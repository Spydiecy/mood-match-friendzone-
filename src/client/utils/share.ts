/**
 * Mood Match - invite links.
 *
 * Mood Match needs at least two players, so "bring a friend" is a core mechanic
 * rather than a nice-to-have. The Invite button opens a jump link to whichever
 * realm the scene is actually running in, so it keeps working when the World is
 * renamed or the scene is deployed somewhere else.
 *
 * Requires `OPEN_EXTERNAL_LINK` in `scene.json`.
 */

import { executeTask } from '@dcl/sdk/ecs'
import { openExternalUrl } from '~system/RestrictedActions'
import { getRealm } from '~system/Runtime'
import { DEFAULT_INVITE_URL } from '../../shared/config'
import { PAD_NAMES } from '../circle'
import { NoticeTone } from '../../shared/messages'
import { showNotice, state } from '../state'

/** Realm name, resolved once at boot. Empty until the request lands. */
let realmName = ''

/** True when running in local preview, which changes what the link can be. */
let preview = false

/** Reads the realm so invite links point at the right World. */
export function resolveRealm(): void {
  executeTask(async () => {
    try {
      const response = await getRealm({})
      realmName = response.realmInfo?.realmName ?? ''
      preview = response.realmInfo?.isPreview ?? false
      console.log('[CLIENT] realm:', realmName, 'preview:', preview)
    } catch (error) {
      console.log('[CLIENT] could not resolve realm:', error)
    }
  })
}

/** The realm name, for display in the info panel. */
export function currentRealm(): string {
  return realmName || 'unknown'
}

/** The shareable jump link for this World. */
export function inviteUrl(): string {
  if (!realmName) return 'https://decentraland.org'
  return DEFAULT_INVITE_URL + encodeURIComponent(realmName)
}

/**
 * A short human-readable meetup hint.
 *
 * Scenes cannot read query parameters, so a "team code" in a URL could not
 * actually be honoured on arrival. Instead the invite tells the friend WHERE to
 * meet, which is the part that genuinely helps two people find each other in a
 * 32x32 plaza.
 */
export function meetupHint(): string {
  const pad = state.nearestPad >= 0 ? state.nearestPad : 0
  return `Meet at the ${PAD_NAMES[pad]}`
}

/**
 * Opens the invite link.
 *
 * In local preview the jump link cannot resolve, so we say so rather than
 * opening a dead page.
 */
export function openInvite(): void {
  if (preview) {
    showNotice('Invite links only work on the published World.', NoticeTone.Info)
    return
  }

  executeTask(async () => {
    try {
      await openExternalUrl({ url: inviteUrl() })
      state.inviteShownUntil = Date.now() + 4000
      showNotice(meetupHint() + ' - link opened in your browser.', NoticeTone.Success)
    } catch (error) {
      console.log('[CLIENT] openExternalUrl failed:', error)
      showNotice('Could not open the invite link.', NoticeTone.Warning)
    }
  })
}
