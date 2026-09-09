/**
 * Mood Match - client bootstrap.
 *
 * Wiring order matters: touch controls and visuals attach to composite entities,
 * so they run inside `main()` (via `startClient`) rather than at module load.
 *
 * The client is a pure renderer of server state plus an intent sender. It never
 * decides a score, never decides whether a circle formed, and never writes a
 * synced component - those are all locked to the server by `validateBeforeChange`.
 */

import { engine, executeTask } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/players'
import { HEARTBEAT_TIMEOUT_MS, RESULT_MS } from '../shared/config'
import { dayIndexUtc, featuredEmotionForDay } from '../shared/emotions'
import { NoticeTone, room } from '../shared/messages'
import { Leaderboard, PlayerStat, ServerHeartbeat, WorldState } from '../shared/schemas'
import { EmotionId } from '../shared/types'
import { applyMuteState, playSfx, setupAudio } from './audio'
import { refreshPadProximity, refreshPadViews } from './circle'
import { assignInitialEmotion } from './emotions'
import { tickHoldKeepalive } from './miniGames/input'
import { setupTouchControls } from './mobile/touchControls'
import { tickPractice } from './practice'
import { expireTransients, showNotice, state } from './state'
import { setupUi } from './ui/root'
import { observeHeartbeat } from './utils/serverClock'
import { resolveRealm } from './utils/share'
import { burstAt, setupVisuals, updateVisuals } from './visuals'

/** True once `hello` has been delivered, so we only introduce ourselves once. */
let helloSent = false

/** Boots the client. Called from `main()` on the non-server branch. */
export function startClient(): void {
  console.log('[CLIENT] Mood Match starting')

  // Render today's featured emotion immediately. It is a pure function of the UTC
  // day, so the client does not have to wait for the server's first sync to show
  // the right thing - the server's value then confirms it.
  state.dayIndex = dayIndexUtc()
  state.featuredEmotion = featuredEmotionForDay(state.dayIndex)

  assignInitialEmotion()

  setupTouchControls()
  setupAudio()
  setupVisuals()
  resolveRealm()
  registerHandlers()
  setupUi()

  engine.addSystem(clientTick)

  console.log('[CLIENT] Mood Match ready')
}

/* -------------------------------------------------------------------------- */
/* Server messages                                                            */
/* -------------------------------------------------------------------------- */

