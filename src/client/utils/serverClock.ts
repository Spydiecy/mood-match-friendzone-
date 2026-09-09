/**
 * Mood Match - server clock alignment.
 *
 * `CircleCore.startsAt` / `endsAt` are stamped with the SERVER's `Date.now()`.
 * A client's wall clock can be off by hundreds of milliseconds, which would make
 * the Rhythm Tap visuals drift out of phase with the beats the server judges
 * against. So the client estimates the offset and renders in its own clock
 * domain.
 *
 * The estimate comes from the heartbeat: every tick carries the server's
 * `Date.now()`, so `offset = serverTick - localNow` at the moment a NEW tick is
 * observed. That reading is late by roughly one-way latency, which biases the
 * player's taps slightly early - and since the tap then spends another one-way
 * latency travelling back to the server, the two errors largely cancel.
 *
 * The judging window is +/-320ms, comfortably wider than the residual error.
 */

/** Current estimate of `serverNow - localNow`, in milliseconds. */
let offset = 0

/** Set once a first reading has landed. */
let initialised = false

/** Smoothing factor. Low enough to reject jitter, high enough to converge fast. */
const SMOOTHING = 0.2

/**
 * Feeds a fresh heartbeat reading.
 *
 * @param serverTick the server's `Date.now()` carried by the heartbeat
 * @param localNow   the local `Date.now()` at which the change was observed
 */
export function observeHeartbeat(serverTick: number, localNow: number): void {
  const sample = serverTick - localNow

  if (!initialised) {
    offset = sample
    initialised = true
    return
  }

  // Exponential moving average, so one delayed packet cannot yank the clock.
  offset = offset + (sample - offset) * SMOOTHING
}

/** Best estimate of the server's current `Date.now()`. */
export function serverNow(): number {
  return Date.now() + offset
}

/** Converts a server timestamp into the local clock domain. */
export function toLocalTime(serverTimestamp: number): number {
  return serverTimestamp - offset
}

/** True once at least one heartbeat has been observed. */
export function clockReady(): boolean {
  return initialised
}

/** Current offset estimate, exposed for the diagnostics row in the info panel. */
export function clockOffset(): number {
  return Math.round(offset)
}
