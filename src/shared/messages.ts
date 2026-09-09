/**
 * Mood Match - client/server message protocol.
 *
 * `registerMessages()` defines a component internally, so like `schemas.ts` this
 * module must be imported STATICALLY from `src/index.ts`. A dynamic `import()`
 * would run after the engine seals and throw "Engine is already sealed".
 *
 * Every payload must be a `Schemas.Map` - plain object literals fail binary
 * serialization. All of these are far below the 13 KB per-message transport cap.
 */

import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Severity hint for the transient notice toast.
 * 0 = info, 1 = success, 2 = warning.
 */
export enum NoticeTone {
  Info = 0,
  Success = 1,
  Warning = 2
}

/** Machine-readable reasons a Form Circle request can be refused. */
export enum RefusalCode {
  None = 0,
  NotOnPad = 1,
  NeedMorePlayers = 2,
  PadBusy = 3,
  AlreadyInCircle = 4,
  TooFarApart = 5
}

export const MoodMessages = {
  /* ---------------------------------------------------------------- client -> server */

  /** Sent once the client is synced, and again if the player rerolls. */
  hello: Schemas.Map({
    emotion: Schemas.Int,
    displayName: Schemas.String
  }),

  /** Player rerolled their emotion at the Mood Font. */
  setEmotion: Schemas.Map({
    emotion: Schemas.Int
  }),

  /**
   * Player tapped "Form Circle" while standing on a pad.
   * The server validates the position itself - the pad index is only a hint.
   */
  formCircle: Schemas.Map({
    padIndex: Schemas.Int
  }),

  /** Player backed out of waiting on a pad. */
  cancelReady: Schemas.Map({
    padIndex: Schemas.Int
  }),

  /**
   * A mini-game input. `kind` is a `GameInputKind`; `value` carries the beat
   * index (Rhythm Tap) or the tapped EmotionId colour (Color Match).
   */
  gameInput: Schemas.Map({
    circleId: Schemas.Int,
    kind: Schemas.Int,
    value: Schemas.Int
  }),

  /* ---------------------------------------------------------------- server -> client */

  /** Transient toast. `code` lets the client pick a localised string if needed. */
  notice: Schemas.Map({
    code: Schemas.Int,
    text: Schemas.String,
    tone: Schemas.Int
  }),

  /**
   * A circle just formed. Full state arrives via the synced `CircleCore`
   * component; this event exists so clients can fire a chime and a particle
   * burst at the right instant rather than polling for a phase change.
   */
  circleFormed: Schemas.Map({
    circleId: Schemas.Int,
    padIndex: Schemas.Int,
    memberCount: Schemas.Int,
    game: Schemas.Int
  }),

  /** A circle finished. Again a cue for audio and particles. */
  circleResolved: Schemas.Map({
    circleId: Schemas.Int,
    success: Schemas.Boolean
  }),

  /**
   * Per-player payout, sent only to that player, itemised so the result panel
   * can show the same lines the server actually used.
   */
  payout: Schemas.Map({
    circleId: Schemas.Int,
    base: Schemas.Int,
    combo: Schemas.Int,
    miniGame: Schemas.Int,
    featuredMultiplier: Schemas.Int,
    streakBonus: Schemas.Float,
    total: Schemas.Int,
    newScore: Schemas.Int,
    rank: Schemas.Int,
    /** EmotionId whose skin this circle just unlocked, or -1. */
    unlockedSkin: Schemas.Int
  }),

  /**
   * Sent right after `hello`, and whenever the server refreshes a profile from
   * Storage. Lets the client reconcile local progress with the durable copy.
   */
  profileSync: Schemas.Map({
    score: Schemas.Int,
    circles: Schemas.Int,
    streakDays: Schemas.Int,
    unlockedMask: Schemas.Int,
    rank: Schemas.Int,
    /** True when this is the player's first circle-session of a new UTC day. */
    newDay: Schemas.Boolean
  })
}

/**
 * The typed room shared by both sides. Registered at module load; `send` calls
 * before the room is ready are queued by the SDK and flushed on connect.
 */
export const room = registerMessages(MoodMessages)
