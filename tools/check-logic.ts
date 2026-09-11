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
  rankMembers,
  streakBonusFor
} from '../src/shared/scoring'
import { EMOTION_COUNT, EmotionId } from '../src/shared/types'
import {
  CURIOSITY_CHANCE,
  CURIOSITY_MULTIPLIER,
  ENERGY_EVERY,
  ENERGY_MULTIPLIER,
  FOCUS_EVERY,
  FOCUS_MULTIPLIER,
  LOVE_EVERY,
  MOOD_PERKS,
  applyMoodPerk,
  describeMoodBalance,
  getPerk,
  toleranceFor
} from '../src/shared/moodPerks'
import {
  FEATURED_MULTIPLIER,
  MAX_CIRCLE_PLAYERS,
  MINIGAME_DURATION_MS,
  MIN_CIRCLE_PLAYERS,
  PAD_POSITIONS,
  PAD_TIERS,
  POINTS_BASE,
  POINTS_COMBO,
  POINTS_MINIGAME,
  PLACEMENT_BONUSES,
  POINTS_PER_EXTRA_MEMBER,
  REACTION_CUES,
  REACTION_MAX_DELAY_MS,
  TAP_RACE_TARGET,
  STREAK_MAX_BONUS,
  placementBonus,
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

// The next three isolate the base/combo/multiplier maths, so they use
// `memberCount: 1` to switch the placement bonus off. A real circle always has at
// least two players; the competitive path is covered separately below.
check(
  'base only',
  computeScore({
    comboMatched: false,
    miniGameSuccess: false,
    playerEmotion: Calm,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 1,
  finishRank: 0
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
    memberCount: 1,
  finishRank: 0
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
    memberCount: 1,
  finishRank: 0
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
  memberCount: 2,
  finishRank: 0,
  topScore: 1
})
check('duo ceiling', duoCeiling.total, Math.round((10 + 20 + 30 + 0 + PLACEMENT_BONUSES[0]) * 2 * 1.5))
check('maxPossibleScore agrees (duo)', maxPossibleScore(11, 2), duoCeiling.total)

// Squad ceiling: (10 + 20 + 30 + 10) * 2 * 1.5 = 210.
const squadCeiling = computeScore({
  comboMatched: true,
  miniGameSuccess: true,
  playerEmotion: Joy,
  featuredEmotion: Joy,
  streakDays: 11,
  memberCount: 4,
  finishRank: 0,
  topScore: 1
})
check('squad ceiling', squadCeiling.total, Math.round((10 + 20 + 30 + 10 + PLACEMENT_BONUSES[0]) * 2 * 1.5))
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
check('there are five pads', PAD_TIERS.length, 5)
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
// Duplicate tiers are intentional now (two Duos, two Trios) - what matters is that
// every group size from the minimum to the cap has a ring, so no group is ever
// left with nowhere to play.
for (let size = MIN_CIRCLE_PLAYERS; size <= MAX_CIRCLE_PLAYERS; size++) {
  checkTrue(
    `a ring exists for a group of ${size}`,
    PAD_TIERS.some((tier) => tier.required === size)
  )
}
// The most common group size is two, so there should be more than one Duo ring.
checkTrue(
  'more than one ring accepts the smallest group',
  PAD_TIERS.filter((t) => t.required === MIN_CIRCLE_PLAYERS).length >= 2
)
checkTrue(
  'every tier has a name and a location',
  PAD_TIERS.every((t) => t.tier.length > 0 && t.where.length > 0)
)
// Every pad needs its own sync id, and the enum only reserves five slots.
checkTrue('no more pads than reserved sync ids', PAD_TIERS.length <= 5)
// Positions and tiers must stay the same length or requiredForPad() silently
// falls back to the minimum for the extra pads.
check('a position for every tier', PAD_POSITIONS.length, PAD_TIERS.length)

// The breakdown must itemise to the same figure the player is paid, or the result
// panel would be lying.
const itemised = computeScore({
  comboMatched: true,
  miniGameSuccess: false,
  playerEmotion: Joy,
  featuredEmotion: Joy,
  streakDays: 3,
    memberCount: 2,
  finishRank: 0,
  topScore: 1
})
check(
  'breakdown reconciles',
  itemised.total,
  Math.round(
    (itemised.base +
      itemised.combo +
      itemised.miniGame +
      itemised.groupSize +
      itemised.placement) *
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
    memberCount: 2,
  finishRank: 0
  })
  checkTrue(`streak ${streak} total is an integer`, Number.isInteger(result.total))
}

/* -------------------------------------------------------------------------- */
/* Mood perks                                                                */
/* -------------------------------------------------------------------------- */

// Every mood must have a distinct, described perk, or the loadout choice is fake.
check('a perk for every mood', Object.keys(MOOD_PERKS).length, EMOTION_COUNT)
check(
  'perk ids are distinct',
  new Set(Object.values(MOOD_PERKS).map((p) => p.id)).size,
  EMOTION_COUNT
)
checkTrue(
  'every perk has a name and a blurb',
  Object.values(MOOD_PERKS).every((p) => p.name.length > 0 && p.blurb.length > 0)
)
// The whole design rests on there being both kinds, so assert both exist.
checkTrue('at least one generous perk', Object.values(MOOD_PERKS).some((p) => p.generous))
checkTrue('at least one selfish perk', Object.values(MOOD_PERKS).some((p) => !p.generous))

// A perk may never REDUCE what a player earns - it is a perk, not a handicap.
for (let mood = 0; mood < EMOTION_COUNT; mood++) {
  for (let counter = 1; counter <= 12; counter++) {
    for (const roll of [0, 0.24, 0.26, 0.99]) {
      const outcome = applyMoodPerk(mood, 1, counter, roll)
      checkTrue(
        `perk ${getPerk(mood).id} never reduces self (n=${counter}, roll=${roll})`,
        outcome.self >= 1
      )
      checkTrue(
        `perk ${getPerk(mood).id} never gives negative to others`,
        outcome.toLowest >= 0 && outcome.toAll >= 0
      )
    }
  }
}

// Energy: an INTERVAL, not a fractional multiplier.
//
// It used to be `ceil(baseAmount * 1.5)`, and since every call site passes a base of
// 1 that resolved to 2 - a flat 2x, not the advertised +50%, and strictly the best
// selfish perk. These cases pin the base amount the game actually uses.
check('surge is quiet off-interval', applyMoodPerk(EmotionId.Energy, 1, ENERGY_EVERY - 1, 0.9).self, 1)
check('surge doubles on interval', applyMoodPerk(EmotionId.Energy, 1, ENERGY_EVERY, 0.9).self, ENERGY_MULTIPLIER)

// Focus: only every Nth action, and exactly N x.
check('locked on is quiet off-beat', applyMoodPerk(EmotionId.Focus, 1, FOCUS_EVERY - 1, 0.9).self, 1)
check('locked on triples on beat', applyMoodPerk(EmotionId.Focus, 1, FOCUS_EVERY, 0.9).self, FOCUS_MULTIPLIER)
check('locked on repeats', applyMoodPerk(EmotionId.Focus, 1, FOCUS_EVERY * 2, 0.9).self, FOCUS_MULTIPLIER)

// Curiosity: gated purely on the roll, so it is deterministic under test.
check('wildcard fires under the threshold', applyMoodPerk(EmotionId.Curiosity, 1, 1, 0).self, CURIOSITY_MULTIPLIER)
check('wildcard misses over the threshold', applyMoodPerk(EmotionId.Curiosity, 1, 1, CURIOSITY_CHANCE + 0.01).self, 1)

// Joy: always feeds the player who is last, and never inflates its own score.
const joy = applyMoodPerk(EmotionId.Joy, 1, 1, 0.9)
check('contagious feeds the last player', joy.toLowest, 1)
check('contagious does not boost itself', joy.self, 1)

// Love: feeds everyone, but only every Nth action.
check('bond is quiet between beats', applyMoodPerk(EmotionId.Love, 1, LOVE_EVERY - 1, 0.9).toAll, 0)
check('bond feeds everyone on beat', applyMoodPerk(EmotionId.Love, 1, LOVE_EVERY, 0.9).toAll, 1)

// Calm changes the RULES, not the arithmetic: tolerance only.
checkTrue('steady widens timing windows', toleranceFor(EmotionId.Calm) > 1)
check('steady does not change score', applyMoodPerk(EmotionId.Calm, 1, 3, 0).self, 1)
for (const mood of [EmotionId.Joy, EmotionId.Focus, EmotionId.Energy, EmotionId.Love, EmotionId.Curiosity]) {
  check(`${getPerk(mood).id} leaves timing alone`, toleranceFor(mood), 1)
}
// An out-of-range mood must not produce a broken multiplier.
check('unknown mood falls back to a sane tolerance', toleranceFor(99), toleranceFor(EmotionId.Calm))

// The racer/supporter summary is what tells players the tension exists.
check('balance is silent for a solo player', describeMoodBalance([EmotionId.Joy]), '')
checkTrue(
  'all-selfish circles are called out',
  describeMoodBalance([EmotionId.Energy, EmotionId.Focus]).length > 0
)
checkTrue(
  'mixed circles are described',
  describeMoodBalance([EmotionId.Energy, EmotionId.Joy]).indexOf('1') !== -1
)

/* -------------------------------------------------------------------------- */
/* Perk balance                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Expected value per scoring action for a mood, at the base amount the game actually
 * uses (1). Averaged over a full interval cycle and over the wildcard probability.
 */
function perkExpectedValue(mood: EmotionId): number {
  let total = 0
  const cycle = 12
  for (let counter = 1; counter <= cycle; counter++) {
    // Average the roll-dependent branch analytically rather than sampling.
    const low = applyMoodPerk(mood, 1, counter, 0).self
    const high = applyMoodPerk(mood, 1, counter, 0.999).self
    total += low * CURIOSITY_CHANCE + high * (1 - CURIOSITY_CHANCE)
  }
  return total / cycle
}

// No selfish perk may dominate the others. Energy was 2.0 against Focus 1.67 and
// Curiosity 1.5 before it became an interval perk.
const selfishEv = [EmotionId.Energy, EmotionId.Focus, EmotionId.Curiosity].map(perkExpectedValue)
const spread = Math.max(...selfishEv) - Math.min(...selfishEv)
checkTrue(
  `selfish perks are within 0.25 EV of each other (spread ${spread.toFixed(2)})`,
  spread <= 0.25
)
for (const mood of [EmotionId.Calm, EmotionId.Joy, EmotionId.Love]) {
  check(`${getPerk(mood).id} does not inflate its own score`, perkExpectedValue(mood), 1)
}

/* -------------------------------------------------------------------------- */
/* Round budgets                                                             */
/* -------------------------------------------------------------------------- */

// The worst-case Reaction schedule must fit inside a round, or the round is
// unwinnable through no fault of the players. Was 4 cues x 2200ms = 8.8s in a 10s
// round, leaving no room for reaction time.
const worstCueSchedule = REACTION_CUES * REACTION_MAX_DELAY_MS
checkTrue(
  `reaction cues fit the round (${worstCueSchedule}ms of ${MINIGAME_DURATION_MS}ms)`,
  worstCueSchedule < MINIGAME_DURATION_MS * 0.75
)

// Tap Race must be reachable. The objective counts RAW taps, so it is mood-independent
// - this pins that it is humanly achievable at a sustainable rate.
const tapsPerSecondNeeded = TAP_RACE_TARGET / (MINIGAME_DURATION_MS / 1000)
checkTrue(
  `tap race is reachable at ${tapsPerSecondNeeded.toFixed(1)} taps/sec`,
  tapsPerSecondNeeded <= 4
)

// There must be a placement bonus defined for every seat in the biggest circle.
checkTrue(
  'a placement bonus exists for every seat',
  PLACEMENT_BONUSES.length >= MAX_CIRCLE_PLAYERS
)

/* -------------------------------------------------------------------------- */
/* Placement gating                                                          */
/* -------------------------------------------------------------------------- */

// A round nobody scored in must NOT pay a winner's bonus. rankMembers maps equal
// scores to the same rank, so an all-zero round ranked everyone 1st and paid every
// member the full bonus - while the result card showed no winner at all.
check(
  'no placement bonus when nobody scored',
  computeScore({
    comboMatched: false,
    miniGameSuccess: false,
    playerEmotion: Calm,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 4,
    finishRank: 0,
    topScore: 0
  }).placement,
  0
)
checkTrue(
  'placement is paid once somebody scores',
  computeScore({
    comboMatched: false,
    miniGameSuccess: false,
    playerEmotion: Calm,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 4,
    finishRank: 0,
    topScore: 1
  }).placement > 0
)

/* -------------------------------------------------------------------------- */

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
