/**
 * Mood Match - platform detection.
 *
 * Mood Match is designed mobile-first: the phone layout is the reference and the
 * desktop layout is the variant, not the other way round. These helpers exist so
 * that intent is explicit at every call site.
 */

import { getPlatform, isDesktop, isMobile } from '@dcl/sdk/platform'

/** Cached because the platform cannot change during a session. */
let cachedMobile: boolean | null = null

/**
 * True on the Decentraland mobile app.
 *
 * Note this is genuinely "is a touch device", not "is a small screen" - the
 * layout also consults `UiCanvasInformation` for real dimensions.
 */
export function onMobile(): boolean {
  if (cachedMobile === null) {
    cachedMobile = isMobile()
  }
  return cachedMobile
}

/** True on the desktop explorer. */
export function onDesktop(): boolean {
  return isDesktop()
}

/** Human-readable platform label, used in the info panel and logs. */
export function platformLabel(): string {
  const platform = getPlatform()
  if (platform === 'mobile') return 'Mobile'
  if (platform === 'desktop') return 'Desktop'
  if (platform === 'web') return 'Web'
  return 'Unknown'
}
