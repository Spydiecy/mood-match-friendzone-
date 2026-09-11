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
  RHYTHM_TOLERANCE_MS,
  REACTION_CUES,
  REACTION_MAX_DELAY_MS,
  REACTION_MIN_DELAY_MS,
  SYNC_TARGET,
  TAP_RACE_TARGET
} from '../shared/config'
import { NoticeTone } from '../shared/messages'
import { EMOTION_COUNT, EmotionId, MINIGAME_COUNT, MiniGameKind } from '../shared/types'
import { markerInZone } from '../shared/syncTap'
import { playSfx } from './audio'
import { PracticeState, showNotice, state } from './state'

/** Short lead-in so the player can read what they are about to do. */
const PRACTICE_COUNTDOWN_MS = 2200

/** A random wait before the next practice Reaction cue. Mirrors the server. */
function practiceCueDelay(): number {
  return (
    REACTION_MIN_DELAY_MS +
    Math.random() * (REACTION_MAX_DELAY_MS - REACTION_MIN_DELAY_MS)
  )
}

/** True when a practice Reaction cue is live right now. */
function practiceCueLive(practice: PracticeState, now: number): boolean {
  return practice.cueAt > 0 && now >= practice.cueAt
}

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

/**
 * Starts a practice round of a specific game, or a random one.
 *
 * Refuses while the player is committed to a real circle or waiting for one.
 * Practice used to be startable while `state.waiting` was true, and since the
 * ready flag stays hot for several seconds, anyone walking up in that window
 * formed a circle around a player whose input was going to the trainer.
 */
export function startPractice(game?: MiniGameKind): void {
  if (state.myPad) return
  if (state.waiting) {
    showNotice(
      'You are waiting for a circle. Cancel first if you want to practise.',
      NoticeTone.Info
    )
    return
  }

  const chosen = game ?? (Math.floor(Math.random() * MINIGAME_COUNT) as MiniGameKind)
  const now = Date.now()
  const startsAt = now + PRACTICE_COUNTDOWN_MS

  scoredBeats = new Set<number>()
  clearAt = 0
  // No need to clear the hold latch here: `tickHoldKeepalive` releases it on the
  // first frame where neither a real round nor a practice run is active, which
  // always happens between two practice rounds. Importing `resetInput` for it
  // would create a practice <-> input module cycle for no benefit.

  state.practice = {
    game: chosen,
    startsAt,
    endsAt: startsAt + MINIGAME_DURATION_MS,
    progress: 0,
    hits: 0,
    holding: false,
    allHoldMs: 0,
    step: 0,
    syncs: 0,
    memberScore: 0,
    cueAt: chosen === MiniGameKind.Reaction ? startsAt + practiceCueDelay() : 0,
    cuesDone: 0,
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

  if (practice.game === MiniGameKind.TapRace) {
    practice.memberScore++
    playSfx('tap')
    return
  }

  if (practice.game === MiniGameKind.Reaction) {
    if (practiceCueLive(practice, now)) {
      practice.cuesDone++
      practice.memberScore++
      // Schedule the next cue, or stop once the round's cues are done.
      practice.cueAt =
        practice.cuesDone >= REACTION_CUES ? 0 : now + practiceCueDelay()
      playSfx('tap')
    } else {
      // Same penalty the server applies: an early tap costs you this cue.
      practice.cueAt = now + practiceCueDelay()
      playSfx('fail')
    }
    return
  }

  if (practice.game === MiniGameKind.SyncTap) {
    // Solo, so "everyone tapped together" reduces to one in-zone tap. The real
    // game needs the whole group inside the same window.
    if (markerInZone(practice.startsAt, now)) {
      practice.syncs++
      playSfx('tap')
    } else {
      practice.syncs = Math.max(0, practice.syncs - 1)
      playSfx('fail')
    }
    return
  }

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
    // The server's real penalty is "the group must re-tap the current step",
    // which is meaningless solo - so practice costs one step instead. Deliberately
    // NOT a reset to zero, which used to make the trainer harsher than the game.
    practice.step = Math.max(0, practice.step - 1)
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
    case MiniGameKind.SyncTap:
      return Math.min(1, practice.syncs / SYNC_TARGET)
    case MiniGameKind.TapRace:
      return Math.min(1, practice.memberScore / TAP_RACE_TARGET)
    case MiniGameKind.Reaction:
      return Math.min(1, practice.cuesDone / REACTION_CUES)
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
    case MiniGameKind.SyncTap:
      return practice.syncs >= SYNC_TARGET
    case MiniGameKind.TapRace:
      return practice.memberScore >= TAP_RACE_TARGET
    case MiniGameKind.Reaction:
      return practice.cuesDone >= REACTION_CUES
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
