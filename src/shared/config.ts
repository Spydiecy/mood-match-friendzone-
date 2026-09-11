/**
 * Mood Match - central tuning constants.
 *
 * Every gameplay number lives here so the server and the client can never
 * disagree about rules, and so balance can be tweaked in one place.
 *
 * This module is imported by BOTH the headless server and the client, so it
 * must stay free of any rendering, UI or server-only imports.
 */

/** Scene layout ------------------------------------------------------------ */

/** Scene is 2x2 parcels => 32m x 32m. Centre of the plaza. */
export const PLAZA_CENTER = { x: 16, y: 0, z: 16 }

/**
 * World positions of the three Mood Circle pads.
 * Kept in sync with `assets/scene/main.composite` (MoodPad_A/B/C).
 * The server uses these to decide which pad a player is standing on.
 */
export const PAD_POSITIONS: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: 16.0, y: 0, z: 25.0 }, // A - Squad, north
  { x: 24.56, y: 0, z: 18.78 }, // B - Trio, east
  { x: 21.29, y: 0, z: 8.72 }, // C - Duo, south east
  { x: 10.71, y: 0, z: 8.72 }, // D - Duo, south west
  { x: 7.44, y: 0, z: 18.78 } // E - Trio, west
]

/**
 * Each pad is a different group size, like a lobby playlist.
 *
 * WHY TIERS: with one shared rule, a pad either needed a button (which is what
 * broke - see below) or auto-started at two and a third player could never join
 * in time. Giving each pad a fixed target makes the requirement legible before
 * you step on it, gives bigger groups something to aim for, and guarantees a pair
 * can always play via the Duo pad however quiet the plaza is.
 *
 * Five rings so there is always one that fits the group you actually have: TWO
 * Duos (much the most likely group size), two Trios and one Squad. Both Duos sit
 * nearest the spawn point on purpose - they are the rings that always work, so
 * they should be the first ones a new arrival walks into.
 *
 * Order matches PAD_POSITIONS.
 */
export const PAD_TIERS: ReadonlyArray<{
  /** Group size that starts a round on this pad. */
  required: number
  /** Short tier name, shown in-world and in the HUD. */
  tier: string
  /** Compass name, for navigation. */
  where: string
}> = [
  { required: 4, tier: 'Squad', where: 'North' },
  { required: 3, tier: 'Trio', where: 'East' },
  { required: 2, tier: 'Duo', where: 'SouthEast' },
  { required: 2, tier: 'Duo', where: 'SouthWest' },
  { required: 3, tier: 'Trio', where: 'West' }
]

/** Players needed on a given pad. */
export function requiredForPad(padIndex: number): number {
  return PAD_TIERS[padIndex]?.required ?? MIN_CIRCLE_PLAYERS
}

/**
 * Radius of a pad in metres. A player must be inside this to join a circle.
 *
 * Kept deliberately tight so that standing on a pad already means "huddled with
 * the others" - the pad geometry is what enforces physical closeness.
 * `PAD_VISUAL_DIAMETER` below keeps the rendered ring in step with it.
 */
export const PAD_RADIUS = 3.0

/** Diameter used for the pad mesh scale in the composite. */
export const PAD_VISUAL_DIAMETER = PAD_RADIUS * 2

/** Circle formation ------------------------------------------------------- */

/**
 * Max distance (metres) between two players for them to count as "together".
 *
 * DERIVED FROM `PAD_RADIUS` ON PURPOSE. These used to be independent constants
 * (3.6 and 3.0), which meant two players standing on opposite edges of the SAME
 * pad passed the pad check and then failed the pairwise proximity check - the
 * server accepted their request and then never seated them, with no message
 * explaining why. Anchoring this to the pad diameter makes that contradiction
 * impossible: anyone on the same pad is always within range.
 *
 * The check is kept rather than removed, because it still catches a player who
 * walks out from under the anchor between the two evaluations.
 */
export const CIRCLE_PROXIMITY = PAD_RADIUS * 2

/**
 * Absolute minimum for a scoring circle. The Duo pad uses exactly this; the other
 * pads require more (see PAD_TIERS).
 */
