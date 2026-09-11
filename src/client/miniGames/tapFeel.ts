/**
 * Mood Match - local tap feedback for Rhythm Tap.
 *
 * THE PROBLEM THIS SOLVES: the server is authoritative over hits, so the hit
 * count in `CircleProgress` only reflects your tap a network round-trip later.
 * Tapping and seeing nothing change for 100-200ms reads as a broken button, and
 * in a rhythm game that is fatal - you cannot find a groove without immediate
 * confirmation.
 *
 * So the client predicts. It knows `startsAt` and the beat interval, which is all
 * the server uses too, so it can judge its own tap on the same rules instantly and
 * light up straight away.
 *
 * This is PRESENTATION ONLY. The score still comes from the server, and if the
 * two ever disagree (lag spike, clock drift) the server wins and the displayed
 * total simply corrects itself. Nothing here can award a point.
 */

import { RHYTHM_BEAT_MS, RHYTHM_TOLERANCE_MS } from '../../shared/config'
import { toleranceFor } from '../../shared/moodPerks'
import { RoundView } from './round'

/** Outcome of the most recent tap. */
export type TapVerdict = 'none' | 'hit' | 'miss' | 'repeat'

interface TapFeelState {
  /** Circle this state belongs to, so a new round resets cleanly. */
  circleId: number
  verdict: TapVerdict
  /** Local time of the last tap, for the flash animation. */
  at: number
  /** Consecutive on-beat taps. Resets on a miss. */
  streak: number
  /** Best streak this round, for the end-of-round line. */
  bestStreak: number
  /** Beats already credited locally, so a double-tap cannot inflate the streak. */
  scored: Set<number>
  /** Locally predicted personal hit count. */
  hits: number
}

let state: TapFeelState = fresh(0)

function fresh(circleId: number): TapFeelState {
  return {
    circleId,
    verdict: 'none',
    at: 0,
    streak: 0,
    bestStreak: 0,
    scored: new Set<number>(),
    hits: 0
  }
}

/** Total beats in a round, derived the same way the server does it. */
function beatCount(round: RoundView): number {
  const span = round.endsAt - round.startsAt
  return Math.max(1, Math.floor(span / RHYTHM_BEAT_MS))
}

/**
 * Judges a tap locally and returns the verdict.
 *
 * Mirrors the server exactly: nearest beat by arrival time, within tolerance, and
 * each beat only counts once.
 */
export function registerTap(round: RoundView, now: number): TapVerdict {
  if (state.circleId !== round.circleId) {
    state = fresh(round.circleId)
  }

  if (now < round.startsAt) {
    state.verdict = 'miss'
    state.at = now
    state.streak = 0
    return 'miss'
  }

  const total = beatCount(round)
  const elapsed = now - round.startsAt

  let beat = Math.round(elapsed / RHYTHM_BEAT_MS)
  if (beat < 0) beat = 0
  if (beat >= total) beat = total - 1

  const offset = Math.abs(elapsed - beat * RHYTHM_BEAT_MS)

  // Scale by the local player's own mood tolerance, exactly as the server does.
  // Without this a Calm player - whose window is 60% wider server-side - was shown
  // "OFF" and had their streak reset on taps the server actually credited.
  const tolerance = RHYTHM_TOLERANCE_MS * toleranceFor(round.memberEmotions[round.myIndex] ?? 0)

  if (offset > tolerance) {
    state.verdict = 'miss'
    state.at = now
    state.streak = 0
    return 'miss'
  }

  if (state.scored.has(beat)) {
    // On-beat but already credited. Not a miss - breaking someone's streak for
    // being enthusiastic would feel unfair - just don't count it again.
    state.verdict = 'repeat'
    state.at = now
    return 'repeat'
  }

  state.scored.add(beat)
  state.hits++
  state.streak++
  state.bestStreak = Math.max(state.bestStreak, state.streak)
  state.verdict = 'hit'
  state.at = now
  return 'hit'
}

/** Clears predicted state. Called when a round ends. */
export function resetTapFeel(): void {
  state = fresh(0)
}

/** The current verdict, or 'none' once the flash window has elapsed. */
export function currentVerdict(now: number, windowMs = 260): TapVerdict {
  if (state.verdict === 'none') return 'none'
  return now - state.at <= windowMs ? state.verdict : 'none'
}

/** 0..1 intensity of the hit flash, for animating the ring. */
export function flashIntensity(now: number, windowMs = 260): number {
  if (state.verdict === 'none' || state.at === 0) return 0
  const age = now - state.at
  if (age > windowMs) return 0
  return 1 - age / windowMs
}

/** Consecutive on-beat taps. */
export function tapStreak(): number {
  return state.streak
}

/** Best streak of the round. */
export function bestTapStreak(): number {
  return state.bestStreak
}

/** Locally predicted personal hits. */
export function predictedHits(): number {
  return state.hits
}

/** Outcome of a single beat, for the history strip. */
export type BeatMark = 'hit' | 'missed' | 'current' | 'upcoming'

/**
 * Per-beat history of the local player's own taps.
 *
 * Drawn as a strip of dots so the player can see the shape of their run rather
 * than just a total: three hits then a gap is legible feedback about WHERE they
 * are drifting, which a single counter cannot express.
 *
 * Local by necessity - the server publishes an aggregate hit count, not a
 * per-beat, per-member breakdown, and sending that every tick would be far more
 * traffic than the feature is worth.
 */
export function beatHistory(round: RoundView, now: number): BeatMark[] {
  const total = beatCount(round)
  const marks: BeatMark[] = []

  // Which beat is live right now, by the same grid the server judges on.
  const elapsed = now - round.startsAt
  const currentBeat = elapsed < 0 ? -1 : Math.round(elapsed / RHYTHM_BEAT_MS)

  for (let beat = 0; beat < total; beat++) {
    if (state.circleId === round.circleId && state.scored.has(beat)) {
      marks.push('hit')
    } else if (beat === currentBeat) {
      marks.push('current')
    } else if (beat < currentBeat) {
      marks.push('missed')
    } else {
      marks.push('upcoming')
    }
  }

  return marks
}
