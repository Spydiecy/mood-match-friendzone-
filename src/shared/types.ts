/**
 * Mood Match - shared type definitions.
 *
 * Imported by both the headless Multiplayer Server and the client, so this file
 * must contain types and plain enums only (no engine or UI imports).
 */

/** The six base emotions. Numeric so they fit in a synced Int field. */
export enum EmotionId {
  Calm = 0,
  Joy = 1,
  Focus = 2,
  Energy = 3,
  Love = 4,
  Curiosity = 5
}

/** Total number of emotions, used for random rolls and bitmasks. */
export const EMOTION_COUNT = 6

/** Which cooperative mini-game a circle is playing. */
export enum MiniGameKind {
  RhythmTap = 0,
  HoldZones = 1,
  ColorMatch = 2,
  /**
   * Everyone taps AT THE SAME TIME while a sweeping marker is in the target zone.
   *
   * The most purely cooperative of the four: an individual cannot make progress at
   * all, because a sync only counts when every member's tap lands inside the same
   * short window. It forces people to count down out loud.
   */
  SyncTap = 3,
  /**
   * Pure speed: hammer the button, first to the target wins.
   * The simplest possible competitive round and instantly understood by anyone.
   */
  TapRace = 4,
  /**
   * Reaction test: the pad flashes GO at an unpredictable moment and the first
   * player to tap takes the point. Tapping early costs you the cue.
   */
  Reaction = 5
}

/** How many mini-games exist, for the server's random pick. */
export const MINIGAME_COUNT = 6

/** Lifecycle of a Mood Circle. */
export enum CirclePhase {
  /** Waiting on the pad for more players. */
  Gathering = 0,
  /** Members locked in, short countdown before play. */
  Countdown = 1,
  /** Mini-game running. */
  Playing = 2,
  /** Result panel showing. */
  Result = 3,
  /** Finished; entity is about to be recycled. */
  Done = 4
}

/** Kinds of input a client can send during a mini-game. */
export enum GameInputKind {
  /** Rhythm Tap: a tap, `value` is the beat index the client aimed at. */
  Tap = 0,
  /** Hold Zones: began holding. */
  HoldStart = 1,
  /** Hold Zones: released. */
  HoldEnd = 2,
  /** Color Match: tapped a colour, `value` is the EmotionId of that colour. */
  ColorTap = 3
}

/** A single leaderboard row. */
export interface LeaderboardEntry {
  address: string
  name: string
  score: number
  circles: number
}

/** A recognised emotion combination. */
export interface ComboDefinition {
  /** Stable id used in messages and analytics. */
  id: string
  /** Player-facing name. ASCII only - see the no-emoji rule in the UI layer. */
  name: string
  /** Short explanation shown in the result panel. */
  blurb: string
  /**
   * Returns true when this combo applies to the given multiset of emotions.
   * Must be deterministic and identical on client and server.
   */
  matches: (emotions: EmotionId[]) => boolean
}

/** Result of evaluating a circle's emotion mix. */
export interface ComboResult {
  /** Empty string when no combo matched. */
  id: string
  name: string
  blurb: string
  bonus: number
}

/** Locally persisted player progress (client-side, best-effort). */
export interface LocalProgress {
  /** Successful circles per emotion, used for skin unlocks. */
  successPerEmotion: number[]
  /** Bitmask of unlocked emotion skins. */
  unlockedMask: number
  /** Consecutive-day streak length. */
  streakDays: number
  /** Day index (UTC days since epoch) of the last session. */
  lastDayIndex: number
  /** True once the player finished or skipped the tutorial. */
  tutorialSeen: boolean
  /** Audio mute preference. */
  muted: boolean
  /** Highest score the client has observed for itself. */
  bestScore: number
}
