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

import { SYNC_SWEEP_MS, SYNC_ZONE_HALF_WIDTH } from './config'

/**
 * Marker position along the bar, 0..1, sweeping there and back.
 *
 * A triangle wave rather than a sine: constant speed means the target zone takes
 * the same amount of time to cross every pass, so the timing is learnable.
 */
export function markerPosition(startsAt: number, now: number): number {
  const elapsed = Math.max(0, now - startsAt)
  const phase = (elapsed % SYNC_SWEEP_MS) / SYNC_SWEEP_MS
  return phase < 0.5 ? phase * 2 : 2 - phase * 2
}

/** True when the marker is inside the scoring zone. */
export function markerInZone(startsAt: number, now: number): boolean {
  return Math.abs(markerPosition(startsAt, now) - 0.5) <= SYNC_ZONE_HALF_WIDTH
}

/** Left edge of the target zone, 0..1, for rendering. */
export const ZONE_START = 0.5 - SYNC_ZONE_HALF_WIDTH

/** Width of the target zone, 0..1, for rendering. */
export const ZONE_WIDTH = SYNC_ZONE_HALF_WIDTH * 2
