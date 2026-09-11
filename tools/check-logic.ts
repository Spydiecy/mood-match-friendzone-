/**
 * Mood Match - logic checks for the shared game rules.
 *
 * The combo table and the score maths are the two places where a silent mistake
 * would be invisible in-world but would quietly pay players the wrong amount, so
 * they get checked directly. These modules are deliberately free of engine
 * imports, which is what makes them runnable outside the scene sandbox.
 *
 * Run with:  npm run check
 */

import {
  COMBOS,
  countUnlockedSkins,
  dayIndexUtc,
  evaluateCombo,
  featuredEmotionForDay,
  isSkinUnlocked,
  withSkinUnlocked
} from '../src/shared/emotions'
import {
  computeScore,
  groupSizeBonus,
  maxPossibleScore,
  streakBonusFor
} from '../src/shared/scoring'
import { EMOTION_COUNT, EmotionId } from '../src/shared/types'
import {
  FEATURED_MULTIPLIER,
  MAX_CIRCLE_PLAYERS,
  MIN_CIRCLE_PLAYERS,
  PAD_TIERS,
  POINTS_BASE,
  POINTS_COMBO,
  POINTS_MINIGAME,
  POINTS_PER_EXTRA_MEMBER,
  STREAK_MAX_BONUS,
  requiredForPad
} from '../src/shared/config'

let failures = 0
let checks = 0

