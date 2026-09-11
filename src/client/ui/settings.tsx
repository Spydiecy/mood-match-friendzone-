/**
 * Mood Match - info and settings panel.
 *
 * Rebuilt to FIT the 720-high canvas. The previous version was authored against
 * 1080 of height, so on a phone its content overflowed the top of the screen and
 * its only close button sat below the bottom edge - the player was trapped in a
 * menu they could not dismiss. `Modal` now caps the height and always renders a
 * close X in the header.
 *
 * Content is deliberately trimmed to what a player reaches for mid-session.
 */

import ReactEcs, { Key, UiEntity } from '@dcl/sdk/react-ecs'
import { PAD_RADIUS, SKIN_UNLOCK_REQUIREMENT } from '../../shared/config'
import { EMOTIONS, countUnlockedSkins, isSkinUnlocked } from '../../shared/emotions'
import { PAD_NAMES } from '../circle'
import { rerollEmotion, setEmotion } from '../emotions'
import { toggleMute } from '../audio'
import { platformLabel } from '../utils/platform'
import { clockOffset, clockReady } from '../utils/serverClock'
import { currentRealm, openInvite } from '../utils/share'
import { state } from '../state'
import { COLORS, FONT, ICON, RADIUS, SPACE, emotionColor } from './theme'
import { EmotionBadge, Icon, IconButton, Modal, Paragraph, Row, Text } from './widgets'

/** Closes the panel. */
function close(): void {
  state.screen = 'hud'
}

/** The info modal. */
export function InfoPanel() {
  return (
    <Modal title="Mood Match" onClose={close} width={980}>
      <Paragraph
        value={`Stand together with other players in one of the three Mood Pads - ${PAD_NAMES.join(
          ', '
        )}, each about ${PAD_RADIUS * 2}m across - and clear a 10-second mini-game as a group.`}
        lines={2}
        fontSize={FONT.small}
        width={920}
        marginBottom={SPACE.md}
      />

      {/* Mood picker */}
      <Row width="100%" justifyContent="space-between">
        <Text
          value="Your mood"
          fontSize={FONT.heading}
          color={COLORS.text}
          align="middle-left"
          width={500}
        />
        <Text
          value={state.myPad ? 'Locked in a circle' : 'Tap to switch'}
          fontSize={FONT.tiny}
          color={COLORS.textDim}
          align="middle-right"
          width={400}
        />
      </Row>

      <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
        {EMOTIONS.map((emotion) => (
          <MoodOption key={`pick-${emotion.id}`} emotion={emotion.id} />
        ))}
      </Row>

      <Text
        value={`Skins ${countUnlockedSkins(state.unlockedMask)} of ${EMOTIONS.length}  -  ${SKIN_UNLOCK_REQUIREMENT} wins with a mood unlocks it`}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={920}
        marginTop={SPACE.sm}
      />

      {/* Controls */}
      <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
        <IconButton
          icon={state.muted ? ICON.soundOff : ICON.soundOn}
          caption={state.muted ? 'Muted' : 'Sound'}
          onClick={() => toggleMute()}
          active={!state.muted}
        />
        <IconButton icon={ICON.reroll} caption="Reroll" onClick={() => rerollEmotion()} />
        <IconButton icon={ICON.invite} caption="Invite" onClick={() => openInvite()} />
        <IconButton
          icon={ICON.board}
          caption="Board"
          onClick={() => {
            state.screen = 'leaderboard'
          }}
        />
      </Row>

      {/* Diagnostics - makes a support conversation much shorter. */}
      <Text
        value={`${platformLabel()}  -  ${currentRealm()}  -  server ${
          state.serverAlive ? 'live' : 'waking'
        }  -  clock ${clockReady() ? `${clockOffset()}ms` : 'sync'}`}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={920}
        marginTop={SPACE.md}
      />
    </Modal>
  )
}

/**
 * One selectable mood.
 *
 * Unlock state is shown as a marker rather than gating selection: locking a mood
 * behind progress would shrink the combo space for everyone else in your circle,
 * which is the opposite of what a cooperative game wants.
 */
function MoodOption(props: { key?: Key; emotion: number }) {
  const selected = state.emotion === props.emotion
  const unlocked = isSkinUnlocked(state.unlockedMask, props.emotion)
  const locked = state.myPad !== null

  return (
    <UiEntity
      uiTransform={{
        width: 122,
        height: 116,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.chip,
        borderWidth: selected ? 3 : 0,
        borderColor: selected ? emotionColor(props.emotion) : COLORS.none,
        margin: { left: SPACE.xs, right: SPACE.xs },
        pointerFilter: 'block'
      }}
      uiBackground={{ color: selected ? COLORS.surface : COLORS.chip }}
      onMouseDown={() => {
        if (!locked) setEmotion(props.emotion)
      }}
    >
      <EmotionBadge emotion={props.emotion} size={56} showName dimmed={locked} />
      {unlocked ? (
        <Icon src={ICON.check} size={16} color={COLORS.warn} marginTop={2} />
      ) : (
        <UiEntity uiTransform={{ width: 1, height: 18 }} />
      )}
    </UiEntity>
  )
}
