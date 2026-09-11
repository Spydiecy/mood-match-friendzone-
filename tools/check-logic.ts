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
  LOVE_EVERY,
  ENERGY_EVERY,
  ENERGY_MULTIPLIER,
  FOCUS_EVERY,
  FOCUS_MULTIPLIER,
  MOOD_PERKS,
  applyMoodPerk,
  describeMoodBalance,
  getPerk,
  toleranceFor
} from '../src/shared/moodPerks'
import {
  COLOR_MISTAKE_SETBACK,
  COLOR_PALETTE_SIZE,
  COLOR_SEQUENCE_LENGTH,
  CUE_GRACE_MS,
  FEATURED_MULTIPLIER,
  HOLD_BREAK_PENALTY_MS,
  HOLD_REQUIRED_MS,
  HOLD_SCORE_INTERVAL_MS,
  MAX_CIRCLE_PLAYERS,
  MINIGAME_DURATION_MS,
  MIN_CIRCLE_PLAYERS,
  PAD_POSITIONS,
  PAD_TIERS,
  POINTS_BASE,
  POINTS_COMBO,
  POINTS_MINIGAME,
  PLACEMENT_LAST,
  PLACEMENT_WIN_BASE,
  POINTS_PER_EXTRA_MEMBER,
  PROGRESS_PUSH_MS,
  REACTION_CUES,
  REACTION_MAX_DELAY_MS,
  REACTION_MIN_DELAY_MS,
  RHYTHM_BEAT_MIN_MS,
  RHYTHM_BEAT_MS,
  RHYTHM_SUCCESS_RATIO,
  RHYTHM_TOLERANCE_MS,
  SEQUENCE_REVEAL_MS,
  SYNC_SWEEP_MIN_MS,
  SYNC_SWEEP_MS,
  SYNC_TARGET,
  SYNC_WINDOW_MS,
  SYNC_ZONE_HALF_WIDTH,
  TAP_RACE_TARGET,
  STREAK_MAX_BONUS,
  placementBonus,
  placementSlice,
  winnerPrize,
  requiredForPad
} from '../src/shared/config'
import {
  beatCount,
  beatOffset,
  beatTime,
  currentInterval,
  nearestBeat
} from '../src/shared/rhythm'
import { markerInZone, markerPosition, sweepPeriod, zonePass } from '../src/shared/syncTap'
import { EMOTION_COUNT as EMOTIONS_AVAILABLE } from '../src/shared/types'

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
check('duo ceiling', duoCeiling.total, Math.round((10 + 20 + 30 + 0 + winnerPrize(2)) * 2 * 1.5))
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
check('squad ceiling', squadCeiling.total, Math.round((10 + 20 + 30 + 10 + winnerPrize(4)) * 2 * 1.5))
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

// The waits are not the whole story: somebody also has to react to each cue. A generous
// 400ms per cue, so raising the cue count can never silently produce a schedule that
// only a perfect player could finish.
const HUMAN_REACTION_MS = 400
checkTrue(
  `reaction cues fit the round with reaction time (${worstCueSchedule + REACTION_CUES * HUMAN_REACTION_MS}ms of ${MINIGAME_DURATION_MS}ms)`,
  worstCueSchedule + REACTION_CUES * HUMAN_REACTION_MS <= MINIGAME_DURATION_MS
)

// Tap Race must be reachable. The objective counts RAW taps, so it is mood-independent
// - this pins that it is humanly achievable at a sustainable rate.
const tapsPerSecondNeeded = TAP_RACE_TARGET / (MINIGAME_DURATION_MS / 1000)
checkTrue(
  `tap race is reachable at ${tapsPerSecondNeeded.toFixed(1)} taps/sec`,
  tapsPerSecondNeeded <= 4
)

// Every seat in the biggest circle must be worth something.
for (let seat = 0; seat < MAX_CIRCLE_PLAYERS; seat++) {
  checkTrue(
    `seat ${seat} of a full circle pays something`,
    placementSlice(seat, MAX_CIRCLE_PLAYERS) > 0
  )
}

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
/* Rhythm Tap: the accelerating beat grid                                     */
/* -------------------------------------------------------------------------- */

// The grid is the one thing in the scene that BOTH sides compute independently every
// frame, so a mistake here does not show up as a wrong number - it shows up as a round
// that cannot be won, with no error anywhere. These checks pin its shape.

