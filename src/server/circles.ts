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
  CUE_EXPIRY_MS,
  COLOR_MISTAKE_SETBACK,
  COLOR_PALETTE_SIZE,
  COLOR_SEQUENCE_LENGTH,
  COUNTDOWN_MS,
  HOLD_BREAK_PENALTY_MS,
  HOLD_EXPIRY_MS,
  HOLD_REQUIRED_MS,
  MAX_CIRCLE_PLAYERS,
  MINIGAME_DURATION_MS,
  MIN_CIRCLE_PLAYERS,
  PAD_DWELL_MS,
  PAD_POSITIONS,
  PAD_RADIUS,
  PROGRESS_PUSH_MS,
  RESULT_MS,
  RHYTHM_SUCCESS_RATIO,
  RHYTHM_TOLERANCE_MS,
  REACTION_CUES,
  REACTION_MAX_DELAY_MS,
  REACTION_MIN_DELAY_MS,
  SYNC_TARGET,
  SYNC_WINDOW_MS,
  TAP_RACE_TARGET
} from '../shared/config'
import { requiredForPad } from '../shared/config'
import { applyMoodPerk, toleranceFor } from '../shared/moodPerks'
import { beatCount, beatOffset, nearestBeat } from '../shared/rhythm'
import { markerInZone } from '../shared/syncTap'
import { evaluateCombo } from '../shared/emotions'
import { NoticeTone, RefusalCode } from '../shared/messages'
import { CircleCore, CircleProgress, padCircleSyncId } from '../shared/schemas'
import {
  CirclePhase,
  EMOTION_COUNT,
  EmotionId,
  GameInputKind,
  MINIGAME_COUNT,
  MiniGameKind
} from '../shared/types'
import { PlayerRecord, allPlayers, getPlayerPosition } from './state'

/** Callbacks the owner (server/index.ts) supplies so this module stays decoupled. */
export interface CircleHooks {
  /**
   * Pays out a resolved circle. Returns points per member, parallel to `members`.
   * Implemented in `index.ts` because it needs the leaderboard and persistence.
   */
  award: (
    members: PlayerRecord[],
    success: boolean,
    comboMatched: boolean,
    circleId: number,
    memberScores: number[]
  ) => number[]
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
  /**
   * Whether every member was holding as of the previous tick.
   *
   * Exists only so the break penalty fires ONCE per break, on the falling edge, rather
   * than every tick the chain is down.
   */
  holdChainLive: boolean

  /* Competitive scoring -------------------------------------------------- */
  /**
   * Per-member performance in the current mini-game, by member index.
   *
   * Every game feeds this, which is what lets one placement mechanism serve all
   * six of them.
   */
  memberScore: number[]
  /**
   * How many discrete scoring actions each member has made this round.
   * Drives the "every Nth point" perks (Focus, Love).
   */
  perkCounter: number[]

  /* Tap Race ------------------------------------------------------------- */
  /**
   * Raw tap count per member, WITHOUT perk inflation.
   *
   * The objective and the progress bar read this, so "First to 24" means 24 actual
   * taps for every mood. Comparing the perk-inflated `memberScore` against the
   * target meant Energy needed 12 taps where Calm needed 24, and it inverted the
   * perk design by making selfish moods clear the SHARED objective faster.
   * `memberScore` still drives ranking, so perks continue to decide placement.
   */
  taps: number[]

  /* Reaction ------------------------------------------------------------- */
  /** Server clock at which the current cue fires. 0 when none is scheduled. */
  cueAt: number
  /** True once the current cue has fired and is claimable. */
  cueLive: boolean
  /** Cues completed so far. */
  cuesDone: number
  /** Member indices that jumped the gun and are locked out of this cue. */
  cueLockout: number[]

