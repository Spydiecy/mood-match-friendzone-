/**
 * Mood Match - in-world visuals.
 *
 * All the scenery (floor, pads, beacons, signs, audio sources) is authored in
 * `assets/scene/main.composite` so it loads fast and stays editable in the
 * Creator Hub. This module only attaches BEHAVIOUR to those entities: recolouring
 * pads by phase, driving the beacons, and keeping the signs in step with the
 * server.
 *
 * The one exception is the particle emitters, which are created here. They exist
 * purely as a function of live game state (a pad that is mid-round) rather than as
 * scene content, and they are created once and then toggled rather than churned.
 *
 * Everything is primitives and flat colours - no meshes, no textures. That is a
 * performance decision for mobile, not an aesthetic accident: it keeps the
 * download tiny and the draw calls low on a mid-range phone.
 */

import {
  Entity,
  Material,
  ParticleSystem,
  PBParticleSystem_BlendMode,
  TextShape,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { PAD_POSITIONS } from '../shared/config'
import { getEmotion } from '../shared/emotions'
import { CirclePhase } from '../shared/types'
import { PAD_NAMES, PAD_WHERE, padFillFor } from './circle'
import { state } from './state'
import { emotionColor } from './ui/theme'

/** Composite entity names. Kept in one place so a rename is a one-line change. */
const NAMES = {
  pads: ['MoodPad_A', 'MoodPad_B', 'MoodPad_C'],
  beacons: ['PadBeacon_A', 'PadBeacon_B', 'PadBeacon_C'],
  padLabels: ['PadLabel_A', 'PadLabel_B', 'PadLabel_C'],
  fontCrystal: 'MoodFontCrystal',
  featuredSign: 'FeaturedSign',
  boardSign: 'LeaderboardSign'
}

/** Resolved composite entities. Null entries mean "not in the composite". */
interface Handles {
  pads: (Entity | null)[]
  beacons: (Entity | null)[]
  padLabels: (Entity | null)[]
  fontCrystal: Entity | null
  featuredSign: Entity | null
  boardSign: Entity | null
  emitters: Entity[]
}

let handles: Handles | null = null

/** Throttle for the sign text, which does not need per-frame updates. */
let nextSignUpdate = 0
const SIGN_INTERVAL_MS = 1000

/** Resolves composite entities and builds the particle emitters. */
export function setupVisuals(): void {
  handles = {
    pads: NAMES.pads.map(byName),
    beacons: NAMES.beacons.map(byName),
    padLabels: NAMES.padLabels.map(byName),
    fontCrystal: byName(NAMES.fontCrystal),
    featuredSign: byName(NAMES.featuredSign),
    boardSign: byName(NAMES.boardSign),
    emitters: PAD_POSITIONS.map((position) => createEmitter(position))
  }

  // Labels are no longer static - they carry the live occupancy - so they are
  // written by `updatePadLabels` on the throttled sign tick instead of once here.
}

/** Looks up a composite entity by name, returning null when absent. */
function byName(name: string): Entity | null {
  const entity = engine.getEntityOrNullByName(name)
  if (!entity) {
    console.log('[CLIENT] composite entity not found:', name)
    return null
  }
  return entity
}

/**
 * Creates one idle particle emitter above a pad.
 *
 * `loop: false` and `active: false` keep it silent until a burst is requested.
 * `maxParticles` is deliberately small - the engine caps the scene at roughly
 * 1000 live particles and scales every system down if that is exceeded, so three
 * modest emitters beat one showy one.
 */
function createEmitter(position: { x: number; y: number; z: number }): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(position.x, position.y + 1.2, position.z)
  })

  ParticleSystem.create(entity, {
    active: false,
    loop: false,
    rate: 0,
    maxParticles: 60,
    lifetime: 1.1,
    gravity: -0.35,
    initialSize: { start: 0.12, end: 0.26 },
    sizeOverTime: { start: 1, end: 0 },
    initialVelocitySpeed: { start: 2.2, end: 4.2 },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    billboard: true,
    initialColor: {
      start: Color4.create(1, 1, 1, 1),
      end: Color4.create(1, 1, 1, 1)
    },
    colorOverTime: {
      start: Color4.create(1, 1, 1, 0.9),
      end: Color4.create(1, 1, 1, 0)
    },
    shape: ParticleSystem.Shape.Sphere({ radius: 1.4 }),
    bursts: { values: [{ time: 0, count: 40 }] }
  })

  return entity
}

