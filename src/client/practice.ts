/**
 * Mood Match - solo practice.
 *
 * Why this exists: the game is cooperative and the leaderboard is deliberately
 * social, but a first-time visitor (or a judge) will often arrive when the plaza
 * is empty. Practice lets them see and feel the whole loop in about 15 seconds so
 * they understand what to invite friends for.
 *
 * Practice is a TRAINER, not a single-player mode:
 *   - it runs entirely on the client, with no server involvement at all
 *   - it awards no points, no circles, no streak progress and no skin progress
 *   - it cannot touch the leaderboard
 *
 * The judging rules are read from the same `shared/config` constants the server
 * uses, so practice feels exactly like the real thing.
 */

import {
  COLOR_SEQUENCE_LENGTH,
  HOLD_REQUIRED_MS,
  MINIGAME_DURATION_MS,
  RESULT_MS,
  RHYTHM_BEAT_MS,
  RHYTHM_SUCCESS_RATIO,
  RHYTHM_TOLERANCE_MS
} from '../shared/config'
import { NoticeTone } from '../shared/messages'
import { EMOTION_COUNT, EmotionId, MiniGameKind } from '../shared/types'
import { playSfx } from './audio'
import { PracticeState, showNotice, state } from './state'

/** Short lead-in so the player can read what they are about to do. */
const PRACTICE_COUNTDOWN_MS = 2200

/** Beats a practice round contains. Matches the server's grid. */
function beatCount(): number {
  return Math.floor(MINIGAME_DURATION_MS / RHYTHM_BEAT_MS)
}

/** Which beats the player has already scored, so mashing gains nothing. */
let scoredBeats = new Set<number>()

/** Local clock at which the finished panel should disappear. */
let clearAt = 0

/**
 * Best practice result this session, per game.
 *
 * Scenes have no client-side persistence, so this is session-only and
 * deliberately never sent to the server - practice must not touch the leaderboard.
 * Its whole job is to give a lone player a number to beat during the minute
 * before somebody else turns up.
 */
const personalBest: Record<number, number> = {}

/** Practice rounds cleared this session, shown as a small nudge. */
let practiceCleared = 0

/** Best progress (0..1) achieved in a given mini-game this session. */
export function practiceBest(game: MiniGameKind): number {
  return personalBest[game] ?? 0
}

/** How many practice rounds have been cleared this session. */
export function practiceClearedCount(): number {
  return practiceCleared
}

/** Starts a practice round of a specific game, or a random one. */
export function startPractice(game?: MiniGameKind): void {
  const chosen = game ?? (Math.floor(Math.random() * 3) as MiniGameKind)
  const now = Date.now()
  const startsAt = now + PRACTICE_COUNTDOWN_MS

  scoredBeats = new Set<number>()
  clearAt = 0

  state.practice = {
    game: chosen,
    startsAt,
    endsAt: startsAt + MINIGAME_DURATION_MS,
    progress: 0,
    hits: 0,
    holding: false,
    allHoldMs: 0,
    step: 0,
    sequence: buildPracticeSequence(),
    finished: false,
    success: false
  }

  playSfx('form')
}

/** Ends practice immediately (the player tapped Exit). */
export function stopPractice(): void {
  state.practice = null
  clearAt = 0
}

/** True while a practice round is on screen. */
export function inPractice(): boolean {
  return state.practice !== null
}

/** A random colour sequence drawn from all emotions. */
function buildPracticeSequence(): EmotionId[] {
  const sequence: EmotionId[] = []
  for (let i = 0; i < COLOR_SEQUENCE_LENGTH; i++) {
    sequence.push(Math.floor(Math.random() * EMOTION_COUNT) as EmotionId)
  }
  return sequence
}

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

