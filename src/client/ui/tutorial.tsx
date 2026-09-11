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
  POINTS_PER_EXTRA_MEMBER,
  MAX_CIRCLE_PLAYERS,
  PLACEMENT_LAST,
  STREAK_MAX_BONUS,
  winnerPrize
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
      <Text value="Your mood is your perk" fontSize={FONT.title} color={COLORS.text} width={840} />
      <Paragraph
        value="Each of the six moods plays differently. Energy scores more, Locked On triples every third point, Steady gets forgiving timing - while Contagious and Bond feed points to the players behind you."
        lines={3}
        width={840}
        marginBottom={SPACE.sm}
      />
      <Paragraph
        value="Racers win the placement bonus. Supporters help the group clear its shared goal, which pays everyone. Swap any time at the font in the middle."
        lines={2}
        width={840}
        marginBottom={SPACE.sm}
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
      <Text value="Just stand in a ring" fontSize={FONT.title} color={COLORS.text} width={840} />
      <Paragraph
        value="There is no button. Walk into a glowing Mood Pad and the circle fills on its own - watch the counter above the ring."
        lines={2}
        width={840}
        marginBottom={SPACE.sm}
      />
      <Paragraph
        value="Each ring wants a different group size: Duo needs 2 (west), Trio needs 3 (east), Squad needs 4 (north). Bigger circles pay more."
        lines={2}
        width={840}
        marginBottom={SPACE.sm}
      />
      <Paragraph
        value={`Then you all play a ${Math.round(
          MINIGAME_DURATION_MS / 1000
        )}-second mini-game together - one of six, and they all get harder as the round runs. None of them can be cleared by one person carrying the group.`}
        lines={2}
        width={840}
        marginBottom={SPACE.sm}
      />
      <Paragraph
        value="Nobody around? Tap Call to ping the World, or Practice to try one solo. Practice does not score."
        lines={1}
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
        // Seven rows at ~32 each, plus the title and a two-line paragraph. Was 300,
        // which was already a shade tight before the placement line was added.
        height: 352,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text value="Score together" fontSize={FONT.title} color={COLORS.text} width={840} />

      <ScoreLine label="Form a circle" value={`+${POINTS_BASE}`} />
      <ScoreLine label="Each player beyond two" value={`+${POINTS_PER_EXTRA_MEMBER}`} />
      <ScoreLine label="Matching mood combo" value={`+${POINTS_COMBO}`} />
      <ScoreLine label="Clear the mini-game" value={`+${POINTS_MINIGAME}`} />
      {/*
        The biggest single line on this table, and it was missing entirely - a new player
        had no way to know that winning the round is worth more than everything else put
        together. Quoted as a range because the prize scales with the circle: beating
        three people pays more than beating one.
      */}
      <ScoreLine
        label="Win the round"
        value={`+${winnerPrize(MIN_CIRCLE_PLAYERS)} to +${winnerPrize(MAX_CIRCLE_PLAYERS)}`}
      />
      <ScoreLine label="Holding the featured mood" value={`x${FEATURED_MULTIPLIER}`} />
      <ScoreLine
        label="Daily streak"
        value={`up to +${Math.round(STREAK_MAX_BONUS * 100)}%`}
      />

      <Paragraph
        value={`Last place still earns +${PLACEMENT_LAST}, and a tie splits the prize. Scores persist on a shared leaderboard, one mood is featured each day, and five wins with a mood unlocks its skin.`}
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
