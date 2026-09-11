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

  /**
   * "I am waiting here, come and play." Broadcast to everyone in the World.
   *
   * This is the scene's answer to the cold-start problem: one player alone can
   * still do something useful, which is summon the others. The server rate-limits
   * it so it cannot become spam.
   */
  pingPlaza: Schemas.Map({
    padIndex: Schemas.Int
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
   * Somebody is waiting and wants company. Relayed to every client by the server
   * so it cannot be forged or spammed by a client talking to its peers directly.
   */
  plazaPing: Schemas.Map({
    padIndex: Schemas.Int,
    /**
     * Lower-cased wallet address of the caller.
     *
     * Present so a client can filter out its OWN ping reliably. Filtering on the
     * display name instead would also swallow the toast for any other player who
     * happened to share a name, which is common among guests.
     */
    fromAddress: Schemas.String,
    fromName: Schemas.String,
    /** The waiting player's EmotionId, so the toast can be colour-coded. */
    emotion: Schemas.Int
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
    /** Bonus for circle size, so a Squad round visibly pays more than a Duo. */
    groupSize: Schemas.Int,
    /** Bonus for finishing position inside the circle. */
    placement: Schemas.Int,
    /** Zero-based finishing position, so the panel can say "1st of 3". */
    finishRank: Schemas.Int,
    /**
     * How many players shared this finishing position, including this one.
     *
     * Needed so the panel can say "Joint 1st" rather than a bare "1st". Tied players
     * split their combined slices, so a two-way tie for first pays noticeably less than
     * an outright win - and a line reading "Finished 1st of 2  +17" next to a rival's
     * "+17" would look like a bug rather than a draw.
     */
    tiedAtRank: Schemas.Int,
    /** How many players were in the circle. */
    memberCount: Schemas.Int,
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