/**
 * Pending burst requests, one slot per pad.
 *
 * A one-shot particle system restarts on an `active` false -> true TRANSITION, and
 * both writes have to be in different frames for the renderer to observe one.
 * Doing `active = false; active = true` back to back within a single frame
 * collapses to no change at all, which meant a pad's burst fired once after boot
 * and then never again. So the request is queued here, armed (set false) on the
 * next visual tick, and fired (set true) on the one after.
 */
const pendingBursts: (number | null)[] = [null, null, null]
const burstStage: number[] = [0, 0, 0]

/**
 * Requests a one-shot burst in an emotion's colour.
 *
 * Called from the circle-formed and circle-resolved handlers. The visible burst
 * lands within two frames, which is imperceptible and, unlike the previous
 * same-frame toggle, actually happens.
 */
export function burstAt(padIndex: number, emotion: number): void {
  if (padIndex < 0 || padIndex >= pendingBursts.length) return
  pendingBursts[padIndex] = emotion
  burstStage[padIndex] = 0
}

/** Advances queued bursts through arm-then-fire across consecutive frames. */
function tickBursts(): void {
  if (!handles) return

  for (let padIndex = 0; padIndex < pendingBursts.length; padIndex++) {
    const emotion = pendingBursts[padIndex]
    if (emotion === null) continue

    const entity = handles.emitters[padIndex]
    if (entity === undefined) {
      pendingBursts[padIndex] = null
      continue
    }

    const particles = ParticleSystem.getMutableOrNull(entity)
    if (!particles) {
      pendingBursts[padIndex] = null
      continue
    }

    if (burstStage[padIndex] === 0) {
      // Arm: recolour and switch off so the next frame is a real transition.
      const color = emotionColor(emotion)
      particles.initialColor = { start: color, end: color }
      particles.colorOverTime = {
        start: Color4.create(color.r, color.g, color.b, 0.95),
        end: Color4.create(color.r, color.g, color.b, 0)
      }
      particles.active = false
      burstStage[padIndex] = 1
      continue
    }

    // Fire.
    particles.active = true
    pendingBursts[padIndex] = null
    burstStage[padIndex] = 0
  }
}

/**
 * Per-frame visual update.
 *
 * Cheap by construction: it only writes a Material or Transform when the value it
 * would write has actually changed, so an idle plaza produces no component churn.
 */
export function updateVisuals(now: number): void {
  if (!handles) return

  tickBursts()
  updatePads(now)
  updateFontCrystal()

  // Pad labels carry the live fill count, so they update faster than the other
  // signs - a counter that lags a second feels broken when someone walks in.
  updatePadLabels(now)

  if (now >= nextSignUpdate) {
    nextSignUpdate = now + SIGN_INTERVAL_MS
    updateSigns()
  }
}

/** Last label text written per pad, so an unchanged label is not rewritten. */
const lastLabelText: string[] = ['', '', '']

/** Throttle for the pad labels. */
let nextLabelUpdate = 0
const LABEL_INTERVAL_MS = 250

/**
 * Writes "TIER - WHERE" and the live "n/required" above each pad.
 *
 * This is the in-world half of the fill indicator: a player crossing the plaza can
 * read how full a ring is without opening any UI, which is what makes people walk
 * toward each other in the first place.
 */
