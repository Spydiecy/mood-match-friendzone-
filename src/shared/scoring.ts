/**
 * Mood Match - score maths.
 *
 * Shared so the client's predicted payout and the server's authoritative payout
 * are computed by the exact same function. The server is still the only writer
 * of any score, the client just previews.
 */

import {
  FEATURED_MULTIPLIER,
  POINTS_BASE,
  POINTS_COMBO,
  POINTS_MINIGAME,
  STREAK_MAX_BONUS,
  STREAK_STEP
} from './config'
import { EmotionId } from './types'

/** Itemised score breakdown, shown in the result panel and paid by the server. */
export interface ScoreBreakdown {
  /** Flat points for forming the circle. */
  base: number
  /** Emotion-combination bonus. */
  combo: number
  /** Mini-game success bonus. */
  miniGame: number
  /** 1, or FEATURED_MULTIPLIER when the player holds the featured emotion. */
  featuredMultiplier: number
  /** Fractional streak bonus, e.g. 0.15 means +15%. */
  streakBonus: number
  /** Final points awarded, rounded to an integer. */
  total: number
}

/** Inputs needed to price one circle for one player. */
export interface ScoreInput {
  /** True when the group's emotions matched a named combo. */
  comboMatched: boolean
  /** True when the group cleared the mini-game. */
  miniGameSuccess: boolean
  /** The emotion this player carried into the circle. */
  playerEmotion: EmotionId
  /** Today's featured emotion. */
  featuredEmotion: EmotionId
  /** Consecutive days played, 1 for a first day. */
  streakDays: number
}

/**
 * Converts a streak length into a fractional bonus.
 * Day 1 gives nothing; each extra consecutive day adds STREAK_STEP, capped at
 * STREAK_MAX_BONUS so long-running players cannot run away with the board.
 */
export function streakBonusFor(streakDays: number): number {
  const extraDays = Math.max(0, Math.floor(streakDays) - 1)
  return Math.min(STREAK_MAX_BONUS, extraDays * STREAK_STEP)
}

/**
 * Prices a single circle for a single player.
 *
 * Order of operations, which the result panel mirrors line by line:
 *   1. add base + combo + mini-game points
 *   2. multiply by the featured-emotion multiplier
 *   3. add the streak percentage
 */
export function computeScore(input: ScoreInput): ScoreBreakdown {
  const base = POINTS_BASE
  const combo = input.comboMatched ? POINTS_COMBO : 0
  const miniGame = input.miniGameSuccess ? POINTS_MINIGAME : 0

  const featuredMultiplier =
    input.playerEmotion === input.featuredEmotion ? FEATURED_MULTIPLIER : 1
  const streakBonus = streakBonusFor(input.streakDays)

  const subtotal = (base + combo + miniGame) * featuredMultiplier
  const total = Math.round(subtotal * (1 + streakBonus))

  return { base, combo, miniGame, featuredMultiplier, streakBonus, total }
}

/**
 * Best-case payout for a circle, used by the HUD to show players what is on the
 * table before they commit ("up to N points").
 */
export function maxPossibleScore(streakDays: number): number {
  return Math.round(
    (POINTS_BASE + POINTS_COMBO + POINTS_MINIGAME) *
      FEATURED_MULTIPLIER *
      (1 + streakBonusFor(streakDays))
  )
}
