/**
 * Mood Match - Sync Tap geometry.
 *
 * Shared so the client's marker and the server's judging are derived from the SAME
 * function. Both sides compute the marker position purely from the round's
 * `startsAt` and the current time, so there is no state to keep in step and no way
 * for the visual and the judgement to disagree.
 *
 * That matters more here than in the other games: the player is aiming at a moving
 * target, so if the bar they can see is even slightly out of phase with the bar the
 * server judges against, the game feels broken and unwinnable.
 */

import {
  MINIGAME_DURATION_MS,
  SYNC_SWEEP_MIN_MS,
  SYNC_SWEEP_MS,
  SYNC_ZONE_HALF_WIDTH
} from './config'

/**
 * How many complete sweeps have elapsed by `elapsed` ms into the round.
 *
 * The sweep ACCELERATES: its period shrinks linearly from `SYNC_SWEEP_MS` to
 * `SYNC_SWEEP_MIN_MS` across the round. A constant-period sweep was learnable in about
 * two passes and then the round played itself; a ramp means the group has to keep
 * re-reading the speed, and the last sync is meaningfully harder than the first.
 *
 * Because the period varies, sweeps completed is the INTEGRAL of 1/period, not
 * `elapsed / period`. With a linear period `p(t) = p0 + k*t` that integral has a closed
 * form, which keeps this a pure function of time - no accumulator to keep in step
 * between client and server, and no discontinuity in the marker's motion.
 */
function sweepsElapsed(elapsed: number): number {
  const p0 = SYNC_SWEEP_MS
  const k = (SYNC_SWEEP_MIN_MS - SYNC_SWEEP_MS) / MINIGAME_DURATION_MS

  // Degenerate case: no ramp configured, so the integral collapses to a division.
  if (Math.abs(k) < 1e-9) return elapsed / p0

  // The period is clamped at the floor past the end of the round, so overtime (the
  // result panel, or a late-arriving tap) keeps sweeping instead of stalling.
  if (elapsed <= MINIGAME_DURATION_MS) {
    return Math.log((p0 + k * elapsed) / p0) / k
  }

  const atEnd = Math.log((p0 + k * MINIGAME_DURATION_MS) / p0) / k
  return atEnd + (elapsed - MINIGAME_DURATION_MS) / SYNC_SWEEP_MIN_MS
}

/**
 * Marker position along the bar, 0..1, sweeping there and back.
 *
 * A triangle wave rather than a sine: within a single pass the speed is constant, so
 * the width of the zone still maps directly to a span of time and the aim stays
 * learnable even as the passes get quicker.
 */
export function markerPosition(startsAt: number, now: number): number {
  const elapsed = Math.max(0, now - startsAt)
  const sweeps = sweepsElapsed(elapsed)
  const phase = sweeps - Math.floor(sweeps)
  return phase < 0.5 ? phase * 2 : 2 - phase * 2
}

/** The sweep period in force at `elapsed` ms into the round, for display and tests. */
export function sweepPeriod(elapsed: number): number {
  const clamped = Math.min(Math.max(0, elapsed), MINIGAME_DURATION_MS)
  const progress = clamped / MINIGAME_DURATION_MS
  return SYNC_SWEEP_MS + (SYNC_SWEEP_MIN_MS - SYNC_SWEEP_MS) * progress
}

/** True when the marker is inside the scoring zone. */
export function markerInZone(startsAt: number, now: number): boolean {
  return Math.abs(markerPosition(startsAt, now) - 0.5) <= SYNC_ZONE_HALF_WIDTH
}

/** Left edge of the target zone, 0..1, for rendering. */
export const ZONE_START = 0.5 - SYNC_ZONE_HALF_WIDTH

/** Width of the target zone, 0..1, for rendering. */
export const ZONE_WIDTH = SYNC_ZONE_HALF_WIDTH * 2