const beats = Array.from({ length: beatCount() }, (_unused, i) => beatTime(i))

checkTrue(`the round has beats (${beatCount()})`, beatCount() >= 8)

// Strictly increasing. A duplicate or a backwards step would make `nearestBeat`
// ambiguous and let one tap score two beats.
let monotonic = true
for (let i = 1; i < beats.length; i++) {
  if (beats[i] <= beats[i - 1]) monotonic = false
}
checkTrue('beat times strictly increase', monotonic)

// Every beat inside the round. A beat past the end is a beat nobody can ever hit, and
// it still counts towards the target, so it silently raises the pass mark.
checkTrue(
  `every beat lands inside the round (last at ${beats[beats.length - 1]}ms)`,
  beats[beats.length - 1] < MINIGAME_DURATION_MS
)

// Actually accelerating, and only accelerating.
const gaps = beats.slice(1).map((t, i) => t - beats[i])
let shrinking = true
for (let i = 1; i < gaps.length; i++) {
  if (gaps[i] >= gaps[i - 1]) shrinking = false
}
checkTrue('the tempo speeds up every beat', shrinking)
checkTrue(`the first gap is about the configured start (${gaps[0]}ms)`, gaps[0] === RHYTHM_BEAT_MS)
checkTrue(
  `the last gap is at or above the configured floor (${gaps[gaps.length - 1]}ms)`,
  gaps[gaps.length - 1] >= RHYTHM_BEAT_MIN_MS
)

// THE important one. If the tolerance reaches half the tightest gap, the scoring windows
// of adjacent beats touch and every moment of the round is "on beat" - mashing scores as
// well as playing, and the game silently stops being a rhythm game. Calm widens the
// window by its tolerance multiplier, so the check has to allow for that too.
const tightestGap = Math.min(...gaps)
const widestWindow = RHYTHM_TOLERANCE_MS * toleranceFor(EmotionId.Calm)
checkTrue(
  `beat windows never overlap (widest ${widestWindow.toFixed(0)}ms vs half-gap ${(tightestGap / 2).toFixed(0)}ms)`,
  widestWindow < tightestGap / 2
)

// `nearestBeat` has to agree with the array it is derived from, including exactly on a
// beat and exactly midway between two.
let nearestOk = true
for (let i = 0; i < beats.length; i++) {
  if (nearestBeat(beats[i]) !== i) nearestOk = false
}
checkTrue('nearestBeat is exact on every beat', nearestOk)
check('nearestBeat clamps before the round', nearestBeat(-500), 0)
check('nearestBeat clamps after the round', nearestBeat(MINIGAME_DURATION_MS * 2), beats.length - 1)
check('beatOffset is zero on a beat', beatOffset(beats[3]), 0)
checkTrue(
  'beatOffset is worst midway between beats',
  beatOffset((beats[3] + beats[4]) / 2) > beatOffset(beats[3] + 10)
)

// A tap landing exactly between two beats must be a miss for EVERY mood, including
// Calm. This is the same margin as above stated as the thing a player actually does:
// tap on the off-beat and get nothing for it.
const offBeatOffset = beatOffset((beats[beats.length - 2] + beats[beats.length - 1]) / 2)
checkTrue(
  `an off-beat tap misses even for Calm (${offBeatOffset.toFixed(0)}ms vs ${widestWindow.toFixed(0)}ms)`,
  offBeatOffset > widestWindow
)

// The pass mark has to be humanly reachable: a player hitting every beat scores
// `beatCount()`, so the required share must leave room for ordinary mistakes.
const soloTarget = Math.ceil(beatCount() * RHYTHM_SUCCESS_RATIO)
checkTrue(
  `a solo player can clear rhythm tap (${soloTarget} of ${beatCount()})`,
  soloTarget <= beatCount() - 2
)

check('currentInterval reports the opening tempo', currentInterval(0), RHYTHM_BEAT_MS)
checkTrue(
  'currentInterval falls through the round',
  currentInterval(MINIGAME_DURATION_MS * 0.9) < currentInterval(0)
)

/* -------------------------------------------------------------------------- */
/* Sync Tap: the accelerating sweep                                           */
/* -------------------------------------------------------------------------- */

// Sampled at 8ms, which is finer than any frame the scene will actually render.
const SWEEP_STEP = 8
let inZoneMs = 0
let zonePasses = 0
let wasInZone = false
let worstJump = 0
let previousPosition = markerPosition(0, 0)
let positionInRange = true