function registerHandlers(): void {
  room.onMessage('notice', (data) => {
    showNotice(data.text, data.tone)
  })

  room.onMessage('circleFormed', (data) => {
    playSfx('form')
    const pad = state.pads[data.padIndex]
    burstAt(data.padIndex, pad?.memberEmotions[0] ?? state.emotion)
  })

  room.onMessage('circleResolved', (data) => {
    const pad = state.pads.find((view) => view && view.circleId === data.circleId)
    // Only the members of a circle get the audio cue; a bystander's plaza should
    // not chime every time somebody else finishes a round.
    if (pad?.mine) {
      playSfx(data.success ? 'success' : 'fail')
    }
    if (pad && data.success) {
      burstAt(pad.padIndex, pad.memberEmotions[0] ?? state.emotion)
    }
  })

  room.onMessage('payout', (data) => {
    state.payout = {
      base: data.base,
      combo: data.combo,
      miniGame: data.miniGame,
      featuredMultiplier: data.featuredMultiplier,
      streakBonus: data.streakBonus,
      total: data.total,
      newScore: data.newScore,
      rank: data.rank,
      unlockedSkin: data.unlockedSkin,
      // Shown after the round-result card clears, so the two do not fight.
      until: Date.now() + RESULT_MS * 2
    }
    state.score = data.newScore
    state.rank = data.rank

    if (data.unlockedSkin >= 0) {
      showNotice('New emotion skin unlocked', NoticeTone.Success, 5000)
    }
  })

  room.onMessage('profileSync', (data) => {
    state.score = data.score
    state.circles = data.circles
    state.streakDays = data.streakDays
    state.unlockedMask = data.unlockedMask
    state.rank = data.rank

    if (data.newDay && data.streakDays > 1) {
      state.newDayBanner = true
      showNotice(
        `Day ${data.streakDays} streak - bonus points on every circle today.`,
        NoticeTone.Success,
        5000
      )
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Per-frame update                                                           */
/* -------------------------------------------------------------------------- */

/** The client's only system. `dt` is in seconds. */
function clientTick(dt: number): void {
  const now = Date.now()
  const dtMs = dt * 1000

  resolveIdentity()
  readHeartbeat(now)
  readWorldState()
  readLeaderboard()
  readMyStat()

  refreshPadProximity()
  refreshPadViews()

  tickHoldKeepalive(now)
  tickPractice(dtMs, now)

  sendHelloWhenReady()
  expireTransients(now)
  updateVisuals(now)
}

/**
 * Resolves the local player's wallet address and name.
 *
 * Not available on the very first frames, so this retries until it lands. The
 * address is the key everything else matches on.
 */
function resolveIdentity(): void {
  if (state.myAddress) return

  const player = getPlayer()
  if (!player?.userId) return

  state.myAddress = player.userId.toLowerCase()
  state.myName = player.name || 'Guest'
  console.log('[CLIENT] identity resolved:', state.myAddress, state.myName)
}

/**
 * Tracks server liveness.
 *
 * Deliberately keyed on the LOCAL time at which the heartbeat value was seen to
 * CHANGE, not on the heartbeat's own timestamp. A CRDT snapshot can carry a stale
 * tick from a previous server run, which would read as "alive" if we trusted the
 * value; and clock skew between server and client is irrelevant this way.
 */
function readHeartbeat(now: number): void {
  for (const [entity] of engine.getEntitiesWith(ServerHeartbeat)) {
    const beat = ServerHeartbeat.getOrNull(entity)
    if (!beat) continue

    if (beat.tick !== state.lastHeartbeatValue) {
      state.lastHeartbeatValue = beat.tick
      state.lastHeartbeatSeenAt = now
      observeHeartbeat(beat.tick, now)
    }
    break
  }

  state.roomReady = isStateSyncronized()
  state.serverAlive =
    state.lastHeartbeatSeenAt !== 0 && now - state.lastHeartbeatSeenAt < HEARTBEAT_TIMEOUT_MS
}

/** Mirrors the authoritative world state, falling back to the local rotation. */
function readWorldState(): void {
  for (const [entity] of engine.getEntitiesWith(WorldState)) {
    const world = WorldState.getOrNull(entity)
    if (!world) continue

    // dayIndex 0 means the server has not published yet; keep the local guess.
    if (world.dayIndex > 0) {
      state.featuredEmotion = world.featuredEmotion as EmotionId
      state.dayIndex = world.dayIndex
    }
    state.playersOnline = world.playersOnline
    state.circlesAllTime = world.circlesAllTime
    return
  }
}

/** Mirrors the synced leaderboard. */
function readLeaderboard(): void {
  for (const [entity] of engine.getEntitiesWith(Leaderboard)) {
    const board = Leaderboard.getOrNull(entity)
    if (!board) continue

    if (board.updatedAt === state.boardUpdatedAt) return
    state.boardUpdatedAt = board.updatedAt
    state.board = board.entries.map((entry) => ({
      address: entry.address,
      name: entry.name,
      score: entry.score,
      circles: entry.circles
    }))
    return
  }
}

/**
 * Finds the local player's own `PlayerStat`.
 *
 * Matched on the `playerId` field rather than on a network id, because per-player
 * entities use auto-allocated sync ids - an id derived from the address would
 * collide between players and with the player's own stale entity on reconnect.
 */
function readMyStat(): void {
  if (!state.myAddress) return

  for (const [entity] of engine.getEntitiesWith(PlayerStat)) {
    const stat = PlayerStat.getOrNull(entity)
    if (!stat || stat.playerId !== state.myAddress) continue

    state.score = stat.score
    state.circles = stat.circles
    state.streakDays = stat.streakDays
    state.unlockedMask = stat.unlockedMask
    state.rank = stat.rank
    return
  }
}

/** Introduces the client to the server once the transport is up. */
function sendHelloWhenReady(): void {
  if (helloSent) return
  if (!state.roomReady) return
  if (!state.myAddress) return

  helloSent = true
  room.send('hello', {
    emotion: state.emotion,
    displayName: state.myName
  })

  // Start the ambient bed only once we are actually in the scene and connected,
  // so a player who bounces off a loading screen never hears a stray loop.
  executeTask(async () => {
    applyMuteState()
  })

  console.log('[CLIENT] hello sent')
}
