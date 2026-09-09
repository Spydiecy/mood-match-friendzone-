#!/usr/bin/env python3
"""
Generates `assets/scene/main.composite` for Mood Match.

The composite is the scene's initial state: floor, Mood Pads, beacons, signs,
emotion pillars and the audio sources. Authoring it from a script keeps the
geometry (pad positions, pillar ring) consistent with `src/shared/config.ts` and
makes it obvious that every position is inside the 2x2 parcel bounds.

This runs at authoring time only; it is not part of the scene build. Re-run it
after changing the layout:

    python3 tools/build-composite.py

Note this writes the composite in "authoring from scratch" form: no
`inspector::*` / `composite::root` / `asset-packs::*` components. The Creator Hub
generates those itself on first save. If the scene has since been opened and
saved in the Creator Hub, do NOT re-run this script - it would drop the editor's
entity tree. Edit through the Creator Hub instead.
"""

import json
import math
import os

# --- Scene bounds -----------------------------------------------------------
# 2x2 parcels => 32m x 32m. Everything below is asserted to be inside this.
SIZE = 32.0
CENTER = (16.0, 16.0)

# Must match PAD_POSITIONS in src/shared/config.ts
PADS = [
    ("A", 16.0, 23.0),
    ("B", 9.9, 12.5),
    ("C", 22.1, 12.5),
]

# Must match EMOTIONS in src/shared/emotions.ts (order = EmotionId)
EMOTIONS = [
    ("Calm", 0.29, 0.62, 1.00),
    ("Joy", 1.00, 0.83, 0.24),
    ("Focus", 0.66, 0.42, 1.00),
    ("Energy", 1.00, 0.35, 0.33),
    ("Love", 1.00, 0.45, 0.76),
    ("Curiosity", 0.35, 0.87, 0.55),
]

# Collision masks: 0 = none, 1 = pointer, 2 = physics, 3 = both.
CL_PHYSICS = 2

# ---------------------------------------------------------------------------

transforms = {}
mesh_renderers = {}
mesh_colliders = {}
materials = {}
text_shapes = {}
billboards = {}
audio_sources = {}
names = {}

_next_id = 512


def new_entity(name):
    """Allocates the next entity id and registers its name."""
    global _next_id
    entity = _next_id
    _next_id += 1
    names[str(entity)] = {"json": {"value": name}}
    return entity


def transform(entity, position, scale=(1, 1, 1), rotation=(0, 0, 0, 1)):
    x, y, z = position
    assert 0 <= x <= SIZE, f"x {x} out of bounds for {names[str(entity)]}"
    assert 0 <= z <= SIZE, f"z {z} out of bounds for {names[str(entity)]}"
    assert y >= 0, f"y {y} below ground for {names[str(entity)]}"
    transforms[str(entity)] = {
        "json": {
            "position": {"x": round(x, 3), "y": round(y, 3), "z": round(z, 3)},
            "scale": {"x": scale[0], "y": scale[1], "z": scale[2]},
            "rotation": {
                "x": rotation[0],
                "y": rotation[1],
                "z": rotation[2],
                "w": rotation[3],
            },
            "parent": 0,
        }
    }


def mesh(entity, kind, **opts):
    # PBMeshRenderer_BoxMesh and _PlaneMesh declare `uvs` as a REQUIRED repeated
    # field, and the build's protobuf encoder iterates it unconditionally. Omitting
    # it fails the build with "message.uvs is not iterable", so default it to an
    # empty array (which means "use the default UV mapping").
    if kind in ("box", "plane") and "uvs" not in opts:
        opts = dict(opts, uvs=[])
    mesh_renderers[str(entity)] = {"json": {"mesh": {"$case": kind, kind: opts}}}


def collider(entity, kind, mask=CL_PHYSICS):
    mesh_colliders[str(entity)] = {
        "json": {"collisionMask": mask, "mesh": {"$case": kind, kind: {}}}
    }


