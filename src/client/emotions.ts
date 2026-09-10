/**
 * Mood Match - client-side emotion handling.
 *
 * Each player is given a random emotion on arrival and can reroll it at the Mood
 * Font in the middle of the plaza. The emotion is the player's social identity
 * for the session: it decides which combos their circle can hit and whether they
 * catch today's 2x featured multiplier.
 *
 * The server records the emotion but the client picks it - there is nothing to
 * gain from cheating a reroll, and the server blocks rerolls mid-round so nobody
 * can fish for a multiplier after seeing the combo.
 */

import { EMOTIONS, getEmotion, randomEmotion } from '../shared/emotions'
import { room } from '../shared/messages'
import { EMOTION_COUNT, EmotionId } from '../shared/types'
import { playSfx } from './audio'
import { emoteReroll } from './emotes'
import { state } from './state'

/** Assigns the starting emotion. Called once, during client boot. */
export function assignInitialEmotion(): void {
  state.emotion = randomEmotion()
}

/**
 * Rerolls to a different emotion.
 *
 * Guarantees a change (never rerolls onto the current emotion), because tapping
 * a button and seeing nothing happen reads as a bug.
 */
export function rerollEmotion(): void {
  if (state.myPad) return // server would reject it anyway; skip the round trip

  let next = state.emotion
  if (EMOTION_COUNT > 1) {
    const offset = 1 + Math.floor(Math.random() * (EMOTION_COUNT - 1))
    next = ((state.emotion + offset) % EMOTION_COUNT) as EmotionId
  }

  setEmotion(next)
}

/**
 * Local time of the last mood change we sent.
 *
 * Used to hold off reconciliation briefly: the client applies a change
 * optimistically for responsiveness, so for a moment the server legitimately
 * still reports the old value and correcting it would fight the player's input.
 */
let lastChangeSentAt = 0

/** How long to trust the local value over the server's after a change. */
const RECONCILE_GRACE_MS = 2500

/** Selects a specific emotion and tells the server. */
export function setEmotion(emotion: EmotionId): void {
  const changed = state.emotion !== emotion
  state.emotion = emotion
  lastChangeSentAt = Date.now()
  playSfx('reroll')
  // Only celebrate an actual change, so re-tapping your current mood is quiet.
  if (changed) emoteReroll()
  room.send('setEmotion', { emotion })
}

/**
 * Corrects the local mood to whatever the server actually has.
 *
 * The server REFUSES a mood change while the player is in a circle, and used to
 * drop the message silently while the client had already applied it - so the HUD
 * showed Joy while the server scored Calm, which quietly changed the player's
 * combo and whether they caught the 2x featured multiplier.
 */
export function reconcileEmotion(serverEmotion: number): void {
  if (Date.now() - lastChangeSentAt < RECONCILE_GRACE_MS) return
  if (serverEmotion < 0 || serverEmotion >= EMOTION_COUNT) return
  if (state.emotion === serverEmotion) return

  console.log('[CLIENT] mood corrected by server:', state.emotion, '->', serverEmotion)
  state.emotion = serverEmotion as EmotionId
}

/** True when today's featured emotion matches the player's current emotion. */
export function holdingFeaturedEmotion(): boolean {
  return state.emotion === state.featuredEmotion
}

/** Display name of the player's current emotion. */
export function currentEmotionName(): string {
  return getEmotion(state.emotion).name
}

/** Display name of today's featured emotion. */
export function featuredEmotionName(): string {
  return getEmotion(state.featuredEmotion).name
}

/** All emotions, for the picker grid in the info panel. */
export function allEmotions() {
  return EMOTIONS
}
