/**
 * Mood Match - emotion definitions, combo rules and the daily rotation.
 *
 * Shared by the client (for prediction and display) and by the headless server
 * (which is authoritative). Both sides run the SAME functions so the number the
 * player is shown before a round matches the number the server pays out.
 *
 * NOTE ON ICONS: the design brief asked for emoji icons, but the Decentraland
 * Unity explorer ships no emoji glyphs, so an emoji in UI text renders as a
 * missing-glyph box (or nothing) on the mobile client. Every emotion therefore
 * carries an ASCII `glyph` plus a `shape` hint that the UI draws from plain
 * coloured blocks. Colour is the primary identity carrier.
 */

import { POINTS_COMBO } from './config'
import { ComboDefinition, ComboResult, EMOTION_COUNT, EmotionId } from './types'

/** Procedural icon shapes the UI can draw without any texture files. */
export type EmotionShape = 'wave' | 'smile' | 'ring' | 'bolt' | 'heart' | 'spiral'

/** Static description of one emotion. */
export interface EmotionDefinition {
  id: EmotionId
  /** Display name, ASCII only. */
  name: string
  /** One-line mood description used in the HUD and tutorial. */
  tagline: string
  /** Identity colour, linear 0..1 RGB. */
  color: { r: number; g: number; b: number }
  /** A darker shade for panel backgrounds. */
  shade: { r: number; g: number; b: number }
  /**
   * Short ASCII mark. Retained as a fallback for anywhere a texture cannot be
   * used (in-world TextShape, for instance), but the UI uses `icon` instead -
   * the ASCII marks read as punctuation rather than artwork.
   */
  glyph: string
  /** Path to the mood's icon PNG, white-on-transparent so it can be tinted. */
  icon: string
  /** Hint for the procedural UI icon. */
  shape: EmotionShape
}

/**
 * The six base emotions. Array index equals the EmotionId, so this can be
 * indexed directly by a synced Int field.
 */
export const EMOTIONS: ReadonlyArray<EmotionDefinition> = [
  {
    id: EmotionId.Calm,
    name: 'Calm',
    icon: 'images/icons/mood-calm.png',
    tagline: 'Slow breath, steady hands.',
    color: { r: 0.29, g: 0.62, b: 1.0 },
    shade: { r: 0.07, g: 0.16, b: 0.3 },
    glyph: '~',
    shape: 'wave'
  },
  {
    id: EmotionId.Joy,
    name: 'Joy',
    icon: 'images/icons/mood-joy.png',
    tagline: 'Loud, bright, contagious.',
    color: { r: 1.0, g: 0.83, b: 0.24 },
    shade: { r: 0.31, g: 0.24, b: 0.04 },
    glyph: ':)',
    shape: 'smile'
  },
  {
    id: EmotionId.Focus,
    name: 'Focus',
    icon: 'images/icons/mood-focus.png',
    tagline: 'One target, nothing else.',
    color: { r: 0.66, g: 0.42, b: 1.0 },
    shade: { r: 0.18, g: 0.1, b: 0.3 },
    glyph: '+',
    shape: 'ring'
  },
  {
    id: EmotionId.Energy,
    name: 'Energy',
    icon: 'images/icons/mood-energy.png',
    tagline: 'Go now, think later.',
    color: { r: 1.0, g: 0.35, b: 0.33 },
    shade: { r: 0.31, g: 0.08, b: 0.08 },
    glyph: '!',
    shape: 'bolt'
  },
  {
    id: EmotionId.Love,
    name: 'Love',
    icon: 'images/icons/mood-love.png',
    tagline: 'Warm, open, generous.',
    color: { r: 1.0, g: 0.45, b: 0.76 },
    shade: { r: 0.31, g: 0.1, b: 0.22 },
    glyph: '<3',
    shape: 'heart'
  },
  {
    id: EmotionId.Curiosity,
    name: 'Curiosity',
    icon: 'images/icons/mood-curiosity.png',
    tagline: 'What happens if we try?',
    color: { r: 0.35, g: 0.87, b: 0.55 },
    shade: { r: 0.07, g: 0.26, b: 0.14 },
    glyph: '?',
    shape: 'spiral'
  }
]

/**
 * Safe lookup for an emotion definition.
 * Falls back to Calm when given an out-of-range id (e.g. from stale sync data).
 */
export function getEmotion(id: number): EmotionDefinition {
  return EMOTIONS[id] ?? EMOTIONS[EmotionId.Calm]
}

/** Picks a uniformly random emotion. Used on spawn and on reroll. */
export function randomEmotion(): EmotionId {
  return Math.floor(Math.random() * EMOTION_COUNT) as EmotionId
}

/** True when the bit for `emotion` is set in an unlock bitmask. */
export function isSkinUnlocked(mask: number, emotion: EmotionId): boolean {
  return (mask & (1 << emotion)) !== 0
}

