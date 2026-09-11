/**
 * Mood Match - leaderboard panel.
 *
 * Reads the synced `Leaderboard` component, which the Multiplayer Server rebuilds
 * whenever a circle resolves and persists to Storage, so scores survive server
 * restarts and redeploys.
 *
 * Two fixed columns of five rather than a scrolling list. Scroll containers are
 * not reliably usable on the Unity mobile client, and the previous version put
 * ~860px of rows in a 520px box - places 7 to 10 were potentially unreachable on
 * a phone. All ten fit on screen now with no scrolling at all.
 */

import ReactEcs, { Key, UiEntity } from '@dcl/sdk/react-ecs'
import { LEADERBOARD_SIZE } from '../../shared/config'
import { state } from '../state'
import { COLORS, FONT, ICON, RADIUS, SPACE, textHeight } from './theme'
import { Icon, Modal, Row, Text } from './widgets'

/** Height of one ranked row. */
const ROW_HEIGHT = 52

/** Shape of a row as held in client state. */
interface BoardRowData {
  address: string
  name: string
  score: number
  circles: number
}

/** Closes the panel. */
function close(): void {
  state.screen = 'hud'
}

/** The leaderboard modal. */
export function LeaderboardPanel() {
  const rows = state.board.slice(0, LEADERBOARD_SIZE)
  const inTopTen = rows.some((row) => row.address === state.myAddress)

  return (
    <Modal title="Top moods" onClose={close} width={940}>
      <Text
        value={`${state.circlesAllTime} circles formed here all time`}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={880}
        marginBottom={SPACE.md}
      />

      {rows.length === 0 ? (
        <UiEntity
          uiTransform={{
            width: 880,
            height: 160,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Icon src={ICON.board} size={40} color={COLORS.textDim} />
          <Text
            value="No circles yet"
            fontSize={FONT.heading}
            color={COLORS.textDim}
            width={700}
            marginTop={SPACE.sm}
          />
          <Text
            value="Be the first - grab someone and form a circle"
            fontSize={FONT.small}
            color={COLORS.textDim}
            width={700}
          />
        </UiEntity>
      ) : (
        <Row width="100%" justifyContent="center" alignItems="flex-start">
          <BoardColumn rows={rows.slice(0, 5)} startRank={1} myAddress={state.myAddress} />
          {rows.length > 5 && (
            <BoardColumn rows={rows.slice(5, 10)} startRank={6} myAddress={state.myAddress} />
          )}
        </Row>
      )}

      {/* Own rank, when outside the visible top ten. */}
      {!inTopTen && state.rank > 0 && (
        <UiEntity
          uiTransform={{
            width: 430,
            height: ROW_HEIGHT + SPACE.sm,
            margin: { top: SPACE.sm }
          }}
        >
          <BoardRow
            rank={state.rank}
            name={state.myName || 'You'}
            score={state.score}
            circles={state.circles}
            highlight
          />
        </UiEntity>
      )}
    </Modal>
  )
}

/** One column of up to five ranked rows, at a fixed height. */
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
        borderWidth: props.highlight ? 2 : 0,
        borderColor: props.highlight ? COLORS.accent : COLORS.none,
        padding: { left: SPACE.md, right: SPACE.md },
        margin: { bottom: SPACE.xs }
      }}
      uiBackground={{ color: props.highlight ? COLORS.surface : COLORS.chip }}
    >
      <Text
        value={`${props.rank}`}
        fontSize={FONT.small}
        color={props.rank === 1 ? COLORS.warn : COLORS.textDim}
        align="middle-left"
        width={44}
      />
      <Text
        value={trim(props.name)}
        fontSize={FONT.small}
        color={COLORS.text}
        align="middle-left"
        width={200}
      />
      <Text
        value={`${props.circles}c`}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        align="middle-right"
        width={54}
      />
      <Text
        value={String(props.score)}
        fontSize={FONT.heading}
        color={COLORS.text}
        align="middle-right"
        width={90}
        height={textHeight(FONT.heading)}
      />
    </UiEntity>
  )
}

/** Keeps a long display name inside the row. */
function trim(name: string): string {
  if (!name) return 'anon'
  if (name.length <= 13) return name
  return name.slice(0, 12) + '.'
}
