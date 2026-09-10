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
  { x: 16, y: 0, z: 23 }, // Pad A - north
  { x: 9.9, y: 0, z: 12.5 }, // Pad B - south west
  { x: 22.1, y: 0, z: 12.5 } // Pad C - south east
]

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

/** Minimum players needed for a real (scoring) circle. */
export const MIN_CIRCLE_PLAYERS = 2

/** Maximum players in one circle. */
export const MAX_CIRCLE_PLAYERS = 4

/**
 * How long a "Ready" flag stays hot after a player taps Form Circle.
 * Lets two players tap a couple of seconds apart and still match up.
 */
export const READY_WINDOW_MS = 6000

/** Mini-games ------------------------------------------------------------- */

/** Every mini-game lasts exactly this long. */
export const MINIGAME_DURATION_MS = 10_000

/** Short countdown between "circle formed" and the mini-game starting. */
export const COUNTDOWN_MS = 3000

/** How long the result panel stays up before the circle dissolves. */
export const RESULT_MS = 5000

/** Rhythm Tap: milliseconds between beats. */
export const RHYTHM_BEAT_MS = 1000

/** Rhythm Tap: how far off a beat a tap may be and still count (ms). */
export const RHYTHM_TOLERANCE_MS = 320

/** Rhythm Tap: share of possible beats the group must hit to succeed. */
export const RHYTHM_SUCCESS_RATIO = 0.6

/** Hold Zones: milliseconds of *everyone holding at once* needed to succeed. */
export const HOLD_REQUIRED_MS = 6500

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
export const COLOR_SEQUENCE_LENGTH = 4

/** Scoring --------------------------------------------------------------- */

/** Points for forming a valid circle at all. */
export const POINTS_BASE = 10

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