for (let t = 0; t <= MINIGAME_DURATION_MS; t += SWEEP_STEP) {
  const position = markerPosition(0, t)
  if (position < -1e-9 || position > 1 + 1e-9) positionInRange = false

  worstJump = Math.max(worstJump, Math.abs(position - previousPosition))
  previousPosition = position

  const inside = markerInZone(0, t)
  if (inside) inZoneMs += SWEEP_STEP
  if (inside && !wasInZone) zonePasses++
  wasInZone = inside
}

checkTrue('the marker stays on the bar', positionInRange)

// Continuity. The whole reason the sweep ramps on TIME rather than on syncs achieved is
// that an event-driven speed change teleports the marker. This is the check that would
// have caught that design: at 8ms the marker should move a couple of percent at most.
checkTrue(
  `the marker never jumps (worst ${(worstJump * 100).toFixed(1)}% per 8ms)`,
  worstJump < 0.05
)

checkTrue(`the sweep passes the zone often enough (${zonePasses} passes)`, zonePasses >= SYNC_TARGET * 2)

// A tap has to be landable. The zone is a fixed fraction of the bar, so the time inside
// it shrinks as the sweep speeds up - the LAST pass is the one that has to stay possible.
const tightestZoneMs = SYNC_ZONE_HALF_WIDTH * 2 * (sweepPeriod(MINIGAME_DURATION_MS) / 2)
checkTrue(
  `the tightest zone pass is still tappable (${tightestZoneMs.toFixed(0)}ms)`,
  tightestZoneMs >= 150
)

// Every member must be able to fit inside one sync window, so the window has to be at
// least as long as a zone pass - otherwise a group who all tapped in the same pass could
// still be judged out of sync.
checkTrue(
  `the sync window covers a whole zone pass (${SYNC_WINDOW_MS}ms vs ${tightestZoneMs.toFixed(0)}ms)`,
  SYNC_WINDOW_MS >= tightestZoneMs
)

checkTrue('the sweep speeds up', SYNC_SWEEP_MIN_MS < SYNC_SWEEP_MS)
check('sweepPeriod starts at the configured period', sweepPeriod(0), SYNC_SWEEP_MS)
check('sweepPeriod ends at the configured floor', sweepPeriod(MINIGAME_DURATION_MS), SYNC_SWEEP_MIN_MS)
checkTrue(
  `the marker is out of the zone most of the time (${Math.round((inZoneMs / MINIGAME_DURATION_MS) * 100)}%)`,
  inZoneMs / MINIGAME_DURATION_MS < 0.4
)

/* -------------------------------------------------------------------------- */
/* Color Match and Hold Zones budgets                                         */
/* -------------------------------------------------------------------------- */

// The palette can only be filled from the emotions that exist.
checkTrue(
  `the colour palette fits the emotion set (${COLOR_PALETTE_SIZE} of ${EMOTIONS_AVAILABLE})`,
  COLOR_PALETTE_SIZE <= EMOTIONS_AVAILABLE
)

// Guessing must be a bad bet, which needs more colours than a coin flip.
checkTrue('guessing a colour is unlikely to pay off', COLOR_PALETTE_SIZE >= 4)

// The reveal eats into the playing time. Lengthening the sequence without shortening the
// reveal is the change that would quietly make the round unwinnable, so this pins that
// there is still a workable amount of time per step afterwards.
const colorPlayMs = MINIGAME_DURATION_MS - SEQUENCE_REVEAL_MS
const msPerStep = colorPlayMs / COLOR_SEQUENCE_LENGTH
checkTrue(
  `color match leaves ${msPerStep.toFixed(0)}ms per step`,
  msPerStep >= 900
)
checkTrue(
  `the reveal leaves time to memorise (${(SEQUENCE_REVEAL_MS / COLOR_SEQUENCE_LENGTH).toFixed(0)}ms per colour)`,
  SEQUENCE_REVEAL_MS / COLOR_SEQUENCE_LENGTH >= 300
)

// A setback must cost something without being able to wipe the round.
checkTrue('a colour mistake costs ground', COLOR_MISTAKE_SETBACK >= 1)
checkTrue('a colour mistake cannot wipe the sequence', COLOR_MISTAKE_SETBACK < COLOR_SEQUENCE_LENGTH)

