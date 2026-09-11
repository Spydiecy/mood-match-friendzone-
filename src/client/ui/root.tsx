/**
 * Mood Match - UI composition and renderer setup.
 *
 * Three deliberate choices here, each of them load-bearing:
 *
 *  1. `virtualWidth` / `virtualHeight` are passed explicitly. That pins the layout
 *     to a stated reference resolution instead of relying on a per-platform
 *     default, and it makes the code behave identically across SDK versions.
 *     On mobile the SDK swaps a 16:9 size for 1600x720, which is what we want -
 *     phone screens are wider than 16:9 and would otherwise letterbox.
 *  2. `screenInset: 'interactable'` keeps the whole UI clear of the device notch
 *     AND of the client's own minimap, chat and left-side controls. Because the
 *     inset is applied at the renderer, the UI is NOT additionally wrapped in
 *     `<InteractableArea>` - doing both would inset twice.
 *  3. The root never returns null. A falsy first render shows a blank frame; a
 *     hidden placeholder does not.
 */

import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { state } from '../state'
import { ActionRow, CenterStage, ConnectionBanner, NoticeToast, TopBar } from './hud'
import { LeaderboardPanel } from './leaderboard'
import { InfoPanel } from './settings'
import { Tutorial } from './tutorial'
import { SPACE } from './theme'

/**
 * Whether onboarding should be on screen.
 *
 * Shown to players with no completed circles. Scenes have no client-side
 * persistence, so "have they played before" is read from the server profile,
 * which does persist. Until the profile arrives we hold off rather than flashing
 * the tutorial at a returning player.
 */
function shouldShowTutorial(): boolean {
  if (state.tutorialDone) return false
  // Gate on the profile actually arriving, not just on the room being connected.
  // `circles` is 0 until the server answers, so gating on the room made the
  // tutorial flash for returning players - and if the server never woke, this
  // full-screen modal would sit over the entire HUD indefinitely.
  if (!state.profileLoaded) return false
  return state.circles === 0
}

/** The single UI tree. */
function Root() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      {/* Top cluster: identity, connection state, transient notices. */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 'auto',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start'
        }}
      >
        <TopBar />
        {/*
          Exactly ONE of these at a time. Both are ~50px and the vertical budget
          only has 60px of slack, so rendering both could push the action row off
          the bottom of a phone screen. The connection banner wins because a player
          who cannot reach the server needs to know that before anything else.
        */}
        {state.serverAlive && state.roomReady ? <NoticeToast /> : <ConnectionBanner />}
      </UiEntity>

      {/* Middle: the round, the result, or where-to-go guidance. */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 'auto',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: { left: SPACE.md, right: SPACE.md }
        }}
      >
        <CenterStage />
      </UiEntity>

      {/* Bottom-centre: the primary action. Never bottom-right. */}
      <ActionRow />

      {/* Overlays last, so they stack above the HUD. */}
      {shouldShowTutorial() && <Tutorial />}
      {!shouldShowTutorial() && state.screen === 'leaderboard' && <LeaderboardPanel />}
      {!shouldShowTutorial() && state.screen === 'info' && <InfoPanel />}
    </UiEntity>
  )
}

/** Installs the renderer. Called once from the client bootstrap. */
export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(Root, {
    // 1600x720, NOT 1920x1080. This matters more than it looks.
    //
    // The SDK overrides any 16:9 virtual size to 1600x720 on mobile, because
    // phone screens are wider than 16:9 and a 16:9 canvas would letterbox. So a
    // layout authored against 1080 of height silently gets 720 on a phone, and
    // every panel then occupies 1.5x the vertical space it was designed for.
    // In practice that pushed panels over the whole view and left the Info
    // panel's close button off the bottom of the screen entirely.
    //
    // 1600x720 is not 16:9 (it is 20:9), so the SDK uses it AS-IS on every
    // platform. One canvas, one set of numbers, and the phone is the reference
    // rather than an afterthought - which is what mobile-first should mean.
    virtualWidth: 1600,
    virtualHeight: 720,
    screenInset: 'interactable'
  })
}
