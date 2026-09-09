/**
 * Mood Match - info and settings panel.
 *
 * Combines the things a player reaches for mid-session: mute, rerolling their
 * mood, the invite link, skin-unlock progress, a rules recap and a small
 * diagnostics row that makes support conversations much shorter.
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
import { COLORS, FONT, RADIUS, SPACE, TOUCH, emotionColor } from './theme'
import { EmotionBadge, IconButton, Modal, Panel, PrimaryButton, Row, Text, Paragraph } from './widgets'

/** Closes the panel. */
function close(): void {
  state.screen = 'hud'
}

/** The info modal. */
export function InfoPanel() {
  return (
    <Modal>
      <Panel width={980} padding={SPACE.lg}>
        <Text value="Mood Match" fontSize={FONT.title} color={COLORS.text} width={860} />
        <Paragraph
          value={`Find other players, stand together in one of the three Mood Pads, and clear a 10-second mini-game as a group. Pads are ${PAD_NAMES.join(
            ', '
          )} - each ring is about ${PAD_RADIUS}m across.`}
          lines={3}
          fontSize={FONT.small}
          marginBottom={SPACE.md}
        />

        {/* Mood picker */}
        <Text
          value="Your mood"
          fontSize={FONT.heading}
          color={COLORS.text}
          width={860}
        />
        <Text
          value={
            state.myPad
              ? 'Locked while you are in a circle'
              : 'Tap any mood to switch to it'
          }
          fontSize={FONT.small}
          color={COLORS.textDim}
          width={860}
          marginBottom={SPACE.sm}
        />

        <Row width="100%" justifyContent="center">
          {EMOTIONS.map((emotion) => (
            <MoodOption key={`pick-${emotion.id}`} emotion={emotion.id} />
          ))}
        </Row>

        <Row width="100%" justifyContent="center" marginTop={SPACE.sm}>
          <Text
            value={`Skins unlocked ${countUnlockedSkins(state.unlockedMask)} of ${
              EMOTIONS.length
            }  -  ${SKIN_UNLOCK_REQUIREMENT} successful circles with a mood unlocks it`}
            fontSize={FONT.small}
            color={COLORS.textDim}
            width={860}
          />
        </Row>

        {/* Controls */}
        <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
          <IconButton
            label={state.muted ? 'Sound off' : 'Sound on'}
            onClick={() => toggleMute()}
            active={!state.muted}
            size={TOUCH.secondary + 20}
          />
          <IconButton
            label="Reroll"
            onClick={() => rerollEmotion()}
            size={TOUCH.secondary + 20}
          />
          <IconButton
            label="Invite"
            onClick={() => openInvite()}
            size={TOUCH.secondary + 20}
          />
          <IconButton
            label="Board"
            onClick={() => {
              state.screen = 'leaderboard'
            }}
            size={TOUCH.secondary + 20}
          />
        </Row>

        {/* Diagnostics */}
        <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
          <Text
            value={`${platformLabel()}  -  realm ${currentRealm()}  -  server ${
              state.serverAlive ? 'live' : 'waking'
            }  -  clock ${clockReady() ? `${clockOffset()}ms` : 'syncing'}`}
            fontSize={FONT.small}
            color={COLORS.textDim}
            width={880}
          />
        </Row>

        <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
          <PrimaryButton label="Back" onClick={() => close()} width={340} />
        </Row>
      </Panel>
    </Modal>
  )
}

/**
 * One selectable mood.
 *
 * Shows unlock state as a subtle marker rather than gating selection: locking a
 * mood behind progress would shrink the combo space for everyone in your circle,
 * which is the opposite of what a cooperative game wants.
 */
function MoodOption(props: { key?: Key; emotion: number }) {
  const selected = state.emotion === props.emotion
  const unlocked = isSkinUnlocked(state.unlockedMask, props.emotion)
  const locked = state.myPad !== null

  return (
    <UiEntity
      uiTransform={{
        width: 138,
        height: 176,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.chip,
        borderWidth: selected ? 4 : 0,
        borderColor: selected ? emotionColor(props.emotion) : COLORS.none,
        margin: { left: SPACE.xs, right: SPACE.xs },
        pointerFilter: 'block'
      }}
      uiBackground={{ color: selected ? COLORS.surface : COLORS.chip }}
      onMouseDown={() => {
        if (!locked) setEmotion(props.emotion)
      }}
    >
      <EmotionBadge emotion={props.emotion} size={86} showName dimmed={locked} />
      <Text
        value={unlocked ? 'skin' : ''}
        fontSize={FONT.small}
        color={COLORS.warn}
        height={Math.round(FONT.small * 1.3)}
      />
    </UiEntity>
  )
}