export const MIN_CIRCLE_PLAYERS = 2

/** Maximum players in one circle. */
export const MAX_CIRCLE_PLAYERS = 4

/**
 * How long a player must stand still on a pad before they count toward filling it.
 *
 * Small, but not zero: it stops someone who is merely walking across a pad from
 * being yanked into a round.
 *
 * This REPLACED a "tap Form Circle to become ready" flag, which was the cause of
 * circles never starting. That flag required every member to have tapped AND for
 * all their flags to be alive simultaneously within a 6-second window, so a pair
 * who tapped more than six seconds apart - or where only one person found the
 * button - simply never matched, with nothing on screen explaining why. Presence
 * is now the only requirement.
 */
export const PAD_DWELL_MS = 700

/** Mini-games ------------------------------------------------------------- */

/** Every mini-game lasts exactly this long. */
export const MINIGAME_DURATION_MS = 10_000

/** Short countdown between "circle formed" and the mini-game starting. */
export const COUNTDOWN_MS = 3000

/** How long the result panel stays up before the circle dissolves. */
export const RESULT_MS = 5000

/**
 * Rhythm Tap: milliseconds between the FIRST beats of a round.
 *
 * The grid accelerates from here down to `RHYTHM_BEAT_MIN_MS` - see `shared/rhythm.ts`.
 * A fixed metronome was solvable in two beats and then ran itself, so the opening gap
 * only has to be wide enough to teach the tempo.
 */
export const RHYTHM_BEAT_MS = 950

/**
 * Rhythm Tap: milliseconds between the LAST beats of a round.
 *
 * The floor of the ramp. Kept above ~600ms because below that the round stops being a
 * rhythm test and becomes a tapping-speed test, which Tap Race already covers.
 */
export const RHYTHM_BEAT_MIN_MS = 620

/**
 * Rhythm Tap: how far off a beat a tap may be and still count (ms).
 *
 * Must stay well under half the TIGHTEST gap in the ramp, and that has to hold after
 * Calm's tolerance multiplier is applied - otherwise the windows of adjacent beats touch
 * at the fast end of the round, every instant counts as on-beat, and mashing scores as
 * well as playing.
 *
 * This is what pushed the value down from 260: at the ramp's floor the gap is ~657ms, so
 * the half-gap is ~328ms, and a Calm player's 1.6x multiplier turned 260 into 416 - a
 * window wider than the space between beats. `check-logic` asserts the margin including
 * the multiplier.
 */
export const RHYTHM_TOLERANCE_MS = 195

/** Rhythm Tap: share of possible beats the group must hit to succeed. */
export const RHYTHM_SUCCESS_RATIO = 0.68

/** Hold Zones: milliseconds of *everyone holding at once* needed to succeed. */
export const HOLD_REQUIRED_MS = 7200

/**
 * Hold Zones: credit deducted from the group total when the chain breaks.
 *
 * Without a penalty the optimal strategy was to release whenever holding got boring
 * and re-grab later; the total only ever went up, so nothing was lost. Losing a slice
 * of progress makes an early release actually cost something, which is what turns the
 * round into the "nobody let go" moment it is meant to be.
 */
export const HOLD_BREAK_PENALTY_MS = 400

/**
 * Hold Zones: how much time a member must hold to earn one scoring point.
 *
 * Hold Zones used to credit `dtMs / 100` per tick, which meant its score was a
 * CONTINUOUS quantity - and every mood perk in the game is defined over DISCRETE
 * actions ("every 2nd point counts double", "every 4th point gives +1 to everyone").
 * A continuous drip has no 2nd or 4th point, so no perk did anything at all here: your
 * mood was pure decoration for the whole round.
 *
 * Half a second gives about twenty scoring actions across a full hold, which is enough
 * cycles for even Love's every-4th interval to fire several times.
 */
export const HOLD_SCORE_INTERVAL_MS = 500

/** Perks ------------------------------------------------------------------ */

