/**
 * Mood Match - leaderboard panel.
 *
 * Reads the synced `Leaderboard` component, which the Multiplayer Server rebuilds
 * whenever a circle resolves and persists to Storage. Scores therefore survive
 * server restarts and redeploys.
 *
 * The player's own row is highlighted, and if they are outside the top ten their
 * rank is shown underneath so the board is still meaningful to them.
 */

import ReactEcs, { Key, UiEntity } from '@dcl/sdk/react-ecs'
import { LEADERBOARD_SIZE } from '../../shared/config'
import { state } from '../state'
import { COLORS, FONT, RADIUS, SPACE } from './theme'
import { Modal, Panel, PrimaryButton, Row, Text } from './widgets'

/** Closes the panel. */
function close(): void {
  state.screen = 'hud'
}

/** The leaderboard modal. */
export function LeaderboardPanel() {
  const rows = state.board.slice(0, LEADERBOARD_SIZE)
  const inTopTen = rows.some((row) => row.address === state.myAddress)

  return (
    <Modal>
      <Panel width={900} padding={SPACE.lg}>
        <Text value="Top moods" fontSize={FONT.title} color={COLORS.text} width={760} />
        <Text
          value={`${state.circlesAllTime} circles formed here all time`}
          fontSize={FONT.small}
          color={COLORS.textDim}
          width={760}
          marginBottom={SPACE.md}
        />

        {rows.length === 0 ? (
          <UiEntity
            uiTransform={{
              width: 800,
              height: 220,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              value="No circles yet today"
              fontSize={FONT.heading}
              color={COLORS.textDim}
              width={700}
            />
            <Text
              value="Be the first. Grab someone and form a circle."
              fontSize={FONT.body}
              color={COLORS.textDim}
              width={700}
            />
          </UiEntity>
        ) : (
          /*
            Two fixed columns rather than one scrolling list.

            All ten rows are visible at once with no scrolling, because scroll
            containers are not reliably usable on the Unity mobile client - a
            520px container holding ~860px of rows would have left the bottom
            four places unreachable on a phone.
          */
          <Row width="100%" justifyContent="center" alignItems="flex-start">
            <BoardColumn
              rows={rows.slice(0, 5)}
              startRank={1}
              myAddress={state.myAddress}
            />
            {rows.length > 5 && (
              <BoardColumn
                rows={rows.slice(5, 10)}
                startRank={6}
                myAddress={state.myAddress}
              />
            )}
          </Row>
        )}

        {!inTopTen && state.rank > 0 && (
          <UiEntity uiTransform={{ width: 440, height: ROW_HEIGHT + 14, margin: { top: SPACE.sm } }}>
            <BoardRow
              rank={state.rank}
              name={state.myName || 'You'}
              score={state.score}
              circles={state.circles}
              highlight
            />
          </UiEntity>
        )}

        <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
          <PrimaryButton label="Back" onClick={() => close()} width={340} />
        </Row>
      </Panel>
    </Modal>
  )
}

/**
 * One column of up to five ranked rows.
 *
 * Fixed height per row and an explicit column height, so the layout is identical
 * on the Bevy and Unity explorers rather than depending on intrinsic sizing.
 */
function BoardColumn(props: {
  key?: Key
  rows: BoardRowData[]
  startRank: number
  myAddress: string
}) {
  return (
    <UiEntity
      uiTransform={{
        width: 430,
        height: 5 * (ROW_HEIGHT + SPACE.xs),
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        margin: { left: SPACE.xs, right: SPACE.xs }
      }}
    >
      {props.rows.map((row, index) => (
        <BoardRow
          key={row.address}
          rank={props.startRank + index}
          name={row.name}
          score={row.score}
          circles={row.circles}
          highlight={row.address === props.myAddress}
        />
      ))}
    </UiEntity>
  )
}

/** Shape of a row as held in client state. */
interface BoardRowData {
  address: string
  name: string
  score: number
  circles: number
}

/** Height of a single ranked row. */
const ROW_HEIGHT = 76

/** One row of the board. */
function BoardRow(props: {
  key?: Key
  rank: number
  name: string
  score: number
  circles: number
  highlight?: boolean
}) {
  return (
    <UiEntity
      uiTransform={{
        width: 420,
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: RADIUS.chip,
        borderWidth: props.highlight ? 3 : 0,
        borderColor: props.highlight ? COLORS.accent : COLORS.none,
        padding: { left: SPACE.md, right: SPACE.md },
        margin: { bottom: SPACE.xs }
      }}
      uiBackground={{ color: props.highlight ? COLORS.surface : COLORS.chip }}
    >
      <Text
        value={`#${props.rank}`}
        fontSize={FONT.small}
        color={props.rank === 1 ? COLORS.warn : COLORS.textDim}
        align="middle-left"
        width={62}
      />
      <Text
        value={trim(props.name)}
        fontSize={FONT.body}
        color={COLORS.text}
        align="middle-left"
        width={190}
      />
      <Text
        value={`${props.circles}c`}
        fontSize={FONT.small}
        color={COLORS.textDim}
        align="middle-right"
        width={60}
      />
      <Text
        value={String(props.score)}
        fontSize={FONT.heading}
        color={COLORS.text}
        align="middle-right"
        width={94}
      />
    </UiEntity>
  )
}

/** Keeps long display names from pushing the score off the row. */
function trim(name: string): string {
  if (!name) return 'Anonymous'
  if (name.length <= 12) return name
  return name.slice(0, 11) + '.'
}
