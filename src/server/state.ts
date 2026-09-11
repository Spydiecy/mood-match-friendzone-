/**
 * Mood Match - server-side player registry.
 *
 * Live gameplay state lives in memory here; Storage is only touched at
 * checkpoints (see `persistence.ts`). That split matters because the runtime
 * caps in-flight host calls and silently fails Storage writes past the cap, so
 * writing on every score change would lose data.
 *
 * SERVER ONLY. Never imported from client code.
 */

import { Entity, Transform, engine } from '@dcl/sdk/ecs'
import { PlayerStat } from '../shared/schemas'
import { EMOTION_COUNT, EmotionId } from '../shared/types'

/** Everything the server knows about one connected player. */
export interface PlayerRecord {
  /** Lower-cased wallet address. The only identity key used anywhere. */
  address: string
  displayName: string
  /** The synced `PlayerStat` entity for this player, or 0 before it exists. */
  entity: Entity
  emotion: EmotionId
  score: number
  circles: number
  streakDays: number
  /** UTC day index of the player's previous session, for streak maths. */
  lastDayIndex: number
  unlockedMask: number
  /** Successful circles completed while holding each emotion. */
  successPerEmotion: number[]
  /** Display signal: true while standing on a pad. */
  ready: boolean
  /** Pad index they are standing on, or -1. Mirrors `onPad`. */
  readyPad: number
  readyAt: number
  /**
   * Pad the player is currently standing on, or -1.
   *
   * This replaced a tap-driven "ready" flag. Presence is the only requirement to
   * fill a pad now, which is what fixed circles never starting.
   */
  onPad: number
  /** Server clock at which they stepped onto `onPad`, for the dwell check. */
  onPadSince: number
  /** Pad index of the circle they are currently playing, or -1. */
  activePad: number
  /** Set once the durable profile has been read from Storage. */
  loaded: boolean
  /** Set when in-memory state has diverged from Storage. */
  dirty: boolean
  /** Leaderboard rank, 1-based; 0 means unranked. */
  rank: number
}

/** Live players, keyed by lower-cased address. */
const players = new Map<string, PlayerRecord>()

/** Creates a blank record. Profile fields get filled in from Storage later. */
function blankRecord(address: string): PlayerRecord {
  return {
    address,
    displayName: shortAddress(address),
    entity: 0 as Entity,
    emotion: EmotionId.Calm,
    score: 0,
    circles: 0,
    streakDays: 1,
    lastDayIndex: 0,
    unlockedMask: 0,
    successPerEmotion: new Array<number>(EMOTION_COUNT).fill(0),
    ready: false,
    readyPad: -1,
    readyAt: 0,
    onPad: -1,
    onPadSince: 0,
    activePad: -1,
    loaded: false,
    dirty: false,
    rank: 0
  }
}

/** A readable fallback name for players whose profile has not arrived yet. */
export function shortAddress(address: string): string {
  if (address.length <= 10) return address
  return address.slice(0, 6) + '..' + address.slice(-4)
}

/** Normalises an address for use as a key. Addresses are compared lower-cased. */
export function normalizeAddress(address: string): string {
  return (address || '').toLowerCase()
}

/** Returns the record for an address, creating it if this is a new player. */
export function getOrCreatePlayer(address: string): PlayerRecord {
  const key = normalizeAddress(address)
  let record = players.get(key)
  if (!record) {
    record = blankRecord(key)
    players.set(key, record)
  }
  return record
}

/** Returns the record for an address, or undefined. */
export function getPlayerRecord(address: string): PlayerRecord | undefined {
  return players.get(normalizeAddress(address))
}

/** All live records. */
export function allPlayers(): PlayerRecord[] {
  return Array.from(players.values())
}

/** Drops a player from the registry (they left the scene). */
export function removePlayer(address: string): PlayerRecord | undefined {
  const key = normalizeAddress(address)
  const record = players.get(key)
  if (record) players.delete(key)
  return record
}

