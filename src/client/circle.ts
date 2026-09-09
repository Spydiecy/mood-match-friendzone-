/**
 * Mood Match - client-side circle awareness.
 *
 * Reads the server's synced `CircleCore` / `CircleProgress` components each frame
 * and projects them into plain `PadView` objects the UI can render, plus works
 * out which pad the local player is standing on.
 *
 * Nothing here decides anything. Standing on a pad and tapping "Form Circle"
 * sends an intent; the server validates the position and forms the circle.
 */

import { Transform, engine } from '@dcl/sdk/ecs'
import { CIRCLE_PROXIMITY, PAD_POSITIONS, PAD_RADIUS } from '../shared/config'
import { room } from '../shared/messages'
import { CircleCore, CircleProgress } from '../shared/schemas'
import { CirclePhase, EmotionId, GameInputKind, MiniGameKind } from '../shared/types'
import { PadView, state } from './state'

/** Names of the pads as shown in the UI. Short so they fit a phone screen. */
export const PAD_NAMES = ['North Pad', 'West Pad', 'East Pad']

/** Squared horizontal distance between two points. */
function horizontalDistanceSq(
  a: { x: number; z: number },
  b: { x: number; z: number }
): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

/**
 * Recomputes which pad the local player is on.
 * Runs every frame; it is two subtractions per pad, so cost is negligible.
 */
export function refreshPadProximity(): void {
  const transform = Transform.getOrNull(engine.PlayerEntity)
  if (!transform) {
    state.nearestPad = -1
    state.nearestPadDistance = Number.MAX_VALUE
    return
  }

  const position = transform.position
  let bestPad = -1
  let bestDistanceSq = Number.MAX_VALUE

  for (let i = 0; i < PAD_POSITIONS.length; i++) {
    const distanceSq = horizontalDistanceSq(position, PAD_POSITIONS[i])
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq
      bestPad = i
    }
  }

  state.nearestPadDistance = Math.sqrt(bestDistanceSq)
  // Only report the pad when the player is actually inside it.
  state.nearestPad = state.nearestPadDistance <= PAD_RADIUS ? bestPad : -1
}

/**
 * Rebuilds `state.pads` and `state.myPad` from the synced components.
 *
 * Both components live on the same entity, so one iteration covers them; they are
 * separate components purely so a progress tick does not re-send the roster.
 */
export function refreshPadViews(): void {
  const views: PadView[] = []
  let mine: PadView | null = null

  for (const [entity, core] of engine.getEntitiesWith(CircleCore)) {
    const progress = CircleProgress.getOrNull(entity)
    const members = core.members.map((address) => address)
    const myIndex = state.myAddress ? members.indexOf(state.myAddress) : -1

    const view: PadView = {
      padIndex: core.padIndex,
      circleId: core.circleId,
      phase: core.phase as CirclePhase,
      game: core.game as MiniGameKind,
      members,
      memberNames: core.memberNames.map((name) => name),
      memberEmotions: core.memberEmotions.map((id) => id as EmotionId),
      startsAt: core.startsAt,
      endsAt: core.endsAt,
      comboName: core.comboName,
      comboBonus: core.comboBonus,
      sequence: core.sequence.map((id) => id as EmotionId),
      progress: progress?.progress ?? 0,
      hits: progress?.hits ?? 0,
      holdMask: progress?.holdMask ?? 0,
      step: progress?.step ?? 0,
      stepMask: progress?.stepMask ?? 0,
      resolved: progress?.resolved ?? false,
      success: progress?.success ?? false,
      points: progress ? progress.points.map((p) => p) : [],
      mine: myIndex !== -1,
      myIndex
    }

    views[core.padIndex] = view

    // "My pad" only counts once the round is locked in - while gathering the
    // player is a waiting candidate, not yet a committed member.
    if (view.mine && view.phase !== CirclePhase.Gathering) {
      mine = view
    }
  }

  state.pads = views
  state.myPad = mine

  // The waiting flag is derived from the gathering roster rather than tracked
  // locally, so a server-side timeout or a wander-off clears it automatically.
  state.waiting = views.some(
    (view) =>
      view &&
      view.phase === CirclePhase.Gathering &&
      state.myAddress !== '' &&
      view.members.indexOf(state.myAddress) !== -1
  )
}

/** Asks the server to form a circle on the pad the player is standing on. */
export function requestFormCircle(): void {
  room.send('formCircle', { padIndex: state.nearestPad })
}

/** Withdraws from the waiting state. */
export function cancelWaiting(): void {
  room.send('cancelReady', { padIndex: state.nearestPad })
}

/** Sends one mini-game input for the local player's active circle. */
export function sendGameInput(kind: GameInputKind, value = 0): void {
  const pad = state.myPad
  if (!pad) return
  room.send('gameInput', { circleId: pad.circleId, kind, value })
}

/**
 * How many other players are waiting on pads right now.
 * Drives the "someone is waiting at the North Pad" prompt that pulls players
 * across the plaza, which is the scene's main social engine.
 */
export function waitingElsewhere(): { padIndex: number; count: number } | null {
  for (const view of state.pads) {
    if (!view) continue
    if (view.phase !== CirclePhase.Gathering) continue
    if (view.members.length === 0) continue
    if (view.padIndex === state.nearestPad) continue
    return { padIndex: view.padIndex, count: view.members.length }
  }
  return null
}

/** Metres the player still has to walk to reach the nearest pad. */
export function distanceToNearestPad(): number {
  return state.nearestPadDistance
}

/** Exposed for the tutorial copy so the number never drifts from the config. */
export const PROXIMITY_HINT = CIRCLE_PROXIMITY
