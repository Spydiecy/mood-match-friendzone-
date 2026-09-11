/**
 * Mood Match - Tap Race.
 *
 * Hammer the button. First to the target wins the round for everyone, and the player
 * who crosses the line first takes the biggest share outright.
 *
 * EVERYTHING ON SCREEN IS COUNTED IN RAW TAPS, because that is what the race is judged
 * in. The bars were drawn from the perk-weighted `memberScore` against a target counted
 * in raw taps, so an Energy player watched their bar fill to the end and then not win,
 * and the "Leading" marker regularly pointed at somebody who was behind. Perks still
 * decide the order of everyone who did NOT finish - see `rankMembers`.
 *
 * The simplest game in the set, and deliberately so: it needs no explanation at all,
 * which makes it the perfect round to land on when a stranger joins their first
 * circle. It is also the most directly competitive - there is no shared objective to
 * hide behind, just a bar next to somebody else's bar.
 *
 * Everyone still benefits when one player is fast: the group objective is "somebody
 * reached the target", so a slower player still gets the mini-game bonus. That is
 * intentional - a beginner should be glad to be in a circle with a regular, not
 * resentful of them.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { TAP_RACE_TARGET } from '../../shared/config'
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor } from '../ui/theme'
import { ProgressBar, Text } from '../ui/widgets'
import {
  RoundView,
  countdownSeconds,
  inCountdown,
  isLeading,
  raceCount,
  secondsLeft
} from './round'
import { inputTap } from './input'
import { Standings } from './standings'

/** The centre visual: your own bar, plus a bar per opponent. */
export function TapRacePanel(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const counting = inCountdown(round, now)
  const mine = raceCount(round, round.myIndex)
  // From the server's ranking, not from comparing tap counts: whoever crosses the target
  // first leads regardless of counts, and until somebody does the ranking falls back to
  // the perk-weighted score. Comparing the numbers on screen could claim a lead the
  // payout was about to contradict.
  const leading = isLeading(round, round.myIndex)
  const accent = emotionColor(round.memberEmotions[round.myIndex] ?? 0)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        // head 45 + bars 80 + standings 50 + caption 25.
        height: 204,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text
        value={
          counting
            ? `Race starts in ${countdownSeconds(round, now)}`
            : leading
              ? `Leading  ${mine}/${TAP_RACE_TARGET}`
              : `${mine}/${TAP_RACE_TARGET}  -  keep tapping`
        }
        fontSize={FONT.heading}
        color={leading ? COLORS.good : COLORS.text}
        width={640}
      />

      {/* One bar per member, so the race is legible at a glance. */}
      <UiEntity
        uiTransform={{
          width: 470,
          height: 76,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: { top: SPACE.xs }
        }}
      >
        {round.members.map((address, index) => {
          const taps = raceCount(round, index)
          const isMe = index === round.myIndex
          return (
            <UiEntity
              key={`race-${address}`}
              uiTransform={{
                width: 470,
                height: 16,
                flexDirection: 'row',
                alignItems: 'center',
                margin: { bottom: 3 }
              }}
            >
              <UiEntity
                uiTransform={{
                  width: 460,
                  height: 14,
                  borderRadius: RADIUS.pill,
                  borderWidth: isMe ? 2 : 0,
                  borderColor: isMe ? COLORS.text : COLORS.none
                }}
              >
                <ProgressBar
                  value={taps / TAP_RACE_TARGET}
                  height={14}
                  fill={isMe ? accent : emotionColor(round.memberEmotions[index] ?? 0, 0.7)}
                />
              </UiEntity>
            </UiEntity>
          )
        })}
      </UiEntity>

      <Standings round={round} />

      <Text
        value={
          counting
            ? 'First over the line takes the biggest share'
            : `${secondsLeft(round, now)}s left`
        }
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={560}
      />
    </UiEntity>
  )
}

/** The bottom-centre input: one big mash target. */
export function TapRaceAction(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const ready = !inCountdown(round, now)
  const accent = emotionColor(round.memberEmotions[round.myIndex] ?? 0, ready ? 1 : 0.4)

  return (
    <UiEntity
      uiTransform={{
        width: TOUCH.primaryWidth,
        height: TOUCH.primaryHeight,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        borderWidth: 3,
        borderColor: accent,
        pointerFilter: 'block'
      }}
      uiBackground={{ color: ready ? COLORS.surface : COLORS.chip }}
      onMouseDown={() => {
        if (ready) inputTap(round)
      }}
    >
      <Text
        value={ready ? 'TAP FAST' : 'GET READY'}
        fontSize={FONT.heading}
        color={ready ? COLORS.text : COLORS.textDim}
      />
    </UiEntity>
  )
}

/** One-line explanation for the countdown and the tutorial. */
export const TAP_RACE_BRIEF = `Tap as fast as you can. First to ${TAP_RACE_TARGET} wins the round for everyone - and first over the line takes the biggest share.`