// Hold Zones has to be clearable inside the round even after one break.
checkTrue(
  `hold zones survives a break (${HOLD_REQUIRED_MS + HOLD_BREAK_PENALTY_MS}ms of ${MINIGAME_DURATION_MS}ms)`,
  HOLD_REQUIRED_MS + HOLD_BREAK_PENALTY_MS <= MINIGAME_DURATION_MS
)
checkTrue('breaking the hold chain costs something', HOLD_BREAK_PENALTY_MS > 0)

/* -------------------------------------------------------------------------- */
/* UI width budgets                                                           */
/* -------------------------------------------------------------------------- */

// These mirror hardcoded layout numbers in the UI. They are checked here because an
// overflowing row does not warn, log or clip visibly - it just puts controls off the
// edge of the screen, which is how two of the six practice games became unreachable.
// If you change a number in the UI, change it here too.

const PICKER_PANEL_WIDTH = 1000
const PICKER_PADDING = 14
const PICKER_CARD_WIDTH = 150
const PICKER_CARD_MARGIN = 4
const MINIGAMES_OFFERED = 6

const pickerRowWidth = MINIGAMES_OFFERED * (PICKER_CARD_WIDTH + PICKER_CARD_MARGIN * 2)
checkTrue(
  `the practice picker fits its panel (${pickerRowWidth} of ${PICKER_PANEL_WIDTH - PICKER_PADDING * 2})`,
  pickerRowWidth <= PICKER_PANEL_WIDTH - PICKER_PADDING * 2
)
checkTrue('the practice picker offers every game', MINIGAMES_OFFERED === 6)

// Color Match draws one tap target per palette colour, in the action row.
const COLOR_TARGET_SIZE = 92
const COLOR_TARGET_MARGIN = 8
const colorRowWidth = COLOR_PALETTE_SIZE * (COLOR_TARGET_SIZE + COLOR_TARGET_MARGIN * 2)
checkTrue(
  `the colour targets fit the canvas (${colorRowWidth} of 1600)`,
  colorRowWidth <= 1600
)
checkTrue(
  `each colour target clears the 80px touch minimum (${COLOR_TARGET_SIZE}px)`,
  COLOR_TARGET_SIZE >= 80
)

// Rhythm Tap draws one dot per beat, and the beat count is now derived rather than
// fixed, so the strip grows if the tempo is raised.
const BEAT_DOT_PITCH = 16 + 3 * 2
checkTrue(
  `the beat strip fits the panel (${beatCount() * BEAT_DOT_PITCH} of 780)`,
  beatCount() * BEAT_DOT_PITCH <= 780
)

// Panel heights against the centre-stage budget. Every mini-game panel declares a
// fixed height and the centre column allows 372; a panel that overruns pushes the
// action row off the bottom of a phone screen, which is unrecoverable mid-round.
// Sync Tap grew from 196 to 250 when the standings strip was added to it.
const CENTRE_MAX = 372
const PANEL_HEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['rhythm tap', 264],
  ['color match', 246],
  ['sync tap', 250],
  ['hold zones', 230],
  ['tap race', 204],
  ['reaction', 196]
]
for (const [name, height] of PANEL_HEIGHTS) {
  checkTrue(`the ${name} panel fits the centre budget (${height} of ${CENTRE_MAX})`, height <= CENTRE_MAX)
}

// The tutorial's scoring table gained a row for the placement prize, which is now the
// biggest single line on it. The modal caps itself at the canvas height, so the table
// plus the header and the button row has to fit inside that cap - otherwise the Next
// button ends up off screen and a first-time player is stuck in onboarding.
const CANVAS_HEIGHT = 720
const MODAL_MARGIN = 32
const MODAL_PADDING = 22
const MODAL_HEADER = 72
const TUTORIAL_BUTTON_ROW = 96 + 14
const SCORE_TABLE_HEIGHT = 352
const tutorialHeight =
  MODAL_PADDING * 2 + MODAL_HEADER + SCORE_TABLE_HEIGHT + TUTORIAL_BUTTON_ROW
checkTrue(
  `the tutorial scoring screen fits the modal (${tutorialHeight} of ${CANVAS_HEIGHT - MODAL_MARGIN})`,
  tutorialHeight <= CANVAS_HEIGHT - MODAL_MARGIN
)

