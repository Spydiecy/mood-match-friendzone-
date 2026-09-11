/**
 * Mood Match - Hold Zones.
 *
 * Every player holds their own coloured zone. The group's timer only advances
 * while EVERY zone is held at once, so one person letting go stalls everybody.
 * That shared-failure condition is the point: it forces players to call out when
 * they are about to slip.
 *
 * The hold is sent as a keepalive rather than a latch (see `input.ts`), so the
 * server drops it the moment a client goes quiet.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { HOLD_REQUIRED_MS } from '../../shared/config'
import { getEmotion } from '../../shared/emotions'
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor, emotionShade } from '../ui/theme'
import { Icon, ProgressBar, Row, Text } from '../ui/widgets'
import { RoundView, countdownSeconds, inCountdown, secondsLeft } from './round'
import { inputHoldEnd, inputHoldStart, isHolding } from './input'

/** True when the member at `index` is currently holding. */
function memberHolding(round: RoundView, index: number): boolean {
  return (round.holdMask & (1 << index)) !== 0
}

/** True when every member is holding, i.e. the timer is running. */
function allHolding(round: RoundView): boolean {
  const full = (1 << round.members.length) - 1
  return round.members.length > 0 && round.holdMask === full
}

/**
 * The centre visual: one tile per member, lit while that member holds.
 *
 * Seeing exactly who has let go is what turns this into a conversation instead of
 * a guessing game.
 */
export function HoldZonesPanel(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const counting = inCountdown(round, now)
  const everyone = allHolding(round)

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
      <Row width="100%" justifyContent="center">
        {round.members.map((address, index) => {
          const emotion = round.memberEmotions[index] ?? 0
          const lit = memberHolding(round, index)
          const isMe = index === round.myIndex

          return (
            <UiEntity
              key={address}
              uiTransform={{
                width: 96,
                height: 104,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RADIUS.chip,
                borderWidth: isMe ? 5 : 2,
                borderColor: isMe ? COLORS.text : emotionColor(emotion, 0.5),
                margin: { left: SPACE.xs, right: SPACE.xs }
              }}
              uiBackground={{
                color: lit ? emotionColor(emotion) : emotionShade(emotion, 0.9)
              }}
            >
              <Icon
                src={getEmotion(emotion).icon}
                size={30}
                color={lit ? COLORS.panel : emotionColor(emotion)}
              />
              <Text
                value={isMe ? 'You' : shortName(round.memberNames[index] ?? '')}
                fontSize={FONT.tiny}
                color={lit ? COLORS.panel : COLORS.textDim}
              />
              <Text
                value={lit ? 'HOLD' : 'OFF'}
                fontSize={FONT.tiny}
                color={lit ? COLORS.panel : COLORS.textDim}
              />
            </UiEntity>
          )
        })}
      </Row>

      <Text
        value={
          counting
            ? `Starting in ${countdownSeconds(round, now)}`
            : everyone
              ? 'All zones held - timer running'
              : missingNames(round)
        }
        fontSize={FONT.small}
        color={everyone ? COLORS.good : COLORS.warn}
        width={640}
        marginTop={SPACE.sm}
      />

      <UiEntity uiTransform={{ width: 470, height: 14, margin: { top: SPACE.xs } }}>
        <ProgressBar
          value={round.progress}
          fill={everyone ? COLORS.good : COLORS.warn}
          height={14}
        />
      </UiEntity>

      <Text
        value={
          counting
            ? `Hold together for ${Math.round(HOLD_REQUIRED_MS / 1000)}s`
            : `${secondsLeft(round, now)}s left`
        }
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={520}
      />
    </UiEntity>
  )
}

/**
 * Names whoever is not currently holding.
 *
 * "Waiting on someone" is useless information in a cooperative game - the group
 * needs to know WHO, so they can call it out. That is the entire mechanic.
 */
function missingNames(round: RoundView): string {
  const missing: string[] = []
  for (let i = 0; i < round.members.length; i++) {
    if (memberHolding(round, i)) continue
    missing.push(i === round.myIndex ? 'you' : shortName(round.memberNames[i] ?? 'player'))
  }
  if (missing.length === 0) return 'All zones held'
  if (missing.length === 1) return `Waiting on ${missing[0]}`
  return `Waiting on ${missing.length} players`
}

/** Trims a long display name so the tile does not overflow on a phone. */
function shortName(name: string): string {
  if (name.length <= 8) return name
  return name.slice(0, 7) + '.'
}

/**
 * The bottom-centre input: a press-and-hold pad.
 *
 * `onMouseUp` releases, and the keepalive in `input.ts` covers the case where the
 * thumb slides off and no mouse-up ever arrives.
 */
export function HoldZonesAction(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const ready = !inCountdown(round, now)
  const held = isHolding()
  const emotion = round.memberEmotions[round.myIndex] ?? 0

  return (
    <UiEntity
      uiTransform={{
        width: TOUCH.primaryWidth,
        height: TOUCH.primaryHeight,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        borderWidth: held ? 8 : 3,
        borderColor: emotionColor(emotion, ready ? 1 : 0.4),
        pointerFilter: 'block'
      }}
      uiBackground={{
        color: held ? emotionColor(emotion) : ready ? COLORS.surface : COLORS.chip
      }}
      onMouseDown={() => {
        if (ready) inputHoldStart()
      }}
      onMouseUp={() => inputHoldEnd()}
      onMouseLeave={() => inputHoldEnd()}
    >
      <Text
        value={held ? 'HOLDING' : ready ? 'PRESS AND HOLD' : 'GET READY'}
        fontSize={FONT.heading}
        color={held ? COLORS.panel : ready ? COLORS.text : COLORS.textDim}
      />
    </UiEntity>
  )
}

/** One-line explanation for the countdown and the tutorial. */
export const HOLD_ZONES_BRIEF =
  'Press and hold your zone. The timer only moves while everyone holds at once.'
