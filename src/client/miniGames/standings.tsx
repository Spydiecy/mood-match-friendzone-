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
 *
 * The number shown is whatever the round is actually JUDGED on - `raceCount`. In Tap
 * Race that is raw taps, not the perk-weighted score, because otherwise the strip
 * showed a bar that had visibly filled up for a player who had not won.
 *
 * WHO is leading comes from the server's published ranking, not from comparing the
 * numbers on screen. The two are not the same question in Tap Race: the displayed count
 * is raw taps, while the ranking puts a player who crossed the target first above
 * everyone regardless of count. Deriving the leader locally let the strip disagree with
 * the payout.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { COLORS, FONT, RADIUS, SPACE, emotionColor } from '../ui/theme'
import { Row, Text } from '../ui/widgets'
import { RoundView, isCompetitive, isLeading, raceCount } from './round'

/**
 * The standings strip.
 *
 * Renders nothing for a solo practice run - a leaderboard of one is noise.
 *
 * It now renders for Sync Tap too. That round used to be excluded because it credited
 * every member the same raw point, so the strip would have shown identical numbers;
 * its points run through each player's mood perk now, so there is a real race to show.
 */
export function Standings(props: { round: RoundView }) {
  const round = props.round

  if (round.practice || round.members.length < 2 || !isCompetitive(round.game)) {
    return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  }

  return (
    <Row width="100%" justifyContent="center" marginTop={SPACE.xs}>
      {round.members.map((address, index) => {
        const score = raceCount(round, index)
        // The SERVER decides who is leading. Marking the highest number on screen was
        // wrong for Tap Race, where the ranking puts whoever crossed the target first
        // ahead of any score - the chip could crown a player the server had in second.
        const leading = isLeading(round, index)
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
