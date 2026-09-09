/**
 * Mood Match - leaderboard.
 *
 * The board is held in memory as a ranked array and published to all clients
 * through the synced `Leaderboard` component (top N only, to keep the CRDT
 * message small). The durable copy keeps more rows so players who drop out of
 * the visible top 10 do not lose their history.
 *
 * SERVER ONLY.
 */

import { Entity } from '@dcl/sdk/ecs'
import { LEADERBOARD_SIZE } from '../shared/config'
import { Leaderboard } from '../shared/schemas'
import { LeaderboardEntry } from '../shared/types'
import { PlayerRecord } from './state'

/** Ranked descending by score. Index 0 is rank 1. */
let board: LeaderboardEntry[] = []

/** Set when the board changed and has not yet been persisted. */
let boardDirty = false

/** The entity carrying the synced `Leaderboard` component. */
let boardEntity: Entity = 0 as Entity

/** Binds the synced entity that this module publishes into. */
export function bindLeaderboardEntity(entity: Entity): void {
  boardEntity = entity
}

/** Seeds the board from Storage at server boot. */
export function hydrateBoard(entries: LeaderboardEntry[]): void {
  board = entries.slice().sort(byScoreDesc)
  publish()
}

/** True when the board has unsaved changes. */
export function isBoardDirty(): boolean {
  return boardDirty
}

/** Clears the dirty flag after a successful persist. */
export function markBoardClean(): void {
  boardDirty = false
}

/** The full ranked board, for persistence. */
export function getBoard(): LeaderboardEntry[] {
  return board
}

/** Sort comparator: score desc, then circles desc, then name for stability. */
function byScoreDesc(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.circles !== a.circles) return b.circles - a.circles
  return a.name.localeCompare(b.name)
}

/**
 * Inserts or updates a player's row and re-ranks the board.
 * Returns the player's new 1-based rank.
 */
export function upsertScore(record: PlayerRecord): number {
  const index = board.findIndex((entry) => entry.address === record.address)
  const row: LeaderboardEntry = {
    address: record.address,
    name: record.displayName,
    score: record.score,
    circles: record.circles
  }

  if (index === -1) {
    board.push(row)
  } else {
    board[index] = row
  }

  board.sort(byScoreDesc)
  boardDirty = true
  publish()

  return rankOf(record.address)
}

/** 1-based rank for an address, or 0 when the player is not on the board. */
export function rankOf(address: string): number {
  const index = board.findIndex((entry) => entry.address === address)
  return index === -1 ? 0 : index + 1
}

/**
 * Pushes the visible top N into the synced component.
 * Only writes when something actually differs, so idle servers send nothing.
 */
function publish(): void {
  if (!boardEntity) return
  const top = board.slice(0, LEADERBOARD_SIZE)
  const current = Leaderboard.getOrNull(boardEntity)

  if (current && sameTop(current.entries, top)) return

  const mutable = Leaderboard.getMutableOrNull(boardEntity)
  if (!mutable) return

  mutable.entries = top.map((entry) => ({
    address: entry.address,
    name: entry.name,
    score: entry.score,
    circles: entry.circles
  }))
  mutable.updatedAt = Date.now()
}

/** Shallow compare of the published rows, to avoid redundant CRDT writes. */
function sameTop(
  current: readonly { address: string; score: number; circles: number; name: string }[],
  next: readonly LeaderboardEntry[]
): boolean {
  if (current.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (
      current[i].address !== next[i].address ||
      current[i].score !== next[i].score ||
      current[i].circles !== next[i].circles ||
      current[i].name !== next[i].name
    ) {
      return false
    }
  }
  return true
}

/**
 * Recomputes and stores the rank on every live player record.
 * Cheap enough to run whenever the board changes (the board is at most a few
 * hundred rows and live players are far fewer).
 */
export function refreshRanks(records: PlayerRecord[]): void {
  for (const record of records) {
    record.rank = rankOf(record.address)
  }
}
