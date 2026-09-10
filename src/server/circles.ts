/**
 * Mood Match - Mood Circle lifecycle and cooperative mini-game judging.
 *
 * The server owns every decision here. Clients only ever send intents
 * ("I tapped", "I want to form a circle"); they never send a score, a hit count
 * or a success flag, and the server re-derives player positions from
 * `PlayerIdentityData` + `Transform` rather than trusting anything reported.
 *
 * There is exactly one persistent entity per pad, cycling through phases for the
 * life of the server. That avoids the remove-and-recreate-in-the-same-frame
 * failure mode of fixed sync ids, and means a late joiner immediately sees the
 * state of all three pads.
 *
 * SERVER ONLY.
 */

import { Entity, engine } from '@dcl/sdk/ecs'
import {
  CIRCLE_PROXIMITY,
  COLOR_SEQUENCE_LENGTH,
  COUNTDOWN_MS,
  HOLD_EXPIRY_MS,
  HOLD_REQUIRED_MS,
  MAX_CIRCLE_PLAYERS,
  MINIGAME_DURATION_MS,
  MIN_CIRCLE_PLAYERS,
  PAD_POSITIONS,
  PAD_RADIUS,
  PROGRESS_PUSH_MS,
  READY_WINDOW_MS,
  RESULT_MS,
  RHYTHM_BEAT_MS,
  RHYTHM_SUCCESS_RATIO,
  RHYTHM_TOLERANCE_MS
} from '../shared/config'
import { evaluateCombo } from '../shared/emotions'
import { NoticeTone, RefusalCode } from '../shared/messages'
import { CircleCore, CircleProgress, padCircleSyncId } from '../shared/schemas'
import { CirclePhase, EMOTION_COUNT, EmotionId, GameInputKind, MiniGameKind } from '../shared/types'
import { PlayerRecord, allPlayers, getPlayerPosition } from './state'

/** Callbacks the owner (server/index.ts) supplies so this module stays decoupled. */
export interface CircleHooks {
  /**
   * Pays out a resolved circle. Returns points per member, parallel to `members`.
   * Implemented in `index.ts` because it needs the leaderboard and persistence.
   */
  award: (members: PlayerRecord[], success: boolean, comboMatched: boolean, circleId: number) => number[]
  /** Sends a toast to one player. */
  notify: (address: string, code: RefusalCode, text: string, tone: NoticeTone) => void
  /** Announces that a circle formed, so clients can play a cue. */
  announceFormed: (circleId: number, padIndex: number, memberCount: number, game: MiniGameKind) => void
  /** Announces that a circle resolved. */
  announceResolved: (circleId: number, success: boolean) => void
  /** Bumps the circles-completed counters in WorldState. */
  countCircle: () => void
  /** Pushes a player record into its synced `PlayerStat` component. */
  publishStat: (record: PlayerRecord) => void
}

/** Per-pad server-side runtime. Never synced directly. */
interface PadRuntime {
  padIndex: number
  entity: Entity
  circleId: number
  phase: CirclePhase
  /** Lower-cased addresses, stable order; index is the "member index". */
  members: string[]
  memberEmotions: EmotionId[]
  memberNames: string[]
  game: MiniGameKind
  /** Color Match target sequence, as EmotionId colours. */
  sequence: EmotionId[]
  startsAt: number
  endsAt: number
  resultUntil: number

  /* Rhythm Tap ---------------------------------------------------------- */
  /** `beatHits[k]` is a bitmask of member indices that hit beat k. */
  beatHits: number[]
  hits: number

  /* Hold Zones ---------------------------------------------------------- */
  /** Bitmask of members currently holding their zone. */
  holdMask: number
  /**
   * Last time each member asserted their hold, indexed by member index.
   * A hold is a keepalive, not a latch: if a client goes quiet we drop the bit.
   * That covers a missed `onMouseUp` AND removes the "hold without holding"
   * cheat of sending a single HoldStart and letting the bit sit set.
   */
  holdSeenAt: number[]
  /** Accumulated ms during which EVERY member was holding. */
  allHoldMs: number

  /* Color Match --------------------------------------------------------- */
  step: number
  /** Bitmask of members who have tapped the current step's colour. */
  stepMask: number