def material(entity, rgb, emissive=0.0, roughness=0.6, alpha=1.0):
    r, g, b = rgb
    pbr = {
        "albedoColor": {"r": r, "g": g, "b": b, "a": alpha},
        "metallic": 0,
        "roughness": roughness,
    }
    if emissive > 0:
        pbr["emissiveColor"] = {"r": r, "g": g, "b": b}
        pbr["emissiveIntensity"] = emissive
    materials[str(entity)] = {"json": {"material": {"$case": "pbr", "pbr": pbr}}}


def text(entity, value, size, rgb=(1, 1, 1)):
    r, g, b = rgb
    text_shapes[str(entity)] = {
        "json": {
            "text": value,
            "fontSize": size,
            "textColor": {"r": r, "g": g, "b": b, "a": 1},
        }
    }


def billboard(entity, mode=2):
    """Mode 2 = Y axis only: text turns to face the player but stays upright."""
    billboards[str(entity)] = {"json": {"billboardMode": mode}}


def audio(entity, clip, volume, loop):
    audio_sources[str(entity)] = {
        "json": {
            "audioClipUrl": clip,
            "playing": False,
            "loop": loop,
            "volume": volume,
            "global": True,
        }
    }


# --- Plaza floor ------------------------------------------------------------
# Slightly above y=0 so it does not z-fight with the default ground.
floor = new_entity("PlazaFloor")
transform(floor, (CENTER[0], 0.02, CENTER[1]), scale=(30, 0.04, 30))
mesh(floor, "cylinder", radiusTop=0.5, radiusBottom=0.5)
material(floor, (0.07, 0.08, 0.13), roughness=0.85)
# Given a physics collider so the plaza is guaranteed walkable ground regardless
# of what the surrounding terrain does.
collider(floor, "cylinder")

# --- Mood Font (centre totem) ----------------------------------------------
font_base = new_entity("MoodFontBase")
transform(font_base, (CENTER[0], 0.55, CENTER[1]), scale=(1.7, 1.1, 1.7))
mesh(font_base, "cylinder", radiusTop=0.42, radiusBottom=0.5)
material(font_base, (0.14, 0.15, 0.22), roughness=0.7)
collider(font_base, "cylinder")

font_crystal = new_entity("MoodFontCrystal")
transform(font_crystal, (CENTER[0], 1.85, CENTER[1]), scale=(1.15, 1.15, 1.15))
mesh(font_crystal, "sphere")
# Recoloured at runtime to today's featured emotion.
material(font_crystal, (0.29, 0.62, 1.0), emissive=1.6, roughness=0.3)

featured_sign = new_entity("FeaturedSign")
transform(featured_sign, (CENTER[0], 3.15, CENTER[1]))
text(featured_sign, "FEATURED TODAY", 2.2, (0.29, 0.62, 1.0))
billboard(featured_sign)

# --- Mood Pads --------------------------------------------------------------
for label, x, z in PADS:
    pad = new_entity(f"MoodPad_{label}")
    transform(pad, (x, 0.06, z), scale=(7.2, 0.08, 7.2))
    mesh(pad, "cylinder", radiusTop=0.5, radiusBottom=0.5)
    material(pad, (0.29, 0.62, 1.0), emissive=0.8, roughness=0.4)

for label, x, z in PADS:
    beacon = new_entity(f"PadBeacon_{label}")
    # Positioned and stretched at runtime; the pivot of a cylinder is its centre.
    transform(beacon, (x, 0.3, z), scale=(0.34, 0.6, 0.34))
    mesh(beacon, "cylinder", radiusTop=0.5, radiusBottom=0.5)
    material(beacon, (0.29, 0.62, 1.0), emissive=2.2, roughness=0.2)

for label, x, z in PADS:
    pad_label = new_entity(f"PadLabel_{label}")
    transform(pad_label, (x, 2.5, z))
    text(pad_label, f"{label} PAD", 2.0)
    billboard(pad_label)

