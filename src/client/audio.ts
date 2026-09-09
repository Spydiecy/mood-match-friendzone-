/**
 * Mood Match - audio.
 *
 * One looping ambient bed plus a handful of short cues. Everything is optional:
 * the Sound toggle in the info panel mutes the bed and silences every cue, and
 * the preference is honoured immediately.
 *
 * The audio entities live in `assets/scene/main.composite` because they exist at
 * scene load - this module only attaches behaviour to them, and falls back to
 * creating them at runtime if the composite is unavailable for any reason.
 */

import { AudioSource, Entity, engine } from '@dcl/sdk/ecs'
import { state } from './state'

/** Short cues, keyed by the name game code uses. */
const CLIPS = {
  tap: 'assets/audio/tap.mp3',
  form: 'assets/audio/circle-form.mp3',
  success: 'assets/audio/success.mp3',
  fail: 'assets/audio/fail.mp3',
  reroll: 'assets/audio/reroll.mp3'
} as const

export type SfxName = keyof typeof CLIPS

/** Per-cue volume, so the fanfare does not dwarf the taps. */
const VOLUME: Record<SfxName, number> = {
  tap: 0.35,
  form: 0.6,
  success: 0.55,
  fail: 0.45,
  reroll: 0.4
}

const AMBIENT_CLIP = 'assets/audio/ambient.mp3'
const AMBIENT_VOLUME = 0.16

/** Entity names as authored in the composite. */
const AMBIENT_NAME = 'AmbientMusic'
const VOICE_NAMES = ['SfxVoice1', 'SfxVoice2', 'SfxVoice3']

let ambientEntity: Entity | null = null
let voices: Entity[] = []
let nextVoice = 0

/** Resolves the audio entities. Called once from client boot. */
export function setupAudio(): void {
  ambientEntity = resolveEntity(AMBIENT_NAME)
  voices = VOICE_NAMES.map((name) => resolveEntity(name))

  // Voices are silent until used, but must carry an AudioSource so `playSound`
  // preserves their volume and `global` flag rather than creating a bare one.
  for (const voice of voices) {
    if (!AudioSource.getOrNull(voice)) {
      AudioSource.create(voice, {
        audioClipUrl: CLIPS.tap,
        playing: false,
        loop: false,
        volume: VOLUME.tap,
        global: true
      })
    }
  }

  applyMuteState()
}

/**
 * Finds a composite entity by name, creating a bare runtime entity if the
 * composite did not provide it. Keeps audio from ever throwing.
 */
function resolveEntity(name: string): Entity {
  const found = engine.getEntityOrNullByName(name)
  if (found) return found
  console.log('[CLIENT] audio entity missing from composite, creating at runtime:', name)
  return engine.addEntity()
}

/** Plays a one-shot cue, unless the player has muted audio. */
export function playSfx(name: SfxName): void {
  if (state.muted) return
  if (voices.length === 0) return

  // Round-robin across voices so two cues close together do not cut each other.
  const voice = voices[nextVoice % voices.length]
  nextVoice++

  const source = AudioSource.getMutableOrNull(voice)
  if (source) {
    source.volume = VOLUME[name]
    source.global = true
    source.loop = false
  }

  AudioSource.playSound(voice, CLIPS[name])
}

/** Toggles the mute preference and applies it. */
export function toggleMute(): void {
  state.muted = !state.muted
  applyMuteState()
  // Give immediate feedback when unmuting, so the toggle feels connected.
  if (!state.muted) playSfx('tap')
}

/**
 * Starts or stops the ambient bed to match `state.muted`.
 *
 * Note the ambient source is `global: true` so its volume does not fall off with
 * distance - the plaza is small and a positional bed would pulse as players walk.
 */
export function applyMuteState(): void {
  if (!ambientEntity) return

  const existing = AudioSource.getMutableOrNull(ambientEntity)
  if (existing) {
    existing.audioClipUrl = AMBIENT_CLIP
    existing.loop = true
    existing.global = true
    existing.volume = AMBIENT_VOLUME
    existing.playing = !state.muted
    return
  }

  AudioSource.create(ambientEntity, {
    audioClipUrl: AMBIENT_CLIP,
    playing: !state.muted,
    loop: true,
    volume: AMBIENT_VOLUME,
    global: true
  })
}