function updatePadLabels(now: number): void {
  if (!handles) return
  if (now < nextLabelUpdate) return
  nextLabelUpdate = now + LABEL_INTERVAL_MS

  for (let padIndex = 0; padIndex < handles.padLabels.length; padIndex++) {
    const entity = handles.padLabels[padIndex]
    if (!entity) continue

    const view = state.pads[padIndex]
    const fill = padFillFor(padIndex)
    const tier = PAD_NAMES[padIndex].replace(' Pad', '').toUpperCase()

    let body: string
    if (view && view.phase === CirclePhase.Playing) {
      body = 'IN PLAY'
    } else if (view && view.phase === CirclePhase.Countdown) {
      body = 'STARTING'
    } else if (view && view.phase === CirclePhase.Result) {
      body = view.success ? 'CLEARED' : 'DONE'
    } else {
      body = `${fill.here}/${fill.required}`
    }

    const text = `${tier} - ${PAD_WHERE[padIndex]}\n${body}`
    if (lastLabelText[padIndex] === text) continue
    lastLabelText[padIndex] = text

    const shape = TextShape.getMutableOrNull(entity)
    if (shape) {
      shape.text = text
      // Green once the ring is full enough to start, so "ready" is legible from
      // across the plaza without reading the numbers.
      shape.textColor =
        fill.here >= fill.required
          ? Color4.create(0.36, 0.87, 0.56, 1)
          : Color4.create(1, 1, 1, 1)
    }
  }
}

/** Colours each pad and sizes its beacon according to that pad's phase. */
function updatePads(now: number): void {
  if (!handles) return

  for (let padIndex = 0; padIndex < PAD_POSITIONS.length; padIndex++) {
    const view = state.pads[padIndex]
    const phase = view ? view.phase : CirclePhase.Gathering
    const memberCount = view ? view.members.length : 0

    // Base colour: the dominant emotion in the circle, or the player's own
    // emotion for an empty pad so the plaza always reads as "yours".
    const emotion =
      view && view.memberEmotions.length > 0 ? view.memberEmotions[0] : state.emotion

    const color = emotionColor(emotion)
    let intensity = 0.35
    let beaconHeight = 0.6

    switch (phase) {
      case CirclePhase.Gathering: {
        // Brightness and beacon height scale with how FULL the ring is, so a pad
        // that needs one more player is visibly hotter than an empty one. This is
        // the main in-world social signal in the scene.
        const required = view?.required ?? 2
        const ratio = required > 0 ? Math.min(1, memberCount / required) : 0
        intensity =
          memberCount > 0 ? 0.4 + ratio * 0.35 + pulse(now, 900) * 0.25 : 0.28
        beaconHeight = memberCount > 0 ? 1.6 + ratio * 3.2 + pulse(now, 900) * 1.0 : 0.6
        break
      }
      case CirclePhase.Countdown:
        intensity = 0.7 + pulse(now, 320) * 0.3
        beaconHeight = 4.2
        break
      case CirclePhase.Playing:
        intensity = 1
        beaconHeight = 5.4 + (view?.progress ?? 0) * 2.4
        break
      case CirclePhase.Result:
        intensity = view?.success ? 1 : 0.5
        beaconHeight = view?.success ? 8 : 2
        break
      default:
        break
    }

    paint(handles.pads[padIndex], color, intensity)
    paint(handles.beacons[padIndex], color, Math.min(1, intensity + 0.2))
    stretchBeacon(handles.beacons[padIndex], padIndex, beaconHeight)
  }
}

/**
 * A 0..1 triangle wave with the given period, for pulsing.
 *
 * QUANTISED to 24 steps. An un-quantised pulse changes every frame, so the
 * `closeEnough` guard in `paint` could never reject anything and the scene wrote
 * a full PBR material every single frame from boot - the exact churn this file's
 * header claims to avoid. 24 steps is well below what the eye resolves in a slow
 * glow but coarse enough that most frames are a no-op.
 */
