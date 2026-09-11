/**
 * Mood Match - synced ECS components.
 *
 * All of these are written ONLY by the headless Multiplayer Server. Clients read
 * them to render, and ask for changes through messages (see `messages.ts`).
 *
 * Two rules from the SDK that this file is built around:
 *
 *  1. `engine.defineComponent` must run during initial module load, before the
 *     engine seals. So this module is imported statically from `src/index.ts`
 *     and never through a dynamic `import()`.
 *  2. `validateBeforeChange` only means anything on the server, so every call
 *     sits inside an `isServer()` guard (see `protectComponents()` below).
 */

import { Schemas, engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/**
 * Stable sync ids for the scene's singleton entities.
 *
 * Only singletons get explicit ids. Per-player and per-circle entities use
 * auto-allocated ids and are matched on a payload field instead, because an id
 * derived from a wallet address can collide and throws on reconnect.
 */
export enum SyncId {
  Heartbeat = 1,
  WorldState = 2,
  Leaderboard = 3,
  /**
   * One persistent circle entity per pad, cycling through phases forever.
   * Reusing three fixed entities instead of creating and destroying one per
   * round avoids the "id provided is already in use" failure that a same-frame
   * remove-and-recreate triggers, and keeps late joiners in sync.
   */
  PadCircle0 = 10,
  PadCircle1 = 11,
  PadCircle2 = 12,
  PadCircle3 = 13,
  PadCircle4 = 14
}

/** Sync id for a given pad index. */
export function padCircleSyncId(padIndex: number): number {
  return SyncId.PadCircle0 + padIndex
}

/**
 * Server liveness pulse. Deliberately its own component with a single field so
 * the 2-second heartbeat never re-sends the leaderboard or world state.
 */
export const ServerHeartbeat = engine.defineComponent('moodmatch::ServerHeartbeat', {
  /** `Date.now()` on the server. Int64 because 13-digit values corrupt in Int. */
  tick: Schemas.Int64
})

/** Slow-changing world state: the daily rotation and some live counters. */
export const WorldState = engine.defineComponent('moodmatch::WorldState', {
  /** EmotionId that pays double today. */
  featuredEmotion: Schemas.Int,
  /** UTC day index the featured emotion was computed for. */
  dayIndex: Schemas.Int,
  /** Players the server currently sees in the scene. */
  playersOnline: Schemas.Int,
  /** Circles completed since this server instance woke up. */
  circlesThisSession: Schemas.Int,
  /** All-time circles completed, restored from Storage. */
  circlesAllTime: Schemas.Int
})

/** Top-N leaderboard, rebuilt by the server whenever a circle resolves. */
export const Leaderboard = engine.defineComponent('moodmatch::Leaderboard', {
  entries: Schemas.Array(
    Schemas.Map({
      address: Schemas.String,
      name: Schemas.String,
      score: Schemas.Int,
      circles: Schemas.Int
    })
  ),
  updatedAt: Schemas.Int64
})

/**
 * One per connected player, created by the server.
 *
 * Uses an auto-allocated sync id; readers match on `playerId`, never on the
 * network id, so a reconnecting player cannot collide with their own old entity.
 */
export const PlayerStat = engine.defineComponent('moodmatch::PlayerStat', {
  /** Lower-cased wallet address. */
  playerId: Schemas.String,
  displayName: Schemas.String,
  /** Current EmotionId. */
  emotion: Schemas.Int,
  score: Schemas.Int,
  circles: Schemas.Int,
  streakDays: Schemas.Int,
  /** Bitmask of unlocked emotion skins. */
  unlockedMask: Schemas.Int,
  /** True while the player is waiting on a pad for others to join. */
  ready: Schemas.Boolean,
  /** Which pad they are waiting on, or -1. */
  readyPad: Schemas.Int,
  /** When they tapped Form Circle, for the ready-window timeout. */
  readyAt: Schemas.Int64,
  /** Rank on the live leaderboard, 1-based. 0 means unranked. */
  rank: Schemas.Int
})

/**
 * The stable half of an active Mood Circle: who is in it, what they are playing.
 * Written once when the circle forms and then only on phase changes, so the
 * fast progress updates below never re-send the member list.
 */
export const CircleCore = engine.defineComponent('moodmatch::CircleCore', {
  /** Monotonic id, unique for the lifetime of the server instance. */
  circleId: Schemas.Int,
  /** Index into PAD_POSITIONS. */
  padIndex: Schemas.Int,
  /**
   * Group size this pad needs to start a round (its tier).
   * Published rather than derived so a client can render the requirement without
   * having to share the tier table.
   */
  required: Schemas.Int,
  /** A `CirclePhase` value. */
  phase: Schemas.Int,
  /** A `MiniGameKind` value. */
  game: Schemas.Int,
  /** Lower-cased wallet addresses, in a stable order. */
  members: Schemas.Array(Schemas.String),
  /** Parallel to `members`: each member's EmotionId. */
  memberEmotions: Schemas.Array(Schemas.Int),
  /** Parallel to `members`: display names for the UI. */
  memberNames: Schemas.Array(Schemas.String),
  /** Server clock at which the mini-game begins. */
  startsAt: Schemas.Int64,
  /** Server clock at which the mini-game ends. */
  endsAt: Schemas.Int64,
  /** Combo id, empty when none matched. */
  comboId: Schemas.String,
  comboName: Schemas.String,
  comboBonus: Schemas.Int,
  /** Color Match only: the EmotionId colour sequence to reproduce. */
  sequence: Schemas.Array(Schemas.Int)
})

/**
 * The fast-changing half of an active Mood Circle. Kept separate from
 * `CircleCore` so a progress tick is a few bytes instead of the whole roster.
 */
export const CircleProgress = engine.defineComponent('moodmatch::CircleProgress', {
  /** Mirrors `CircleCore.circleId` so late readers can pair them up. */
  circleId: Schemas.Int,
  /** 0..1 completion of the current mini-game. */
  progress: Schemas.Float,
  /** Rhythm Tap: successful group hits so far. */
  hits: Schemas.Int,
  /** Rhythm Tap: beats elapsed. */
  beatIndex: Schemas.Int,
  /** Hold Zones: bitmask of member indices currently holding. */
  holdMask: Schemas.Int,
  /** Color Match: how many sequence steps are done. */
  step: Schemas.Int,
  /** Color Match: bitmask of members who have confirmed the current step. */
  stepMask: Schemas.Int,
  /** True once the round is judged and `points` is meaningful. */
  resolved: Schemas.Boolean,
  /** Whether the group cleared the mini-game. */
  success: Schemas.Boolean,
  /** Points each member earned, parallel to `CircleCore.members`. */
  points: Schemas.Array(Schemas.Int)
})

/**
 * Locks every synced component to server-only writes.
 *
 * MUST be called from inside an `isServer()` branch: `validateBeforeChange` is
 * meaningless on a client and logs errors there. The callback receives the
 * sender's address, which equals AUTH_SERVER_PEER_ID for the server's own
 * writes - anything else is a client trying to forge state and is rejected.
 */
export function protectComponents(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }): boolean =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  ServerHeartbeat.validateBeforeChange(serverOnly)
  WorldState.validateBeforeChange(serverOnly)
  Leaderboard.validateBeforeChange(serverOnly)
  PlayerStat.validateBeforeChange(serverOnly)
  CircleCore.validateBeforeChange(serverOnly)
  CircleProgress.validateBeforeChange(serverOnly)
}
