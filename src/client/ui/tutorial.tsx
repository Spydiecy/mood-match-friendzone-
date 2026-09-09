/**
 * Mood Match - onboarding.
 *
 * Three screens, skippable from the first tap. It shows automatically on a
 * player's first visit and never again, which is derived from the server profile
 * (`circles > 0` means they have played) rather than from local storage - scenes
 * have no client-side persistence, but the server profile already survives.
 *
 * Kept to three short screens because the brief's real requirement is that a new
 * player is playing within 30 seconds, and a long tutorial is the fastest way to
 * fail that.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { MINIGAME_DURATION_MS, MIN_CIRCLE_PLAYERS, POINTS_BASE } from '../../shared/config'
import { EMOTIONS } from '../../shared/emotions'
import { state } from '../state'
import { COLORS, FONT, SPACE, TOUCH } from './theme'
import { EmotionBadge, IconButton, Modal, Panel, PrimaryButton, Row, Text, Paragraph } from './widgets'

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

/** The onboarding modal. Rendered only while it should be visible. */
export function Tutorial() {
  const step = state.tutorialStep

  return (
    <Modal>
      <Panel width={960} padding={SPACE.xl}>
        <Text
          value={`Mood Match  -  ${step + 1} of ${STEPS}`}
          fontSize={FONT.small}
          color={COLORS.textDim}
          width={800}
        />

        {step === 0 && <StepEmotion />}
        {step === 1 && <StepCircle />}
        {step === 2 && <StepScore />}

        <Row width="100%" justifyContent="center" marginTop={SPACE.lg}>
          <IconButton label="Skip" onClick={() => dismissTutorial()} size={TOUCH.secondary} />
          <UiEntity uiTransform={{ width: SPACE.md, height: 1 }} />
          <PrimaryButton
            label={step >= STEPS - 1 ? "Let's play" : 'Next'}
            onClick={() => nextStep()}
            width={360}
          />
        </Row>
      </Panel>
    </Modal>
  )
}

/** Screen 1: you have an emotion. */
function StepEmotion() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 420,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="You have a mood" fontSize={FONT.title} color={COLORS.text} width={840} />
      <Paragraph
        value="Everyone who arrives is given one of six moods. Your colour is your identity here - it decides which bonus patterns your group can hit."
        lines={3}
        fontSize={FONT.body}
        marginBottom={SPACE.md}
      />

      <Row width="100%" justifyContent="center">
        {EMOTIONS.slice(0, 3).map((emotion) => (
          <UiEntity
            key={`e-${emotion.id}`}
            uiTransform={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}
          >
            <EmotionBadge emotion={emotion.id} size={104} showName />
          </UiEntity>
        ))}
      </Row>
      <Row width="100%" justifyContent="center">
        {EMOTIONS.slice(3).map((emotion) => (
          <UiEntity
            key={`e-${emotion.id}`}
            uiTransform={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}
          >
            <EmotionBadge emotion={emotion.id} size={104} showName />
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
        height: 420,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="Form a circle" fontSize={FONT.title} color={COLORS.text} width={840} />
      <Paragraph
        value={`Walk into one of the three glowing Mood Pads and tap Form Circle. When ${MIN_CIRCLE_PLAYERS} or more players are standing in the same ring, the circle locks in.`}
        lines={3}
        fontSize={FONT.body}
        marginBottom={SPACE.md}
      />
      <Paragraph
        value={`Then you all play a ${Math.round(
          MINIGAME_DURATION_MS / 1000
        )}-second mini-game together. Rhythm Tap, Hold Zones or Color Match - all three only work if the group cooperates.`}
        lines={3}
        fontSize={FONT.body}
        marginBottom={SPACE.md}
      />
      <Paragraph
        value="No one else around? Tap Practice to try a mini-game solo. Practice does not score."
        lines={2}
        fontSize={FONT.small}
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
        height: 420,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="Score together" fontSize={FONT.title} color={COLORS.text} width={840} />

      <ScoreLine label="Form a circle" value={`+${POINTS_BASE}`} />
      <ScoreLine label="Matching mood combo" value="+20" />
      <ScoreLine label="Clear the mini-game" value="+30" />
      <ScoreLine label="Holding the featured mood" value="x2" />
      <ScoreLine label="Daily streak" value="up to +50%" />

      <Paragraph
        value="Scores are kept on a persistent leaderboard. One mood is featured every day, and five successful circles with the same mood unlocks its skin."
        lines={3}
        fontSize={FONT.small}
      />
    </UiEntity>
  )
}

/** A row in the scoring table. */
function ScoreLine(props: { label: string; value: string }) {
  return (
    <UiEntity
      uiTransform={{
        width: 700,
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Text
        value={props.label}
        fontSize={FONT.body}
        color={COLORS.textDim}
        align="middle-left"
        width={480}
      />
      <Text
        value={props.value}
        fontSize={FONT.body}
        color={COLORS.good}
        align="middle-right"
        width={200}
      />
    </UiEntity>
  )
}
