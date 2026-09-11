/**
 * Mood Match - mood perks.
 *
 * WHY THIS EXISTS. Moods used to be a purely passive modifier: they fed the combo
 * bonus and the daily 2x, both applied silently at payout. Nothing about your mood
 * changed how a round actually played, so choosing one felt arbitrary and the whole
 * system read as decoration.
 *
 * A perk makes your mood a LOADOUT. It changes what your taps are worth, how
 * forgiving your timing is, or who else benefits when you score - so picking a mood
 * is a real decision made before a round, and swapping at the Mood Font is a real
 * play.
 *
 * THE INTERESTING PART is the tension between selfish and generous perks:
 *
 *   Energy / Focus / Curiosity boost YOUR score, which wins the placement bonus.
 *   Joy / Love feed OTHER players, which helps the group clear the shared objective
 *   - and that objective pays +30 to everyone, including you.
 *
 * So a circle full of selfish moods races hard and often fails the group goal, and a
 * circle with a couple of generous moods clears it. There is no dominant choice,
 * which is what makes the decision worth making.
 *
 * Shared between client and server: the client uses it to DESCRIBE perks, the server
 * to APPLY them. `applyMoodPerk` is pure and takes its randomness as an argument so
 * it can be tested exhaustively.
 */

import { EmotionId } from './types'

/** Player-facing description of a mood's perk. */
export interface MoodPerk {
  /** Stable id. */
  id: string
  /** Short name, shown on the mood chip. ASCII only. */
  name: string
  /** One-line explanation, shown in the mood picker and the round header. */
  blurb: string
  /**
   * Multiplier applied to timing windows - the Rhythm Tap hit tolerance and the
   * Sync Tap simultaneity window. 1 means no change.
   */
  toleranceMultiplier: number
  /** True when the perk mainly helps other players rather than the holder. */
  generous: boolean
}

/** How often Focus lands its triple. Every Nth scoring action. */
export const FOCUS_EVERY = 3

/** Focus multiplier when it lands. */
export const FOCUS_MULTIPLIER = 3

/**
 * Energy doubles every Nth point rather than applying a fractional multiplier.
 *
 * WHY AN INTERVAL: a flat 1.5x multiplier is not expressible at integer scale. Every
 * scoring action is worth 1 point, and `ceil(1 * 1.5)` is 2 - so the perk that
 * advertised "+50%" actually paid DOUBLE, making it strictly the strongest selfish
 * perk (2.0 expected value against Focus's 1.67 and Curiosity's 1.5). Doubling every
 * second point is exactly 1.5x on average, and lands on whole numbers.
 */
export const ENERGY_EVERY = 2

/** Energy's multiplier when it lands. */
export const ENERGY_MULTIPLIER = 2

/** How often Love feeds the rest of the circle. Every Nth scoring action. */
export const LOVE_EVERY = 4

/** Chance that Curiosity's wildcard fires, 0..1. */
export const CURIOSITY_CHANCE = 0.25

/** Curiosity multiplier when the wildcard fires. */
export const CURIOSITY_MULTIPLIER = 3

/** Calm's timing tolerance multiplier. */
export const CALM_TOLERANCE = 1.6

/** Perk per mood. Indexed by EmotionId. */
export const MOOD_PERKS: Record<EmotionId, MoodPerk> = {
  [EmotionId.Calm]: {
    id: 'steady',
    name: 'Steady',
    blurb: `Timing windows are ${Math.round((CALM_TOLERANCE - 1) * 100)}% more forgiving for you.`,
    toleranceMultiplier: CALM_TOLERANCE,
    generous: false
  },
  [EmotionId.Joy]: {
    id: 'contagious',
    name: 'Contagious',
    blurb: 'Every point you score also gives +1 to whoever is last.',
    toleranceMultiplier: 1,
    generous: true
  },
  [EmotionId.Focus]: {
    id: 'lockedon',
    name: 'Locked On',
    blurb: `Every ${FOCUS_EVERY}rd point you score counts ${FOCUS_MULTIPLIER}x.`,
    toleranceMultiplier: 1,
    generous: false
  },
  [EmotionId.Energy]: {
    id: 'surge',
    name: 'Surge',
    blurb: `Every ${ENERGY_EVERY}nd point you score counts ${ENERGY_MULTIPLIER}x.`,
    toleranceMultiplier: 1,
    generous: false
  },
  [EmotionId.Love]: {
    id: 'bond',
    name: 'Bond',
    blurb: `Every ${LOVE_EVERY}th point you score gives +1 to everyone else.`,
    toleranceMultiplier: 1,
    generous: true
  },
  [EmotionId.Curiosity]: {
    id: 'wildcard',
    name: 'Wildcard',
    blurb: `A ${Math.round(CURIOSITY_CHANCE * 100)}% chance each point counts ${CURIOSITY_MULTIPLIER}x.`,
    toleranceMultiplier: 1,
    generous: false
  }
}

