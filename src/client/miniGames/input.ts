/**
 * Mood Match - mini-game input routing.
 *
 * Panels call these functions and do not care whether the round is a real
 * server-judged circle or a local practice run.
 *
 * ROUTING ORDER MATTERS. A real circle ALWAYS wins over practice. These used to
 * check `state.practice` first, which meant a circle forming while a practice run
 * was on screen sent every tap to the local trainer instead of the server: the
 * player looked like a member but contributed nothing, and Hold Zones could never
 * complete because their bit never set. `state.myPad` is therefore checked first
 * everywhere, and `stopPractice()` is called the moment a real round begins.
 *
 * The hold keepalive deserves an explanation too. `onMouseUp` is not guaranteed to
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
import { markColorTap, resetColorFeel } from './colorFeel'

/** True while the local player is holding their zone. */
let holding = false

/** Local time the next keepalive is due. */
let nextKeepalive = 0

/** True when a real, server-judged round is the active one. */
function inRealRound(): boolean {
  return state.myPad !== null
}

/**
 * Rhythm Tap: register a tap.
 *
 * The local verdict is computed FIRST so the ring flashes on the same frame the
 * thumb lands. The server still judges the tap independently and owns the score;
 * this only drives feedback. Without it there is a visible round-trip delay
 * between tapping and anything happening, which makes the game unplayable as a
 * rhythm game.
 *
 * Practice feeds the same predictor, so the ring is alive in the mode a lone
 * first-time player spends their first minute in.
 */
export function inputTap(round?: RoundView): void {
  let verdict: TapVerdict = 'none'
  if (round) {
    verdict = registerTap(round, Date.now())
  }

  // A missed tap gets a quieter cue than a hit, so the audio reinforces the
  // rhythm rather than rewarding mashing.
  if (verdict !== 'miss') playSfx('tap')

  if (inRealRound()) {
    sendGameInput(GameInputKind.Tap)
    return
  }
  if (state.practice) practiceTap()
}

/** Hold Zones: begin holding. */
export function inputHoldStart(): void {
  holding = true
  nextKeepalive = Date.now() + HOLD_KEEPALIVE_MS
  playSfx('tap')

  if (inRealRound()) {
    sendGameInput(GameInputKind.HoldStart)
    return
  }
  if (state.practice) practiceHold(true)
}

/** Hold Zones: stop holding. */
export function inputHoldEnd(): void {
  if (!holding) return
  holding = false

  if (inRealRound()) {
    sendGameInput(GameInputKind.HoldEnd)
    return
  }
  if (state.practice) practiceHold(false)
}

/** True while the local player is holding. Used to style the hold button. */
export function isHolding(): boolean {
  return holding
}

/**
 * Color Match: tap a colour.
 *
 * Marks the tap locally before sending. The server only advances the step once
 * EVERY member has tapped, so without a local mark your own tap cannot change
 * anything on screen - in a game whose entire premise is coordination, that left
 * you unable to see whether your own contribution registered.
 */
export function inputColorTap(emotion: EmotionId, round?: RoundView): void {
  if (round) markColorTap(round, emotion)
  playSfx('tap')

  if (inRealRound()) {
    sendGameInput(GameInputKind.ColorTap, emotion)
    return
  }
  if (state.practice) practiceColorTap(emotion)
}

/**
 * Re-asserts an active hold and clears it when no round is running.
 * Called once per frame from the client system.
 */
export function tickHoldKeepalive(now: number): void {
  if (!holding) return

  // No active round means the button cannot still be legitimately held.
  if (!inRealRound() && !state.practice) {
    inputHoldEnd()
    return
  }

  // Practice is judged locally, so it needs no keepalive.
  if (!inRealRound()) return

  if (now >= nextKeepalive) {
    nextKeepalive = now + HOLD_KEEPALIVE_MS
    sendGameInput(GameInputKind.HoldStart)
  }
}

/**
 * Clears local input state between rounds.
 *
 * Includes the `holding` latch: a player who keeps their thumb down through the
 * end of a round would otherwise start the next one with the button styled as
 * held while nothing was accumulating.
 */
export function resetInput(): void {
  holding = false
  nextKeepalive = 0
  resetTapFeel()
  resetColorFeel()
}