// Color Match draws one swatch per sequence step in the centre panel.
const SEQUENCE_SWATCH_PITCH = 54 + 4 * 2
checkTrue(
  `the sequence strip fits the panel (${COLOR_SEQUENCE_LENGTH * SEQUENCE_SWATCH_PITCH} of 780)`,
  COLOR_SEQUENCE_LENGTH * SEQUENCE_SWATCH_PITCH <= 780
)

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

// `rankMembers` decides who is paid what in every round, and it was imported here
// without a single check against it. These pin the three rules it encodes.

// 1. Plain ordering, best score first, and nobody is tied on their own.
const plain = rankMembers([5, 9, 1])
check('ranks order by score, best first', plain.ranks, [1, 0, 2])
check('distinct scores are each alone at their rank', plain.tied, [1, 1, 1])

// 2. Equal results SHARE a rank and report how many share it, so the caller can split
//    the prize rather than paying each of them in full.
const drawn = rankMembers([7, 7, 3])
check('equal scores share a rank', drawn.ranks, [0, 0, 2])
check('a shared rank reports its size', drawn.tied, [2, 2, 1])

const allDrawn = rankMembers([4, 4, 4, 4])
check('an all-square round ties everyone at first', allDrawn.ranks, [0, 0, 0, 0])
check('an all-square round reports the full size', allDrawn.tied, [4, 4, 4, 4])

// 3. Completing the objective OUTRANKS the score, and among finishers the earlier one
//    wins. This is the Tap Race fix: a mood perk inflates `memberScore`, so without
//    this an Energy player on 24 taps could score 36 and be ranked above the player who
//    actually crossed 30 taps first and won the race for the group.
const raced = rankMembers([36, 30], [0, 1000])
check('the player who finished outranks a higher score', raced.ranks, [1, 0])
check('a finish is not a tie', raced.tied, [1, 1])

const photoFinish = rankMembers([30, 30], [1200, 1000])
check('the earlier finisher takes first', photoFinish.ranks, [1, 0])

const bothMissed = rankMembers([12, 20], [0, 0])
check('with nobody finishing it falls back to score', bothMissed.ranks, [1, 0])

// A dead heat on the exact same tick is still a dead heat.
check('identical finish times stay tied', rankMembers([30, 30], [900, 900]).ranks, [0, 0])
check('identical finish times report the tie', rankMembers([30, 30], [900, 900]).tied, [2, 2])

// A DEAD HEAT MUST NOT FALL BACK TO THE SCORE. Two racers who each land their final tap
// in the same millisecond hold the same raw count but different perk-weighted scores, so
// deferring to the score would let the mood decide the photo finish - the exact key the
// finish stamp exists to override. Identical stamps are the common case, not an exotic
// one: `Date.now()` is read per message and a batch handled in one turn shares a ms.
check(
  'a dead heat ignores the weighted score',
  rankMembers([45, 30], [1000, 1000]).ranks,
  [0, 0]
)
check(
  'a dead heat is reported as a tie',
  rankMembers([45, 30], [1000, 1000]).tied,
  [2, 2]
)
// ...but a real gap in the stamps still decides it, whichever way the scores point.
check('a later finisher loses despite a higher score', rankMembers([45, 30], [1200, 1000]).ranks, [1, 0])

/* -------------------------------------------------------------------------- */
/* Placement ladder                                                           */
/* -------------------------------------------------------------------------- */

// Winning has to be worth chasing. The old fixed [16, 9, 5, 2] table paid a duo winner
// 46 and the loser 39 - a seven-point gap on a 46-point round, most of which was the
// shared base and combo. Two players reported that winning felt pointless.

check('a duo winner takes the base prize', placementSlice(0, 2), PLACEMENT_WIN_BASE)
check('last place is the same whatever the size', placementSlice(1, 2), PLACEMENT_LAST)
check('last place in a squad is the same', placementSlice(3, 4), PLACEMENT_LAST)

// The prize scales with the circle: beating three people beats beating one.
checkTrue(
  `a trio winner beats a duo winner (${winnerPrize(3)} vs ${winnerPrize(2)})`,
  winnerPrize(3) > winnerPrize(2)
)
checkTrue(
  `a squad winner beats a trio winner (${winnerPrize(4)} vs ${winnerPrize(3)})`,
  winnerPrize(4) > winnerPrize(3)
)