/** Safe lookup, falling back to Calm for an out-of-range id. */
export function getPerk(emotion: EmotionId | number): MoodPerk {
  return MOOD_PERKS[emotion as EmotionId] ?? MOOD_PERKS[EmotionId.Calm]
}

/**
 * Timing tolerance multiplier for a mood.
 *
 * Applied to the Rhythm Tap hit window and the Sync Tap simultaneity window. This is
 * the one perk that changes the RULES rather than the arithmetic, which is why Calm
 * is the mood to pick when a group keeps narrowly missing a timing round.
 */
export function toleranceFor(emotion: EmotionId | number): number {
  return getPerk(emotion).toleranceMultiplier
}

/**
 * What a single scoring action produces once the mood perk is applied.
 *
 * IMPORTANT: `toLowest` and `toAll` may only ever be given to members who have
 * scored at least once themselves this round. A generous perk is meant to help a
 * player who is behind but TRYING; without that restriction, a Joy player tapping 24
 * times in a Duo handed an idle partner 24 points, a tied first place and the full
 * placement bonus for never touching the screen. The restriction is enforced at the
 * call site, which is the only place that knows who has been active.
 */
export interface PerkOutcome {
  /** Points for the player who scored. Always at least `baseAmount`. */
  self: number
  /** Points for the lowest-scoring ACTIVE other member. */
  toLowest: number
  /** Points for every ACTIVE other member. */
  toAll: number
  /** True when the perk did something visible, for the UI flash. */
  triggered: boolean
}

/**
 * Applies a mood perk to one discrete scoring action.
 *
 * PURE. `counter` is how many times this member has scored INCLUDING this action
 * (so the first action is 1), and `roll` is a 0..1 random supplied by the caller -
 * both so this can be tested exhaustively rather than probabilistically.
 *
 * Only ever called for DISCRETE scoring events (a tap, a step, a cue). Continuous
 * accumulation like Hold Zones' held-time deliberately bypasses perks: applying
 * "give +1 to whoever is last" thirty times a second would break the game.
 */
export function applyMoodPerk(
  emotion: EmotionId | number,
  baseAmount: number,
  counter: number,
  roll: number
): PerkOutcome {
  const perk = getPerk(emotion)
  const outcome: PerkOutcome = {
    self: baseAmount,
    toLowest: 0,
    toAll: 0,
    triggered: false
  }

  switch (perk.id) {
    case 'surge':
      if (counter > 0 && counter % ENERGY_EVERY === 0) {
        outcome.self = baseAmount * ENERGY_MULTIPLIER
        outcome.triggered = true
      }
      break

    case 'lockedon':
      if (counter > 0 && counter % FOCUS_EVERY === 0) {
        outcome.self = baseAmount * FOCUS_MULTIPLIER
        outcome.triggered = true
      }
      break

    case 'wildcard':
      if (roll < CURIOSITY_CHANCE) {
        outcome.self = baseAmount * CURIOSITY_MULTIPLIER
        outcome.triggered = true
      }
      break

    case 'contagious':
      outcome.toLowest = 1
      outcome.triggered = true
      break

    case 'bond':
      if (counter > 0 && counter % LOVE_EVERY === 0) {
        outcome.toAll = 1
        outcome.triggered = true
      }
      break

    case 'steady':
    default:
      // Calm's perk is the tolerance multiplier, applied at the judging site rather
      // than here, so a scoring action itself is unmodified.
      break
  }

  return outcome
}

/**
 * Short summary of how a circle's moods are balanced, for the combo preview.
 *
 * Surfaces the selfish/generous tension explicitly, because a player cannot make a
 * meaningful mood choice without knowing it exists.
 */
export function describeMoodBalance(emotions: (EmotionId | number)[]): string {
  if (emotions.length < 2) return ''
  const generous = emotions.filter((e) => getPerk(e).generous).length

  if (generous === 0) return 'All racers - big scores, but the group goal is harder'
  if (generous === emotions.length) return 'All supporters - the group goal is easy'
  return `${generous} supporting, ${emotions.length - generous} racing`
}
