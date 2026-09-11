/**
 * Mood Match - Sync Tap.
 *
 * A marker sweeps back and forth across a bar. When it is inside the target zone,
 * EVERY player has to tap within the same short window. Three group syncs clears
 * the round.
 *
 * This is the most purely cooperative of the four games: an individual cannot make
 * any progress alone, because a sync only counts when everyone's tap lands together.
 * It reliably makes people count down out loud, which is exactly the behaviour the
 * scene exists to produce.
 *
 * The marker is drawn from `markerPosition` in `shared/syncTap.ts` - the same
 * function the server judges with - so the bar you see and the bar being judged can
 * never drift out of phase. Local clock offset is already corrected in `RoundView`.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { SYNC_TARGET, SYNC_WINDOW_MS } from '../../shared/config'
import { ZONE_START, ZONE_WIDTH, markerInZone, markerPosition } from '../../shared/syncTap'
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor } from '../ui/theme'
import { ProgressBar, Row, Text } from '../ui/widgets'
import { RoundView, countdownSeconds, inCountdown, secondsLeft } from './round'
import { inputTap } from './input'

/** Width of the sweep bar, in canvas units. */
const BAR_WIDTH = 470
const BAR_HEIGHT = 44

/** The centre visual: the sweep bar with its target zone and marker. */
export function SyncTapPanel(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const counting = inCountdown(round, now)
  const inZone = !counting && markerInZone(round.startsAt, now)
  const position = counting ? 0.5 : markerPosition(round.startsAt, now)
  const accent = emotionColor(round.memberEmotions[round.myIndex] ?? 0)
  const syncs = round.hits

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
      <Text
        value={
          counting
            ? `Get ready  ${countdownSeconds(round, now)}`
            : inZone
              ? 'NOW - everyone tap together'
              : 'Wait for the marker'
        }
        fontSize={FONT.heading}
        color={inZone ? COLORS.good : COLORS.text}
        width={640}
      />

      {/* The bar. The zone is drawn as a band, the marker as a bright column. */}
      <UiEntity
        uiTransform={{
          width: BAR_WIDTH,
          height: BAR_HEIGHT,
          positionType: 'relative',
          borderRadius: RADIUS.chip,
          margin: { top: SPACE.sm }
        }}
        uiBackground={{ color: COLORS.chip }}
      >
        {/* Target zone */}
        <UiEntity
          uiTransform={{
            width: Math.round(BAR_WIDTH * ZONE_WIDTH),
            height: BAR_HEIGHT,
            positionType: 'absolute',
            position: { left: Math.round(BAR_WIDTH * ZONE_START), top: 0 },
            borderRadius: RADIUS.chip
          }}
          uiBackground={{
            color: inZone
              ? Color4.create(COLORS.good.r, COLORS.good.g, COLORS.good.b, 0.55)
              : Color4.create(1, 1, 1, 0.12)
          }}
        />
        {/* Marker */}
        <UiEntity
          uiTransform={{
            width: 10,
            height: BAR_HEIGHT,
            positionType: 'absolute',
            // Offset by half the marker width so it is centred on its position.
            position: { left: Math.round(position * (BAR_WIDTH - 10)), top: 0 },
            borderRadius: RADIUS.pill
          }}
          uiBackground={{ color: inZone ? COLORS.good : accent }}
        />
      </UiEntity>

      {/* One pip per required sync. */}
      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {pips(SYNC_TARGET).map((pip) => (
          <UiEntity
            key={`sync-${pip}`}
            uiTransform={{
              width: 18,
              height: 18,
              borderRadius: RADIUS.pill,
              margin: { left: 5, right: 5 }
            }}
            uiBackground={{ color: pip < syncs ? COLORS.good : COLORS.chip }}
          />
        ))}
      </Row>

      <UiEntity uiTransform={{ width: BAR_WIDTH, height: 14, margin: { top: SPACE.xs } }}>
        <ProgressBar value={round.progress} fill={COLORS.good} height={14} />
      </UiEntity>

      <Text
        value={
          counting
            ? `All ${round.members.length} of you tap at once, ${SYNC_TARGET} times`
            : `${syncs}/${SYNC_TARGET} synced  -  ${secondsLeft(round, now)}s left`
        }
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={640}
      />
    </UiEntity>
  )
}

/** [0, 1, ... n-1] */
function pips(n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(i)
  return out
}

/**
 * The bottom-centre input.
 *
 * Turns green only while the marker is in the zone, so the button itself teaches
 * the timing without the player having to watch the bar and their thumb at once.
 */
export function SyncTapAction(props: { round: RoundView }) {
  const round = props.round
  const now = Date.now()
  const ready = !inCountdown(round, now)
  const inZone = ready && markerInZone(round.startsAt, now)

  return (
    <UiEntity
      uiTransform={{
        width: TOUCH.primaryWidth,
        height: TOUCH.primaryHeight,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.pill,
        borderWidth: inZone ? 6 : 3,
        borderColor: inZone ? COLORS.good : COLORS.chip,
        pointerFilter: 'block'
      }}
      uiBackground={{ color: inZone ? COLORS.surface : COLORS.chip }}
      onMouseDown={() => {
        if (ready) inputTap(round)
      }}
    >
      <Text
        value={!ready ? 'GET READY' : inZone ? 'TAP NOW' : 'WAIT'}
        fontSize={FONT.heading}
        color={inZone ? COLORS.good : COLORS.textDim}
      />
    </UiEntity>
  )
}

/** One-line explanation for the countdown and the tutorial. */
export const SYNC_TAP_BRIEF = `Everyone taps at the same moment while the marker is in the green zone. ${SYNC_TARGET} syncs to clear. Count down out loud - you have about ${Math.round(
  SYNC_WINDOW_MS / 100
) / 10}s of slack.`
