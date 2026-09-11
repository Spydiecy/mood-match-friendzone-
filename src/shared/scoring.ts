/**
 * Mood Match - score maths.
 *
 * Shared so the client's predicted payout and the server's authoritative payout
 * are computed by the exact same function. The server is still the only writer
 * of any score, the client just previews.
 */

import {
  FEATURED_MULTIPLIER,
  MIN_CIRCLE_PLAYERS,
  POINTS_BASE,
  POINTS_COMBO,
  POINTS_MINIGAME,
  POINTS_PER_EXTRA_MEMBER,
  STREAK_MAX_BONUS,
  placementBonus,
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
  /** Bonus for each member beyond the second. */
  groupSize: number
  /** Bonus for finishing position inside the circle. */
  placement: number
  /** Zero-based finishing rank, so the UI can say "1st". */
  rank: number
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
  /**
   * How many players were in the circle.
   *
   * Bigger circles pay more, which is what gives the Trio and Squad pads a reason
   * to exist: they are harder to assemble, so they are worth more.
   */
  memberCount: number
  /**
   * Zero-based finishing position inside the circle, by mini-game performance.
   * 0 is the winner. Pass 0 when the round has no individual ranking.
   */
  finishRank: number
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
  const groupSize = groupSizeBonus(input.memberCount)
  // Placement only exists when there is somebody to beat.
  const placement = input.memberCount > 1 ? placementBonus(input.finishRank) : 0

  const featuredMultiplier =
    input.playerEmotion === input.featuredEmotion ? FEATURED_MULTIPLIER : 1
  const streakBonus = streakBonusFor(input.streakDays)

  const subtotal = (base + combo + miniGame + groupSize + placement) * featuredMultiplier
  const total = Math.round(subtotal * (1 + streakBonus))

  return {
    base,
    combo,
    miniGame,
    groupSize,
    placement,
    rank: input.finishRank,
    featuredMultiplier,
    streakBonus,
    total
  }
}

/**
 * Ranks circle members by mini-game performance, highest score first.
 *
 * Returns a zero-based rank per member, parallel to the input. EQUAL SCORES SHARE A
 * RANK - two players who both scored 12 are both "1st" and both get the winner's
 * bonus, rather than one being arbitrarily demoted by array order. That matters for
 * Sync Tap, where every member scores identically by design.
 */
export function rankMembers(scores: number[]): number[] {
  const sorted = scores.slice().sort((a, b) => b - a)
  return scores.map((score) => sorted.indexOf(score))
}

/** Bonus for each member beyond the minimum. Never negative. */
export function groupSizeBonus(memberCount: number): number {
  const extra = Math.max(0, Math.floor(memberCount) - MIN_CIRCLE_PLAYERS)
  return extra * POINTS_PER_EXTRA_MEMBER
}

/**
 * Best-case payout for a circle, used by the HUD to show players what is on the
 * table before they commit ("up to N points").
 */
export function maxPossibleScore(streakDays: number, memberCount = MIN_CIRCLE_PLAYERS): number {
  return Math.round(
    (POINTS_BASE +
      POINTS_COMBO +
      POINTS_MINIGAME +
      groupSizeBonus(memberCount) +
      (memberCount > 1 ? placementBonus(0) : 0)) *
      FEATURED_MULTIPLIER *
      (1 + streakBonusFor(streakDays))
  )
}