/**
 * How far behind the busiest member a player may fall and still receive perk gifts.
 *
 * The generous moods (Joy, Love) donate to members who are "active". Activity used to
 * mean "has scored at least once this round", which was strong enough while a round held
 * about a dozen scoring actions. Hold Zones now holds roughly twenty, and under the old
 * test a partner who tapped their zone once in the first second stayed eligible for the
 * remaining nineteen intervals - collecting enough charity to tie for first having
 * played almost none of the round.
 *
 * Counted in scoring ACTIONS rather than milliseconds so the same number means the same
 * thing in a four-action round and a thirty-action one.
 */
export const PERK_GIFT_ACTIVE_GAP = 4

/**
 * Hold Zones: how often a holding client re-asserts its hold.
 *
 * `onMouseUp` can be missed if a thumb slides off the button, so a hold is a
 * heartbeat rather than a latched state. Silence means released.
 */
export const HOLD_KEEPALIVE_MS = 350

/**
 * Hold Zones: the server drops a hold it has not heard from in this long.
 * Comfortably more than two keepalive intervals so ordinary jitter never
 * flickers a legitimate hold off.
 */
export const HOLD_EXPIRY_MS = 900

/** Color Match: how many steps in the sequence. */
export const COLOR_SEQUENCE_LENGTH = 6

/**
 * Color Match: how long the sequence stays visible at the start of the round.
 *
 * Shared rather than client-only so `check-logic` can assert that the reveal plus the
 * time needed to tap every step still fits inside `MINIGAME_DURATION_MS`. Lengthening
 * the sequence without shortening the reveal is exactly the change that would quietly
 * make the round unwinnable.
 */
export const SEQUENCE_REVEAL_MS = 2200

/** Color Match: how many distinct colors the pads offer. */
export const COLOR_PALETTE_SIZE = 5

/**
 * Color Match: a wrong tap knocks the group back this many steps.
 *
 * Previously a mistake only cleared that step's partial progress, so the sequence could
 * be brute-forced by tapping every pad at every step. Losing ground makes reading the
 * reveal the cheaper option.
 */
export const COLOR_MISTAKE_SETBACK = 1

/** Sync Tap: how long the marker takes to sweep across and back, in ms. */
export const SYNC_SWEEP_MS = 2000

/**
 * Sync Tap: half-width of the target zone, as a fraction of the bar.
 * 0.16 means the middle ~32% of the sweep counts.
 */
export const SYNC_ZONE_HALF_WIDTH = 0.16

/**
 * Sync Tap: how close together every member's tap must land to count as one sync.
 * Generous enough to be achievable over real network latency, tight enough that it
 * cannot be hit by accident.
 */
export const SYNC_WINDOW_MS = 550

/** Sync Tap: successful group syncs needed to clear the round. */
export const SYNC_TARGET = 4

/**
 * Sync Tap: sweep duration at the END of the round, in ms.
 *
 * The sweep accelerates from `SYNC_SWEEP_MS` down to this. The zone stays a fixed
 * fraction of the bar, so a faster sweep means less real time inside it - the round
 * tightens without the target ever visibly changing size, which keeps it readable.
 *
 * Ramped over ELAPSED TIME rather than per sync achieved. Per-sync was the first
 * design and had to go: the marker is drawn from a pure function of `startsAt` and
 * `now`, so changing the speed mid-round on an event would teleport the marker to
 * whatever position the new formula produced at that instant. Ramping on time keeps
 * the function pure and the motion continuous.
 */
export const SYNC_SWEEP_MIN_MS = 1150

/** Tap Race: taps needed to win the race. */
export const TAP_RACE_TARGET = 30

/**
 * Reaction: how many cues fire in a round.
 *
 * Sized so the WORST case fits the round: 4 cues x 1400ms max wait = 5.6s of waiting
 * plus reaction time, inside a 10s round. Four cues rather than three because three
 * left the round decided by a single lucky twitch - a fourth gives a slower player a
 * real chance to come back, and gives everyone something to do in the last two seconds.
 *
 * This was 4 cues x 2200ms once before and had to be cut to 3: the tail of that delay
 * distribution could not be cleared even with perfect play, which made the round
 * unwinnable through no fault of the players. Going back to 4 is only safe because the
 * max delay came down with it. `check-logic` asserts the fit.
 */