// Every position must be worth climbing out of, or the middle of a squad has nothing
// to play for.
for (let members = 2; members <= MAX_CIRCLE_PLAYERS; members++) {
  for (let rank = 1; rank < members; rank++) {
    checkTrue(
      `rank ${rank} of ${members} pays less than rank ${rank - 1}`,
      placementSlice(rank, members) < placementSlice(rank - 1, members)
    )
  }
  checkTrue(`last place in a circle of ${members} still pays`, placementSlice(members - 1, members) > 0)
}

// A solo pseudo-circle has nobody to beat.
check('placement needs somebody to beat', placementBonus(0, 1, 1), 0)

// Ties SPLIT their slices rather than each taking the higher one. Paying both players
// a winner's share was the other half of "nothing is competitive": a dead heat was as
// good as a win, so in Tap Race - where two players often end level - there was no
// reason to be first.
check('a duo tie splits the pot', placementBonus(0, 2, 2), Math.round((30 + 4) / 2))
checkTrue(
  'a tie pays less than an outright win',
  placementBonus(0, 2, 2) < placementBonus(0, 2, 1)
)
checkTrue(
  'a tie for first still beats coming last',
  placementBonus(0, 2, 2) > placementBonus(1, 2, 1)
)

// Sync Tap credits every member for every sync, so a round where perks happen not to
// separate anybody ties the whole circle at first. That must pay the ladder average,
// not four winner's shares.
const syncTie = placementBonus(0, 4, 4)
const ladderAverage = Math.round(
  (placementSlice(0, 4) + placementSlice(1, 4) + placementSlice(2, 4) + placementSlice(3, 4)) / 4
)
check('an all-square squad splits the whole ladder', syncTie, ladderAverage)
checkTrue('an all-square round pays less than winning it', syncTie < placementSlice(0, 4))
checkTrue('an all-square round pays more than losing it', syncTie > placementSlice(3, 4))

// A tie can never pay out more in total than the positions it covers.
for (let members = 2; members <= MAX_CIRCLE_PLAYERS; members++) {
  for (let tied = 1; tied <= members; tied++) {
    let ladder = 0
    for (let i = 0; i < tied; i++) ladder += placementSlice(i, members)
    checkTrue(
      `a ${tied}-way tie in a circle of ${members} pays out no more than its slices`,
      placementBonus(0, members, tied) * tied <= ladder + tied
    )
  }
}

/* -------------------------------------------------------------------------- */
/* Perk gifts: the generous moods must stay playable                          */
/* -------------------------------------------------------------------------- */

// A gift may never lift its recipient ABOVE the giver. This became essential when the
// winner's prize grew from 16 to 30-54: Joy donates a point every time it scores, so in
// any round where members act on the same schedule - Hold Zones credits every holder
// every 500ms, Sync Tap credits everyone on each sync - the donations were unopposed and
// the recipient overtook the donor. A Joy player who held the entire round finished on 14
// against a partner's 27 and collected LAST place, every time, with no play available to
// them that changed it. Choosing the kind mood was a guaranteed loss.
//
// The server applies the cap; this models it so the property is pinned somewhere.
function simulateGifts(
  moods: EmotionId[],
  actionsEach: number,
  capped: boolean
): number[] {
  const scores = new Array<number>(moods.length).fill(0)
  const counters = new Array<number>(moods.length).fill(0)

  for (let action = 0; action < actionsEach; action++) {
    for (let i = 0; i < moods.length; i++) {
      counters[i]++
      // Roll above the wildcard threshold, so Curiosity stays deterministic here.
      const outcome = applyMoodPerk(moods[i], 1, counters[i], 0.999)
      scores[i] += outcome.self

      if (outcome.toLowest > 0 && moods.length > 1) {
        let lowest = -1
        for (let j = 0; j < moods.length; j++) {
          if (j === i || counters[j] === 0) continue
          if (lowest === -1 || scores[j] < scores[lowest]) lowest = j
        }
        if (lowest !== -1) {
          const room = scores[i] - scores[lowest] - 1
          scores[lowest] += capped
            ? Math.max(0, Math.min(outcome.toLowest, room))
            : outcome.toLowest
        }
      }

      if (outcome.toAll > 0) {
        for (let j = 0; j < moods.length; j++) {
          if (j === i || counters[j] === 0) continue
          const room = scores[i] - scores[j] - 1
          scores[j] += capped ? Math.max(0, Math.min(outcome.toAll, room)) : outcome.toAll
        }
      }
    }
  }

  return scores
}

