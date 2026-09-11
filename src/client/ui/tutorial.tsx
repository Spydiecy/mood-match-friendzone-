/**
 * Mood Match - onboarding.
 *
 * Three screens, skippable from the first tap. Shown on a player's first visit and
 * never again, derived from the server profile (`circles === 0`) since scenes have
 * no client-side persistence.
 *
 * Rebuilt for the 720-high canvas: each screen is a single compact block that fits
 * without scrolling, and `Modal` guarantees a reachable close control. The brief's
 * real requirement is that a new player is PLAYING within 30 seconds, and a
 * tutorial they have to fight is the fastest way to fail that.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import {
  FEATURED_MULTIPLIER,
  MINIGAME_DURATION_MS,
  MIN_CIRCLE_PLAYERS,
  POINTS_BASE,
  POINTS_COMBO,
  POINTS_MINIGAME,
  STREAK_MAX_BONUS
} from '../../shared/config'
import { EMOTIONS } from '../../shared/emotions'
import { state } from '../state'
import { COLORS, FONT, ICON, SPACE, textHeight } from './theme'
import { EmotionBadge, IconButton, Modal, Paragraph, PrimaryButton, Row, Text } from './widgets'

/** How many screens the tutorial has. */
const STEPS = 3

/** Closes onboarding for the rest of the session. */
export function dismissTutorial(): void {
  state.tutorialDone = true
  state.tutorialStep = 0
}

/** Advances one screen, closing on the last. */
function nextStep(): void {
  if (state.tutorialStep >= STEPS - 1) {
    dismissTutorial()
    return
  }
  state.tutorialStep++
}

/** The onboarding modal. */
export function Tutorial() {
  const step = state.tutorialStep

  return (
    <Modal title={`Mood Match  ${step + 1}/${STEPS}`} onClose={dismissTutorial} width={900}>
      {step === 0 && <StepEmotion />}
      {step === 1 && <StepCircle />}
      {step === 2 && <StepScore />}

      <Row width="100%" justifyContent="center" marginTop={SPACE.md}>
        <IconButton icon={ICON.close} caption="Skip" onClick={() => dismissTutorial()} />
        <UiEntity uiTransform={{ width: SPACE.md, height: 1 }} />
        <PrimaryButton
          label={step >= STEPS - 1 ? 'Play' : 'Next'}
          icon={ICON.play}
          onClick={() => nextStep()}
          width={300}
        />
      </Row>
    </Modal>
  )
}

/** Screen 1: you have a mood. */
function StepEmotion() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 300,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="You have a mood" fontSize={FONT.title} color={COLORS.text} width={840} />
      <Paragraph
        value="Everyone who arrives gets one of six. Your colour is your identity here, and it decides which bonus patterns your group can hit."
        lines={2}
        width={840}
        marginBottom={SPACE.md}
      />
      <Row width="100%" justifyContent="center">
        {EMOTIONS.map((emotion) => (
          <UiEntity
            key={`e-${emotion.id}`}
            uiTransform={{
              width: 128,
              height: 108,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <EmotionBadge emotion={emotion.id} size={64} showName />
          </UiEntity>
        ))}
      </Row>
    </UiEntity>
  )
}

/** Screen 2: circles are the whole game. */
function StepCircle() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 300,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="Form a circle" fontSize={FONT.title} color={COLORS.text} width={840} />
      <Paragraph
        value={`Walk into a glowing Mood Pad and tap Form Circle. Once ${MIN_CIRCLE_PLAYERS} or more players are in the same ring, the circle locks in.`}
        lines={2}
        width={840}
        marginBottom={SPACE.sm}
      />
      <Paragraph
        value={`Then you all play a ${Math.round(
          MINIGAME_DURATION_MS / 1000
        )}-second mini-game together: Rhythm Tap, Hold Zones or Color Match. None of them can be cleared by one person carrying the group.`}
        lines={2}
        width={840}
        marginBottom={SPACE.sm}
      />
      <Paragraph
        value="Nobody around? Tap Call to ping the World, or Practice to try one solo. Practice does not score."
        lines={2}
        width={840}
      />
    </UiEntity>
  )
}

/** Screen 3: how points work and why to come back. */
function StepScore() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 300,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="Score together" fontSize={FONT.title} color={COLORS.text} width={840} />

      <ScoreLine label="Form a circle" value={`+${POINTS_BASE}`} />
      <ScoreLine label="Matching mood combo" value={`+${POINTS_COMBO}`} />
      <ScoreLine label="Clear the mini-game" value={`+${POINTS_MINIGAME}`} />
      <ScoreLine label="Holding the featured mood" value={`x${FEATURED_MULTIPLIER}`} />
      <ScoreLine
        label="Daily streak"
        value={`up to +${Math.round(STREAK_MAX_BONUS * 100)}%`}
      />

      <Paragraph
        value="Scores persist on a shared leaderboard. One mood is featured each day, and five wins with a mood unlocks its skin."
        lines={2}
        width={840}
        marginBottom={0}
      />
    </UiEntity>
  )
}

/** A row in the scoring table. */
function ScoreLine(props: { label: string; value: string }) {
  return (
    <UiEntity
      uiTransform={{
        width: 620,
        height: textHeight(FONT.small) + 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Text
        value={props.label}
        fontSize={FONT.small}
        color={COLORS.textDim}
        align="middle-left"
        width={430}
      />
      <Text
        value={props.value}
        fontSize={FONT.small}
        color={COLORS.good}
        align="middle-right"
        width={170}
      />
    </UiEntity>
  )
}
