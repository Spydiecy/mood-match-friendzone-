/**
 * Mood Match - Reaction.
 *
 * The pad waits an unpredictable moment, flashes GO, and the first player to tap
 * takes the point. Four cues per round. Tapping early locks you out of that cue, so
 * mashing is punished rather than rewarded.
 *
 * The classic reaction duel, and the most immediately competitive round in the set:
 * there is exactly one winner per cue and everybody knows instantly whether they got
 * it. It also needs zero explanation, which makes it a good round for a stranger's
 * first circle.
 *
 * ON FAIRNESS: the server publishes the cue time only ONCE THE CUE HAS FIRED, never
 * in advance, because a client that knew the cue time in advance could schedule a
 * perfect tap and win every round. The cost is that everyone's reaction includes one
 * network hop. That is the same for all players and acceptable for a party game -
 * and it is the right trade against the alternative, which is a cheatable round.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { REACTION_CUES } from '../../shared/config'
import { COLORS, FONT, RADIUS, SPACE, TOUCH } from '../ui/theme'
import { ProgressBar, Row, Text } from '../ui/widgets'
import { RoundView, countdownSeconds, inCountdown, secondsLeft } from './round'
import { inputTap } from './input'
import { Standings } from './standings'

/**
 * True when a cue is live and claimable right now.
 *
 * BOTH conditions are needed, and the time check is not redundant. A real round
 * publishes `cueAt` only AFTER the cue has fired, so `> 0` alone would be enough
 * there - but a PRACTICE round schedules its cue locally and so carries a FUTURE
 * timestamp. Checking only `> 0` therefore showed GO for the entire practice round,
 * making it unplayable. Comparing against the clock is correct for both.
 */
function cueLive(round: RoundView, now: number): boolean {
  return round.cueAt > 0 && now >= round.cueAt
}

/** The centre visual: a big WAIT / GO plate. */
export function ReactionPanel(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const counting = inCountdown(round, now)
  const live = !counting && cueLive(round, now)
  const mine = round.memberScore[round.myIndex] ?? 0

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 196,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* The plate is the whole game: it is either red or green. */}
      <UiEntity
        uiTransform={{
          width: 300,
          height: 76,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.chip,
          borderWidth: 3,
          borderColor: live ? COLORS.good : COLORS.chip
        }}
        uiBackground={{
          color: live ? COLORS.good : counting ? COLORS.chip : COLORS.surface
        }}
      >
        <Text
          value={counting ? String(countdownSeconds(round, now)) : live ? 'GO' : 'WAIT'}
          fontSize={FONT.hero}
          color={live ? COLORS.panel : COLORS.textDim}
        />
      </UiEntity>

      {/* One pip per cue. */}
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {cues().map((cue) => (
          <UiEntity
            key={`cue-${cue}`}
            uiTransform={{
              width: 16,
              height: 16,
              borderRadius: RADIUS.pill,
              margin: { left: 4, right: 4 }
            }}
            uiBackground={{
              color: cue < Math.round(round.progress * REACTION_CUES) ? COLORS.good : COLORS.chip
            }}
          />
        ))}
      </Row>

      <Standings round={round} />

      <UiEntity uiTransform={{ width: 470, height: 12, margin: { top: SPACE.xs } }}>
        <ProgressBar value={round.progress} fill={COLORS.good} height={12} />
      </UiEntity>

      <Text
        value={
          counting
            ? 'Tap the instant it turns green - early taps skip you'
            : `You won ${mine}  -  ${secondsLeft(round, now)}s left`
        }
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={640}
      />
    </UiEntity>
  )
}

/** [0, 1, ... REACTION_CUES-1] */
function cues(): number[] {
  const out: number[] = []
  for (let i = 0; i < REACTION_CUES; i++) out.push(i)
  return out
}

/** The bottom-centre input, mirroring the plate's colour. */
export function ReactionAction(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const ready = !inCountdown(round, now)
  const live = ready && cueLive(round, now)

  return (
    <UiEntity
      uiTransform={{
        width: TOUCH.primaryWidth,
        height: TOUCH.primaryHeight,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        borderWidth: live ? 6 : 3,
        borderColor: live ? COLORS.good : COLORS.chip,
        pointerFilter: 'block'
      }}
      uiBackground={{ color: live ? COLORS.good : COLORS.chip }}
      onMouseDown={() => {
        if (ready) inputTap(round)
      }}
    >
      <Text
        value={!ready ? 'GET READY' : live ? 'TAP NOW' : 'WAIT FOR GREEN'}
        fontSize={FONT.heading}
        color={live ? COLORS.panel : COLORS.textDim}
      />
    </UiEntity>
  )
}

/** One-line explanation for the countdown and the tutorial. */
export const REACTION_BRIEF = `Wait for green, then tap first. ${REACTION_CUES} cues, one winner each. Tapping early skips you.`
