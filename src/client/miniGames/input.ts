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
import { EmotionId, GameInputKind } from '../../shared/types'
import { sendGameInput } from '../circle'
import { playSfx } from '../audio'
import { practiceColorTap, practiceHold, practiceTap } from '../practice'
import { state } from '../state'
import { RoundView } from './round'
import { TapVerdict, registerTap, resetTapFeel } from './tapFeel'

/** True while the local player is holding their zone. */
let holding = false

/** Local time the next keepalive is due. */
let nextKeepalive = 0

/**
 * Rhythm Tap: register a tap.
 *
 * The local verdict is computed FIRST so the ring flashes on the same frame the
 * thumb lands. The server still judges the tap independently and owns the score;
 * this only drives feedback. Without it there is a visible round-trip delay
 * between tapping and anything happening, which makes the game unplayable as a
 * rhythm game.
 */
export function inputTap(round?: RoundView): void {
  if (state.practice) {
    practiceTap()
    return
  }

  let verdict: TapVerdict = 'none'
  if (round) {
    verdict = registerTap(round, Date.now())
  }

  // A missed tap gets a quieter cue than a hit, so the audio reinforces the
  // rhythm rather than rewarding mashing.
  if (verdict !== 'miss') playSfx('tap')

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
  resetTapFeel()
}