# --- Leaderboard board ------------------------------------------------------
board = new_entity("LeaderboardBoard")
transform(board, (CENTER[0], 2.7, 30.7), scale=(7.4, 4.4, 0.3))
mesh(board, "box")
material(board, (0.08, 0.09, 0.15), roughness=0.8)
collider(board, "box")

board_sign = new_entity("LeaderboardSign")
# Rotated 180 degrees about Y so the text faces the plaza (toward -Z), and offset
# just in front of the board face so it does not clip into it.
transform(board_sign, (CENTER[0], 2.8, 30.5), rotation=(0, 1, 0, 0))
text(board_sign, "TOP MOODS", 1.5)

welcome = new_entity("WelcomeSign")
transform(welcome, (CENTER[0], 2.5, 9.0))
text(
    welcome,
    "MOOD MATCH\nstand on a pad with someone\nand tap Form Circle",
    1.7,
)
billboard(welcome)

# --- Emotion pillars --------------------------------------------------------
# Six pillars on a ring, one per emotion, as colour landmarks around the plaza.
RING_RADIUS = 13.2
for index, (emotion_name, r, g, b) in enumerate(EMOTIONS):
    angle = math.radians(30 + index * 60)
    x = CENTER[0] + RING_RADIUS * math.cos(angle)
    z = CENTER[1] + RING_RADIUS * math.sin(angle)

    pillar = new_entity(f"EmotionPillar_{index}")
    transform(pillar, (x, 1.6, z), scale=(0.7, 3.2, 0.7))
    mesh(pillar, "cylinder", radiusTop=0.42, radiusBottom=0.5)
    material(pillar, (r, g, b), emissive=1.1, roughness=0.4)
    collider(pillar, "cylinder")

    plate = new_entity(f"EmotionLabel_{index}")
    transform(plate, (x, 3.7, z))
    text(plate, emotion_name.upper(), 1.5, (r, g, b))
    billboard(plate)

# --- Audio ------------------------------------------------------------------
ambient = new_entity("AmbientMusic")
transform(ambient, (CENTER[0], 1.5, CENTER[1]))
audio(ambient, "assets/audio/ambient.mp3", 0.16, True)

for voice in range(1, 4):
    entity = new_entity(f"SfxVoice{voice}")
    transform(entity, (CENTER[0], 1.5, CENTER[1]))
    audio(entity, "assets/audio/tap.mp3", 0.35, False)

# --- Assemble ---------------------------------------------------------------
NAME_SCHEMA = {
    "type": "object",
    "properties": {"value": {"type": "string", "serializationType": "utf8-string"}},
    "serializationType": "map",
}

components = [
    {"name": "core::Transform", "data": transforms},
    {"name": "core::MeshRenderer", "data": mesh_renderers},
    {"name": "core::MeshCollider", "data": mesh_colliders},
    {"name": "core::Material", "data": materials},
    {"name": "core::TextShape", "data": text_shapes},
    {"name": "core::Billboard", "data": billboards},
    {"name": "core::AudioSource", "data": audio_sources},
    # Non-core components MUST carry their jsonSchema or the SDK build fails.
    {"name": "core-schema::Name", "jsonSchema": NAME_SCHEMA, "data": names},
]

composite = {"version": 1, "components": [c for c in components if c["data"]]}

out_path = os.path.join("assets", "scene", "main.composite")
with open(out_path, "w") as handle:
    json.dump(composite, handle, indent=2)
    handle.write("\n")

# Every entity must have a Transform and a Name - the build and the Creator Hub
# both rely on it.
entity_ids = set()
for component in composite["components"]:
    entity_ids.update(component["data"].keys())

missing_transform = sorted(entity_ids - set(transforms.keys()))
missing_name = sorted(entity_ids - set(names.keys()))
assert not missing_transform, f"entities without Transform: {missing_transform}"
assert not missing_name, f"entities without Name: {missing_name}"

print(f"wrote {out_path}")
print(f"entities: {len(entity_ids)} (512..{_next_id - 1})")
print(f"materials: {len(materials)}  text: {len(text_shapes)}  audio: {len(audio_sources)}")