function pulse(now: number, periodMs: number): number {
  const phase = (now % periodMs) / periodMs
  const wave = phase < 0.5 ? phase * 2 : 2 - phase * 2
  return Math.round(wave * 24) / 24
}

/** Applies an emissive colour, skipping the write when nothing changed. */
function paint(entity: Entity | null, color: Color4, intensity: number): void {
  if (!entity) return

  const target = Color4.create(
    color.r * intensity,
    color.g * intensity,
    color.b * intensity,
    1
  )

  const existing = Material.getOrNull(entity)
  if (existing && existing.material?.$case === 'pbr') {
    const current = existing.material.pbr.albedoColor
    // 1/255 is below display precision, so anything smaller is not worth a write.
    if (current && closeEnough(current, target)) return
  }

  Material.setPbrMaterial(entity, {
    albedoColor: target,
    emissiveColor: Color3.create(target.r, target.g, target.b),
    emissiveIntensity: 1.4 * intensity,
    roughness: 0.55,
    metallic: 0
  })
}

/**
 * True when two colours are close enough that a repaint is not worth it.
 *
 * The threshold is deliberately looser than display precision: combined with the
 * quantised pulse it turns a per-frame material write into an occasional one.
 */
function closeEnough(a: Color4, b: Color4): boolean {
  const epsilon = 1 / 96
  return (
    Math.abs(a.r - b.r) < epsilon &&
    Math.abs(a.g - b.g) < epsilon &&
    Math.abs(a.b - b.b) < epsilon
  )
}

/**
 * Scales a beacon vertically so it reads as a column of light.
 *
 * The pivot of a primitive cylinder is its centre, so the Y position has to move
 * by half the height to keep the base planted on the pad.
 */
function stretchBeacon(entity: Entity | null, padIndex: number, height: number): void {
  if (!entity) return

  const transform = Transform.getMutableOrNull(entity)
  if (!transform) return

  // Quantise to 20cm. Without this, a pulsing beacon rewrote its Transform and
  // allocated two Vector3s every frame for a change nobody can see.
  const stepped = Math.round(height * 5) / 5
  if (Math.abs(transform.scale.y - stepped) < 0.05) return

  transform.scale = Vector3.create(0.34, stepped, 0.34)
  transform.position = Vector3.create(
    PAD_POSITIONS[padIndex].x,
    stepped / 2,
    PAD_POSITIONS[padIndex].z
  )
}

/** Recolours the central Mood Font to today's featured emotion. */
function updateFontCrystal(): void {
  if (!handles?.fontCrystal) return
  paint(handles.fontCrystal, emotionColor(state.featuredEmotion), 0.85 + pulse(Date.now(), 2400) * 0.15)
}

/** Refreshes the two in-world signs. Throttled to once a second. */
function updateSigns(): void {
  if (!handles) return

  if (handles.featuredSign) {
    const text = TextShape.getMutableOrNull(handles.featuredSign)
    if (text) {
      const featured = getEmotion(state.featuredEmotion)
      text.text = `FEATURED TODAY\n${featured.name.toUpperCase()}\ndouble points`
      text.textColor = emotionColor(state.featuredEmotion)
    }
  }

  if (handles.boardSign) {
    const text = TextShape.getMutableOrNull(handles.boardSign)
    if (text) {
      text.text = boardSignText()
    }
  }
}

/** Builds the top-three text for the in-world leaderboard sign. */
function boardSignText(): string {
  if (state.board.length === 0) {
    return 'TOP MOODS\n\nno circles yet\nbe the first'
  }

  const lines = state.board
    .slice(0, 3)
    .map((row, index) => `${index + 1}. ${shorten(row.name)}  ${row.score}`)

  return `TOP MOODS\n\n${lines.join('\n')}`
}

/** Keeps a name short enough for a 3D sign. */
function shorten(name: string): string {
  if (!name) return 'anon'
  if (name.length <= 12) return name
  return name.slice(0, 11) + '.'
}
