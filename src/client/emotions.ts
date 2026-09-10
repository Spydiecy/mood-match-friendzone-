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

/** Selects a specific emotion and tells the server. */
export function setEmotion(emotion: EmotionId): void {
  const changed = state.emotion !== emotion
  state.emotion = emotion
  playSfx('reroll')
  // Only celebrate an actual change, so re-tapping your current mood is quiet.
  if (changed) emoteReroll()
  room.send('setEmotion', { emotion })
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