export const REACTION_CUES = 4

/** Reaction: shortest and longest wait before a cue fires, in ms. */
export const REACTION_MIN_DELAY_MS = 550
export const REACTION_MAX_DELAY_MS = 1400

/**
 * Reaction: abandon a live cue nobody claims after this long.
 *
 * Needed because lockouts now persist into a live cue, so every member can be locked
 * out at once - without this the cue would stay green and unclaimable for the rest of
 * the round.
 */
export const CUE_EXPIRY_MS = 2500

/**
 * Reaction: how long after a cue is claimed a rival's tap is still forgiven.
 *
 * The claim has to travel back to the other clients, so for about one round-trip they
 * are all still looking at a green plate in perfectly good faith. A tap in that window
 * is a lost race, not a false start, and treating it as a false start was expensive:
 * the early-tap lockout survives into the NEXT cue, so losing one cue by a hair silently
 * cost the player the following cue too.
 *
 * Comfortably over one `PROGRESS_PUSH_MS`, since the server now forces a push the moment
 * a cue is claimed, but short enough that it cannot hide a genuine early tap.
 */
export const CUE_GRACE_MS = 400

/**
 * Placement -------------------------------------------------------------------
 *
 * THIS IS WHAT MAKES A ROUND A GAME. Circles are cooperative to FORM - you cannot
 * play at all without other people - but inside a round players compete, and whoever
 * performs best takes the biggest share. Purely shared outcomes gave nobody a reason
 * to try hard.
 *
 * WHY THIS REPLACED A FIXED [16, 9, 5, 2] TABLE. Winning was worth almost nothing. A
 * real duo round played out as 46 points for the winner and 39 for the loser: of that
 * 46, thirty points were the shared base and combo, and the entire reward for winning
 * was the 7-point gap between first and second. Two players reported it and both were
 * right - there was no point in trying to win.
 *
 * Two things are fixed here.
 *
 * 1. The gap is now wide enough to chase. Winning a duo is worth `PLACEMENT_WIN_BASE`
 *    against `PLACEMENT_LAST` for losing, so the same round becomes 60 against 34.
 *
 * 2. The prize SCALES WITH THE CIRCLE. Beating three people is a bigger achievement
 *    than beating one, so a Squad winner takes more than a Duo winner. That also gives
 *    the Trio and Squad pads a competitive reason to exist, not just a bigger
 *    group-size bonus.
 *
 * Last place is still deliberately non-zero. A beginner dropped into a circle with a
 * regular should not walk away with nothing, or they do not come back.
 */

/** What the winner of a two-player circle takes. */
export const PLACEMENT_WIN_BASE = 30

/** Added to the winner's prize for each rival beyond the first. */
export const PLACEMENT_WIN_PER_RIVAL = 12

/** What the player in last place takes, whatever the circle size. */
export const PLACEMENT_LAST = 4

/**
 * The winner's prize in a circle of `memberCount`.
 *
 * Duo 30, Trio 42, Squad 54.
 */
export function winnerPrize(memberCount: number): number {
  const rivals = Math.max(1, Math.floor(memberCount) - 1)
  return PLACEMENT_WIN_BASE + PLACEMENT_WIN_PER_RIVAL * (rivals - 1)
}

/**
 * The prize attached to one finishing position, before ties are settled.
 *
 * A straight line from the winner's prize down to `PLACEMENT_LAST`. Linear rather than
 * steep-at-the-top on purpose: every position has to be worth moving up from, or the
 * players in the middle of a Squad have nothing to play for.
 *
 * Prefer `placementBonus`, which also handles ties. This is exported for the checks and
 * for the "up to N points" preview.
 */
export function placementSlice(rank: number, memberCount: number): number {
  const members = Math.floor(memberCount)
  if (members <= 1) return 0

  const winner = winnerPrize(members)
  const clamped = Math.max(0, Math.min(Math.floor(rank), members - 1))
  const step = (winner - PLACEMENT_LAST) / (members - 1)

  return Math.round(winner - step * clamped)
}

