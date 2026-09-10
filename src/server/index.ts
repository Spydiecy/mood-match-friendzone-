/**
 * Mood Match - headless Multiplayer Server entry point.
 *
 * Responsibilities:
 *   - own every score, circle and leaderboard decision (clients send intents only)
 *   - publish a 2-second heartbeat so clients can tell a cold start from a hang
 *   - persist profiles and the board to Storage at checkpoints, never per tick
 *
 * SERVER ONLY. Loaded through a dynamic import from `src/index.ts` so that
 * `@dcl/sdk/server` never reaches the client bundle. This module deliberately
 * defines no components at module scope - all of those live in
 * `src/shared/schemas.ts`, which is imported statically before the engine seals.
 */

import { Entity, PlayerIdentityData, engine, executeTask } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import {
  HEARTBEAT_INTERVAL_MS,
  SKIN_UNLOCK_REQUIREMENT,
  STORAGE_FLUSH_MS
} from '../shared/config'
import { isSkinUnlocked, withSkinUnlocked } from '../shared/emotions'
import { NoticeTone, RefusalCode, room } from '../shared/messages'
import {
  CircleCore,
  CircleProgress,
  Leaderboard,
  PlayerStat,
  ServerHeartbeat,
  SyncId,
  WorldState
} from '../shared/schemas'
import { computeScore } from '../shared/scoring'
import { EMOTION_COUNT, EmotionId, GameInputKind } from '../shared/types'
import {
  cancelReady,
  handleGameInput,
  handlePlayerLeft,
  initCircles,
  requestReady,
  tickCircles
} from './circles'
import { applyStreak, bindWorldStateEntity, getFeaturedEmotion, updateRotation } from './dailyRotation'
import {
  bindLeaderboardEntity,
  getBoard,
  hydrateBoard,
  isBoardDirty,
  markBoardClean,
  refreshRanks,
  upsertScore
} from './leaderboard'
import { loadProfile, loadSceneRecord, saveDirtyProfiles, saveProfile, saveSceneRecord } from './persistence'
import {
  PlayerRecord,
  allPlayers,
  destroyPlayerStatEntity,
  ensurePlayerStatEntity,
  getOrCreatePlayer,
  getPlayerRecord,
  normalizeAddress,
  refreshAvatarIndex,
  removePlayer,
  writePlayerStat
} from './state'

/** Entity holding `ServerHeartbeat`. */
let heartbeatEntity: Entity = 0 as Entity
/** Entity holding `WorldState`. */
let worldEntity: Entity = 0 as Entity

/** Accumulators for the throttled systems. */
let heartbeatAccumulator = 0
let storageAccumulator = 0

/** Circles completed since this instance booted, and all time. */
let circlesThisSession = 0
let circlesAllTime = 0

/** Addresses with a Storage read in flight, so we never double-load. */
const loadingProfiles = new Set<string>()

