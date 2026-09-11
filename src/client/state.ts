/**
 * Mood Match - client-side state store.
 *
 * The React-ECS renderer re-renders every frame and React hooks are NOT
 * available, so UI state lives in this module-level object. Game systems mutate
 * it; the UI reads it. That is the SDK's prescribed pattern.
 *
 * Nothing here is authoritative. Scores, circles and the leaderboard all arrive
 * from the server; these fields are a local mirror used for rendering.
 */

import { EmotionId, MiniGameKind } from '../shared/types'
import { CirclePhase } from '../shared/types'

/** Which full-screen panel is showing. */
export type Screen = 'hud' | 'tutorial' | 'leaderboard' | 'info' | 'practicePick'

/** A transient toast. */
export interface Notice {
  text: string
  /** A `NoticeTone` value. */
  tone: number
  /** Local timestamp after which the toast hides. */
  until: number
}

/** The itemised payout panel shown after a round. */
export interface PayoutView {
  base: number
  combo: number
  miniGame: number
  /** Bonus for circle size. */
  groupSize: number
  /** Bonus for finishing position. */
  placement: number
  /** Zero-based finishing position. */
  finishRank: number
  /** How many players shared that position, including this one. 1 for an outright. */
  tiedAtRank: number
  /** How many players were in the circle. */
  memberCount: number
  featuredMultiplier: number
  streakBonus: number
  total: number
  newScore: number
  rank: number
  /** EmotionId whose skin just unlocked, or -1. */
  unlockedSkin: number
  /** Local timestamp after which the panel hides. */
  until: number
}

/** A read-only view of one pad, derived from synced components each frame. */
export interface PadView {
  padIndex: number
  /** Group size this pad needs to start a round. */
  required: number
  circleId: number
  phase: CirclePhase
  game: MiniGameKind
  members: string[]
  memberNames: string[]
  memberEmotions: EmotionId[]
  /** Server clock at which play begins. */
  startsAt: number
  endsAt: number
  comboName: string
  comboBonus: number
  sequence: EmotionId[]
  progress: number
  hits: number
  holdMask: number
  step: number
  stepMask: number
  resolved: boolean
  success: boolean
  points: number[]
  /** Live per-member mini-game performance, parallel to `members`. */
  memberScore: number[]
  /**
   * Tap Race only: RAW taps per member, parallel to `members`. Empty otherwise.
   *
   * The race is run and judged in raw taps, so the race has to be DISPLAYED in raw
   * taps. `memberScore` is perk-weighted and does not track the target.
   */
  memberTaps: number[]
  /**
   * Each member's current finishing position, zero-based, parallel to `members`.
   * The server's own ordering - never recompute it from `memberScore`.
   */
  memberRank: number[]
  /** Reaction: server clock of a cue that has already fired, or 0. */
  cueAt: number
  /** True when the local player is a member. */
  mine: boolean
  /** The local player's index inside `members`, or -1. */
  myIndex: number
}

/** One leaderboard row as rendered. */
export interface BoardRow {
  address: string
  name: string
  score: number
  circles: number
}

/** Everything the UI needs. */
export interface ClientState {
  /* Identity ------------------------------------------------------------- */
  myAddress: string
  myName: string
  emotion: EmotionId

  /* Profile mirror (server-authoritative) --------------------------------- */
  score: number
  circles: number
  streakDays: number
  unlockedMask: number
  rank: number
  /** True when the server reported this as the first session of a new day. */
  newDayBanner: boolean
  /**
   * Set once the durable profile has arrived from the server.
   *
   * The tutorial gates on this rather than on `circles === 0`, because `circles`
   * starts at zero and only fills in after sync - so a returning player used to
   * see the tutorial flash, and if the server never woke it stayed up for good
   * behind a full-screen scrim.
   */
  profileLoaded: boolean

  /* World ---------------------------------------------------------------- */
  featuredEmotion: EmotionId
  dayIndex: number
  playersOnline: number
  circlesAllTime: number

