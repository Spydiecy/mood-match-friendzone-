/**
 * Mood Match - local tap feedback for Color Match.
 *
 * THE PROBLEM THIS SOLVES: a Color Match step only advances once EVERY member has
 * tapped the right colour. That means your own tap, on its own, changes nothing
 * the server publishes - so without local state the game gives you no way to tell
 * whether your contribution registered at all. In a game whose entire premise is
 * coordination, that is the worst possible thing to leave ambiguous.
 *
 * So the client remembers its own tap immediately: which colour, for which step.
 * The authoritative `stepMask` from the server then confirms it a round-trip
 * later, and the two are shown together - your own mark is instant, everyone
 * else's arrives from the server.
 *
 * PRESENTATION ONLY. Nothing here can advance a step or award a point.
 */

import { EmotionId } from '../../shared/types'
import { RoundView } from './round'

interface ColorFeelState {
  /** Round this belongs to, so state resets between circles. */
  circleId: number
  /** Step index the local tap was for. */
  step: number
  /** Colour the local player tapped, or -1. */
  tapped: EmotionId | -1
  /** Local time of the tap, for the flash. */
  at: number
  /** True when the tap matched the expected colour. */
  correct: boolean
}

let state: ColorFeelState = fresh(0)

function fresh(circleId: number): ColorFeelState {
  return { circleId, step: -1, tapped: -1, at: 0, correct: false }
}

/**
 * Records the local player's tap for the current step.
 *
 * Correctness is judged against `round.sequence`, which the server already sent
 * to every client, so this is the same information the server uses - no guessing.
 */
export function markColorTap(round: RoundView, emotion: EmotionId): void {
  if (state.circleId !== round.circleId) {
    state = fresh(round.circleId)
  }

  const expected = round.sequence[round.step]
  state.step = round.step
  state.tapped = emotion
  state.at = Date.now()
  state.correct = expected === emotion
}

/** Clears local state. Called when a round ends. */
export function resetColorFeel(): void {
  state = fresh(0)
}

/**
 * True when the local player has tapped the current step and was right.
 *
 * Cleared automatically when the step advances, because the remembered step no
 * longer matches - so a stale mark can never linger into the next step.
 */
export function myTapConfirmed(round: RoundView): boolean {
  return (
    state.circleId === round.circleId &&
    state.step === round.step &&
    state.correct
  )
}

/** The colour the local player tapped for this step, or -1. */
export function myTappedColor(round: RoundView): EmotionId | -1 {
  if (state.circleId !== round.circleId || state.step !== round.step) return -1
  return state.tapped
}

/** 0..1 flash intensity after a tap, for animating the target. */
export function colorFlash(now: number, windowMs = 300): number {
  if (state.at === 0) return 0
  const age = now - state.at
  if (age > windowMs) return 0
  return 1 - age / windowMs
}

/** True when the most recent local tap was wrong, while the flash lasts. */
export function lastTapWrong(now: number, windowMs = 500): boolean {
  if (state.at === 0 || state.correct) return false
  return now - state.at <= windowMs
}

/**
 * Whether a given member has confirmed the current step, combining the
 * authoritative mask with the local optimistic mark for the local player.
 */
export function memberConfirmed(round: RoundView, memberIndex: number): boolean {
  const fromServer = (round.stepMask & (1 << memberIndex)) !== 0
  if (fromServer) return true
  // Show our own tap straight away rather than waiting for the mask to come back.
  return memberIndex === round.myIndex && myTapConfirmed(round)
}