/** Boots the server. Called from `main()` inside the `isServer()` branch. */
export function startServer(): void {
  console.log('[SERVER] Mood Match server starting')

  createSingletons()
  registerHandlers()
  hydrateFromStorage()

  initCircles(
    {
      award,
      notify,
      announceFormed: (circleId, padIndex, memberCount, game) => {
        room.send('circleFormed', { circleId, padIndex, memberCount, game })
      },
      announceResolved: (circleId, success) => {
        room.send('circleResolved', { circleId, success })
      },
      countCircle: () => {
        circlesThisSession++
        circlesAllTime++
      },
      // Lets the circle machine push a released lock straight to the client,
      // rather than the player waiting a tick to find out they are free again.
      publishStat: writePlayerStat
    },
    (entity, syncId) =>
      // Both circle components live on the same entity but travel as separate
      // CRDT messages, so a progress tick never re-sends the member roster.
      syncEntity(entity, [CircleCore.componentId, CircleProgress.componentId], syncId)
  )

  engine.addSystem(serverTick)

  // Publish the first heartbeat immediately so the very first client to connect
  // does not have to wait a whole interval to see the server as alive.
  pulseHeartbeat()

  console.log('[SERVER] Mood Match server ready')
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates the three singleton synced entities.
 *
 * Only the server calls `syncEntity` in an authoritative scene: it creates and
 * shares the instance, and every client just receives it.
 */
function createSingletons(): void {
  heartbeatEntity = engine.addEntity()
  ServerHeartbeat.create(heartbeatEntity, { tick: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId], SyncId.Heartbeat)

  worldEntity = engine.addEntity()
  WorldState.create(worldEntity, {
    featuredEmotion: 0,
    dayIndex: 0,
    playersOnline: 0,
    circlesThisSession: 0,
    circlesAllTime: 0
  })
  syncEntity(worldEntity, [WorldState.componentId], SyncId.WorldState)
  bindWorldStateEntity(worldEntity)

  const boardEntity = engine.addEntity()
  Leaderboard.create(boardEntity, { entries: [], updatedAt: 0 })
  syncEntity(boardEntity, [Leaderboard.componentId], SyncId.Leaderboard)
  bindLeaderboardEntity(boardEntity)

  // Publish today's featured emotion straight away.
  updateRotation()
}

/** Restores the board and lifetime counter from Storage. */
function hydrateFromStorage(): void {
  executeTask(async () => {
    const record = await loadSceneRecord()
    circlesAllTime = record.circlesAllTime
    hydrateBoard(record.board)
    refreshRanks(allPlayers())
    console.log('[SERVER] hydrated board with', record.board.length, 'rows')
  })
}

/* -------------------------------------------------------------------------- */
/* Message handlers                                                           */
/* -------------------------------------------------------------------------- */

/** Sends a toast to a single player. */
function notify(address: string, code: RefusalCode, text: string, tone: NoticeTone): void {
  room.send('notice', { code, text, tone }, { to: [address] })
}

function registerHandlers(): void {
  room.onMessage('hello', (data, context) => {
    const address = normalizeAddress(context?.from ?? '')
    if (!address) return

    const record = getOrCreatePlayer(address)
    if (data.displayName) record.displayName = data.displayName
    record.emotion = clampEmotion(data.emotion)

    ensureProfileLoaded(record)
    writePlayerStat(record)
  })

  room.onMessage('setEmotion', (data, context) => {
    const record = senderRecord(context?.from)
    if (!record) return
    // Rerolling mid-round would let a player fish for the featured multiplier
    // after seeing the combo, so it is only allowed outside a circle.
    if (record.activePad !== -1) return

    record.emotion = clampEmotion(data.emotion)
    writePlayerStat(record)
  })

  room.onMessage('formCircle', (data, context) => {
    const record = senderRecord(context?.from)
    if (!record) return
    requestReady(record, data.padIndex)
    writePlayerStat(record)
  })

  room.onMessage('cancelReady', (_data, context) => {
    const record = senderRecord(context?.from)
    if (!record) return
    cancelReady(record)
    writePlayerStat(record)
  })

  room.onMessage('gameInput', (data, context) => {
    const record = senderRecord(context?.from)
    if (!record) return
    handleGameInput(record, data.circleId, data.kind as GameInputKind, data.value)
  })

  room.onMessage('pingPlaza', (data, context) => {
    const record = senderRecord(context?.from)
    if (!record) return
    relayPlazaPing(record, data.padIndex)
  })
}

/** Last ping time per player, for the per-player rate limit. */
const lastPingAt = new Map<string, number>()

/** Minimum gap between one player's pings. */
const PING_COOLDOWN_MS = 25_000

/** Last time ANY ping went out, so a busy plaza cannot become a toast storm. */
let lastGlobalPingAt = 0
const PING_GLOBAL_COOLDOWN_MS = 8000

/**
 * Relays a "come and play" ping to every client.
 *
 * Rate-limited on two axes on purpose. Per-player stops one person spamming;
 * global stops five people all pinging at once and burying everyone in toasts.
 * The relay goes through the server rather than client-to-client so the sender
 * name cannot be forged and the limits cannot be bypassed.
 */
function relayPlazaPing(record: PlayerRecord, padIndex: number): void {
  const now = Date.now()

  const previous = lastPingAt.get(record.address) ?? 0
  if (now - previous < PING_COOLDOWN_MS) {
    const wait = Math.ceil((PING_COOLDOWN_MS - (now - previous)) / 1000)
    notify(
      record.address,
      RefusalCode.None,
      `Hold on ${wait}s before calling the plaza again.`,
      NoticeTone.Info
    )
    return
  }

  if (now - lastGlobalPingAt < PING_GLOBAL_COOLDOWN_MS) {
    // Used to return silently, which made a tapped button do nothing at all.
    notify(
      record.address,
      RefusalCode.None,
      'Someone just called the plaza. Give it a moment.',
      NoticeTone.Info
    )
    return
  }

  lastPingAt.set(record.address, now)
  lastGlobalPingAt = now

  const others = Math.max(0, allPlayers().length - 1)

  room.send('plazaPing', {
    padIndex: Math.max(0, Math.min(2, padIndex)),
    fromAddress: record.address,
    fromName: record.displayName,
    emotion: record.emotion
  })

  // The caller is filtered out of their own broadcast, so without this a
  // successful Call produced no feedback at all.
  notify(
    record.address,
    RefusalCode.None,
    others > 0
      ? `Called the plaza - ${others} player(s) notified.`
      : 'Called out. Nobody else is here yet, so keep an eye out.',
    NoticeTone.Success
  )

  console.log('[SERVER] plaza ping from', record.address, 'pad', padIndex)
}

/** Resolves a message sender to a live record. */
function senderRecord(from: string | undefined): PlayerRecord | undefined {
  if (!from) return undefined
  return getPlayerRecord(from)
}

/** Keeps an emotion id inside the valid range. */
function clampEmotion(value: number): EmotionId {
  if (!isFinite(value)) return EmotionId.Calm
  const n = Math.floor(value)
  if (n < 0 || n >= EMOTION_COUNT) return EmotionId.Calm
  return n as EmotionId
}

/**
 * Reads a player's durable profile once per session, then applies streak rules
 * and pushes the result back to that client.
 */
function ensureProfileLoaded(record: PlayerRecord): void {
  if (record.loaded || loadingProfiles.has(record.address)) return
  loadingProfiles.add(record.address)

  executeTask(async () => {
    try {
      await loadProfile(record)
      const newDay = applyStreak(record)
      const rank = upsertScore(record)
      record.rank = rank
      writePlayerStat(record)

      room.send(
        'profileSync',
        {
          score: record.score,
          circles: record.circles,
          streakDays: record.streakDays,
          unlockedMask: record.unlockedMask,
          rank,
          newDay
        },
        { to: [record.address] }
      )
    } finally {
      loadingProfiles.delete(record.address)
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Payouts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Prices and pays a resolved circle.
 *
 * Uses the same `computeScore` the client used to preview the payout, so the
 * numbers always agree - but this is the only place a score is ever written.
 *
 * @returns points per member, parallel to the caller's `members` array.
 */
function award(
  members: PlayerRecord[],
  success: boolean,
  comboMatched: boolean,
  circleId: number
): number[] {
  const featuredEmotion = getFeaturedEmotion()
  const points: number[] = []

  for (const record of members) {
    const breakdown = computeScore({
      comboMatched,
      miniGameSuccess: success,
      playerEmotion: record.emotion,
      featuredEmotion,
      streakDays: record.streakDays
    })

    record.score += breakdown.total
    record.circles += 1
    record.dirty = true

    let unlockedSkin = -1
    if (success) {
      const emotion = record.emotion
      record.successPerEmotion[emotion] = (record.successPerEmotion[emotion] ?? 0) + 1

      if (
        record.successPerEmotion[emotion] >= SKIN_UNLOCK_REQUIREMENT &&
        !isSkinUnlocked(record.unlockedMask, emotion)
      ) {
        record.unlockedMask = withSkinUnlocked(record.unlockedMask, emotion)
        unlockedSkin = emotion
      }
    }

    record.rank = upsertScore(record)
    writePlayerStat(record)

    room.send(
      'payout',
      {
        circleId,
        base: breakdown.base,
        combo: breakdown.combo,
        miniGame: breakdown.miniGame,
        featuredMultiplier: breakdown.featuredMultiplier,
        streakBonus: breakdown.streakBonus,
        total: breakdown.total,
        newScore: record.score,
        rank: record.rank,
        unlockedSkin
      },
      { to: [record.address] }
    )

    points.push(breakdown.total)
  }

  refreshRanks(allPlayers())
  return points
}

/* -------------------------------------------------------------------------- */
/* Main tick                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The server's only system. `dt` arrives in seconds; everything downstream works
 * in milliseconds.
 */
function serverTick(dt: number): void {
  const dtMs = dt * 1000
  const now = Date.now()

  syncConnectedPlayers()
  tickCircles(dtMs, now)
  updateRotation(now)
  updateWorldState()

  heartbeatAccumulator += dtMs
  if (heartbeatAccumulator >= HEARTBEAT_INTERVAL_MS) {
    heartbeatAccumulator = 0
    pulseHeartbeat()
  }

  storageAccumulator += dtMs
  if (storageAccumulator >= STORAGE_FLUSH_MS) {
    storageAccumulator = 0
    flushStorage()
  }
}

/** Writes the liveness pulse. Its own component, so this stays a few bytes. */
function pulseHeartbeat(): void {
  const beat = ServerHeartbeat.getMutableOrNull(heartbeatEntity)
  if (beat) beat.tick = Date.now()
}

/**
 * Reconciles the player registry with who the engine actually sees.
 *
 * `PlayerIdentityData` is the server-verified source of truth for presence, and
 * the matching `Transform` is the server-verified position used by every
 * proximity check.
 */
function syncConnectedPlayers(): void {
  const identityPairs: [Entity, { address: string }][] = []
  const seen = new Set<string>()

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (!identity.address) continue
    const address = normalizeAddress(identity.address)
    identityPairs.push([entity, { address }])
    seen.add(address)

    const record = getOrCreatePlayer(address)
    ensurePlayerStatEntity(record, (statEntity) => {
      // Per-player entities get an auto-allocated id on purpose: an id derived
      // from the wallet address collides on reconnect and between players.
      syncEntity(statEntity, [PlayerStat.componentId])
    })
    ensureProfileLoaded(record)
  }

  refreshAvatarIndex(identityPairs)

  // Anyone in the registry the engine no longer reports has left the scene.
  for (const record of allPlayers()) {
    if (seen.has(record.address)) continue
    handleDeparture(record)
  }
}

/** Cleans up a departing player and checkpoints their profile. */
function handleDeparture(record: PlayerRecord): void {
  handlePlayerLeft(record)

  // A player leaving is a natural checkpoint, so persist here rather than
  // waiting for the debounce (they may not come back for days).
  if (record.dirty) {
    executeTask(async () => {
      await saveProfile(record)
    })
  }

  destroyPlayerStatEntity(record)
  removePlayer(record.address)
  console.log('[SERVER] player left:', record.address)
}

/** Refreshes the live counters, only writing when a value actually changed. */
function updateWorldState(): void {
  const state = WorldState.getMutableOrNull(worldEntity)
  if (!state) return

  const online = allPlayers().length
  if (state.playersOnline !== online) state.playersOnline = online
  if (state.circlesThisSession !== circlesThisSession) {
    state.circlesThisSession = circlesThisSession
  }
  if (state.circlesAllTime !== circlesAllTime) {
    state.circlesAllTime = circlesAllTime
  }
}

/** Debounced checkpoint: dirty profiles plus the board if it moved. */
function flushStorage(): void {
  const dirty = allPlayers().filter((record) => record.dirty)
  const boardNeedsSave = isBoardDirty()

  if (dirty.length === 0 && !boardNeedsSave) return

  executeTask(async () => {
    if (dirty.length > 0) {
      await saveDirtyProfiles(dirty)
    }
    if (boardNeedsSave) {
      const ok = await saveSceneRecord(circlesAllTime, getBoard())
      if (ok) markBoardClean()
    }
  })
}
