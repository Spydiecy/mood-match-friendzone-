/**
 * Mood Match - daily featured emotion and login streaks.
 *
 * The featured emotion is a pure function of the UTC day index, so the client can
 * render it instantly on load and every client agrees without waiting for a
 * sync. The server still publishes it as authoritative state and is the only
 * thing that grants the 2x payout.
 *
 * SERVER ONLY.
 */

import { Entity } from '@dcl/sdk/ecs'
import { dayIndexUtc, featuredEmotionForDay } from '../shared/emotions'
import { WorldState } from '../shared/schemas'
import { EmotionId } from '../shared/types'
import { PlayerRecord } from './state'

/** Day index the server last published. */
let publishedDayIndex = -1

/** Today's featured emotion, cached. */
let featured: EmotionId = EmotionId.Calm

/** The entity carrying the synced `WorldState` component. */
let worldEntity: Entity = 0 as Entity

/** Binds the synced entity this module publishes into. */
export function bindWorldStateEntity(entity: Entity): void {
  worldEntity = entity
}

/** Today's featured emotion. */
export function getFeaturedEmotion(): EmotionId {
  return featured
}

/**
 * Recomputes the featured emotion and publishes it if the UTC day rolled over.
 * Safe to call every tick; it only writes on an actual change.
 *
 * @returns true when the day changed on this call.
 */
export function updateRotation(nowMs: number = Date.now()): boolean {
  const dayIndex = dayIndexUtc(nowMs)
  if (dayIndex === publishedDayIndex) return false

  publishedDayIndex = dayIndex
  featured = featuredEmotionForDay(dayIndex)

  const state = WorldState.getMutableOrNull(worldEntity)
  if (state) {
    state.featuredEmotion = featured
    state.dayIndex = dayIndex
  }

  console.log('[SERVER] featured emotion for day', dayIndex, 'is', featured)
  return true
}

/**
 * Applies daily-streak rules to a player who just started a session.
 *
 * - same UTC day as last session: streak unchanged
 * - exactly the next day: streak grows by one
 * - any longer gap (or a first-ever session): streak resets to 1
 *
 * @returns true when this is the player's first session of a new day, which the
 *          client uses to show the "streak extended" banner.
 */
export function applyStreak(record: PlayerRecord, nowMs: number = Date.now()): boolean {
  const today = dayIndexUtc(nowMs)

  if (record.lastDayIndex === today) {
    return false
  }

  if (record.lastDayIndex === today - 1) {
    record.streakDays = Math.max(1, record.streakDays) + 1
  } else {
    record.streakDays = 1
  }

  record.lastDayIndex = today
  record.dirty = true
  return true
}
