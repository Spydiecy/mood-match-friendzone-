/**
 * Mood Match - the round view shared by real circles and solo practice.
 *
 * A mini-game panel should not care whether it is judging a real server-driven
 * circle or a local practice run, so both are projected into this one shape.
 *
 * IMPORTANT: EVERY timestamp on a `RoundView` is in the LOCAL clock domain -
 * `startsAt`, `endsAt` and `cueAt`. Server timestamps are converted on the way in, so
 * every panel can just compare against `Date.now()`.
 *
 * "Every" is stated so emphatically because `cueAt` was the exception and it broke
 * Reaction outright. See `toLocalCue` below.
 */

import { COLOR_PALETTE_SIZE, MINIGAME_DURATION_MS } from '../../shared/config'
import { EMOTION_COUNT, EmotionId, MiniGameKind } from '../../shared/types'
import { PadView, PracticeState } from '../state'
import { toLocalTime } from '../utils/serverClock'

/** Everything a mini-game panel needs to render and accept input. */
export interface RoundView {
  /**
   * Identifies this round. Real circles use the server's circleId; a practice run
   * uses its own start time. Local prediction keys off this to reset between
   * rounds.
   */
  circleId: number
  game: MiniGameKind
  /** Local-clock time at which play begins. */
  startsAt: number
  /** Local-clock time at which play ends. */
  endsAt: number
  /** 0..1 group progress. */
  progress: number
  /** Rhythm Tap: successful group hits. */
  hits: number
  /** Hold Zones: bitmask of members currently holding. */
  holdMask: number
  /** Color Match: completed steps. */
  step: number
  /**
   * Color Match: bitmask of members who have confirmed the CURRENT step.
   * This is the information that makes the game legible - without it a player
   * cannot see whether their own tap, or anyone else's, registered.
   */
  stepMask: number
  /** Color Match: the target sequence. */
  sequence: EmotionId[]
  members: string[]
  memberNames: string[]
  memberEmotions: EmotionId[]
  /** Live per-member performance, parallel to `members`. Drives the standings. */
  memberScore: number[]
  /**
   * Tap Race only: RAW taps per member, parallel to `members`. Empty for every other
   * game.
   *
   * Tap Race must be shown in the units it is judged in. Use `raceCount` rather than
   * reading this directly, so a missing array falls back gracefully.
   */
  memberTaps: number[]
  /**
   * Each member's current finishing position, zero-based, parallel to `members`.
   *
   * THE SERVER'S ordering, not a local guess. Read it through `isLeading` / `leaders`
   * rather than comparing scores by hand - that is the mistake this field exists to
   * make impossible.
   */
  memberRank: number[]
  /**
   * Reaction: LOCAL-clock time of an already-fired cue, or 0 when none is live.
   *
   * Local clock, like every other timestamp here. A real round only ever carries a
   * cue that has already fired; a practice round schedules its own and so carries a
   * future time.
   */
  cueAt: number
  /** Local player's index in `members`, or 0 for practice. */
  myIndex: number
  /** True for a local, unscored practice run. */
  practice: boolean
}

/**
 * Converts a published Reaction cue time into the local clock.
 *
 * THE BUG THIS FIXES: `cueAt` was the one timestamp handed to the panels without
 * conversion, so `cueLive()` compared the local `Date.now()` against a SERVER
 * timestamp. On a phone whose wall clock trails the server's, `now >= cueAt` stayed
 * false for the whole round: the plate never turned green, nobody could claim a cue,
 * and the round ran out at "You won 0". A player whose clock ran ahead got the mirror
 * image - the plate was green before the cue fired.
 *
 * The zero guard is not optional. `cueAt` is 0 for "no cue is live", and
 * `toLocalTime(0)` is `-offset`, which is a POSITIVE number whenever the server clock
 * trails the client's. That would have satisfied `cueAt > 0 && now >= cueAt` and left
 * the plate green for the entire round, which is the same bug wearing the opposite sign.
 */
function toLocalCue(cueAt: number): number {
  return cueAt > 0 ? toLocalTime(cueAt) : 0
}

/** Projects a synced pad into a round view. */
export function roundFromPad(pad: PadView): RoundView {
  return {
    circleId: pad.circleId,
    game: pad.game,
    startsAt: toLocalTime(pad.startsAt),
    endsAt: toLocalTime(pad.endsAt),
    progress: pad.progress,
    hits: pad.hits,
    holdMask: pad.holdMask,
    step: pad.step,
    stepMask: pad.stepMask,
    sequence: pad.sequence,
    members: pad.members,
    memberNames: pad.memberNames,
    memberEmotions: pad.memberEmotions,
    memberScore: pad.memberScore,
    memberTaps: pad.memberTaps,
    memberRank: pad.memberRank,
    cueAt: toLocalCue(pad.cueAt),
    myIndex: Math.max(0, pad.myIndex),
    practice: false
  }
}

