/**
 * Mood Match - mini-game input routing.
 *
 * Panels call these functions and do not care whether the round is a real
 * server-judged circle or a local practice run.
 *
 * The hold keepalive deserves an explanation. `onMouseUp` is not guaranteed to
 * fire if the player's thumb slides off the button, which would leave the server
 * believing they are still holding - both a stuck-input bug and a way to pass
 * Hold Zones without holding. So while holding, the client re-sends HoldStart on
 * an interval and the server expires any hold it has not heard from recently.
 * Silence means released.
 */

import { HOLD_KEEPALIVE_MS } from '../../shared/config'
import { GameInputKind } from '../../shared/types'
import { sendGameInput } from '../circle'
import { playSfx } from '../audio'
import { practiceColorTap, practiceHold, practiceTap } from '../practice'
import { EmotionId } from '../../shared/types'
import { state } from '../state'

/** True while the local player is holding their zone. */
let holding = false

/** Local time the next keepalive is due. */
let nextKeepalive = 0

/** Rhythm Tap: register a tap. */
export function inputTap(): void {
  if (state.practice) {
    practiceTap()
    return
  }
  playSfx('tap')
  sendGameInput(GameInputKind.Tap)
}

/** Hold Zones: begin holding. */
export function inputHoldStart(): void {
  holding = true
  nextKeepalive = Date.now() + HOLD_KEEPALIVE_MS

  if (state.practice) {
    practiceHold(true)
    return
  }
  playSfx('tap')
  sendGameInput(GameInputKind.HoldStart)
}

/** Hold Zones: stop holding. */
export function inputHoldEnd(): void {
  if (!holding) return
  holding = false

  if (state.practice) {
    practiceHold(false)
    return
  }
  sendGameInput(GameInputKind.HoldEnd)
}

/** True while the local player is holding. Used to style the hold button. */
export function isHolding(): boolean {
  return holding
}

/** Color Match: tap a colour. */
export function inputColorTap(emotion: EmotionId): void {
  if (state.practice) {
    practiceColorTap(emotion)
    return
  }
  sendGameInput(GameInputKind.ColorTap, emotion)
}

/**
 * Re-asserts an active hold and clears it when no round is running.
 * Called once per frame from the client system.
 */
export function tickHoldKeepalive(now: number): void {
  if (!holding) return

  // No active round means the button cannot still be legitimately held.
  if (!state.myPad && !state.practice) {
    inputHoldEnd()
    return
  }

  if (state.practice) return

  if (now >= nextKeepalive) {
    nextKeepalive = now + HOLD_KEEPALIVE_MS
    sendGameInput(GameInputKind.HoldStart)
  }
}

/** Clears local input state between rounds. */
export function resetInput(): void {
  holding = false
  nextKeepalive = 0
}