function check(label: string, actual: unknown, expected: unknown): void {
  checks++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.log(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`)
  }
}

function checkTrue(label: string, value: boolean): void {
  check(label, value, true)
}

/* -------------------------------------------------------------------------- */
/* Combos                                                                    */
/* -------------------------------------------------------------------------- */

const { Calm, Joy, Focus, Energy, Love, Curiosity } = EmotionId

// A solo player can never earn a combo - circles are the unit of play.
check('solo has no combo', evaluateCombo([Calm]).id, '')
check('empty has no combo', evaluateCombo([]).id, '')

// The named combos from the design brief.
check('harmony', evaluateCombo([Calm, Joy, Focus]).id, 'harmony')
check('spark', evaluateCombo([Energy, Curiosity, Joy]).id, 'spark')
check('devotion', evaluateCombo([Love, Calm, Focus]).id, 'devotion')

// Four distinct emotions is the top pattern and must beat the three-way combos
// even though those also match.
check('spectrum beats harmony', evaluateCombo([Calm, Joy, Focus, Love]).id, 'spectrum')

// Two-player patterns.
check('duet: calm + energy', evaluateCombo([Calm, Energy]).id, 'duet')
check('duet is order independent', evaluateCombo([Energy, Calm]).id, 'duet')
check('twin flame', evaluateCombo([Joy, Joy]).id, 'twinflame')
check('twin flame with three', evaluateCombo([Joy, Joy, Joy]).id, 'twinflame')

// A non-complementary pair still forms a circle, just without a bonus.
check('plain pair has no combo', evaluateCombo([Calm, Focus]).id, '')
check('plain pair pays no bonus', evaluateCombo([Calm, Focus]).bonus, 0)

// Three distinct emotions that match no named pattern fall back to Open Triad.
check('open triad', evaluateCombo([Calm, Energy, Love]).id, 'triad')

// Every matched combo pays the same bonus, so no combination is a trap.
for (const combo of COMBOS) {
  const sample = sampleFor(combo.id)
  if (!sample) continue
  check(`${combo.id} pays POINTS_COMBO`, evaluateCombo(sample).bonus, POINTS_COMBO)
}

function sampleFor(id: string): EmotionId[] | null {
  switch (id) {
    case 'spectrum':
      return [Calm, Joy, Focus, Love]
    case 'harmony':
      return [Calm, Joy, Focus]
    case 'spark':
      return [Energy, Curiosity, Joy]
    case 'devotion':
      return [Love, Calm, Focus]
    case 'triad':
      return [Calm, Energy, Love]
    case 'duet':
      return [Calm, Energy]
    case 'twinflame':
      return [Joy, Joy]
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/* Daily rotation                                                            */
/* -------------------------------------------------------------------------- */

// The rotation must visit every emotion across any six consecutive days,
// otherwise some emotions would never get their featured day.
const day = dayIndexUtc()
const seen = new Set<number>()
for (let offset = 0; offset < EMOTION_COUNT; offset++) {
  seen.add(featuredEmotionForDay(day + offset))
}
check('rotation covers all emotions in 6 days', seen.size, EMOTION_COUNT)

// Deterministic: the same day must always give the same answer, on every client.
check('rotation is deterministic', featuredEmotionForDay(1000), featuredEmotionForDay(1000))

// Must stay in range even for a negative day index (clock set before 1970).
checkTrue(
  'rotation stays in range for negative days',
  featuredEmotionForDay(-7) >= 0 && featuredEmotionForDay(-7) < EMOTION_COUNT
)

/* -------------------------------------------------------------------------- */
/* Skin unlock bitmask                                                       */
/* -------------------------------------------------------------------------- */

check('no skins by default', countUnlockedSkins(0), 0)
check('unlock sets the bit', isSkinUnlocked(withSkinUnlocked(0, Focus), Focus), true)
check('unlock is targeted', isSkinUnlocked(withSkinUnlocked(0, Focus), Joy), false)
check('unlock is idempotent', withSkinUnlocked(withSkinUnlocked(0, Joy), Joy), withSkinUnlocked(0, Joy))

let allSkins = 0
for (let i = 0; i < EMOTION_COUNT; i++) allSkins = withSkinUnlocked(allSkins, i as EmotionId)
check('all skins counts 6', countUnlockedSkins(allSkins), EMOTION_COUNT)

/* -------------------------------------------------------------------------- */
/* Streak bonus                                                              */
/* -------------------------------------------------------------------------- */

check('day 1 has no streak bonus', streakBonusFor(1), 0)
check('day 0 is treated as day 1', streakBonusFor(0), 0)
check('day 2 gives 5%', round(streakBonusFor(2)), 0.05)
check('day 11 hits the cap', streakBonusFor(11), STREAK_MAX_BONUS)
check('streak is capped', streakBonusFor(500), STREAK_MAX_BONUS)

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/* -------------------------------------------------------------------------- */
/* Score maths                                                               */
/* -------------------------------------------------------------------------- */

// Worst case: a circle formed, nothing else.
check(
  'base only',
  computeScore({
    comboMatched: false,
    miniGameSuccess: false,
    playerEmotion: Calm,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 2
  }).total,
  POINTS_BASE
)

// Combo plus mini-game, no multipliers.
check(
  'combo + minigame',
  computeScore({
    comboMatched: true,
    miniGameSuccess: true,
    playerEmotion: Calm,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 2
  }).total,
  POINTS_BASE + POINTS_COMBO + POINTS_MINIGAME
)

// The featured multiplier applies BEFORE the streak percentage.
check(
  'featured doubles the subtotal',
  computeScore({
    comboMatched: true,
    miniGameSuccess: true,
    playerEmotion: Joy,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 2
  }).total,
  (POINTS_BASE + POINTS_COMBO + POINTS_MINIGAME) * FEATURED_MULTIPLIER
)

// Duo ceiling: (10 + 20 + 30 + 0) * 2 * 1.5 = 180.
const duoCeiling = computeScore({
  comboMatched: true,
  miniGameSuccess: true,
  playerEmotion: Joy,
  featuredEmotion: Joy,
  streakDays: 11,
  memberCount: 2
})
check('duo ceiling', duoCeiling.total, 180)
check('maxPossibleScore agrees (duo)', maxPossibleScore(11, 2), duoCeiling.total)

// Squad ceiling: (10 + 20 + 30 + 10) * 2 * 1.5 = 210.
const squadCeiling = computeScore({
  comboMatched: true,
  miniGameSuccess: true,
  playerEmotion: Joy,
  featuredEmotion: Joy,
  streakDays: 11,
  memberCount: 4
})
check('squad ceiling', squadCeiling.total, 210)
check('maxPossibleScore agrees (squad)', maxPossibleScore(11, 4), squadCeiling.total)
checkTrue('a bigger circle always pays more', squadCeiling.total > duoCeiling.total)

/* -------------------------------------------------------------------------- */
/* Group size bonus                                                          */
/* -------------------------------------------------------------------------- */

check('duo gets no size bonus', groupSizeBonus(2), 0)
check('trio size bonus', groupSizeBonus(3), POINTS_PER_EXTRA_MEMBER)
check('squad size bonus', groupSizeBonus(4), POINTS_PER_EXTRA_MEMBER * 2)
check('size bonus never negative', groupSizeBonus(0), 0)
check('size bonus never negative for one', groupSizeBonus(1), 0)

/* -------------------------------------------------------------------------- */
/* Pad tiers                                                                 */
/* -------------------------------------------------------------------------- */

// Every pad must be playable: no tier may exceed the circle cap, and at least one
// pad must be reachable by the smallest possible group, or two friends could never
// play at all.
check('there are three pad tiers', PAD_TIERS.length, 3)
for (let pad = 0; pad < PAD_TIERS.length; pad++) {
  const required = requiredForPad(pad)
  checkTrue(
    `pad ${pad} tier is within the circle limits`,
    required >= MIN_CIRCLE_PLAYERS && required <= MAX_CIRCLE_PLAYERS
  )
}
checkTrue(
  'at least one pad is playable by the minimum group',
  PAD_TIERS.some((tier) => tier.required === MIN_CIRCLE_PLAYERS)
)
check(
  'tiers are all distinct',
  new Set(PAD_TIERS.map((t) => t.required)).size,
  PAD_TIERS.length
)
checkTrue(
  'every tier has a name and a location',
  PAD_TIERS.every((t) => t.tier.length > 0 && t.where.length > 0)
)

// The breakdown must itemise to the same figure the player is paid, or the result
// panel would be lying.
const itemised = computeScore({
  comboMatched: true,
  miniGameSuccess: false,
  playerEmotion: Joy,
  featuredEmotion: Joy,
  streakDays: 3,
    memberCount: 2
})
check(
  'breakdown reconciles',
  itemised.total,
  Math.round(
    (itemised.base + itemised.combo + itemised.miniGame + itemised.groupSize) *
      itemised.featuredMultiplier *
      (1 + itemised.streakBonus)
  )
)

// Scores must always be whole numbers - a fractional score would render badly and
// desync from the server's integer component field.
for (let streak = 1; streak <= 12; streak++) {
  const result = computeScore({
    comboMatched: true,
    miniGameSuccess: true,
    playerEmotion: Joy,
    featuredEmotion: Joy,
    streakDays: streak,
    memberCount: 2
  })
  checkTrue(`streak ${streak} total is an integer`, Number.isInteger(result.total))
}

/* -------------------------------------------------------------------------- */

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