// The regression, stated as a failing case under the OLD behaviour and a passing one
// under the new. At Hold Zones' action count Joy used to lose outright.
const holdActions = Math.floor(HOLD_REQUIRED_MS / HOLD_SCORE_INTERVAL_MS)
const joyUncapped = simulateGifts([EmotionId.Joy, EmotionId.Calm], holdActions, false)
checkTrue(
  `without the cap Joy loses its own round (${joyUncapped[0]} vs ${joyUncapped[1]})`,
  joyUncapped[0] < joyUncapped[1]
)

const joyCapped = simulateGifts([EmotionId.Joy, EmotionId.Calm], holdActions, true)
checkTrue(
  `with the cap Joy is never overtaken by its own gift (${joyCapped[0]} vs ${joyCapped[1]})`,
  joyCapped[0] >= joyCapped[1]
)

// The same must hold for Love, which feeds everyone rather than the player in last.
const loveCapped = simulateGifts([EmotionId.Love, EmotionId.Calm], holdActions, true)
checkTrue(
  `Love is never overtaken by its own gift (${loveCapped[0]} vs ${loveCapped[1]})`,
  loveCapped[0] >= loveCapped[1]
)

// No generous mood may finish behind a mood that gives nothing away, across every
// symmetric round length the games actually produce.
for (const actions of [4, 6, 13, holdActions, 20, 30]) {
  for (const generous of [EmotionId.Joy, EmotionId.Love]) {
    const result = simulateGifts([generous, EmotionId.Calm], actions, true)
    checkTrue(
      `${getPerk(generous).id} is not punished at ${actions} actions (${result[0]} vs ${result[1]})`,
      result[0] >= result[1]
    )
  }
}

// TWO IDENTICAL PLAYERS MUST TIE. Gifts are applied in member-array order against
// mid-pass scores, so uncapped they leapfrogged each other and whoever sat earlier in
// the array ended a point ahead - taking the entire winner's prize for occupying seat 0.
// `rankMembers` was rewritten specifically to stop array order demoting anybody; without
// the cap it came back one layer down, where the ranking could not see it.
for (const mood of [EmotionId.Joy, EmotionId.Love, EmotionId.Calm, EmotionId.Energy]) {
  const pair = simulateGifts([mood, mood], holdActions, true)
  check(`two ${getPerk(mood).id} players tie exactly`, pair[0], pair[1])
}

// THE GIFT MUST STILL DO SOMETHING. Capping it could easily have turned the generous
// moods back into decoration, which is the failure this whole area started with. A member
// who is genuinely behind has to be pulled UP, visibly, in the standings strip everyone is
// watching - that is the social payoff the mood is bought for.
//
// Modelled by giving the straggler a quarter of the actions.
function simulateWithStraggler(mood: EmotionId, actionsEach: number): number[] {
  const scores = [0, 0]
  const counters = [0, 0]

  for (let action = 0; action < actionsEach; action++) {
    for (let i = 0; i < 2; i++) {
      // The straggler only acts on every fourth pass.
      if (i === 1 && action % 4 !== 0) continue

      counters[i]++
      const outcome = applyMoodPerk(i === 0 ? mood : EmotionId.Calm, 1, counters[i], 0.999)
      scores[i] += outcome.self

      const gift = Math.max(outcome.toLowest, outcome.toAll)
      const other = 1 - i
      if (gift > 0 && counters[other] > 0) {
        const room = scores[i] - scores[other] - 1
        scores[other] += Math.max(0, Math.min(gift, room))
      }
    }
  }

  return scores
}

const withJoy = simulateWithStraggler(EmotionId.Joy, holdActions)
const withCalm = simulateWithStraggler(EmotionId.Calm, holdActions)

checkTrue(
  `contagious lifts a struggling partner (${withJoy[1]} vs ${withCalm[1]} without it)`,
  withJoy[1] > withCalm[1]
)
checkTrue(
  `contagious costs its owner nothing (${withJoy[0]} vs ${withCalm[0]})`,
  withJoy[0] >= withCalm[0]
)
// The accepted consequence, pinned so it is a decision rather than a surprise: because
// the gift stops one point short of parity it lifts a partner up the standings without
// ever reordering them. A generous mood buys visible support for a struggling player, not
// a placement swing - the compensation for choosing one is the shared mini-game bonus,
// which the whole circle collects when the group objective lands.
checkTrue(
  'a lifted partner is still ranked below their benefactor',
  withJoy[1] < withJoy[0]
)

