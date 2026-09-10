/**
 * Mood Match - Rhythm Tap.
 *
 * A ring pulses once a second. Everyone in the circle taps on the beat. The group
 * needs to land 60% of the available taps, counted across all members, so a
 * player who finds the rhythm can carry someone who has not yet - which is what
 * makes it cooperative rather than a solo timing test.
 *
 * The pulse animation is driven from the LOCAL clock (offset-corrected against
 * the server heartbeat), so the visual beat matches the beat the server judges.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { RHYTHM_BEAT_MS, RHYTHM_SUCCESS_RATIO } from '../../shared/config'
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor } from '../ui/theme'
import { ProgressBar, Row, Text } from '../ui/widgets'
import { RoundView, countdownSeconds, inCountdown, secondsLeft } from './round'
import { inputTap } from './input'
import { currentVerdict, flashIntensity, tapStreak } from './tapFeel'

/** Beats in a full round. */
function beatCount(round: RoundView): number {
  const span = round.endsAt - round.startsAt
  return Math.max(1, Math.floor(span / RHYTHM_BEAT_MS))
}

/**
 * How "hot" the beat is right now, 0..1, peaking exactly on the beat.
 * A sharp attack and quick decay reads much more clearly on a small screen than
 * a smooth sine.
 */
function beatPulse(round: RoundView, now: number): number {
  if (now < round.startsAt) return 0
  const phase = ((now - round.startsAt) % RHYTHM_BEAT_MS) / RHYTHM_BEAT_MS
  return Math.max(0, 1 - phase * 3.2)
}

/** Target the group has to reach. */
function targetHits(round: RoundView): number {
  return Math.ceil(beatCount(round) * Math.max(1, round.members.length) * RHYTHM_SUCCESS_RATIO)
}

/** The centre visual: a ring that swells on every beat. */
export function RhythmTapPanel(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const pulse = beatPulse(round, now)

  // Local, immediate feedback. The server owns the score; this owns the feel.
  const verdict = currentVerdict(now)
  const flash = flashIntensity(now)
  const streak = tapStreak()

  const baseSize = 190
  // The ring swells on the beat AND kicks on a confirmed hit, so a well-timed tap
  // visibly lands rather than just being counted.
  const size = Math.round(baseSize * (1 + pulse * 0.28 + flash * 0.16))
  const myEmotion = round.memberEmotions[round.myIndex] ?? 0
  const ringColor =
    verdict === 'hit'
      ? COLORS.good
      : verdict === 'miss'
        ? COLORS.bad
        : emotionColor(myEmotion)
  const counting = inCountdown(round, now)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 300,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 260,
          height: 260,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <UiEntity
          uiTransform={{
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: RADIUS.pill,
            borderWidth: Math.round(8 + pulse * 8),
            borderColor: ringColor
          }}
          uiBackground={{ color: COLORS.surface }}
        >
          <Text
            value={
              counting
                ? String(countdownSeconds(round, now))
                : verdict === 'hit'
                  ? 'YES'
                  : verdict === 'miss'
                    ? 'OFF'
                    : 'TAP'
            }
            fontSize={counting ? FONT.hero : FONT.title}
            color={ringColor}
            height={Math.round(FONT.hero * 1.2)}
          />
        </UiEntity>
      </UiEntity>

      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        <Text
          value={
            streak >= 2
              ? `${streak} in a row  -  group ${round.hits} / ${targetHits(round)}`
              : `Group taps ${round.hits} / ${targetHits(round)}`
          }
          fontSize={FONT.body}
          color={streak >= 3 ? COLORS.good : COLORS.textDim}
          width={620}
        />
      </Row>

      <UiEntity uiTransform={{ width: 560, height: 26, margin: { top: SPACE.sm } }}>
        <ProgressBar value={round.progress} fill={ringColor} />
      </UiEntity>

      <Text
        value={counting ? 'Get ready' : `${secondsLeft(round, now)}s left`}
        fontSize={FONT.small}
        color={COLORS.textDim}
        width={420}
        marginTop={SPACE.xs}
      />
    </UiEntity>
  )
}

/**
 * The bottom-centre input: one very large tap target.
 *
 * Sized far above the 80x80 minimum because it is tapped roughly ten times in ten
 * seconds - accuracy of placement has to be a non-issue.
 */
export function RhythmTapAction(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const ready = !inCountdown(round, now)
  const pulse = beatPulse(round, now)
  const verdict = currentVerdict(now)
  const flash = flashIntensity(now)

  // The button itself confirms the tap, so the player's thumb never covers the
  // only piece of feedback on screen.
  const accent =
    verdict === 'hit'
      ? COLORS.good
      : verdict === 'miss'
        ? COLORS.bad
        : emotionColor(round.memberEmotions[round.myIndex] ?? 0, ready ? 1 : 0.4)

  return (
    <UiEntity
      uiTransform={{
        width: TOUCH.primaryWidth,
        height: TOUCH.primaryHeight + 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        borderWidth: Math.round(2 + pulse * 10 + flash * 10),
        borderColor: accent,
        pointerFilter: 'block'
      }}
      uiBackground={{ color: ready ? COLORS.surface : COLORS.chip }}
      onMouseDown={() => {
        if (ready) inputTap(round)
      }}
    >
      <Text
        value={
          !ready
            ? 'WAIT FOR THE BEAT'
            : tapStreak() >= 2
              ? `${tapStreak()} IN A ROW`
              : 'TAP ON THE BEAT'
        }
        fontSize={FONT.heading}
        color={ready ? (tapStreak() >= 2 ? COLORS.good : COLORS.text) : COLORS.textDim}
        height={Math.round(FONT.heading * 1.3)}
      />
    </UiEntity>
  )
}

/** One-line explanation, shown during the countdown and in the tutorial. */
export const RHYTHM_TAP_BRIEF =
  'Tap in time with the pulsing ring. Every tap from every player counts.'
