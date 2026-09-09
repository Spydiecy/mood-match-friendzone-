/**
 * Mood Match - mobile layout metrics.
 *
 * The renderer is configured with `screenInset: 'interactable'`, which already
 * keeps our UI out of the device notch AND out of the client's own chrome
 * (minimap, chat, left-side controls). This module covers the one thing that
 * inset does NOT protect: the mobile client draws its action buttons over the
 * bottom-right of the interactable area by design.
 *
 * So the rule this module encodes is: nothing tappable goes in the bottom-right
 * corner. Primary actions sit bottom-CENTRE, secondary controls sit top-centre.
 */

import { UiCanvasInformation, engine } from '@dcl/sdk/ecs'
import { onMobile } from '../utils/platform'

/** Layout metrics recomputed from the live canvas each frame the UI needs them. */
export interface LayoutMetrics {
  /** Canvas width in virtual units. */
  width: number
  /** Canvas height in virtual units. */
  height: number
  /** True when the viewport is portrait-ish and needs the compact layout. */
  compact: boolean
  /** True when running on a touch client. */
  touch: boolean
  /**
   * Right-hand margin to keep clear of the client's action buttons.
   * Zero on desktop, where no such overlay exists.
   */
  actionButtonGuard: number
  /** Bottom margin for the primary action row. */
  bottomGuard: number
}

/** Fallback used before the first `UiCanvasInformation` arrives. */
const FALLBACK: LayoutMetrics = {
  width: 1920,
  height: 1080,
  compact: false,
  touch: false,
  actionButtonGuard: 0,
  bottomGuard: 40
}

/**
 * Width reserved on the right for the mobile client's action buttons.
 * Measured against the 1600x720 mobile virtual canvas the SDK enforces.
 */
const MOBILE_ACTION_GUARD = 280

/** Reads current layout metrics. Safe to call every frame. */
export function getLayout(): LayoutMetrics {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  const touch = onMobile()

  if (!canvas) {
    return { ...FALLBACK, touch, actionButtonGuard: touch ? MOBILE_ACTION_GUARD : 0 }
  }

  const width = canvas.width
  const height = canvas.height

  return {
    width,
    height,
    // Below this ratio the screen is short and wide (a phone held sideways) or
    // narrow, and the HUD drops to a single stacked column.
    compact: touch || width < 1100,
    touch,
    actionButtonGuard: touch ? MOBILE_ACTION_GUARD : 0,
    bottomGuard: touch ? 24 : 48
  }
}

/**
 * Scales a design value for the compact layout.
 *
 * Deliberately mild. On SDK 7.26.0+ the UI scale factor no longer divides by
 * `devicePixelRatio` and mobile gets a 1600x720 virtual canvas, so pixel sizes
 * are already noticeably larger on a phone than they used to be. The old
 * "multiply everything by 3 for mobile" advice over-inflates on current SDKs.
 */
export function scaled(base: number, layout: LayoutMetrics): number {
  return layout.compact ? Math.round(base * 1.12) : base
}
