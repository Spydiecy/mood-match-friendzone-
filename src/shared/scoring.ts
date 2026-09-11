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
  /**
   * How many members share `finishRank`, including this one. 1 for a clear position.
   *
   * Tied players split their combined slices, so a dead heat pays the average rather
   * than paying everyone involved a winner's share. Defaults to 1 so a caller that
   * genuinely has no ranking information still gets a sane number.
   */
  tiedAtRank?: number
  /**
   * The highest mini-game score anyone in the circle achieved.
   *
   * Gates the placement bonus. `rankMembers` maps equal scores to the same rank, so a
   * round where NOBODY scored ranked everyone 0 and paid every member the winner's
   * bonus - while the result card, which gates its winner line on a top score above
   * zero, showed no winner at all. The two panels described the same round
   * differently. Placement now requires somebody to have actually done something.
   */
  topScore: number
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
  // Placement needs somebody to beat AND somebody to have scored.
  const ranked = input.memberCount > 1 && input.topScore > 0
  const placement = ranked
    ? placementBonus(input.finishRank, input.memberCount, input.tiedAtRank ?? 1)
    : 0

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
 * Ranks circle members, best first, and reports how many share each rank.
 *
 * Returns a zero-based rank per member, parallel to the input. EQUAL RESULTS SHARE A
 * RANK - two players who both scored 12 are both "1st" rather than one being
 * arbitrarily demoted by array order. `tied` says how many members hold each rank, so
 * the caller can split the prize between them instead of paying each of them a
 * winner's share.
 *
 * `finishedAt` is the optional first-past-the-post tiebreak: the clock time at which
 * each member completed the round's individual objective, or 0 for one who never did.
 *
 * IT OUTRANKS THE SCORE, and that ordering is the point. Tap Race counts RAW taps for
 * its objective but ranks on the PERK-WEIGHTED score, so an Energy player on 24 taps
 * could score 36 and finish above the Calm player who actually crossed 30 taps first
 * and won the race for everybody. Worse, two players frequently landed on the same
 * weighted score, which read as a dead heat in a game that had a clear winner. Whoever
 * got there first now takes first, and the weighted score only orders the players who
 * did not finish.
 */
export function rankMembers(
  scores: number[],
  finishedAt?: number[]
): { ranks: number[]; tied: number[] } {
  const order = scores.map((_unused, index) => index)

  order.sort((a, b) => compareMembers(scores, finishedAt, a, b))

  const ranks = new Array<number>(scores.length).fill(0)
  const counts = new Array<number>(scores.length).fill(0)

  let rank = 0
  for (let position = 0; position < order.length; position++) {
    // Only demote when this member is genuinely behind the previous one. Equal results
    // keep the rank they were first assigned.
    if (
      position > 0 &&
      compareMembers(scores, finishedAt, order[position - 1], order[position]) !== 0
    ) {
      rank = position
    }
    ranks[order[position]] = rank
    counts[rank]++
  }

  const tied = ranks.map((r) => counts[r])
  return { ranks, tied }
}

/** Orders two members. Negative means `a` finished ahead of `b`. */
function compareMembers(
  scores: number[],
  finishedAt: number[] | undefined,
  a: number,
  b: number
): number {
  const finishA = finishedAt?.[a] ?? 0
  const finishB = finishedAt?.[b] ?? 0

  // Completing the objective beats any score. Then, among those who completed it,
  // earlier beats later - and an identical stamp is a genuine dead heat.
  //
  // Returning 0 for equal stamps matters more than it looks. Falling through to the
  // score would decide a photo finish on exactly the key this tiebreak exists to
  // override: two racers who each land their final tap in the same millisecond sit on
  // the same RAW count, but their perk-weighted scores differ by mood, so an Energy
  // player would take the win over a Calm player who tapped just as fast. Identical
  // stamps are common rather than exotic - `Date.now()` is read per message and a batch
  // of messages handled in one turn shares a millisecond.
  if (finishA > 0 || finishB > 0) {
    if (finishA > 0 && finishB === 0) return -1
    if (finishB > 0 && finishA === 0) return 1
    return finishA - finishB
  }

  return (scores[b] ?? 0) - (scores[a] ?? 0)
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
      // Winning outright, so no tie to split.
      (memberCount > 1 ? placementBonus(0, memberCount, 1) : 0)) *
      FEATURED_MULTIPLIER *
      (1 + streakBonusFor(streakDays))
  )
}