/**
 * Reads the server-verified position of a player.
 *
 * The server sees the same scene-local metres the client does, so these values
 * compare directly against pad positions with no base-parcel offset maths.
 * Returns undefined when the player has no Transform yet.
 */
export function getPlayerPosition(
  record: PlayerRecord
): { x: number; y: number; z: number } | undefined {
  const avatar = findAvatarEntity(record.address)
  if (avatar === undefined) return undefined
  const transform = Transform.getOrNull(avatar)
  if (!transform) return undefined
  return transform.position
}

/**
 * Maps addresses to their avatar entity. Rebuilt each frame by
 * `refreshAvatarIndex()` because avatar entities are recycled by the runtime.
 */
const avatarIndex = new Map<string, Entity>()

/** Looks up the avatar entity for an address. */
export function findAvatarEntity(address: string): Entity | undefined {
  return avatarIndex.get(normalizeAddress(address))
}

/**
 * Refreshes the address -> avatar entity index from `PlayerIdentityData`.
 * Called once per tick before any proximity check.
 */
export function refreshAvatarIndex(
  identityPairs: Iterable<[Entity, { address: string }]>
): void {
  avatarIndex.clear()
  for (const [entity, identity] of identityPairs) {
    if (!identity.address) continue
    avatarIndex.set(normalizeAddress(identity.address), entity)
  }
}

/**
 * Creates or refreshes the synced `PlayerStat` entity for a record.
 *
 * The sync id is auto-allocated on purpose: an id hashed from the wallet address
 * collides both between players and with the player's own stale entity after a
 * reconnect. Readers match on the `playerId` field instead.
 *
 * `syncPlayerStat` is passed in from `index.ts` so this module never has to
 * import `@dcl/sdk/network` itself.
 */
export function ensurePlayerStatEntity(
  record: PlayerRecord,
  syncPlayerStat: (entity: Entity) => void
): void {
  // A cached handle can go stale on a long-running server when entity slots get
  // recycled, so validate the component still exists before reusing it.
  if (record.entity && PlayerStat.getOrNull(record.entity)) {
    writePlayerStat(record)
    return
  }

  const entity = engine.addEntity()
  PlayerStat.create(entity, {
    playerId: record.address,
    displayName: record.displayName,
    emotion: record.emotion,
    score: record.score,
    circles: record.circles,
    streakDays: record.streakDays,
    unlockedMask: record.unlockedMask,
    ready: record.ready,
    readyPad: record.readyPad,
    readyAt: record.readyAt,
    rank: record.rank
  })
  syncPlayerStat(entity)
  record.entity = entity
}

/** Pushes the in-memory record into its synced component. */
export function writePlayerStat(record: PlayerRecord): void {
  if (!record.entity) return
  const stat = PlayerStat.getMutableOrNull(record.entity)
  // A transient miss means the entity was recycled; skip this tick rather than
  // throwing every frame. `ensurePlayerStatEntity` will rebuild it.
  if (!stat) {
    record.entity = 0 as Entity
    return
  }
  stat.playerId = record.address
  stat.displayName = record.displayName
  stat.emotion = record.emotion
  stat.score = record.score
  stat.circles = record.circles
  stat.streakDays = record.streakDays
  stat.unlockedMask = record.unlockedMask
  stat.ready = record.ready
  stat.readyPad = record.readyPad
  stat.readyAt = record.readyAt
  stat.rank = record.rank
}

/** Removes the synced entity belonging to a departing player. */
export function destroyPlayerStatEntity(record: PlayerRecord): void {
  if (!record.entity) return
  // Entity numbers below 512 are runtime-reserved (avatar range) - never remove.
  if ((record.entity & 0xffff) < 512) {
    record.entity = 0 as Entity
    return
  }
  engine.removeEntity(record.entity)
  record.entity = 0 as Entity
}