/**
 * Placement bonus for a finishing position, with tied players splitting their slices.
 *
 * `tiedCount` is how many members share this rank, including this one.
 *
 * TIES SPLIT THE POT rather than everyone taking the higher slice. That is the rule
 * that makes a dead heat feel honest: two players who tie for first in a duo take
 * (30 + 4) / 2 = 17 each, not 30 each. Paying both the winner's slice was the other
 * half of "nothing is competitive" - a tie was as good as a win, so in Tap Race, where
 * two players often end on the same score, there was no incentive to be first.
 *
 * It also means a round that genuinely ends level pays a fair middling amount with no
 * special case anywhere, and gives no way for a round with no clear winner to pay
 * everybody like a winner.
 *
 * ONE KNOWN ODDITY, accepted deliberately. Because a wide tie averages the whole ladder,
 * an all-square Squad pays 29 while an outright second pays 37 - so a player who cannot
 * win outright would rather be beaten cleanly than draw with everyone. Reaching that
 * situation requires the other three to draw with you as well, so it is not something a
 * player can engineer, and the alternatives (paying every tied player the top slice, or
 * redistributing a fixed pot) each reintroduce a worse problem: the first makes a draw as
 * good as a win, which is what this rule exists to stop.
 */
export function placementBonus(rank: number, memberCount: number, tiedCount = 1): number {
  const members = Math.floor(memberCount)
  if (members <= 1) return 0
  if (rank < 0) return 0

  const first = Math.max(0, Math.min(Math.floor(rank), members - 1))
  const shared = Math.max(1, Math.min(Math.floor(tiedCount), members - first))

  let total = 0
  for (let i = 0; i < shared; i++) total += placementSlice(first + i, members)

  return Math.round(total / shared)
}

/** Scoring --------------------------------------------------------------- */

/** Points for forming a valid circle at all. */
export const POINTS_BASE = 10

/**
 * Extra points per member beyond the second.
 *
 * Gives the Trio and Squad pads a reason to exist beyond flavour: a bigger circle
 * is harder to assemble, so it should pay more. A Squad round is +10 before any
 * multiplier.
 */
export const POINTS_PER_EXTRA_MEMBER = 5

/** Bonus for a recognised emotion combination. */
export const POINTS_COMBO = 20

/** Bonus when the group clears the mini-game. */
export const POINTS_MINIGAME = 30

/** Featured emotion of the day doubles a player's payout. */
export const FEATURED_MULTIPLIER = 2

/** Streak adds 5% per consecutive day, capped at +50%. */
export const STREAK_STEP = 0.05
export const STREAK_MAX_BONUS = 0.5

/** Successful circles with one emotion needed to unlock its skin. */
export const SKIN_UNLOCK_REQUIREMENT = 5

/** How many players the leaderboard shows. */
export const LEADERBOARD_SIZE = 10

/** Networking ------------------------------------------------------------ */

/** Server writes a heartbeat this often so clients can detect a cold start. */
export const HEARTBEAT_INTERVAL_MS = 2000

/** Treat the server as dead if no heartbeat tick was observed in this long. */
export const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 3

/** Server pushes circle progress at most this often (throttle). */
export const PROGRESS_PUSH_MS = 150

/** Debounce for persisting scores to Storage (checkpoint writes only). */
export const STORAGE_FLUSH_MS = 20_000

/** Storage keys ---------------------------------------------------------- */

export const STORAGE_KEY_LEADERBOARD = 'moodmatch:leaderboard:v1'
export const STORAGE_KEY_ROTATION = 'moodmatch:rotation:v1'
export const STORAGE_PLAYER_KEY = 'moodmatch:profile:v1'

/** Sharing --------------------------------------------------------------- */

/** Base URL used by the Invite Friends button. Overridden by INVITE_BASE_URL. */
export const DEFAULT_INVITE_URL = 'https://decentraland.org/jump/?realm='