  /* Result -------------------------------------------------------------- */
  comboId: string
  comboName: string
  comboBonus: number
  success: boolean
  points: number[]

  /** Throttle marker for progress pushes. */
  lastPush: number
}

const pads: PadRuntime[] = []
let hooks: CircleHooks | undefined
let nextCircleId = 1

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates the three persistent pad circle entities.
 *
 * @param syncPad called with (entity, syncId) so this module does not need to
 *                import `@dcl/sdk/network` itself.
 */
export function initCircles(
  circleHooks: CircleHooks,
  syncPad: (entity: Entity, syncId: number) => void
): void {
  hooks = circleHooks

  for (let padIndex = 0; padIndex < PAD_POSITIONS.length; padIndex++) {
    const entity = engine.addEntity()

    CircleCore.create(entity, {
      circleId: 0,
      padIndex,
      phase: CirclePhase.Gathering,
      game: MiniGameKind.RhythmTap,
      members: [],
      memberEmotions: [],
      memberNames: [],
      startsAt: 0,
      endsAt: 0,
      comboId: '',
      comboName: '',
      comboBonus: 0,
      sequence: []
    })

    CircleProgress.create(entity, {
      circleId: 0,
      progress: 0,
      hits: 0,
      beatIndex: 0,
      holdMask: 0,
      step: 0,
      stepMask: 0,
      resolved: false,
      success: false,
      points: []
    })

    syncPad(entity, padCircleSyncId(padIndex))

    pads.push({
      padIndex,
      entity,
      circleId: 0,
      phase: CirclePhase.Gathering,
      members: [],
      memberEmotions: [],
      memberNames: [],
      game: MiniGameKind.RhythmTap,
      sequence: [],
      startsAt: 0,
      endsAt: 0,
      resultUntil: 0,
      beatHits: [],
      hits: 0,
      holdMask: 0,
      holdSeenAt: [],
      allHoldMs: 0,
      step: 0,
      stepMask: 0,
      comboId: '',
      comboName: '',
      comboBonus: 0,
      success: false,
      points: [],
      lastPush: 0
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Squared horizontal distance. Y is ignored: the plaza is flat. */
function horizontalDistanceSq(
  a: { x: number; z: number },
  b: { x: number; z: number }
): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

/** True when a player stands inside the given pad. */
function isOnPad(record: PlayerRecord, padIndex: number): boolean {
  const position = getPlayerPosition(record)
  if (!position) return false
  return horizontalDistanceSq(position, PAD_POSITIONS[padIndex]) <= PAD_RADIUS * PAD_RADIUS
}

/* -------------------------------------------------------------------------- */
/* Player intents                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Handles a "Form Circle" request. Validates server-side that the player really
 * is standing on the pad they claim; the client's `padIndex` is only a hint and
 * the nearest pad wins if it disagrees.
 */
export function requestReady(record: PlayerRecord, claimedPad: number): void {
  if (record.activePad !== -1) {
    hooks?.notify(
      record.address,
      RefusalCode.AlreadyInCircle,
      'You are already in a circle.',
      NoticeTone.Info
    )
    return
  }

  const position = getPlayerPosition(record)
  if (!position) {
    hooks?.notify(
      record.address,
      RefusalCode.NotOnPad,
      'Still finding you. Try again in a second.',
      NoticeTone.Warning
    )
    return
  }

  // Trust geometry, not the client: pick the nearest pad the player is inside.
  let padIndex = -1
  let bestDistance = Number.MAX_VALUE
  for (let i = 0; i < PAD_POSITIONS.length; i++) {
    const distance = horizontalDistanceSq(position, PAD_POSITIONS[i])
    if (distance <= PAD_RADIUS * PAD_RADIUS && distance < bestDistance) {
      bestDistance = distance
      padIndex = i
    }
  }

  if (padIndex === -1) {
    hooks?.notify(
      record.address,
      RefusalCode.NotOnPad,
      'Stand on a glowing Mood Pad first.',
      NoticeTone.Warning
    )
    return
  }

  const pad = pads[padIndex]
  if (pad.phase !== CirclePhase.Gathering) {
    hooks?.notify(
      record.address,
      RefusalCode.PadBusy,
      'That pad is mid-round. Try another one.',
      NoticeTone.Warning
    )
    return
  }

  record.ready = true
  record.readyPad = padIndex
  record.readyAt = Date.now()

  if (claimedPad !== padIndex) {
    console.log('[SERVER] pad hint corrected', claimedPad, '->', padIndex, 'for', record.address)
  }
}

/** Handles a player backing out of the waiting state. */
export function cancelReady(record: PlayerRecord): void {
  record.ready = false
  record.readyPad = -1
  record.readyAt = 0
}

/**
 * Handles one mini-game input.
 *
 * Every branch re-derives timing from the server clock. A client can tell us
 * *that* it tapped but never *when*, so a doctored timestamp buys nothing.
 */
export function handleGameInput(
  record: PlayerRecord,
  circleId: number,
  kind: GameInputKind,
  value: number
): void {
  const pad = pads.find((p) => p.circleId === circleId && p.phase === CirclePhase.Playing)
  if (!pad) return

  const memberIndex = pad.members.indexOf(record.address)
  if (memberIndex === -1) return

  const now = Date.now()

  switch (kind) {
    case GameInputKind.Tap:
      if (pad.game === MiniGameKind.RhythmTap) judgeRhythmTap(pad, memberIndex, now)
      break

    case GameInputKind.HoldStart:
      if (pad.game === MiniGameKind.HoldZones) {
        pad.holdMask |= 1 << memberIndex
        // Every HoldStart doubles as a keepalive.
        pad.holdSeenAt[memberIndex] = now
      }
      break

    case GameInputKind.HoldEnd:
      if (pad.game === MiniGameKind.HoldZones) {
        pad.holdMask &= ~(1 << memberIndex)
        pad.holdSeenAt[memberIndex] = 0
      }
      break

    case GameInputKind.ColorTap:
      if (pad.game === MiniGameKind.ColorMatch) judgeColorTap(pad, memberIndex, value)
      break

    default:
      break
  }
}

/** Called when a player disconnects, so they leave any pad cleanly. */
export function handlePlayerLeft(record: PlayerRecord): void {
  cancelReady(record)
  if (record.activePad === -1) return

  const pad = pads[record.activePad]
  const memberIndex = pad.members.indexOf(record.address)
  if (memberIndex !== -1) {
    dropMember(pad, memberIndex)
  }
  record.activePad = -1
}

/* -------------------------------------------------------------------------- */
/* Mini-game judging                                                          */
/* -------------------------------------------------------------------------- */

/** Total beats in one Rhythm Tap round. */
function beatCount(): number {
  return Math.floor(MINIGAME_DURATION_MS / RHYTHM_BEAT_MS)
}

/**
 * Judges a Rhythm Tap input against the server's own beat grid.
 * A member can only score each beat once, so mashing gains nothing.
 */
function judgeRhythmTap(pad: PadRuntime, memberIndex: number, now: number): void {
  const elapsed = now - pad.startsAt
  const total = beatCount()

  // Nearest beat to the moment the tap actually arrived.
  let beat = Math.round(elapsed / RHYTHM_BEAT_MS)
  if (beat < 0) beat = 0
  if (beat >= total) beat = total - 1

  const offset = Math.abs(elapsed - beat * RHYTHM_BEAT_MS)
  if (offset > RHYTHM_TOLERANCE_MS) return

  const bit = 1 << memberIndex
  if ((pad.beatHits[beat] & bit) !== 0) return

  pad.beatHits[beat] |= bit
  pad.hits++
}

/**
 * Judges a Color Match tap.
 *
 * Cooperative by construction: the step only advances once EVERY member has
 * tapped the current colour, and a single wrong tap clears the group's progress
 * on that step. Players have to talk to each other to clear it.
 */
function judgeColorTap(pad: PadRuntime, memberIndex: number, tapped: number): void {
  if (pad.step >= pad.sequence.length) return

  const expected = pad.sequence[pad.step]
  if (tapped !== expected) {
    // Group setback, not an individual one - this is what forces coordination.
    pad.stepMask = 0
    return
  }

  pad.stepMask |= 1 << memberIndex

  if (pad.stepMask === fullMemberMask(pad)) {
    pad.step++
    pad.stepMask = 0
  }
}

/** Bitmask with one bit set per member. */
function fullMemberMask(pad: PadRuntime): number {
  return (1 << pad.members.length) - 1
}

/**
 * Drops holds the server has not heard re-asserted recently.
 *
 * This is what makes the hold honest: a client cannot set the bit once and walk
 * away, and a client whose `onMouseUp` was swallowed does not stay stuck on.
 */
function expireStaleHolds(pad: PadRuntime, now: number): void {
  for (let i = 0; i < pad.members.length; i++) {
    if ((pad.holdMask & (1 << i)) === 0) continue
    const seen = pad.holdSeenAt[i] ?? 0
    if (now - seen > HOLD_EXPIRY_MS) {
      pad.holdMask &= ~(1 << i)
    }
  }
}

/** Current 0..1 progress of the running mini-game. */
function computeProgress(pad: PadRuntime): number {
  switch (pad.game) {
    case MiniGameKind.RhythmTap: {
      const max = beatCount() * Math.max(1, pad.members.length)
      return max === 0 ? 0 : Math.min(1, pad.hits / max)
    }
    case MiniGameKind.HoldZones:
      return Math.min(1, pad.allHoldMs / HOLD_REQUIRED_MS)
    case MiniGameKind.ColorMatch:
      return pad.sequence.length === 0 ? 0 : Math.min(1, pad.step / pad.sequence.length)
    default:
      return 0
  }
}

/** Whether the group has definitively cleared the objective. */
function objectiveMet(pad: PadRuntime): boolean {
  switch (pad.game) {
    case MiniGameKind.RhythmTap: {
      const max = beatCount() * Math.max(1, pad.members.length)
      return pad.hits >= Math.ceil(max * RHYTHM_SUCCESS_RATIO)
    }
    case MiniGameKind.HoldZones:
      return pad.allHoldMs >= HOLD_REQUIRED_MS
    case MiniGameKind.ColorMatch:
      return pad.step >= pad.sequence.length
    default:
      return false
  }
}

/* -------------------------------------------------------------------------- */
/* Phase machine                                                              */
/* -------------------------------------------------------------------------- */

/** Advances every pad. Called once per server tick. */
export function tickCircles(dtMs: number, now: number): void {
  expireStaleReadyFlags(now)
  for (const pad of pads) {
    tickPad(pad, dtMs, now)
  }
}

/** Clears ready flags that have gone cold, so pads do not show phantom players. */
function expireStaleReadyFlags(now: number): void {
  for (const record of allPlayers()) {
    if (!record.ready) continue
    if (record.activePad !== -1) continue

    const expired = now - record.readyAt > READY_WINDOW_MS
    const wandered = record.readyPad === -1 || !isOnPad(record, record.readyPad)

    if (expired || wandered) {
      cancelReady(record)
    }
  }
}

function tickPad(pad: PadRuntime, dtMs: number, now: number): void {
  switch (pad.phase) {
    case CirclePhase.Gathering:
      tickGathering(pad, now)
      break
    case CirclePhase.Countdown:
      tickCountdown(pad, now)
      break
    case CirclePhase.Playing:
      tickPlaying(pad, dtMs, now)
      break
    case CirclePhase.Result:
      if (now >= pad.resultUntil) resetPad(pad)
      break
    default:
      resetPad(pad)
      break
  }
}

/**
 * While gathering, the pad publishes whoever is currently waiting on it - even a
 * single player. That is deliberate: other players in the plaza can see "Ava is
 * waiting at the north pad" and walk over, which is the whole social hook.
 */
function tickGathering(pad: PadRuntime, now: number): void {
  const selected = selectCircleMembers(pad.padIndex)

  const changed =
    selected.length !== pad.members.length ||
    selected.some((record, i) => record.address !== pad.members[i])

  if (changed) {
    pad.members = selected.map((r) => r.address)
    pad.memberEmotions = selected.map((r) => r.emotion)
    pad.memberNames = selected.map((r) => r.displayName)
    writeCore(pad)
  }

  if (selected.length >= MIN_CIRCLE_PLAYERS) {
    startCountdown(pad, selected, now)
  }
}

/**
 * Chooses who forms the circle on a pad.
 *
 * Greedy and deterministic: the longest-waiting eligible player anchors the
 * circle, then anyone within CIRCLE_PROXIMITY of EVERY already-selected member
 * joins. Checking against all selected members (not just the anchor) is what
 * makes "within 3 units of each other" actually true pairwise.
 */
function selectCircleMembers(padIndex: number): PlayerRecord[] {
  const candidates = allPlayers()
    .filter(
      (record) =>
        record.ready &&
        record.readyPad === padIndex &&
        record.activePad === -1 &&
        isOnPad(record, padIndex)
    )
    .sort((a, b) => a.readyAt - b.readyAt)

  const selected: PlayerRecord[] = []
  const limitSq = CIRCLE_PROXIMITY * CIRCLE_PROXIMITY

  for (const candidate of candidates) {
    if (selected.length >= MAX_CIRCLE_PLAYERS) break

    const candidatePosition = getPlayerPosition(candidate)
    if (!candidatePosition) continue

    const closeToAll = selected.every((member) => {
      const memberPosition = getPlayerPosition(member)
      if (!memberPosition) return false
      return horizontalDistanceSq(candidatePosition, memberPosition) <= limitSq
    })

    if (closeToAll) selected.push(candidate)
  }

  return selected
}

/** Locks the roster, picks a mini-game, and starts the pre-round countdown. */
function startCountdown(pad: PadRuntime, members: PlayerRecord[], now: number): void {
  pad.circleId = nextCircleId++
  pad.phase = CirclePhase.Countdown
  pad.members = members.map((r) => r.address)
  pad.memberEmotions = members.map((r) => r.emotion)
  pad.memberNames = members.map((r) => r.displayName)
  pad.game = Math.floor(Math.random() * 3) as MiniGameKind
  pad.startsAt = now + COUNTDOWN_MS
  pad.endsAt = pad.startsAt + MINIGAME_DURATION_MS

  const combo = evaluateCombo(pad.memberEmotions)
  pad.comboId = combo.id
  pad.comboName = combo.name
  pad.comboBonus = combo.bonus

  pad.sequence =
    pad.game === MiniGameKind.ColorMatch ? buildColorSequence(pad.memberEmotions) : []

  // Reset accumulators.
  pad.beatHits = new Array<number>(beatCount()).fill(0)
  pad.hits = 0
  pad.holdMask = 0
  pad.holdSeenAt = new Array<number>(pad.members.length).fill(0)
  pad.allHoldMs = 0
  pad.step = 0
  pad.stepMask = 0
  pad.success = false
  pad.points = []

  for (const record of members) {
    record.activePad = pad.padIndex
    record.ready = false
    record.readyPad = -1
  }

  writeCore(pad)
  writeProgress(pad, now, true)

  hooks?.announceFormed(pad.circleId, pad.padIndex, pad.members.length, pad.game)
  console.log(
    '[SERVER] circle',
    pad.circleId,
    'formed on pad',
    pad.padIndex,
    'with',
    pad.members.length,
    'players, game',
    pad.game
  )
}

/**
 * Builds the Color Match sequence.
 *
 * Drawn from the circle's own emotion colours where possible, so the puzzle
 * reads as "your group's palette" rather than arbitrary colours. Padded with
 * random emotions when the group is small.
 */
function buildColorSequence(memberEmotions: EmotionId[]): EmotionId[] {
  const palette = memberEmotions.slice()
  while (palette.length < 3) {
    palette.push(Math.floor(Math.random() * EMOTION_COUNT) as EmotionId)
  }

  const sequence: EmotionId[] = []
  for (let i = 0; i < COLOR_SEQUENCE_LENGTH; i++) {
    sequence.push(palette[Math.floor(Math.random() * palette.length)])
  }
  return sequence
}

/** During the countdown, a member wandering off the pad aborts the round. */
function tickCountdown(pad: PadRuntime, now: number): void {
  for (let i = pad.members.length - 1; i >= 0; i--) {
    const record = findMember(pad, i)
    if (!record || !isOnPad(record, pad.padIndex)) {
      dropMember(pad, i)
    }
  }

  if (pad.members.length < MIN_CIRCLE_PLAYERS) {
    abortPad(pad)
    return
  }

  if (now >= pad.startsAt) {
    pad.phase = CirclePhase.Playing
    writeCore(pad)
    writeProgress(pad, now, true)
  }
}

function tickPlaying(pad: PadRuntime, dtMs: number, now: number): void {
  if (pad.game === MiniGameKind.HoldZones) {
    expireStaleHolds(pad, now)

    // Only accumulates while EVERY member is holding at once. That shared
    // condition is what makes the game cooperative rather than parallel.
    if (pad.holdMask === fullMemberMask(pad)) {
      pad.allHoldMs += dtMs
    }
  }

  // A member who disconnects mid-round is dropped; if too few remain the round
  // resolves as a failure but the survivors still keep their base points.
  for (let i = pad.members.length - 1; i >= 0; i--) {
    if (!findMember(pad, i)) dropMember(pad, i)
  }

  if (pad.members.length < MIN_CIRCLE_PLAYERS) {
    resolvePad(pad, now, false)
    return
  }

  if (objectiveMet(pad) || now >= pad.endsAt) {
    resolvePad(pad, now, objectiveMet(pad))
    return
  }

  writeProgress(pad, now, false)
}

/** Judges the round, pays it out, and moves to the result phase. */
function resolvePad(pad: PadRuntime, now: number, success: boolean): void {
  pad.success = success
  pad.phase = CirclePhase.Result
  pad.resultUntil = now + RESULT_MS

  const members: PlayerRecord[] = []
  for (let i = 0; i < pad.members.length; i++) {
    const record = findMember(pad, i)
    if (record) members.push(record)
  }

  pad.points = hooks?.award(members, success, pad.comboBonus > 0, pad.circleId) ?? []

  for (const record of members) {
    record.activePad = -1
  }

  hooks?.announceResolved(pad.circleId, success)
  hooks?.countCircle()

  writeCore(pad)
  writeProgress(pad, now, true)

  console.log('[SERVER] circle', pad.circleId, success ? 'SUCCESS' : 'failed')
}

/** Abandons a round before it started (not enough players stayed). */
function abortPad(pad: PadRuntime): void {
  for (let i = 0; i < pad.members.length; i++) {
    const record = findMember(pad, i)
    if (!record) continue
    record.activePad = -1
    hooks?.publishStat(record)
    // Tell them why. Previously the panel just disappeared mid-countdown with no
    // explanation, which reads as a bug rather than as somebody walking away.
    hooks?.notify(
      record.address,
      RefusalCode.NeedMorePlayers,
      'Someone stepped out of the ring. Tap Form Circle to try again.',
      NoticeTone.Warning
    )
  }
  resetPad(pad)
}

/** Returns the pad to an empty gathering state. */
function resetPad(pad: PadRuntime): void {
  pad.phase = CirclePhase.Gathering
  pad.circleId = 0
  pad.members = []
  pad.memberEmotions = []
  pad.memberNames = []
  pad.sequence = []
  pad.startsAt = 0
  pad.endsAt = 0
  pad.resultUntil = 0
  pad.beatHits = []
  pad.hits = 0
  pad.holdMask = 0
  pad.holdSeenAt = []
  pad.allHoldMs = 0
  pad.step = 0
  pad.stepMask = 0
  pad.comboId = ''
  pad.comboName = ''
  pad.comboBonus = 0
  pad.success = false
  pad.points = []

  writeCore(pad)
  writeProgress(pad, Date.now(), true)
}

/** Removes one member and compacts every parallel array and bitmask. */
function dropMember(pad: PadRuntime, memberIndex: number): void {
  // CRITICAL: release the per-player lock before losing the roster entry.
  //
  // `activePad` is what gates joining a circle, being selected for one, and
  // changing mood. It is otherwise only cleared by `resolvePad` / `abortPad`,
  // and both of those iterate the roster - so a player dropped here would keep
  // the lock forever and be permanently unable to play again, silently. The
  // player is still connected in the common case (they stepped off the pad
  // during the countdown), which is exactly the case that used to leak.
  const dropped = findMember(pad, memberIndex)
  if (dropped) {
    dropped.activePad = -1
    dropped.ready = false
    dropped.readyPad = -1
    hooks?.publishStat(dropped)
  }

  pad.members.splice(memberIndex, 1)
  pad.memberEmotions.splice(memberIndex, 1)
  pad.memberNames.splice(memberIndex, 1)

  // Bitmasks are indexed by member position, so removing a member means every
  // higher bit shifts down one place.
  pad.holdMask = compactMask(pad.holdMask, memberIndex)
  pad.stepMask = compactMask(pad.stepMask, memberIndex)
  pad.holdSeenAt.splice(memberIndex, 1)
  for (let i = 0; i < pad.beatHits.length; i++) {
    pad.beatHits[i] = compactMask(pad.beatHits[i], memberIndex)
  }

  // Recount hits after compaction so progress stays honest.
  pad.hits = pad.beatHits.reduce((sum, mask) => sum + popCount(mask), 0)

  // Dropping a member shrinks `fullMemberMask`, so a Color Match step that the
  // remaining players had all already tapped may now be complete. The advance
  // check normally only runs on a tap, so re-run it here or progress appears to
  // freeze until someone taps again.
  if (
    pad.game === MiniGameKind.ColorMatch &&
    pad.members.length > 0 &&
    pad.step < pad.sequence.length &&
    pad.stepMask === fullMemberMask(pad)
  ) {
    pad.step++
    pad.stepMask = 0
  }

  writeCore(pad)
}

/** Drops bit `index` from a mask and shifts the higher bits down. */
function compactMask(mask: number, index: number): number {
  const low = mask & ((1 << index) - 1)
  const high = mask >> (index + 1)
  return low | (high << index)
}

/** Number of set bits. */
function popCount(mask: number): number {
  let count = 0
  let value = mask
  while (value !== 0) {
    value &= value - 1
    count++
  }
  return count
}

/** Resolves a member index to a live player record, or undefined if gone. */
function findMember(pad: PadRuntime, memberIndex: number): PlayerRecord | undefined {
  const address = pad.members[memberIndex]
  if (!address) return undefined
  return allPlayers().find((record) => record.address === address)
}

/* -------------------------------------------------------------------------- */
/* Publishing                                                                 */
/* -------------------------------------------------------------------------- */

/** Writes the slow-changing half of the circle state. */
function writeCore(pad: PadRuntime): void {
  const core = CircleCore.getMutableOrNull(pad.entity)
  if (!core) return
  core.circleId = pad.circleId
  core.padIndex = pad.padIndex
  core.phase = pad.phase
  core.game = pad.game
  core.members = pad.members.slice()
  core.memberEmotions = pad.memberEmotions.slice()
  core.memberNames = pad.memberNames.slice()
  core.startsAt = pad.startsAt
  core.endsAt = pad.endsAt
  core.comboId = pad.comboId
  core.comboName = pad.comboName
  core.comboBonus = pad.comboBonus
  core.sequence = pad.sequence.slice()
}

/**
 * Writes the fast-changing half, throttled to PROGRESS_PUSH_MS.
 * `force` bypasses the throttle for phase transitions and results.
 */
function writeProgress(pad: PadRuntime, now: number, force: boolean): void {
  if (!force && now - pad.lastPush < PROGRESS_PUSH_MS) return
  pad.lastPush = now

  const progress = CircleProgress.getMutableOrNull(pad.entity)
  if (!progress) return

  progress.circleId = pad.circleId
  progress.progress = computeProgress(pad)
  progress.hits = pad.hits
  progress.beatIndex = pad.startsAt
    ? Math.max(0, Math.floor((now - pad.startsAt) / RHYTHM_BEAT_MS))
    : 0
  progress.holdMask = pad.holdMask
  progress.step = pad.step
  progress.stepMask = pad.stepMask
  progress.resolved = pad.phase === CirclePhase.Result
  progress.success = pad.success
  progress.points = pad.points.slice()
}
