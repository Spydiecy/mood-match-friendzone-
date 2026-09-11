/**
 * Mood Match - Rhythm Tap beat grid.
 *
 * The grid ACCELERATES: beats start at `RHYTHM_BEAT_MS` apart and close to
 * `RHYTHM_BEAT_MIN_MS` by the end of the round. A fixed 1000ms metronome was
 * trivially easy once you found it - the whole round could be played on autopilot
 * after two beats. A ramp means the group has to keep re-finding the tempo, which is
 * where the tension and the shouting come from.
 *
 * Shared so the server's judging, the client's pulse animation and the client's local
 * hit prediction are all derived from THE SAME function. That matters more here than
 * anywhere else in the scene: if the ring the player watches is even slightly out of
 * phase with the grid the server judges against, the game is unwinnable and feels
 * broken. Everything is derived from the round's `startsAt` plus these constants, so
 * there is no state to keep in step.
 */

import {
  MINIGAME_DURATION_MS,
  RHYTHM_BEAT_MIN_MS,
  RHYTHM_BEAT_MS
} from './config'

/**
 * Offsets from the start of play at which each beat lands.
 *
 * Computed once at module load. Pure and deterministic - no randomness - so both
 * sides produce an identical array.
 */
const BEAT_TIMES: number[] = buildBeatTimes()

function buildBeatTimes(): number[] {
  const times: number[] = []
  let t = 0

  // Guard against a misconfiguration producing an unbounded loop.
  const safetyCap = 200

  while (t < MINIGAME_DURATION_MS && times.length < safetyCap) {
    times.push(t)
    // The gap shrinks in proportion to how far through the round we are, so the
    // acceleration is smooth rather than stepped.
    const progress = t / MINIGAME_DURATION_MS
    const interval = RHYTHM_BEAT_MS + (RHYTHM_BEAT_MIN_MS - RHYTHM_BEAT_MS) * progress
    t += Math.max(120, interval)
  }

  return times
}

/** How many beats a round contains. */
export function beatCount(): number {
  return BEAT_TIMES.length
}

/** Offset from `startsAt` of a given beat. Clamped to the valid range. */
export function beatTime(index: number): number {
  if (index <= 0) return BEAT_TIMES[0] ?? 0
  if (index >= BEAT_TIMES.length) return BEAT_TIMES[BEAT_TIMES.length - 1] ?? 0
  return BEAT_TIMES[index]
}

/**
 * The beat closest to a given elapsed time.
 *
 * A linear scan, which is fine: the array is about a dozen entries and this runs only
 * on an actual tap, not per frame.
 */
export function nearestBeat(elapsed: number): number {
  let best = 0
  let bestDistance = Number.MAX_VALUE

  for (let i = 0; i < BEAT_TIMES.length; i++) {
    const distance = Math.abs(elapsed - BEAT_TIMES[i])
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }

  return best
}

/** How far a tap at `elapsed` was from its nearest beat, in ms. */
export function beatOffset(elapsed: number): number {
  return Math.abs(elapsed - beatTime(nearestBeat(elapsed)))
}

/**
 * How "hot" the beat is right now, 0..1, peaking exactly on a beat.
 *
 * Used for the ring pulse. A sharp attack and quick decay reads far more clearly on a
 * small screen than a smooth sine, and because the gap between beats changes the decay
 * is scaled by the CURRENT interval rather than a fixed constant - otherwise the pulse
 * would visibly lag the grid as the round speeds up.
 */
export function beatPulse(elapsed: number): number {
  if (elapsed < 0) return 0

  const index = nearestBeat(elapsed)
  const sinceBeat = elapsed - beatTime(index)
  if (sinceBeat < 0) return 0

  // Local interval, so the decay stays proportional as the tempo climbs.
  const next = beatTime(Math.min(index + 1, BEAT_TIMES.length - 1))
  const interval = Math.max(150, next - beatTime(index))

  return Math.max(0, 1 - (sinceBeat / interval) * 3.2)
}

/** The interval currently between beats, for display. */
export function currentInterval(elapsed: number): number {
  const index = nearestBeat(Math.max(0, elapsed))
  const next = beatTime(Math.min(index + 1, BEAT_TIMES.length - 1))
  const gap = next - beatTime(index)
  return gap > 0 ? gap : RHYTHM_BEAT_MIN_MS
}
