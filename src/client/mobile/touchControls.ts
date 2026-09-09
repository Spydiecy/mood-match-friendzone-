/**
 * Mood Match - native touch control tuning.
 *
 * The mobile client's gamepad buttons form a fixed priority stack and overflow
 * behind a "+" once more than five are visible. Mood Match needs none of the
 * numbered action buttons, so hiding them drops the visible count, removes the
 * "+" overflow, and frees the bottom-right corner that our own UI deliberately
 * avoids anyway.
 *
 * The joystick stays visible: it is the only way to walk on mobile, and walking
 * over to another player is the core of the game.
 */

import { InputAction, TouchScreenControls, engine } from '@dcl/sdk/ecs'
import { onMobile } from '../utils/platform'

/**
 * Applies the touch layout. A no-op on desktop, where the component is ignored.
 *
 * `TouchScreenControls` is available from SDK 7.26.0; this project pins a newer
 * SDK so the component is always present.
 */
export function setupTouchControls(): void {
  if (!onMobile()) return

  TouchScreenControls.createOrReplace(engine.RootEntity, {
    // Keep the joystick: players must be able to walk to each other.
    hideJoystick: false,
    // No world-space aiming in this game, so the crosshair is pure clutter.
    hideCrosshair: true,
    touchInputs: [
      // Hide the four numbered buttons. All Mood Match interaction happens
      // through large in-scene UI buttons instead.
      { inputAction: InputAction.IA_ACTION_3, hide: true },
      { inputAction: InputAction.IA_ACTION_4, hide: true },
      { inputAction: InputAction.IA_ACTION_5, hide: true },
      { inputAction: InputAction.IA_ACTION_6, hide: true },
      { inputAction: InputAction.IA_SECONDARY, hide: true }
    ]
  })
}
