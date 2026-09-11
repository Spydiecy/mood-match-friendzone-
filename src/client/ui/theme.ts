/**
 * Mood Match - UI design tokens.
 *
 * REFERENCE CANVAS IS 1600x720 on every platform (see `root.tsx` for why). Every
 * number in this file is in that space, so the vertical budget is 720 - which is
 * tight, and is the constraint that shapes the whole layout:
 *
 *   top strip      ~96
 *   centre stage   ~380 max
 *   action row     ~200
 *
 * Anything that busts that budget pushes content off a phone screen. The earlier
 * version of this file was authored against 1080 of height and every panel came
 * out 1.5x too tall on mobile, which buried the world and put the Info panel's
 * close button below the bottom edge.
 *
 * Two hard rules enforced throughout the UI layer:
 *
 *  1. NO EMOJI, and no decorative Unicode, in any text value. The Unity explorer
 *     ships no emoji glyphs, so an emoji renders as a missing-glyph box there
 *     while looking fine elsewhere. Pictorial affordances come from the generated
 *     PNGs in `images/icons/` instead (see `ICON`).
 *  2. Every Label gets an explicit width AND height, and the height must fit the
 *     number of lines the text will actually wrap to. Bevy measures intrinsic text
 *     size, Unity gives an unset dimension ~0 while still drawing the glyphs, so
 *     unsized labels overlap and their parents collapse on the Unity client - and
 *     an under-sized box clips.
 */

import { Color4 } from '@dcl/sdk/math'
import { getEmotion } from '../../shared/emotions'
import { EmotionId } from '../../shared/types'

/* -------------------------------------------------------------------------- */
/* Canvas budget                                                              */
/* -------------------------------------------------------------------------- */

/** The reference canvas, matching `setUiRenderer`. */
export const CANVAS = { width: 1600, height: 720 }

/**
 * Vertical budget per region. The HUD is built to leave the middle of the screen
 * as clear as possible, because the players are the interesting thing to look at.
 */
export const BUDGET = {
  topStrip: 92,
  centreMax: 372,
  actionRow: 196
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

export const COLORS = {
  /** Panel background. Fairly opaque so text stays legible over bright terrain. */
  panel: Color4.create(0.05, 0.06, 0.11, 0.94),
  /** Slightly lighter inner surface. */
  surface: Color4.create(0.1, 0.11, 0.18, 0.96),
  /** Raised chip / row background. */
  chip: Color4.create(0.16, 0.17, 0.26, 0.96),
  /** Full-screen scrim behind modals. */
  scrim: Color4.create(0.02, 0.02, 0.05, 0.88),
  /** Primary text. */
  text: Color4.create(1, 1, 1, 1),
  /** Secondary text. */
  textDim: Color4.create(0.78, 0.81, 0.9, 1),
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
 * Font sizes against the 1600x720 canvas.
 *
 * `small` at 20 is the floor. On a 1600-wide virtual canvas mapped to a typical
 * phone viewport that lands comfortably above the readability threshold, and it
 * leaves room for the compact layout the vertical budget demands.
 */
export const FONT = {
  hero: 54,
  title: 38,
  heading: 30,
  body: 24,
  small: 20,
  tiny: 17
}

/**
 * Line height multiplier used to size text boxes.
 * Slightly generous so a descender is never clipped.
 */
export const LINE = 1.5

/** Height of a text box for a given font size and line count. */
export function textHeight(fontSize: number, lines = 1): number {
  return Math.ceil(fontSize * LINE * lines)
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 22,
  xl: 32
}

export const RADIUS = {
  chip: 10,
  panel: 18,
  pill: 999
}

/**
 * Touch target sizes.
 *
 * The brief asks for a minimum of 80x80. On a 1600x720 canvas these all clear
 * that: the primary bar is 400x86 and secondary buttons are 96x96, which on a
 * phone viewport is a comfortable thumb target with room to spare.
 */
export const TOUCH = {
  primaryWidth: 400,
  primaryHeight: 86,
  /** Secondary icon button (square). */
  secondary: 96,
  /** Icon glyph size inside a secondary button. */
  icon: 40,
  /** Mini-game tap targets. */
  gameButton: 116,
  /** Close button on a modal. */
  close: 72,
  /** Minimum any interactive element is allowed to be. */
  min: 80
}

/** Paths to the generated icon PNGs. Relative to the scene root. */
export const ICON = {
  board: 'images/icons/board.png',
  call: 'images/icons/call.png',
  practice: 'images/icons/practice.png',
  info: 'images/icons/info.png',
  close: 'images/icons/close.png',
  soundOn: 'images/icons/sound-on.png',
  soundOff: 'images/icons/sound-off.png',
  reroll: 'images/icons/reroll.png',
  invite: 'images/icons/invite.png',
  play: 'images/icons/play.png',
  check: 'images/icons/check.png',

  /*
   * One glyph per mini-game.
   *
   * Each is a literal picture of the verb - a beat grid, a pressed pad, a colour
   * sequence, two arrows meeting, a stopwatch, a lightning bolt - so a player can tell
   * which game a practice card or a countdown is offering at a glance, in a language
   * they do not have to read. `gameIcon()` in `miniGames/index.tsx` maps the enum onto
   * these; nothing outside that helper should index this by hand.
   */
  gameRhythm: 'images/icons/game-rhythm.png',
  gameHold: 'images/icons/game-hold.png',
  gameColor: 'images/icons/game-color.png',
  gameSync: 'images/icons/game-sync.png',
  gameRace: 'images/icons/game-race.png',
  gameReaction: 'images/icons/game-reaction.png'
} as const

/** Subtle background texture used behind mini-game panels. */
export const PANEL_TEXTURE = 'images/panel-grid.png'

/** Soft radial glow, tinted at the call site. Used behind the beat ring. */
export const GLOW = 'images/glow.png'

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
