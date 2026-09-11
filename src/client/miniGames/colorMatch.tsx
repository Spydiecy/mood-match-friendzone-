/**
 * Mood Match - Color Match.
 *
 * The circle is shown a colour sequence for a couple of seconds, then it hides.
 * Players reproduce it together: a step only completes once EVERY member has
 * tapped that colour, and one wrong tap wipes the group's progress on the current
 * step.
 *
 * That rule is what makes it a conversation. Somebody has to say "green next",
 * and everyone has to agree before the step clears.
 *
 * The palette is built from the circle's own emotion colours (see
 * `colorPalette`), capped at four options so every target stays thumb-sized.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { COLORS, FONT, RADIUS, SPACE, emotionColor } from '../ui/theme'
import { ColorTarget, ProgressBar, Row, Text } from '../ui/widgets'
import {
  RoundView,
  SEQUENCE_REVEAL_MS,
  colorPalette,
  countdownSeconds,
  inCountdown,
  secondsLeft
} from './round'
import { inputColorTap } from './input'
import { Standings } from './standings'
import {
  colorFlash,
  lastTapWrong,
  memberConfirmed,
  myTapConfirmed,
  myTappedColor
} from './colorFeel'

/**
 * True while the sequence is still on show.
 *
 * The reveal window starts when play starts, so the pre-round countdown is pure
 * "get ready" time and nobody loses memorisation time to a slow read.
 */
function revealing(round: RoundView, now: number): boolean {
  return now >= round.startsAt && now < round.startsAt + SEQUENCE_REVEAL_MS
}

/** The centre visual: the sequence, then a progress read-out. */
export function ColorMatchPanel(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const counting = inCountdown(round, now)
  const showing = revealing(round, now)
  const wrongTap = lastTapWrong(now)
  const revealLeft = Math.max(
    0,
    Math.ceil((round.startsAt + SEQUENCE_REVEAL_MS - now) / 1000)
  )

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        // head 30 + sequence 60 + confirmations 40 + step dots 20 + standings 50 +
        // bar 18 + caption 25.
        height: 246,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text
        value={
          counting
            ? `Memorise in ${countdownSeconds(round, now)}`
            : showing
              ? `Memorise it - ${revealLeft}s`
              : `Step ${Math.min(round.step + 1, round.sequence.length)} of ${round.sequence.length}`
        }
        fontSize={FONT.small}
        color={showing ? COLORS.warn : COLORS.text}
        width={640}
      />

      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {round.sequence.map((emotion, index) => {
          const done = index < round.step
          // Hidden once the reveal window closes - from then on it is memory plus
          // whatever the group tells each other.
          const visible = showing || done

          return (
            <UiEntity
              key={`${index}-${emotion}`}
              uiTransform={{
                width: 54,
                height: 54,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RADIUS.chip,
                borderWidth: index === round.step && !showing ? 5 : 2,
                borderColor:
                  index === round.step && !showing ? COLORS.text : COLORS.chip,
                margin: { left: SPACE.xs, right: SPACE.xs }
              }}
              uiBackground={{
                color: visible ? emotionColor(emotion) : COLORS.chip
              }}
            >
              <Text
                value={done ? 'OK' : visible ? '' : '?'}
                fontSize={FONT.small}
                color={COLORS.panel}
              />
            </UiEntity>
          )
        })}
      </Row>

      {/*
        Who has confirmed the current step. This is the whole game: without it a
        player cannot tell whether their own tap landed, nor who the group is
        waiting on, so there is nothing to coordinate around.
      */}
      {!counting && !showing && round.members.length > 1 && (
        <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
          {round.members.map((address, index) => {
            const confirmed = memberConfirmed(round, index)
            const isMe = index === round.myIndex
            return (
              <UiEntity
                key={`conf-${address}`}
                uiTransform={{
                  width: 80,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: RADIUS.pill,
                  borderWidth: isMe ? 3 : 0,
                  borderColor: isMe ? COLORS.text : COLORS.none,
                  margin: { left: SPACE.xs, right: SPACE.xs }
                }}
                uiBackground={{ color: confirmed ? COLORS.good : COLORS.chip }}
              >
                <Text
                  value={confirmed ? 'OK' : isMe ? 'You' : shortName(round.memberNames[index] ?? '')}
                  fontSize={FONT.tiny}
                  color={confirmed ? COLORS.panel : COLORS.textDim}
                />
              </UiEntity>
            )
          })}
        </Row>
      )}

      {/* Step dots: how far through the sequence the group is. */}
      <Row width="100%" justifyContent="center" marginTop={SPACE.xs}>
        {round.sequence.map((_, index) => (
          <UiEntity
            key={`step-${index}`}
            uiTransform={{
              width: index === round.step ? 16 : 12,
              height: index === round.step ? 16 : 12,
              borderRadius: RADIUS.pill,
              margin: { left: 3, right: 3 }
            }}
            uiBackground={{
              color:
                index < round.step
                  ? COLORS.good
                  : index === round.step
                    ? COLORS.accent
                    : COLORS.chip
            }}
          />
        ))}
      </Row>

      <Standings round={round} />

      <UiEntity uiTransform={{ width: 470, height: 14, margin: { top: SPACE.xs } }}>
        <ProgressBar value={round.progress} fill={COLORS.accent} height={14} />
      </UiEntity>

      <Text
        value={
          counting
            ? 'Tap the colours in order, together'
            : wrongTap
              ? 'Wrong colour - the step resets, try again together'
              : myTapConfirmed(round) && round.members.length > 1
                ? 'You are in - waiting for the others'
                : `${secondsLeft(round, now)}s left`
        }
        fontSize={FONT.tiny}
        color={wrongTap ? COLORS.bad : COLORS.textDim}
        width={720}
      />
    </UiEntity>
  )
}

/** Keeps a long display name inside a confirmation chip. */
function shortName(name: string): string {
  if (!name) return 'player'
  if (name.length <= 7) return name
  return name.slice(0, 6) + '.'
}

/** The bottom-centre input: up to four large colour targets. */
export function ColorMatchAction(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const ready = !inCountdown(round, now) && !revealing(round, now)
  const palette = colorPalette(round.sequence)
  const myTap = myTappedColor(round)
  const flash = colorFlash(now)
  const confirmed = myTapConfirmed(round)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 128,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Row width="100%" justifyContent="center">
        {palette.map((emotion) => (
          <ColorTarget
            key={`target-${emotion}`}
            emotion={emotion}
            // The tapped target grows briefly, so the thumb gets confirmation
            // from the thing it actually touched.
            size={Math.round((ready ? 92 : 82) + (myTap === emotion ? flash * 10 : 0))}
            highlighted={myTap === emotion}
            onClick={ready ? () => inputColorTap(emotion, round) : undefined}
          />
        ))}
      </Row>
      <Text
        value={
          !ready
            ? 'Watch the sequence'
            : confirmed
              ? 'Tapped - the step clears when everyone matches'
              : 'Everyone taps the same colour to advance'
        }
        fontSize={FONT.tiny}
        color={confirmed ? COLORS.good : COLORS.textDim}
        width={760}
      />
    </UiEntity>
  )
}

/** One-line explanation for the countdown and the tutorial. */
export const COLOR_MATCH_BRIEF =
  'Watch the colour sequence, then everyone taps it back in order, together.'
