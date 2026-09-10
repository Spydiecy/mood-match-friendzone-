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
        <ConnectionBanner />
        <NoticeToast />
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
    virtualWidth: 1920,
    virtualHeight: 1080,
    screenInset: 'interactable'
  })
}