  /* Sync Tap ------------------------------------------------------------- */
  /** Last tap time per member index, for the simultaneity check. */
  syncTapAt: number[]
  /** Completed group syncs. */
  syncs: number

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
      required: requiredForPad(padIndex),
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
      points: [],
      memberScore: [],
      cueAt: 0
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
      holdChainLive: false,
      memberScore: [],
      perkCounter: [],
      taps: [],
      cueAt: 0,
      cueLive: false,
      cuesDone: 0,
      cueLockout: [],
      syncTapAt: [],
      syncs: 0,
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
 * Legacy no-op kept for older clients.
 *
 * There is no Form Circle button any more - standing on a pad is what fills it.
 * A client that still sends `formCircle` gets told so rather than being ignored.
 */
export function requestReady(record: PlayerRecord, _claimedPad: number): void {
  if (record.activePad !== -1) return

  hooks?.notify(
    record.address,
    RefusalCode.None,
    record.onPad === -1
      ? 'Just stand inside a glowing ring - circles start on their own.'
      : 'No need to tap - the circle starts as soon as the ring is full.',
    NoticeTone.Info
  )
}

/** Legacy no-op. Presence is now the only thing that fills a pad. */
export function cancelReady(_record: PlayerRecord): void {
  // Intentionally empty: there is no opt-in state to cancel. Stepping off the pad
  // is how you leave, and `refreshPadPresence` picks that up on the next tick.
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
      else if (pad.game === MiniGameKind.SyncTap) judgeSyncTap(pad, memberIndex, now)
      else if (pad.game === MiniGameKind.TapRace) judgeTapRace(pad, memberIndex)
      else if (pad.game === MiniGameKind.Reaction) judgeReaction(pad, memberIndex, now)
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

/**
 * Judges a Rhythm Tap input against the shared, ACCELERATING beat grid.
 *
 * A member can only score each beat once, so mashing gains nothing. The grid comes
 * from `shared/rhythm.ts` rather than a local `elapsed / interval` calculation - with a
 * changing interval that arithmetic no longer describes where the beats are, and any
 * drift between this and the ring the player is watching makes the round unwinnable.
 */
function judgeRhythmTap(pad: PadRuntime, memberIndex: number, now: number): void {
  const elapsed = now - pad.startsAt

  const beat = nearestBeat(elapsed)
  const offset = beatOffset(elapsed)

  // Calm's perk widens this window, which is why it is the mood to pick when a
  // group keeps narrowly missing a timing round.
  const tolerance = RHYTHM_TOLERANCE_MS * toleranceFor(pad.memberEmotions[memberIndex] ?? 0)
  if (offset > tolerance) return

  const bit = 1 << memberIndex
  if ((pad.beatHits[beat] & bit) !== 0) return

  pad.beatHits[beat] |= bit
  pad.hits++
  scoreWithPerk(pad, memberIndex, 1)
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
    //
    // Losing GROUND as well as the partial step is what closes the brute-force hole:
    // when a mistake only reset `stepMask`, a group could tap all five pads at every
    // step and advance on the one that happened to be right, never reading the reveal.
    // Now a guess has a worse expected value than remembering.
    pad.stepMask = 0
    pad.step = Math.max(0, pad.step - COLOR_MISTAKE_SETBACK)
    return
  }

  pad.stepMask |= 1 << memberIndex
  // Credit the contribution, so the player who keeps up scores higher than the one
  // the group is always waiting on.
  scoreWithPerk(pad, memberIndex, 1)

  if (pad.stepMask === fullMemberMask(pad)) {
    pad.step++
    pad.stepMask = 0
  }
}

/**
 * Judges a Sync Tap input.
 *
 * A tap only counts if the marker is in the zone, and a SYNC only completes when
 * every member has a qualifying tap inside the same `SYNC_WINDOW_MS`. Nothing an
 * individual does moves the bar on its own, which is the point: the group has to
 * count down together.
 *
 * Timing comes from the server's own clock and the shared `markerInZone`, so a
 * client cannot claim a tap landed in the zone when it did not.
 */
function judgeSyncTap(pad: PadRuntime, memberIndex: number, now: number): void {
  if (!markerInZone(pad.startsAt, now)) {
    // A tap outside the zone costs the group its partial sync, so mashing through
    // the sweep actively hurts rather than being free.
    pad.syncTapAt = new Array<number>(pad.members.length).fill(0)
    return
  }

  pad.syncTapAt[memberIndex] = now

  const everyoneTapped = pad.members.every((_, index) => {
    const at = pad.syncTapAt[index] ?? 0
    if (at === 0) return false
    // Each member's own tolerance applies, so one Calm player makes the whole sync
    // easier to land - a small, legible reason to want one in the circle.
    const window = SYNC_WINDOW_MS * toleranceFor(pad.memberEmotions[index] ?? 0)
    return now - at <= window
  })

  if (everyoneTapped) {
    pad.syncs++
    // A sync belongs to the whole group, so everyone is credited equally. Sync Tap
    // is deliberately the one round with no individual winner, so this stays raw -
    // a perk here would break the "everyone scores the same" guarantee it relies on.
    for (let i = 0; i < pad.members.length; i++) bumpScore(pad, i, 1)
    pad.syncTapAt = new Array<number>(pad.members.length).fill(0)
  }
}

/**
 * Adds to a member's live score. RAW - no mood perk applied.
 *
 * Used for continuous accumulation (Hold Zones' held time), where applying a perk
 * like "give +1 to whoever is last" thirty times a second would break the game.
 */
function bumpScore(pad: PadRuntime, memberIndex: number, amount: number): void {
  pad.memberScore[memberIndex] = (pad.memberScore[memberIndex] ?? 0) + amount
}

/**
 * Scores a DISCRETE action with the member's mood perk applied.
 *
 * This is where moods stop being decoration: the same tap is worth a different
 * amount, or feeds a different player, depending on the mood its owner chose.
 *
 * The random roll is generated here so it stays server-side - a client must not be
 * able to predict or influence a Curiosity wildcard.
 */
function scoreWithPerk(pad: PadRuntime, memberIndex: number, amount: number): void {
  const emotion = pad.memberEmotions[memberIndex] ?? 0
  pad.perkCounter[memberIndex] = (pad.perkCounter[memberIndex] ?? 0) + 1

  const outcome = applyMoodPerk(
    emotion,
    amount,
    pad.perkCounter[memberIndex],
    Math.random()
  )

  bumpScore(pad, memberIndex, outcome.self)

  // Feed the lowest-scoring ACTIVE member, excluding the scorer.
  //
  // "Active" means they have scored at least once themselves this round. Without
  // that filter a Joy player tapping 24 times in a Duo handed an idle partner 24
  // points, a tied first place and the full placement bonus for doing nothing. A
  // generous perk should help someone who is behind but trying, not carry a
  // passenger.
  if (outcome.toLowest > 0 && pad.members.length > 1) {
    let lowestIndex = -1
    let lowest = Number.MAX_VALUE
    for (let i = 0; i < pad.members.length; i++) {
      if (i === memberIndex) continue
      if ((pad.perkCounter[i] ?? 0) === 0) continue
      const score = pad.memberScore[i] ?? 0
      if (score < lowest) {
        lowest = score
        lowestIndex = i
      }
    }
    if (lowestIndex !== -1) bumpScore(pad, lowestIndex, outcome.toLowest)
  }

  // Feed every ACTIVE member except the scorer, same reasoning.
  if (outcome.toAll > 0) {
    for (let i = 0; i < pad.members.length; i++) {
      if (i === memberIndex) continue
      if ((pad.perkCounter[i] ?? 0) === 0) continue
      bumpScore(pad, i, outcome.toAll)
    }
  }
}

/**
 * Tap Race: pure speed. Every tap counts, first to the target wins the round for
 * the group.
 *
 * The group objective is "somebody got there", so a fast player carries everyone to
 * the mini-game bonus while placement still rewards them for being fastest. That
 * keeps a slower player glad to be in the circle rather than resentful.
 */
function judgeTapRace(pad: PadRuntime, memberIndex: number): void {
  // Raw taps drive the objective; the perk-weighted score drives placement.
  pad.taps[memberIndex] = (pad.taps[memberIndex] ?? 0) + 1
  scoreWithPerk(pad, memberIndex, 1)
}

/** A random wait before the next Reaction cue. */
function nextCueDelay(): number {
  return (
    REACTION_MIN_DELAY_MS +
    Math.random() * (REACTION_MAX_DELAY_MS - REACTION_MIN_DELAY_MS)
  )
}

/**
 * Reaction: first tap after the cue fires takes the point.
 *
 * Tapping BEFORE the cue locks you out of that cue, so mashing is actively
 * punished rather than being a free win - without that, the whole game degenerates
 * into holding the button down.
 */
function judgeReaction(pad: PadRuntime, memberIndex: number, now: number): void {
  if (!pad.cueLive) {
    // Jumped the gun.
    if (pad.cueLockout.indexOf(memberIndex) === -1) {
      pad.cueLockout.push(memberIndex)
    }
    return
  }

  if (pad.cueLockout.indexOf(memberIndex) !== -1) return

  // First claim wins the cue.
  scoreWithPerk(pad, memberIndex, 1)
  pad.cuesDone++
  scheduleNextCue(pad, now)
}

/** Advances the Reaction cue schedule. Called from the playing tick. */
function tickReaction(pad: PadRuntime, now: number): void {
  if (pad.game !== MiniGameKind.Reaction) return

  if (pad.cueLive) {
    // DEADLOCK GUARD. Now that lockouts actually persist into a live cue, it is
    // possible for every member to have jumped the gun - and then nobody can claim
    // the cue, `cueLive` stays true, and the client's GO plate sits green and
    // unclaimable for the rest of the round. Abandon such a cue and move on.
    const everyoneLockedOut =
      pad.members.length > 0 && pad.cueLockout.length >= pad.members.length
    // Also abandon a cue nobody claims, so one shy round cannot stall the rest.
    const expired = now - pad.cueAt > CUE_EXPIRY_MS

    if (everyoneLockedOut || expired) {
      scheduleNextCue(pad, now)
      writeProgress(pad, now, true)
    }
    return
  }

  if (pad.cueAt === 0) return
  if (now < pad.cueAt) return

  pad.cueLive = true
  // NOTE: the lockout is deliberately NOT cleared here.
  //
  // It used to be, which silently disabled the entire anti-mash mechanic: the only
  // moment the lockout is ever read is while a cue is live, so wiping it at the
  // instant the cue fired made the guard in `judgeReaction` unreachable and a player
  // holding the button down won every cue. Lockouts are cleared when the NEXT cue is
  // scheduled instead - see `scheduleNextCue`.

  // Force the push. Progress is normally throttled to PROGRESS_PUSH_MS, which would
  // add up to 150ms of dead time to a reaction game - the one game where that delay
  // is the thing being measured.
  writeProgress(pad, now, true)
}

/**
 * Schedules the next Reaction cue and clears the lockouts.
 *
 * Clearing here rather than at fire time is what makes the early-tap penalty real:
 * a lockout earned during the wait survives into the cue it was earned for.
 */
function scheduleNextCue(pad: PadRuntime, now: number): void {
  pad.cueLive = false
  pad.cueLockout = []
  pad.cueAt = pad.cuesDone >= REACTION_CUES ? 0 : now + nextCueDelay()
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
    case MiniGameKind.SyncTap:
      return Math.min(1, pad.syncs / SYNC_TARGET)
    case MiniGameKind.TapRace: {
      const best = pad.taps.reduce((m, v) => Math.max(m, v), 0)
      return Math.min(1, best / TAP_RACE_TARGET)
    }
    case MiniGameKind.Reaction:
      return Math.min(1, pad.cuesDone / REACTION_CUES)
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
    case MiniGameKind.SyncTap:
      return pad.syncs >= SYNC_TARGET
    case MiniGameKind.TapRace:
      // RAW taps, so the target means the same number of taps for every mood.
      return pad.taps.some((count) => count >= TAP_RACE_TARGET)
    case MiniGameKind.Reaction:
      return pad.cuesDone >= REACTION_CUES
    default:
      return false
  }
}

