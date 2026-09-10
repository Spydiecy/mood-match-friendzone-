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

/** A zeroed view, used once per pad and then mutated in place. */
function blankPadView(padIndex: number): PadView {
  return {
    padIndex,
    circleId: 0,
    phase: CirclePhase.Gathering,
    game: MiniGameKind.RhythmTap,
    members: [],
    memberNames: [],
    memberEmotions: [],
    startsAt: 0,
    endsAt: 0,
    comboName: '',
    comboBonus: 0,
    sequence: [],
    progress: 0,
    hits: 0,
    holdMask: 0,
    step: 0,
    stepMask: 0,
    resolved: false,
    success: false,
    points: [],
    mine: false,
    myIndex: -1
  }
}

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
/**
 * Reused view objects, one per pad.
 *
 * Rebuilt in place rather than reallocated. The naive version built three objects
 * and roughly eighteen copied arrays EVERY frame - about 1,200 array allocations
 * a second in a completely empty plaza, all of it garbage for a mid-range phone
 * to collect. Now the arrays are only re-copied when the roster identity actually
 * changes, and the per-frame scalars are written into the existing object.
 */
const viewCache = new Map<number, PadView>()

/** Cheap identity token: if this is unchanged, the arrays are unchanged. */
function rosterToken(core: {
  circleId: number
  phase: number
  members: readonly string[]
}): string {
  return `${core.circleId}:${core.phase}:${core.members.length}`
}

/** Identity tokens from the previous frame. */
const rosterTokens = new Map<number, string>()

export function refreshPadViews(): void {
  const views: PadView[] = []
  let mine: PadView | null = null

  for (const [entity, core] of engine.getEntitiesWith(CircleCore)) {
    const progress = CircleProgress.getOrNull(entity)

    let view = viewCache.get(core.padIndex)
    if (!view) {
      view = blankPadView(core.padIndex)
      viewCache.set(core.padIndex, view)
    }

    // Only re-copy the arrays when the roster itself changed.
    const token = rosterToken(core)
    if (rosterTokens.get(core.padIndex) !== token) {
      rosterTokens.set(core.padIndex, token)
      view.members = core.members.map((address) => address)
      view.memberNames = core.memberNames.map((name) => name)
      view.memberEmotions = core.memberEmotions.map((id) => id as EmotionId)
      view.sequence = core.sequence.map((id) => id as EmotionId)
      view.myIndex = state.myAddress ? view.members.indexOf(state.myAddress) : -1
      view.mine = view.myIndex !== -1
    }

    // Scalars are cheap, so they are always current.
    view.circleId = core.circleId
    view.phase = core.phase as CirclePhase
    view.game = core.game as MiniGameKind
    view.startsAt = core.startsAt
    view.endsAt = core.endsAt
    view.comboName = core.comboName
    view.comboBonus = core.comboBonus
    view.progress = progress?.progress ?? 0
    view.hits = progress?.hits ?? 0
    view.holdMask = progress?.holdMask ?? 0
    view.step = progress?.step ?? 0
    view.stepMask = progress?.stepMask ?? 0
    view.resolved = progress?.resolved ?? false
    view.success = progress?.success ?? false

    // Points only matter once the round has resolved, so this array is copied at
    // most once per round rather than every frame.
    if (view.resolved && progress) {
      if (view.points.length !== progress.points.length) {
        view.points = progress.points.map((p) => p)
      }
    } else if (view.points.length !== 0) {
      view.points = []
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

  // Waiting is true if EITHER the server acknowledged our ready flag or we appear
  // in a gathering roster. The roster alone was not enough: a player the server
  // accepted but had not yet seated saw no waiting state at all, so their tap
  // looked like it had done nothing. Neither signal is tracked locally, so a
  // server-side timeout or a wander-off still clears it automatically.
  const inRoster = views.some(
    (view) =>
      view &&
      view.phase === CirclePhase.Gathering &&
      state.myAddress !== '' &&
      view.members.indexOf(state.myAddress) !== -1
  )
  state.waiting = state.serverReady || inRoster
}

/** Asks the server to form a circle on the pad the player is standing on. */
export function requestFormCircle(): void {
  room.send('formCircle', { padIndex: state.nearestPad })
}

/** Withdraws from the waiting state. */
export function cancelWaiting(): void {
  room.send('cancelReady', { padIndex: state.nearestPad })
}

/**
 * Calls out to everyone in the World that you are waiting for company.
 *
 * The one genuinely useful thing a lone player can do. The server rate-limits and
 * relays it, so it cannot be spammed or forged.
 */
export function pingPlaza(): void {
  room.send('pingPlaza', { padIndex: Math.max(0, state.nearestPad) })
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
