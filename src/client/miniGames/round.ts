/**
 * Mood Match - the round view shared by real circles and solo practice.
 *
 * A mini-game panel should not care whether it is judging a real server-driven
 * circle or a local practice run, so both are projected into this one shape.
 *
 * IMPORTANT: `startsAt` / `endsAt` here are always in the LOCAL clock domain.
 * Server timestamps are converted on the way in, so every panel can just compare
 * against `Date.now()`.
 */

import { MINIGAME_DURATION_MS } from '../../shared/config'
import { EMOTION_COUNT, EmotionId, MiniGameKind } from '../../shared/types'
import { PadView, PracticeState } from '../state'
import { toLocalTime } from '../utils/serverClock'

/** Everything a mini-game panel needs to render and accept input. */
export interface RoundView {
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
  /** Color Match: the target sequence. */
  sequence: EmotionId[]
  members: string[]
  memberNames: string[]
  memberEmotions: EmotionId[]
  /** Local player's index in `members`, or 0 for practice. */
  myIndex: number
  /** True for a local, unscored practice run. */
  practice: boolean
}

/** Projects a synced pad into a round view. */
export function roundFromPad(pad: PadView): RoundView {
  return {
    game: pad.game,
    startsAt: toLocalTime(pad.startsAt),
    endsAt: toLocalTime(pad.endsAt),
    progress: pad.progress,
    hits: pad.hits,
    holdMask: pad.holdMask,
    step: pad.step,
    sequence: pad.sequence,
    members: pad.members,
    memberNames: pad.memberNames,
    memberEmotions: pad.memberEmotions,
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
    game: practice.game,
    startsAt: practice.startsAt,
    endsAt: practice.endsAt,
    progress: practice.progress,
    hits: practice.hits,
    holdMask: practice.holding ? 1 : 0,
    step: practice.step,
    sequence: practice.sequence,
    members: ['practice'],
    memberNames: ['You'],
    memberEmotions: [myEmotion],
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
 * Builds the tap palette for Color Match.
 *
 * Only the colours actually used in the sequence, padded with decoys up to four
 * options. Four is the ceiling on purpose: more than that and the targets get too
 * small to hit reliably with a thumb.
 *
 * Sorted by emotion id so the buttons never move between frames - a shifting
 * button is unusable on a touch screen.
 */
export function colorPalette(sequence: EmotionId[]): EmotionId[] {
  const present: EmotionId[] = []
  for (const emotion of sequence) {
    if (present.indexOf(emotion) === -1) present.push(emotion)
  }

  for (let candidate = 0; candidate < EMOTION_COUNT && present.length < 4; candidate++) {
    if (present.indexOf(candidate as EmotionId) === -1) {
      present.push(candidate as EmotionId)
    }
  }

  return present.sort((a, b) => a - b)
}

/**
 * How long the sequence stays visible at the start of a Color Match round.
 * After this the players are working from memory and from each other.
 */
export const SEQUENCE_REVEAL_MS = 2600