/* -------------------------------------------------------------------------- */
/* Sync Tap must involve playing                                              */
/* -------------------------------------------------------------------------- */

// Sync Tap used to credit each member only for COMPLETED group syncs, which is
// `SYNC_TARGET` actions each - four - with nothing a player did changing their own total.
// Placement was then a pure lookup by mood, and a 54-point prize should not be decided
// before the round starts. Members are now also credited for landing an individual tap in
// the zone, once per pass, so accuracy separates them.
//
// The number of passes available is what makes that worth doing, so pin it.
const passesAvailable = (() => {
  let passes = 0
  let inside = false
  for (let t = 0; t <= MINIGAME_DURATION_MS; t += 8) {
    const now = markerInZone(0, t)
    if (now && !inside) passes++
    inside = now
  }
  return passes
})()

checkTrue(
  `sync tap offers enough individual chances to separate players (${passesAvailable})`,
  passesAvailable >= SYNC_TARGET * 2
)

// With that many actions the interval perks average toward their intended multipliers
// instead of resolving to a fixed table. Four actions was not enough for Love's
// every-4th or Focus's every-3rd to mean anything.
checkTrue(
  `sync tap clears every perk interval (${passesAvailable} vs ${LOVE_EVERY})`,
  passesAvailable >= LOVE_EVERY * 2
)

// One pass, one point: `zonePass` is what stops a held button scoring per frame.
check('a zone pass has a stable index', zonePass(0, 1000), zonePass(0, 1000))
checkTrue('zone passes advance through the round', zonePass(0, MINIGAME_DURATION_MS) > zonePass(0, 0))
let passesMonotonic = true
let lastPass = zonePass(0, 0)
for (let t = 0; t <= MINIGAME_DURATION_MS; t += 8) {
  const pass = zonePass(0, t)
  if (pass < lastPass) passesMonotonic = false
  lastPass = pass
}
checkTrue('zone pass indices never go backwards', passesMonotonic)

/* -------------------------------------------------------------------------- */
/* Reaction: losing a race is not a false start                               */
/* -------------------------------------------------------------------------- */

// The early-tap lockout survives into the next cue on purpose, which makes it expensive
// to hand out by accident. A claim has to travel back to the other clients, so for about
// one round-trip they are all still looking at a green plate in good faith; a tap then is
// a lost race. Without the grace window, losing a cue by 50ms silently cost the player
// the NEXT cue too.
checkTrue(
  `the claim grace outlasts a progress push (${CUE_GRACE_MS}ms vs ${PROGRESS_PUSH_MS}ms)`,
  CUE_GRACE_MS > PROGRESS_PUSH_MS
)
// ...but it must not be long enough to cover a genuine early tap, which means staying
// well inside the shortest wait the server will ever schedule before a cue.
checkTrue(
  `the claim grace cannot hide a false start (${CUE_GRACE_MS}ms vs ${REACTION_MIN_DELAY_MS}ms)`,
  CUE_GRACE_MS < REACTION_MIN_DELAY_MS
)

/* -------------------------------------------------------------------------- */
/* The reported round, end to end                                             */
/* -------------------------------------------------------------------------- */

// Reproduces exactly what two players saw and complained about: a duo Hold Zones round
// with a combo, which they failed, one of them ahead of the other. It paid 46 and 39.
function reportedDuoRound(rank: number): number {
  return computeScore({
    comboMatched: true,
    miniGameSuccess: false,
    playerEmotion: Calm,
    featuredEmotion: Joy,
    streakDays: 1,
    memberCount: 2,
    finishRank: rank,
    tiedAtRank: 1,
    topScore: 12
  }).total
}

const reportedWinner = reportedDuoRound(0)
const reportedLoser = reportedDuoRound(1)

checkTrue(
  `winning the reported round pays meaningfully more (${reportedWinner} vs ${reportedLoser})`,
  reportedWinner >= reportedLoser * 1.5
)
checkTrue(`the loser of the reported round still scores (${reportedLoser})`, reportedLoser > 0)

/* -------------------------------------------------------------------------- */

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