/** Rhythm Tap input, judged against the local beat grid. */
export function practiceTap(): void {
  const practice = state.practice
  if (!practice || practice.finished) return

  const now = Date.now()
  if (now < practice.startsAt) return

  const total = beatCount()
  let beat = Math.round((now - practice.startsAt) / RHYTHM_BEAT_MS)
  if (beat < 0) beat = 0
  if (beat >= total) beat = total - 1

  const offset = Math.abs(now - practice.startsAt - beat * RHYTHM_BEAT_MS)
  if (offset > RHYTHM_TOLERANCE_MS) return
  if (scoredBeats.has(beat)) return

  scoredBeats.add(beat)
  practice.hits++
  playSfx('tap')
}

/** Hold Zones press / release. */
export function practiceHold(holding: boolean): void {
  const practice = state.practice
  if (!practice || practice.finished) return
  practice.holding = holding
}

/** Color Match tap. A wrong colour resets progress on the current step. */
export function practiceColorTap(emotion: EmotionId): void {
  const practice = state.practice
  if (!practice || practice.finished) return
  if (Date.now() < practice.startsAt) return
  if (practice.step >= practice.sequence.length) return

  if (practice.sequence[practice.step] === emotion) {
    practice.step++
    playSfx('tap')
  } else {
    // Same rule the server applies: a wrong tap costs the step, not the round.
    practice.step = 0
    playSfx('fail')
  }
}

/* -------------------------------------------------------------------------- */
/* Tick                                                                       */
/* -------------------------------------------------------------------------- */

/** Advances a practice round. Called once per frame from the client system. */
export function tickPractice(dtMs: number, now: number): void {
  const practice = state.practice
  if (!practice) return

  if (practice.finished) {
    if (clearAt !== 0 && now >= clearAt) stopPractice()
    return
  }

  if (now < practice.startsAt) return

  if (practice.game === MiniGameKind.HoldZones && practice.holding) {
    practice.allHoldMs += dtMs
  }

  practice.progress = computeProgress(practice)

  if (objectiveMet(practice)) {
    finish(practice, true, now)
    return
  }

  if (now >= practice.endsAt) {
    finish(practice, false, now)
  }
}

function computeProgress(practice: PracticeState): number {
  switch (practice.game) {
    case MiniGameKind.RhythmTap:
      return Math.min(1, practice.hits / beatCount())
    case MiniGameKind.HoldZones:
      return Math.min(1, practice.allHoldMs / HOLD_REQUIRED_MS)
    case MiniGameKind.ColorMatch:
      return practice.sequence.length === 0
        ? 0
        : Math.min(1, practice.step / practice.sequence.length)
    default:
      return 0
  }
}

function objectiveMet(practice: PracticeState): boolean {
  switch (practice.game) {
    case MiniGameKind.RhythmTap:
      return practice.hits >= Math.ceil(beatCount() * RHYTHM_SUCCESS_RATIO)
    case MiniGameKind.HoldZones:
      return practice.allHoldMs >= HOLD_REQUIRED_MS
    case MiniGameKind.ColorMatch:
      return practice.step >= practice.sequence.length
    default:
      return false
  }
}

function finish(practice: PracticeState, success: boolean, now: number): void {
  practice.finished = true
  practice.success = success
  practice.progress = success ? 1 : practice.progress
  clearAt = now + RESULT_MS

  const previousBest = personalBest[practice.game] ?? 0
  const beatIt = practice.progress > previousBest
  if (beatIt) personalBest[practice.game] = practice.progress
  if (success) practiceCleared++

  playSfx(success ? 'success' : 'fail')

  // Always end on something to do next: either a new best to beat, or the nudge
  // that the real thing scores and needs a second player.
  let message: string
  if (success) {
    message =
      practiceCleared === 1
        ? 'Cleared it. Now do that with someone else and it actually scores.'
        : `Cleared ${practiceCleared} practice runs. Real circles score - grab a friend.`
  } else if (beatIt) {
    message = `New best: ${Math.round(practice.progress * 100)}%. Go again.`
  } else {
    message = `Best so far ${Math.round(previousBest * 100)}%. Go again, or call the plaza.`
  }

  showNotice(message, success ? NoticeTone.Success : NoticeTone.Info, RESULT_MS)
}