/* -------------------------------------------------------------------------- */
/* Phase machine                                                              */
/* -------------------------------------------------------------------------- */

/** Advances every pad. Called once per server tick. */
export function tickCircles(dtMs: number, now: number): void {
  refreshPadPresence(now)
  for (const pad of pads) {
    tickPad(pad, dtMs, now)
  }
}

/**
 * Recomputes which pad each player is standing on.
 *
 * `onPadSince` is only reset when the pad actually CHANGES, so a player who stands
 * still keeps accumulating dwell time and is not repeatedly re-timed by this
 * running every tick.
 */
function refreshPadPresence(now: number): void {
  for (const record of allPlayers()) {
    const position = getPlayerPosition(record)

    let padIndex = -1
    if (position) {
      let bestDistance = Number.MAX_VALUE
      for (let i = 0; i < PAD_POSITIONS.length; i++) {
        const distance = horizontalDistanceSq(position, PAD_POSITIONS[i])
        if (distance <= PAD_RADIUS * PAD_RADIUS && distance < bestDistance) {
          bestDistance = distance
          padIndex = i
        }
      }
    }

    // Only reset the dwell clock when the pad actually CHANGES, so standing still
    // keeps accumulating time rather than being re-timed every tick.
    if (record.onPad !== padIndex) {
      record.onPad = padIndex
      record.onPadSince = now
    }

    // `ready` is DERIVED every tick, not written once on entry.
    //
    // It used to be set only inside the change guard above, while startCountdown,
    // dropMember and abortPad all cleared it WITHOUT moving the player - so after a
    // round a player standing in the ring kept `ready === false` forever, which
    // silently killed their waving emote and the Call button highlight until they
    // stepped off the pad and back on.
    const derivedReady = padIndex !== -1 && record.activePad === -1
    if (record.ready !== derivedReady || record.readyPad !== padIndex) {
      record.ready = derivedReady
      record.readyPad = padIndex
      hooks?.publishStat(record)
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
  const required = requiredForPad(pad.padIndex)

  const changed =
    selected.length !== pad.members.length ||
    selected.some((record, i) => record.address !== pad.members[i])

  if (changed) {
    pad.members = selected.map((r) => r.address)
    pad.memberEmotions = selected.map((r) => r.emotion)
    pad.memberNames = selected.map((r) => r.displayName)
    writeCore(pad)
  }

  // Auto-start once the tier is satisfied. No button, no confirmation: if you are
  // standing in the ring with enough people, the round begins. The existing
  // 3-second countdown doubles as the grace period - `tickCountdown` aborts if
  // anyone steps back out, so an accidental fill costs nobody a round.
  if (selected.length >= required) {
    // Anyone standing on the pad who did not make this round is told so, and is
    // first in line next time because selection is ordered by dwell time.
    notifyPassedOver(pad.padIndex, selected, now)
    startCountdown(pad, selected, now)
  }
}

/**
 * Chooses who is currently filling a pad.
 *
 * PRESENCE IS THE ONLY REQUIREMENT. Standing on the pad for `PAD_DWELL_MS` is
 * enough - there is no button and no ready flag. That is the fix for circles never
 * starting: the old version required every member to have tapped Form Circle with
 * all their flags alive in the same 6-second window, which silently failed whenever
 * one person did not find the button or two people tapped too far apart.
 *
 * Ordered by how long each player has been on the pad, so if more players are
 * present than the tier needs, the ones who have waited longest go first.
 */
function selectCircleMembers(padIndex: number): PlayerRecord[] {
  const now = Date.now()

  const candidates = allPlayers()
    .filter(
      (record) =>
        record.activePad === -1 &&
        record.onPad === padIndex &&
        now - record.onPadSince >= PAD_DWELL_MS
    )
    .sort((a, b) => a.onPadSince - b.onPadSince)

  const selected: PlayerRecord[] = []
  const limitSq = CIRCLE_PROXIMITY * CIRCLE_PROXIMITY
  // Cap at the PAD'S OWN tier, not the global maximum. Capping at MAX_CIRCLE_PLAYERS
  // meant three players on a Duo pad published a roster of 3 against a required 2,
  // so the HUD and the in-world label both rendered "3/2" for a frame and then
  // startCountdown silently dropped the third player with no explanation.
  const capacity = Math.min(requiredForPad(padIndex), MAX_CIRCLE_PLAYERS)

  for (const candidate of candidates) {
    if (selected.length >= capacity) break

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

/**
 * Tells anyone on the pad who was not seated that they are next.
 *
 * Being passed over used to be completely silent: the player stood in the ring while
 * a round started around them with no explanation.
 */
function notifyPassedOver(padIndex: number, selected: PlayerRecord[], now: number): void {
  for (const record of allPlayers()) {
    if (record.activePad !== -1) continue
    if (record.onPad !== padIndex) continue
    if (now - record.onPadSince < PAD_DWELL_MS) continue
    if (selected.indexOf(record) !== -1) continue

    hooks?.notify(
      record.address,
      RefusalCode.PadBusy,
      'This ring was full - you are first in line for the next round.',
      NoticeTone.Info
    )
  }
}

/** Locks the roster, picks a mini-game, and starts the pre-round countdown. */
function startCountdown(pad: PadRuntime, members: PlayerRecord[], now: number): void {
  pad.circleId = nextCircleId++
  pad.phase = CirclePhase.Countdown
  pad.members = members.map((r) => r.address)
  pad.memberEmotions = members.map((r) => r.emotion)
  pad.memberNames = members.map((r) => r.displayName)
  pad.game = Math.floor(Math.random() * MINIGAME_COUNT) as MiniGameKind
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
  pad.holdChainLive = false
  pad.syncTapAt = new Array<number>(pad.members.length).fill(0)
  pad.syncs = 0
  pad.memberScore = new Array<number>(pad.members.length).fill(0)
  pad.perkCounter = new Array<number>(pad.members.length).fill(0)
  pad.taps = new Array<number>(pad.members.length).fill(0)
  pad.cuesDone = 0
  pad.cueLive = false
  pad.cueLockout = []
  // Reaction schedules its first cue relative to the start of play.
  pad.cueAt =
    pad.game === MiniGameKind.Reaction ? pad.startsAt + nextCueDelay() : 0
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
 * random emotions up to `COLOR_PALETTE_SIZE`.
 *
 * The palette is de-duplicated and filled to the full palette size. Previously it was
 * the raw member emotions padded to three, which meant a duo who both picked Joy played
 * a sequence drawn from two or three colours while the client still drew five buttons -
 * two of them provably never used. Filling the palette makes every button a live
 * possibility, so guessing is genuinely a one-in-five bet.
 */
function buildColorSequence(memberEmotions: EmotionId[]): EmotionId[] {
  const palette: EmotionId[] = []
  for (const emotion of memberEmotions) {
    if (palette.indexOf(emotion) === -1) palette.push(emotion)
  }

  // Fill by scanning from a random start so the decoys are not always the lowest ids.
  const offset = Math.floor(Math.random() * EMOTION_COUNT)
  for (let i = 0; i < EMOTION_COUNT && palette.length < COLOR_PALETTE_SIZE; i++) {
    const candidate = ((offset + i) % EMOTION_COUNT) as EmotionId
    if (palette.indexOf(candidate) === -1) palette.push(candidate)
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

  // Aborting on the tier count would be harsh: if a fourth player wanders off a
  // Squad pad the remaining three should still get to play. Only collapse below
  // the absolute minimum.
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
    const everyoneHolding = pad.holdMask === fullMemberMask(pad)

    if (everyoneHolding) {
      pad.allHoldMs += dtMs
    } else if (pad.holdChainLive) {
      // The chain just broke. Charge the group for it once, on the transition, so a
      // release costs a fixed amount rather than draining continuously - a player who
      // is disconnected or fumbling shouldn't be able to zero the round out.
      //
      // Without any penalty the total only ever climbed, so letting go was free and
      // the round had no tension: everyone could release whenever it got dull and
      // re-grab later with nothing lost.
      pad.allHoldMs = Math.max(0, pad.allHoldMs - HOLD_BREAK_PENALTY_MS)
    }

    pad.holdChainLive = everyoneHolding

    // Individually, credit every member for the time THEY held, in tenths of a
    // second. The group needs everyone, but the player who never lets go wins.
    for (let i = 0; i < pad.members.length; i++) {
      if ((pad.holdMask & (1 << i)) !== 0) {
        bumpScore(pad, i, dtMs / 100)
      }
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

  tickReaction(pad, now)

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

  // Build the live roster AND its scores together, so the two arrays cannot drift.
  //
  // Previously `award` received the filtered record list alongside the FULL score
  // array and indexed the latter by the former's index. That happened to be correct
  // only because tickPlaying drains missing members immediately beforehand; any
  // future path that resolved a pad without draining first would have paid the wrong
  // players.
  const members: PlayerRecord[] = []
  const scores: number[] = []
  for (let i = 0; i < pad.members.length; i++) {
    const record = findMember(pad, i)
    if (!record) continue
    members.push(record)
    scores.push(Math.round(pad.memberScore[i] ?? 0))
  }

  pad.points = hooks?.award(members, success, pad.comboBonus > 0, pad.circleId, scores) ?? []

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
  pad.holdChainLive = false
  pad.syncTapAt = []
  pad.syncs = 0
  pad.memberScore = []
  pad.perkCounter = []
  pad.taps = []
  pad.cueAt = 0
  pad.cueLive = false
  pad.cuesDone = 0
  pad.cueLockout = []
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
  pad.syncTapAt.splice(memberIndex, 1)
  pad.memberScore.splice(memberIndex, 1)
  pad.perkCounter.splice(memberIndex, 1)
  pad.taps.splice(memberIndex, 1)
  // Empty until resolve, so this is defensive rather than load-bearing - but keeping
  // every per-member array compacted uniformly means a future reader does not have to
  // work out which ones are exceptions.
  if (pad.points.length > memberIndex) pad.points.splice(memberIndex, 1)
  if (pad.cueLockout.length > 0) {
    // Lockouts are member INDICES, so they must be re-based past the removed slot or
    // they alias onto the wrong player. Inert while the lockout was broken; real now.
    pad.cueLockout = pad.cueLockout
      .filter((index) => index !== memberIndex)
      .map((index) => (index > memberIndex ? index - 1 : index))
  }
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
  core.required = requiredForPad(pad.padIndex)
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
  // `hits` doubles as the Sync Tap counter: both are "successful actions so far",
  // and reusing the field avoids widening the component for one game.
  progress.hits = pad.game === MiniGameKind.SyncTap ? pad.syncs : pad.hits
  // Derived from the shared accelerating grid, not `elapsed / interval` - with a
  // varying interval that division no longer names the right beat.
  progress.beatIndex = pad.startsAt ? nearestBeat(Math.max(0, now - pad.startsAt)) : 0
  progress.holdMask = pad.holdMask
  progress.step = pad.step
  progress.stepMask = pad.stepMask
  progress.resolved = pad.phase === CirclePhase.Result
  progress.success = pad.success
  progress.points = pad.points.slice()
  progress.memberScore = pad.memberScore.map((v) => Math.round(v))
  // Only ever the time of a cue that has ALREADY fired - see the schema comment.
  progress.cueAt = pad.cueLive ? pad.cueAt : 0
}
