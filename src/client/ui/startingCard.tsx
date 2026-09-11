/**
 * Mood Match - the "round is starting" card, and the mood-combo preview.
 *
 * Two jobs, both about making the moment before a round feel like something:
 *
 *  1. A big, unmissable countdown when a circle locks in - who is in it, what you
 *     are about to play, and 3-2-1-GO. Previously the countdown was a small number
 *     inside the mini-game panel and the transition read as nothing happening.
 *
 *  2. A LIVE COMBO PREVIEW while a ring is filling. This is what makes moods mean
 *     something: standing on a pad now shows "Calm + Joy -> Harmony Bonus +20"
 *     before the round starts, so the player can see that WHO they stand with
 *     changes their score, and can go and grab a different mood if they want a
 *     better one. Without it, moods were an invisible stat.
 */

import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { COUNTDOWN_MS } from '../../shared/config'
import { evaluateCombo, getEmotion } from '../../shared/emotions'
import { EmotionId } from '../../shared/types'
import { PAD_NAMES, padFillFor } from '../circle'
import { miniGameBrief, miniGameName } from '../miniGames'
import { state } from '../state'
import { COLORS, FONT, RADIUS, SPACE, emotionColor } from './theme'
import { EmotionBadge, Panel, ProgressBar, Row, Text } from './widgets'

/**
 * The full-width countdown card shown while a circle is in its Countdown phase.
 *
 * Deliberately loud: a coloured border, every member's mood, the game name, the
 * combo they landed, and a single huge number.
 */
export function StartingCard() {
  const pad = state.myPad
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const now = Date.now()
  const msLeft = Math.max(0, pad.startsAt - now)
  const seconds = Math.ceil(msLeft / 1000)
  const go = msLeft <= 250

  const combo = evaluateCombo(pad.memberEmotions)
  const accent = go ? COLORS.good : emotionColor(state.emotion)

  return (
    <Panel width={720} padding={SPACE.md} borderWidth={4} borderColor={accent} textured>
      <Text
        value={go ? 'GO' : 'GET READY'}
        fontSize={FONT.title}
        color={accent}
        width={640}
      />

      {/* Everyone in the circle, so the group is visible before play starts. */}
      <Row width="100%" justifyContent="center" marginTop={SPACE.xs}>
        {pad.members.map((address, index) => (
          <UiEntity
            key={`start-${address}`}
            uiTransform={{
              width: 104,
              height: 78,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.chip,
              margin: { left: SPACE.xs, right: SPACE.xs }
            }}
            uiBackground={{ color: COLORS.chip }}
          >
            <EmotionBadge emotion={pad.memberEmotions[index] ?? 0} size={40} />
            <Text
              value={index === pad.myIndex ? 'You' : trimName(pad.memberNames[index] ?? '')}
              fontSize={FONT.tiny}
              color={COLORS.textDim}
            />
          </UiEntity>
        ))}
      </Row>

      {/* The huge number. */}
      <Text
        value={go ? '!' : String(seconds)}
        fontSize={FONT.hero}
        color={accent}
        width={200}
      />

      <Text
        value={`${miniGameName(pad.game)}  -  ${PAD_NAMES[pad.padIndex]}`}
        fontSize={FONT.heading}
        color={COLORS.text}
        width={640}
      />

      <Text
        value={
          combo.bonus > 0
            ? `${combo.name}  +${combo.bonus}`
            : 'No combo bonus this time'
        }
        fontSize={FONT.small}
        color={combo.bonus > 0 ? COLORS.good : COLORS.textDim}
        width={640}
      />

      <Text
        value={miniGameBrief(pad.game)}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={660}
        wrap
        lines={2}
      />

      <UiEntity uiTransform={{ width: 470, height: 10, margin: { top: SPACE.xs } }}>
        {/* Fills as the countdown runs down. */}
        <ProgressBar
          value={1 - msLeft / COUNTDOWN_MS}
          fill={accent}
          height={10}
        />
      </UiEntity>
    </Panel>
  )
}

/**
 * A compact preview of the combo the current ring would score, shown while the
 * player is standing on a filling pad.
 *
 * The whole point of moods lives here. It answers "why does my colour matter"
 * without a tutorial, at the exact moment the answer is actionable.
 */
export function ComboPreview() {
  if (state.myPad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />
  if (state.nearestPad < 0) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const pad = state.pads[state.nearestPad]
  if (!pad) return <UiEntity uiTransform={{ width: 1, height: 1 }} />

  const fill = padFillFor(state.nearestPad)
  const moods = pad.memberEmotions.slice()

  // Nobody else here yet: explain what the player's own mood is worth instead.
  if (moods.length <= 1) {
    const mine = getEmotion(state.emotion)
    const featured = state.emotion === state.featuredEmotion
    return (
      <Panel width={560} padding={SPACE.sm}>
        <Text
          value={
            featured
              ? `${mine.name} is featured today - you score double`
              : `You are ${mine.name}`
          }
          fontSize={FONT.small}
          color={featured ? COLORS.good : COLORS.text}
          width={520}
        />
        <Text
          value={`Waiting for ${Math.max(0, fill.required - fill.here)} more - different moods together score bonuses`}
          fontSize={FONT.tiny}
          color={COLORS.textDim}
          width={520}
        />
      </Panel>
    )
  }

  const combo = evaluateCombo(moods)

  return (
    <Panel
      width={620}
      padding={SPACE.sm}
      borderWidth={2}
      borderColor={combo.bonus > 0 ? COLORS.good : COLORS.chip}
    >
      <Row width="100%" justifyContent="center">
        {moods.map((emotion, index) => (
          <UiEntity
            key={`preview-${index}`}
            uiTransform={{
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              margin: { left: 3, right: 3 }
            }}
          >
            <EmotionBadge emotion={emotion as EmotionId} size={38} />
          </UiEntity>
        ))}
      </Row>
      <Text
        value={
          combo.bonus > 0
            ? `${combo.name}  +${combo.bonus} bonus`
            : 'No bonus pattern yet'
        }
        fontSize={FONT.small}
        color={combo.bonus > 0 ? COLORS.good : COLORS.textDim}
        width={580}
      />
      <Text
        value={combo.bonus > 0 ? combo.blurb : 'Try a different mood mix for a bonus'}
        fontSize={FONT.tiny}
        color={COLORS.textDim}
        width={580}
      />
    </Panel>
  )
}

/** Keeps a display name inside its chip. */
function trimName(name: string): string {
  if (!name) return 'player'
  if (name.length <= 8) return name
  return name.slice(0, 7) + '.'
}