  /* Connection ----------------------------------------------------------- */
  /** CRDT room connected. Transient, usually resolves in about a second. */
  roomReady: boolean
  /**
   * Server heartbeat observed recently. Distinct from `roomReady`: a cold start
   * can take 15s or more and may never resolve, so this drives a visible
   * "waking up" message rather than silent buffering.
   */
  serverAlive: boolean
  /** Local time at which we last saw the heartbeat value change. */
  lastHeartbeatSeenAt: number
  /** Previous heartbeat value, to detect an actual change. */
  lastHeartbeatValue: number

  /* Local player position awareness -------------------------------------- */
  /** Index of the pad the player is standing on, or -1. */
  nearestPad: number
  /** Distance in metres to the nearest pad centre. */
  nearestPadDistance: number
  /** True when the player has asked to form a circle and is waiting. */
  waiting: boolean
  /**
   * The server's own `PlayerStat.ready` flag.
   *
   * `waiting` used to be derived purely from the published pad roster, which
   * could not distinguish "the server refused me" from "the server accepted me
   * but has not seated me yet" - both looked like nothing happened. Reading the
   * server's acknowledgement directly makes the waiting state honest.
   */
  serverReady: boolean

  /* Circles -------------------------------------------------------------- */
  pads: PadView[]
  /** The pad view the local player is a member of, or null. */
  myPad: PadView | null

  /* Leaderboard ---------------------------------------------------------- */
  board: BoardRow[]
  boardUpdatedAt: number

  /* UI ------------------------------------------------------------------- */
  screen: Screen
  tutorialStep: number
  /** Set once the player dismissed or completed the tutorial this session. */
  tutorialDone: boolean
  notice: Notice | null
  payout: PayoutView | null
  muted: boolean
  /** Shows the copied-link confirmation after tapping Invite. */
  inviteShownUntil: number

  /* Practice (solo, unscored) -------------------------------------------- */
  practice: PracticeState | null
}

/**
 * Solo practice run.
 *
 * A judge or a first-time visitor who arrives alone still needs to understand
 * the loop in 30 seconds. Practice replays a mini-game locally with no server
 * involvement and awards NOTHING - it is a trainer, not a single-player mode, so
 * the leaderboard stays purely social.
 */
export interface PracticeState {
  game: MiniGameKind
  /** Local clock at which the mini-game began. */
  startsAt: number
  endsAt: number
  progress: number
  hits: number
  holding: boolean
  allHoldMs: number
  step: number
  /** Sync Tap: completed syncs. */
  syncs: number
  /** Local performance score, mirroring the server's per-member score. */
  memberScore: number
  /** Reaction: local clock of a live cue, or 0. */
  cueAt: number
  /** Reaction: cues completed. */
  cuesDone: number
  sequence: EmotionId[]
  finished: boolean
  success: boolean
}

/** The single live state object. Mutated in place; never reassigned. */
export const state: ClientState = {
  myAddress: '',
  myName: '',
  emotion: EmotionId.Calm,

  score: 0,
  circles: 0,
  streakDays: 1,
  unlockedMask: 0,
  rank: 0,
  newDayBanner: false,
  profileLoaded: false,

  featuredEmotion: EmotionId.Calm,
  dayIndex: 0,
  playersOnline: 0,
  circlesAllTime: 0,

  roomReady: false,
  serverAlive: false,
  lastHeartbeatSeenAt: 0,
  lastHeartbeatValue: 0,

  nearestPad: -1,
  nearestPadDistance: Number.MAX_VALUE,
  waiting: false,
  serverReady: false,

  pads: [],
  myPad: null,

  board: [],
  boardUpdatedAt: 0,

  screen: 'hud',
  tutorialStep: 0,
  tutorialDone: false,
  notice: null,
  payout: null,
  muted: false,
  inviteShownUntil: 0,

  practice: null
}

/** Shows a toast for a few seconds. */
export function showNotice(text: string, tone: number, durationMs = 3200): void {
  state.notice = { text, tone, until: Date.now() + durationMs }
}

/** Clears expired transient UI. Called once per frame. */
export function expireTransients(now: number): void {
  if (state.notice && now >= state.notice.until) state.notice = null
  if (state.payout && now >= state.payout.until) state.payout = null
}