/** Projects a local practice run into a round view. */
export function roundFromPractice(
  practice: PracticeState,
  myEmotion: EmotionId
): RoundView {
  return {
    // Negative, so a practice round can never collide with a server circleId.
    circleId: -practice.startsAt,
    game: practice.game,
    startsAt: practice.startsAt,
    endsAt: practice.endsAt,
    progress: practice.progress,
    // Sync Tap reports its counter through `hits`, matching the server.
    hits: practice.game === MiniGameKind.SyncTap ? practice.syncs : practice.hits,
    holdMask: practice.holding ? 1 : 0,
    step: practice.step,
    // Solo: the local optimistic mark in `colorFeel` supplies the confirmation.
    stepMask: 0,
    sequence: practice.sequence,
    members: ['practice'],
    memberNames: ['You'],
    memberEmotions: [myEmotion],
    memberScore: [practice.memberScore],
    // Solo, so there are no perks in play and the score IS the tap count.
    memberTaps: [practice.memberScore],
    // A field of one.
    memberRank: [0],
    // Practice fires its own local cue.
    cueAt: practice.cueAt,
    myIndex: 0,
    practice: true
  }
}

/** Seconds remaining, floored at zero, for the countdown readout. */
export function secondsLeft(round: RoundView, now: number): number {
  return Math.max(0, Math.ceil((round.endsAt - now) / 1000))
}

/** True while the pre-round countdown is still running. */
export function inCountdown(round: RoundView, now: number): boolean {
  return now < round.startsAt
}

/** Seconds until play starts. */
export function countdownSeconds(round: RoundView, now: number): number {
  return Math.max(0, Math.ceil((round.startsAt - now) / 1000))
}

/** Fraction of the round elapsed, 0..1. */
export function elapsedFraction(round: RoundView, now: number): number {
  const span = round.endsAt - round.startsAt
  if (span <= 0) return 0
  return Math.max(0, Math.min(1, (now - round.startsAt) / span))
}

/** Nominal round length, exposed so panels do not hardcode it. */
export const ROUND_MS = MINIGAME_DURATION_MS

/**
 * True when the round produces individual placings worth showing.
 *
 * Every game does, now. Sync Tap used to be the exception - it credited every member
 * the same raw point per sync, so ranking it would have been arbitrary - but its points
 * go through each player's mood perk like everywhere else, so two players who sync the
 * same four times can and should finish on different scores.
 *
 * Kept as a function rather than being deleted at the call sites because it is the
 * honest name for what those call sites are asking, and a future game with genuinely
 * shared scoring only has to be added here.
 *
 * Lives in this module, not the router, because `standings.tsx` needs it and the router
 * imports `standings.tsx` - asking it the other way round would close an import cycle.
 */
export function isCompetitive(_game: MiniGameKind): boolean {
  return true
}

/**
 * Builds the tap palette for Color Match.
 *
 * Only the colours actually used in the sequence, padded with decoys up to
 * `COLOR_PALETTE_SIZE` options.
 *
 * Five is the ceiling on purpose. Four was too forgiving - with only four choices a
 * half-remembered step could be guessed at decent odds - but the targets still have to
 * stay thumb-sized, and five at 92px plus margins is the most that fits the action row
 * comfortably. Six is where they start shrinking below a reliable touch size.
 *
 * Sorted by emotion id so the buttons never move between frames - a shifting
 * button is unusable on a touch screen.
 */
export function colorPalette(sequence: EmotionId[]): EmotionId[] {
  const present: EmotionId[] = []
  for (const emotion of sequence) {
    if (present.indexOf(emotion) === -1) present.push(emotion)
  }

  for (
    let candidate = 0;
    candidate < EMOTION_COUNT && present.length < COLOR_PALETTE_SIZE;
    candidate++
  ) {
    if (present.indexOf(candidate as EmotionId) === -1) {
      present.push(candidate as EmotionId)
    }
  }

  return present.sort((a, b) => a - b)
}

/**
 * How long the sequence stays visible at the start of a Color Match round.
 * After this the players are working from memory and from each other.
 *
 * Re-exported from shared config so the existing panel imports keep working while the
 * value itself lives where `check-logic` can assert it against the round length.
 */
export { SEQUENCE_REVEAL_MS } from '../../shared/config'

/**
 * A member's progress in the units their round is actually judged in.
 *
 * Tap Race is the only game where this differs from `memberScore`, and the difference
 * mattered: the panel used to draw every racer's bar as `memberScore / TAP_RACE_TARGET`
 * while the target counted RAW taps, so an Energy player - whose score runs ahead of
 * their taps - saw a full bar and then lost the race. Every other game's score and
 * objective share a scale, so they fall through to `memberScore`.
 */
export function raceCount(round: RoundView, index: number): number {
  if (round.game === MiniGameKind.TapRace) {
    // Fall back to the score only if the raw array has not arrived yet, so the bars are
    // never blank on the first frame of a round.
    const taps = round.memberTaps[index]
    if (typeof taps === 'number') return taps
  }
  return round.memberScore[index] ?? 0
}

/**
 * Whether a member is currently in the lead, by the SERVER's ranking.
 *
 * Never derive this from `memberScore`. Tap Race ranks whoever crossed the target first
 * ahead of any score, and ranks everyone else on their perk-weighted score, so the
 * highest number on screen is not always the player in line for the winner's prize.
 * The HUD used to compute the leader itself and could contradict the payout the player
 * was about to be shown.
 *
 * Falls back to "nobody is leading" until the first progress push arrives, which is
 * correct: at that point nobody has scored.
 */
export function isLeading(round: RoundView, index: number): boolean {
  if (round.memberRank.length !== round.members.length) return false
  if ((round.memberScore[index] ?? 0) <= 0) return false
  return round.memberRank[index] === 0
}

/** Indices of every member currently in the lead. Empty until somebody scores. */
export function leaders(round: RoundView): number[] {
  return round.members
    .map((_unused, index) => index)
    .filter((index) => isLeading(round, index))
}
