/**
 * Mood Match - live standings inside a round.
 *
 * WHY THIS EXISTS: circles used to be purely cooperative, with everyone getting an
 * identical payout. There was nothing to push against, so there was no reason to
 * try hard. Rounds are now competitive INSIDE a cooperative frame - you still need
 * other people to play at all, but the best performer takes the biggest share.
 *
 * A competitive round is only competitive if you can see the race. This strip shows
 * every member's live score with the leader marked, which is the difference between
 * "we all tapped a button" and "I'm one ahead, don't let up".
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { MiniGameKind } from '../../shared/types'
import { COLORS, FONT, RADIUS, SPACE, emotionColor } from '../ui/theme'
import { Row, Text } from '../ui/widgets'
import { RoundView } from './round'

/** Sync Tap is the one round with no individual winner, by design. */
function isTeamGame(game: MiniGameKind): boolean {
  return game === MiniGameKind.SyncTap
}

/**
 * The standings strip.
 *
 * Renders nothing for a solo practice run or a team game - a leaderboard of one, or
 * of identical scores, is noise.
 */
export function Standings(props: { round: RoundView }) {
  const round = props.round

  if (round.practice || round.members.length < 2 || isTeamGame(round.game)) {
    return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  }

  const best = round.memberScore.reduce((m, v) => Math.max(m, v), 0)

  return (
    <Row width="100%" justifyContent="center" marginTop={SPACE.xs}>
      {round.members.map((address, index) => {
        const score = round.memberScore[index] ?? 0
        // Only mark a leader once somebody is actually ahead.
        const leading = best > 0 && score === best
        const isMe = index === round.myIndex

        return (
          <UiEntity
            key={`stand-${address}`}
            uiTransform={{
              width: 96,
              height: 46,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.chip,
              borderWidth: isMe ? 2 : 0,
              borderColor: isMe ? COLORS.text : COLORS.none,
              margin: { left: 3, right: 3 }
            }}
            uiBackground={{
              color: leading ? COLORS.surface : COLORS.chip
            }}
          >
            <UiEntity
              uiTransform={{
                width: 8,
                height: 30,
                borderRadius: RADIUS.pill,
                margin: { right: 5 }
              }}
              uiBackground={{
                color: leading
                  ? COLORS.good
                  : emotionColor(round.memberEmotions[index] ?? 0)
              }}
            />
            <UiEntity
              uiTransform={{
                width: 62,
                height: 42,
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center'
              }}
            >
              <Text
                value={String(score)}
                fontSize={FONT.small}
                color={leading ? COLORS.good : COLORS.text}
                align="middle-left"
                width={58}
              />
              <Text
                value={isMe ? 'You' : trim(round.memberNames[index] ?? '')}
                fontSize={FONT.tiny}
                color={COLORS.textDim}
                align="middle-left"
                width={58}
              />
            </UiEntity>
          </UiEntity>
        )
      })}
    </Row>
  )
}

/** Ordinal for a zero-based rank: 1st, 2nd, 3rd, 4th. */
export function ordinal(rank: number): string {
  const place = rank + 1
  if (place === 1) return '1st'
  if (place === 2) return '2nd'
  if (place === 3) return '3rd'
  return `${place}th`
}

/** Keeps a display name inside a standings chip. */
function trim(name: string): string {
  if (!name) return 'player'
  if (name.length <= 7) return name
  return name.slice(0, 6) + '.'
}
