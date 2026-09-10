/**
 * Mood Match - avatar emotes.
 *
 * This is the scene's main source of joy, and the reason it reads as a *social*
 * space rather than a UI with people standing near it. Circles are moments where
 * several avatars visibly do the same thing at the same time:
 *
 *   - waiting on a pad      -> you wave, which everyone in the plaza can see
 *   - circle locks in       -> everyone raises a hand together
 *   - mini-game cleared     -> everyone dances, in their own mood's style
 *   - mini-game missed      -> everyone shrugs (failure should be funny, not sad)
 *
 * Requires `ALLOW_TO_TRIGGER_AVATAR_EMOTE` in scene.json.
 *
 * Two engine constraints shape everything here:
 *   1. Emotes only play while the player is STANDING STILL - walking or jumping
 *      interrupts them. That is fine for our moments (you are stood on a pad) but
 *      it means an emote is a suggestion, not a guarantee. Never gate game logic
 *      on one having played.
 *   2. Triggering a new emote interrupts the current one, so they are rate-limited
 *      below to avoid a stuttering avatar.
 */

import { executeTask } from '@dcl/sdk/ecs'
import { triggerEmote } from '~system/RestrictedActions'
import { EmotionId } from '../shared/types'

/**
 * Celebration emote per mood, so a winning circle looks like a group of
 * individuals rather than a synchronised chorus line. Each one is a real
 * built-in emote name.
 */
const CELEBRATION: Record<EmotionId, string> = {
  [EmotionId.Calm]: 'tik',
  [EmotionId.Joy]: 'disco',
  [EmotionId.Focus]: 'robot',
  [EmotionId.Energy]: 'fistpump',
  [EmotionId.Love]: 'kiss',
  [EmotionId.Curiosity]: 'dab'
}

/**
 * Minimum gap between emotes. Below this an avatar visibly stutters as each new
 * emote interrupts the last.
 */
const COOLDOWN_MS = 1400

let lastEmoteAt = 0

/**
 * Plays an emote, dropping the request if one played too recently.
 *
 * Fire-and-forget by design: a failed emote must never interrupt gameplay, so
 * errors are logged and swallowed. `force` bypasses the cooldown for the big
 * moments (a circle forming, a round being won) which should never be dropped in
 * favour of an incidental wave.
 */
function play(emote: string, force = false): void {
  const now = Date.now()
  if (!force && now - lastEmoteAt < COOLDOWN_MS) return
  lastEmoteAt = now

  executeTask(async () => {
    try {
      await triggerEmote({ predefinedEmote: emote })
    } catch (error) {
      console.log('[CLIENT] emote failed:', emote, error)
    }
  })
}

/**
 * Beckons other players over while you wait on a pad.
 *
 * This is the highest-value emote in the game: a waving avatar is legible from
 * across the plaza and reads as an invitation in a way that a glowing ring does
 * not. Called on a timer while waiting, hence the cooldown rather than `force`.
 */
export function emoteWaiting(): void {
  play('wave')
}

/** Everyone raises a hand the instant the circle locks in. */
export function emoteCircleFormed(): void {
  play('raiseHand', true)
}

/** Mood-specific victory dance. */
export function emoteSuccess(emotion: EmotionId): void {
  play(CELEBRATION[emotion] ?? 'handsair', true)
}

/**
 * A shrug on failure.
 *
 * Deliberately comic. Losing a cooperative round with strangers should feel like
 * a shared joke, because the thing that brings people back is wanting another go
 * together - not feeling punished.
 */
export function emoteFailure(): void {
  play('shrug', true)
}

/** A small flourish when you reroll your mood at the Mood Font. */
export function emoteReroll(): void {
  play('headexplode')
}

/** Acknowledges a plaza ping - you look up and wave back. */
export function emotePingAck(): void {
  play('raiseHand')
}
