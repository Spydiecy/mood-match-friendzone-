/**
 * Mood Match - durable storage.
 *
 * The Multiplayer Server caps in-flight host calls and a `Storage.set` past that
 * cap fails SILENTLY (it resolves `false` rather than throwing). So:
 *
 *   - live state stays in memory (see `state.ts`)
 *   - writes happen only at checkpoints: a player leaves, a debounce elapses,
 *     or the leaderboard actually changed
 *   - every `set` result is checked and a failure is logged and retried later
 *
 * SERVER ONLY - imports `@dcl/sdk/server`.
 */

import { Storage } from '@dcl/sdk/server'
import {
  STORAGE_KEY_LEADERBOARD,
  STORAGE_PLAYER_KEY
} from '../shared/config'
import { EMOTION_COUNT } from '../shared/types'
import { LeaderboardEntry } from '../shared/types'
import { PlayerRecord } from './state'

/** Shape of a persisted player profile. `v` allows future migrations. */
interface StoredProfile {
  v: 1
  name: string
  score: number
  circles: number
  streakDays: number
  lastDayIndex: number
  unlockedMask: number
  /** Successful circles per emotion. */
  spe: number[]
}

/** Shape of the persisted scene-wide record. */
interface StoredScene {
  v: 1
  circlesAllTime: number
  /** Ranked board, capped to BOARD_PERSIST_LIMIT rows. */
  board: LeaderboardEntry[]
}

/**
 * How many ranked rows we keep durably. The visible leaderboard is only the top
 * 10, but keeping more means a player who slips out of the top 10 does not lose
 * their score, and the board recovers if someone above them is removed.
 */
const BOARD_PERSIST_LIMIT = 100

/** Logs and swallows a failed write so one bad checkpoint cannot kill the tick. */
function reportWrite(ok: boolean, what: string): boolean {
  if (!ok) {
    console.log('[SERVER] storage write did not persist:', what)
  }
  return ok
}

/* -------------------------------------------------------------------------- */
/* Player profiles                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Loads a player's durable profile into their in-memory record.
 *
 * Called once per player per session. Failures are non-fatal: the player simply
 * starts from a blank profile, which is the correct graceful degradation for a
 * social game (they can still play, they just do not see history).
 */
export async function loadProfile(record: PlayerRecord): Promise<void> {
  try {
    const stored = await Storage.player.get<StoredProfile>(
      record.address,
      STORAGE_PLAYER_KEY
    )
    if (stored && stored.v === 1) {
      record.score = clampInt(stored.score)
      record.circles = clampInt(stored.circles)
      record.streakDays = Math.max(1, clampInt(stored.streakDays))
      record.lastDayIndex = clampInt(stored.lastDayIndex)
      record.unlockedMask = clampInt(stored.unlockedMask)
      record.successPerEmotion = normalizeCounts(stored.spe)
      if (stored.name) record.displayName = stored.name
    }
  } catch (error) {
    console.log('[SERVER] loadProfile failed for', record.address, error)
  } finally {
    // Mark loaded either way so we never block gameplay on storage.
    record.loaded = true
  }
}

/** Writes a player's profile. Only call at a checkpoint. */
export async function saveProfile(record: PlayerRecord): Promise<boolean> {
  const payload: StoredProfile = {
    v: 1,
    name: record.displayName,
    score: record.score,
    circles: record.circles,
    streakDays: record.streakDays,
    lastDayIndex: record.lastDayIndex,
    unlockedMask: record.unlockedMask,
    spe: record.successPerEmotion
  }
  try {
    const ok = await Storage.player.set(record.address, STORAGE_PLAYER_KEY, payload)
    if (ok) record.dirty = false
    return reportWrite(ok, 'profile ' + record.address)
  } catch (error) {
    console.log('[SERVER] saveProfile failed for', record.address, error)
    return false
  }
}

/** Flushes every dirty profile. Used by the debounced checkpoint. */
export async function saveDirtyProfiles(records: PlayerRecord[]): Promise<void> {
  for (const record of records) {
    if (record.dirty) {
      await saveProfile(record)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Scene record                                                               */
/* -------------------------------------------------------------------------- */

/** Loads the persisted board and lifetime counter. Returns safe defaults. */
export async function loadSceneRecord(): Promise<{
  circlesAllTime: number
  board: LeaderboardEntry[]
}> {
  try {
    const stored = await Storage.get<StoredScene>(STORAGE_KEY_LEADERBOARD)
    if (stored && stored.v === 1) {
      return {
        circlesAllTime: clampInt(stored.circlesAllTime),
        board: Array.isArray(stored.board) ? stored.board.filter(isValidEntry) : []
      }
    }
  } catch (error) {
    console.log('[SERVER] loadSceneRecord failed', error)
  }
  return { circlesAllTime: 0, board: [] }
}

/** Writes the board and lifetime counter. Only call at a checkpoint. */
export async function saveSceneRecord(
  circlesAllTime: number,
  board: LeaderboardEntry[]
): Promise<boolean> {
  const payload: StoredScene = {
    v: 1,
    circlesAllTime,
    board: board.slice(0, BOARD_PERSIST_LIMIT)
  }
  try {
    const ok = await Storage.set(STORAGE_KEY_LEADERBOARD, payload)
    return reportWrite(ok, 'scene record')
  } catch (error) {
    console.log('[SERVER] saveSceneRecord failed', error)
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Coerces anything into a safe non-negative integer. */
function clampInt(value: unknown): number {
  const n = typeof value === 'number' ? value : 0
  if (!isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** Ensures a per-emotion counter array has the right length. */
function normalizeCounts(input: unknown): number[] {
  const out = new Array<number>(EMOTION_COUNT).fill(0)
  if (Array.isArray(input)) {
    for (let i = 0; i < EMOTION_COUNT && i < input.length; i++) {
      out[i] = clampInt(input[i])
    }
  }
  return out
}

/** Rejects malformed rows so one bad record cannot corrupt the board. */
function isValidEntry(entry: unknown): entry is LeaderboardEntry {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Partial<LeaderboardEntry>
  return typeof e.address === 'string' && typeof e.score === 'number'
}
