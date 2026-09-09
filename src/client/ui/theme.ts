/**
 * Mood Match - UI design tokens.
 *
 * Sizes are expressed against the 1920x1080 virtual canvas passed to
 * `setUiRenderer`. On mobile the SDK swaps in a 1600x720 virtual canvas (it
 * overrides any 16:9 size on phones), so these values render proportionally
 * LARGER on a phone than on desktop - which is what we want.
 *
 * Two hard rules enforced throughout the UI layer:
 *
 *  1. NO EMOJI, and no decorative Unicode, in any text value. The Unity explorer
 *     ships no emoji glyphs, so an emoji renders as a missing-glyph box there
 *     while looking fine elsewhere. Emotion identity is carried by COLOUR plus a
 *     plain-ASCII glyph.
 *  2. Every Label gets an explicit width AND height. Bevy measures intrinsic text
 *     size, Unity gives an unset dimension ~0 while still drawing the glyphs, so
 *     unsized labels overlap and their parents collapse on the Unity client.
 */

import { Color4 } from '@dcl/sdk/math'
import { getEmotion } from '../../shared/emotions'
import { EmotionId } from '../../shared/types'

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

export const COLORS = {
  /** Panel background, near-black with a blue cast. */
  panel: Color4.create(0.05, 0.06, 0.11, 0.92),
  /** Slightly lighter inner surface. */
  surface: Color4.create(0.1, 0.11, 0.18, 0.95),
  /** Raised chip / row background. */
  chip: Color4.create(0.16, 0.17, 0.26, 0.95),
  /** Full-screen scrim behind modals. */
  scrim: Color4.create(0.02, 0.02, 0.05, 0.82),
  /** Primary text. */
  text: Color4.create(1, 1, 1, 1),
  /** Secondary text - still WCAG-comfortable on the panel colour. */
  textDim: Color4.create(0.76, 0.79, 0.88, 1),
  /** Success / confirmation. */
  good: Color4.create(0.36, 0.87, 0.56, 1),
  /** Warning / refusal. */
  warn: Color4.create(1, 0.72, 0.28, 1),
  /** Failure. */
  bad: Color4.create(1, 0.42, 0.42, 1),
  /** Accent used for the primary action. */
  accent: Color4.create(0.44, 0.55, 1, 1),
  /** Transparent, for spacers. */
  none: Color4.create(0, 0, 0, 0)
}

/* -------------------------------------------------------------------------- */
/* Type scale                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Font sizes in virtual pixels. The smallest value used anywhere is `small` at
 * 26, which stays comfortably above the 18px readability floor once the mobile
 * virtual canvas scaling is applied.
 */
export const FONT = {
  hero: 76,
  title: 54,
  heading: 42,
  body: 34,
  small: 26,
  /** Only for the numeric score readout, which benefits from being oversized. */
  numeric: 64
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export const SPACE = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 48
}

export const RADIUS = {
  chip: 14,
  panel: 26,
  pill: 999
}

/**
 * Touch target sizes.
 *
 * The brief asks for a minimum of 80x80. These are well above that on purpose:
 * the primary action is a wide bottom-centre bar, and secondary controls are
 * generous squares, so a thumb never has to be precise.
 */
export const TOUCH = {
  /** Primary action bar. */
  primaryWidth: 460,
  primaryHeight: 132,
  /** Secondary icon button. */
  secondary: 116,
  /** Mini-game tap targets. */
  gameButton: 200,
  /** Minimum any interactive element is allowed to be. */
  min: 96
}

/* -------------------------------------------------------------------------- */
/* Emotion colours                                                            */
/* -------------------------------------------------------------------------- */

/** Full-strength identity colour for an emotion. */
export function emotionColor(id: EmotionId | number, alpha = 1): Color4 {
  const { color } = getEmotion(id)
  return Color4.create(color.r, color.g, color.b, alpha)
}

/** Dark companion shade, for panel fills behind the identity colour. */
export function emotionShade(id: EmotionId | number, alpha = 1): Color4 {
  const { shade } = getEmotion(id)
  return Color4.create(shade.r, shade.g, shade.b, alpha)
}

/**
 * Picks black or white text for legibility on a given emotion colour.
 * Uses the standard luminance weighting rather than a naive average.
 */
export function textOn(id: EmotionId | number): Color4 {
  const { color } = getEmotion(id)
  const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
  return luminance > 0.6 ? Color4.create(0.05, 0.05, 0.08, 1) : COLORS.text
}

/** Tone colour for a toast (`NoticeTone`). */
export function toneColor(tone: number): Color4 {
  if (tone === 1) return COLORS.good
  if (tone === 2) return COLORS.warn
  return COLORS.accent
}