/** Returns `mask` with the bit for `emotion` set. */
export function withSkinUnlocked(mask: number, emotion: EmotionId): number {
  return mask | (1 << emotion)
}

/** Counts how many skins a bitmask has unlocked. */
export function countUnlockedSkins(mask: number): number {
  let n = 0
  for (let i = 0; i < EMOTION_COUNT; i++) {
    if (mask & (1 << i)) n++
  }
  return n
}

/* -------------------------------------------------------------------------- */
/* Combos                                                                     */
/* -------------------------------------------------------------------------- */

/** True when every listed emotion appears at least once. */
function containsAll(emotions: EmotionId[], required: EmotionId[]): boolean {
  return required.every((r) => emotions.indexOf(r) !== -1)
}

/** Number of distinct emotions in the group. */
function distinctCount(emotions: EmotionId[]): number {
  let mask = 0
  for (const e of emotions) mask |= 1 << e
  return countUnlockedSkins(mask)
}

/** Pairs that read as "complementary" for a two-player circle. */
const COMPLEMENT_PAIRS: ReadonlyArray<[EmotionId, EmotionId]> = [
  [EmotionId.Calm, EmotionId.Energy],
  [EmotionId.Joy, EmotionId.Focus],
  [EmotionId.Love, EmotionId.Curiosity]
]

/**
 * Recognised combinations, highest priority first. The first match wins.
 * Every combo awards the same bonus (POINTS_COMBO) - the variety is flavour,
 * so that no combination feels like the "wrong" one to chase.
 */
export const COMBOS: ReadonlyArray<ComboDefinition> = [
  {
    id: 'spectrum',
    name: 'Full Spectrum',
    blurb: 'Four different moods, zero overlap.',
    matches: (e) => e.length >= 4 && distinctCount(e) === e.length
  },
  {
    id: 'harmony',
    name: 'Harmony Bonus',
    blurb: 'Calm, Joy and Focus in one ring.',
    matches: (e) => containsAll(e, [EmotionId.Calm, EmotionId.Joy, EmotionId.Focus])
  },
  {
    id: 'spark',
    name: 'Spark Circuit',
    blurb: 'Energy and Curiosity feeding Joy.',
    matches: (e) => containsAll(e, [EmotionId.Energy, EmotionId.Curiosity, EmotionId.Joy])
  },
  {
    id: 'devotion',
    name: 'Devotion Knot',
    blurb: 'Love held steady by Calm and Focus.',
    matches: (e) => containsAll(e, [EmotionId.Love, EmotionId.Calm, EmotionId.Focus])
  },
  {
    id: 'triad',
    name: 'Open Triad',
    blurb: 'Three different moods, well balanced.',
    matches: (e) => e.length >= 3 && distinctCount(e) >= 3
  },
  {
    id: 'duet',
    name: 'Balanced Duet',
    blurb: 'Two moods that pull against each other.',
    matches: (e) =>
      e.length === 2 &&
      COMPLEMENT_PAIRS.some(
        ([a, b]) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)
      )
  },
  {
    id: 'twinflame',
    name: 'Twin Flame',
    blurb: 'Same mood, doubled.',
    matches: (e) => e.length >= 2 && distinctCount(e) === 1
  }
]

/** No combo matched. */
const NO_COMBO: ComboResult = {
  id: '',
  name: 'Mixed Feelings',
  blurb: 'No bonus pattern, but the circle still counts.',
  bonus: 0
}

/**
 * Evaluates a circle's emotions and returns the winning combo (or NO_COMBO).
 * Deterministic: the client uses it to preview the bonus, the server to pay it.
 */
export function evaluateCombo(emotions: EmotionId[]): ComboResult {
  if (emotions.length < 2) return NO_COMBO
  for (const combo of COMBOS) {
    if (combo.matches(emotions)) {
      return { id: combo.id, name: combo.name, blurb: combo.blurb, bonus: POINTS_COMBO }
    }
  }
  return NO_COMBO
}

/* -------------------------------------------------------------------------- */
/* Daily rotation                                                             */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000

/** UTC days since the epoch. The unit the daily rotation and streaks run on. */
export function dayIndexUtc(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / MS_PER_DAY)
}

/**
 * The featured emotion for a given day. Deterministic, so the client can render
 * it before the server's first sync lands, and every client agrees.
 *
 * `* 7` steps through all six emotions without repeating (gcd(7, 6) === 1).
 */
export function featuredEmotionForDay(dayIndex: number): EmotionId {
  const n = ((dayIndex * 7 + 3) % EMOTION_COUNT + EMOTION_COUNT) % EMOTION_COUNT
  return n as EmotionId
}

/** Milliseconds until the featured emotion rotates again. */
export function msUntilRotation(nowMs: number = Date.now()): number {
  return MS_PER_DAY - (nowMs % MS_PER_DAY)
}
