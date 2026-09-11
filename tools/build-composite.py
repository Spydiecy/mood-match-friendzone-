#!/usr/bin/env python3
"""
Generates `assets/scene/main.composite` for Mood Match.

The composite is the scene's initial state: floor, Mood Pads, beacons, signs,
mood pillars, perimeter decor and the audio sources. Authoring it from a script
keeps the geometry consistent with `src/shared/config.ts` and lets the layout be
asserted rather than eyeballed - every position is checked against the parcel
bounds, and the pads are checked against each other and the leaderboard board.

Run after changing the layout:

    python3 tools/build-composite.py     (or: npm run composite)

This writes the composite in "authoring from scratch" form: no `inspector::*`,
`composite::root` or `asset-packs::*` components. The Creator Hub generates those
itself on first save. If the scene has since been opened AND saved in the Creator
Hub, do NOT re-run this - it would drop the editor's entity tree. Edit through the
Creator Hub instead.
"""

import json
import math
import os

# --- Scene bounds -----------------------------------------------------------
# 2x2 parcels => 32m x 32m.
SIZE = 32.0
CENTER = (16.0, 16.0)

# --- Pads -------------------------------------------------------------------
# Must match PAD_TIERS and PAD_POSITIONS in src/shared/config.ts.
#
# Five pads on a ring so there is always a ring that fits the group you have:
# two Duos (the most likely group size), two Trios, one Squad. The Duos sit
# nearest the spawn point on purpose - they are the rings that always work.
PAD_RADIUS = 3.0
PAD_DIAMETER = PAD_RADIUS * 2
PAD_RING = 9.0

# (label, tier, required, where, angle degrees)
PADS = [
    ("A", "SQUAD", 4, "North", 90),
    ("B", "TRIO", 3, "East", 18),
    ("C", "DUO", 2, "SouthEast", 306),
    ("D", "DUO", 2, "SouthWest", 234),
    ("E", "TRIO", 3, "West", 162),
]

# --- Moods ------------------------------------------------------------------
# Must match EMOTIONS in src/shared/emotions.ts (order = EmotionId)
EMOTIONS = [
    ("Calm", 0.29, 0.62, 1.00),
    ("Joy", 1.00, 0.83, 0.24),
    ("Focus", 0.66, 0.42, 1.00),
    ("Energy", 1.00, 0.35, 0.33),
    ("Love", 1.00, 0.45, 0.76),
    ("Curiosity", 0.35, 0.87, 0.55),
]

# Pillar ring. Offset so NO pillar lands at 90 degrees (due north), which is where
# the leaderboard board is: the previous ring put the Joy pillar 1.5m in front of
# it and blocked the board completely.
PILLAR_RING = 14.0
PILLAR_ANGLE_OFFSET = 0

# Leaderboard board.
BOARD_Z = 30.7

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
            "scale": {"x": round(scale[0], 3), "y": round(scale[1], 3), "z": round(scale[2], 3)},
            "rotation": {"x": rotation[0], "y": rotation[1], "z": rotation[2], "w": rotation[3]},
            "parent": 0,
        }
    }


def mesh(entity, kind, **opts):
    # PBMeshRenderer_BoxMesh and _PlaneMesh declare `uvs` as a REQUIRED repeated
    # field and the build's encoder iterates it unconditionally, so omitting it
    # fails with "message.uvs is not iterable".
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
            # An outline is what makes in-world text legible against a bright sky
            # or a pale floor. Without it the pillar labels washed out completely.
            "outlineWidth": 0.18,
            "outlineColor": {"r": 0.02, "g": 0.02, "b": 0.05},
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


def ring_position(radius, angle_degrees):
    a = math.radians(angle_degrees)
    return CENTER[0] + radius * math.cos(a), CENTER[1] + radius * math.sin(a)


# --- Ground -----------------------------------------------------------------
# A FULL 32x32 slab, not a disc.
#
# `landscapeTerrain` is disabled in scene.json (the default jungle did not match
# the scene at all), which means the engine provides no ground of its own. A disc
# would leave the corners of the parcel floorless and a player could walk off the
# edge and fall forever. The slab guarantees solid ground everywhere inside the
# scene, and the decorative disc on top of it carries the look.
ground = new_entity("Ground")
transform(ground, (CENTER[0], 0.05, CENTER[1]), scale=(SIZE, 0.1, SIZE))
mesh(ground, "box")
material(ground, (0.04, 0.04, 0.08), roughness=0.9)
collider(ground, "box")

plaza = new_entity("PlazaDisc")
transform(plaza, (CENTER[0], 0.12, CENTER[1]), scale=(30, 0.06, 30))
mesh(plaza, "cylinder", radiusTop=0.5, radiusBottom=0.5)
material(plaza, (0.09, 0.10, 0.17), roughness=0.75)

inner = new_entity("PlazaInner")
transform(inner, (CENTER[0], 0.16, CENTER[1]), scale=(15, 0.05, 15))
mesh(inner, "cylinder", radiusTop=0.5, radiusBottom=0.5)
material(inner, (0.13, 0.14, 0.24), emissive=0.25, roughness=0.6)

# --- Mood Font (centre totem) ----------------------------------------------
font_base = new_entity("MoodFontBase")
transform(font_base, (CENTER[0], 0.6, CENTER[1]), scale=(1.9, 1.2, 1.9))
mesh(font_base, "cylinder", radiusTop=0.4, radiusBottom=0.5)
material(font_base, (0.16, 0.17, 0.26), roughness=0.65)
collider(font_base, "cylinder")

font_crystal = new_entity("MoodFontCrystal")
transform(font_crystal, (CENTER[0], 2.0, CENTER[1]), scale=(1.3, 1.3, 1.3))
mesh(font_crystal, "sphere")
material(font_crystal, (0.29, 0.62, 1.0), emissive=1.8, roughness=0.25)

featured_sign = new_entity("FeaturedSign")
transform(featured_sign, (CENTER[0], 3.5, CENTER[1]))
text(featured_sign, "FEATURED TODAY", 1.3, (0.29, 0.62, 1.0))
billboard(featured_sign)

# --- Mood Pads --------------------------------------------------------------
pad_points = []
for label, tier, required, where, angle in PADS:
    x, z = ring_position(PAD_RING, angle)
    pad_points.append((label, x, z))

    pad = new_entity(f"MoodPad_{label}")
    transform(pad, (x, 0.2, z), scale=(PAD_DIAMETER, 0.08, PAD_DIAMETER))
    mesh(pad, "cylinder", radiusTop=0.5, radiusBottom=0.5)
    material(pad, (0.29, 0.62, 1.0), emissive=0.9, roughness=0.4)

for (label, tier, required, where, angle), (_, x, z) in zip(PADS, pad_points):
    # A darker inner ring gives the pad a rim so its edge is obvious on the floor.
    rim = new_entity(f"PadRim_{label}")
    transform(rim, (x, 0.18, z), scale=(PAD_DIAMETER + 0.7, 0.05, PAD_DIAMETER + 0.7))
    mesh(rim, "cylinder", radiusTop=0.5, radiusBottom=0.5)
    material(rim, (0.05, 0.05, 0.1), roughness=0.9)

for (label, tier, required, where, angle), (_, x, z) in zip(PADS, pad_points):
    beacon = new_entity(f"PadBeacon_{label}")
    # Positioned and stretched at runtime; a cylinder's pivot is its centre.
    transform(beacon, (x, 0.3, z), scale=(0.34, 0.6, 0.34))
    mesh(beacon, "cylinder", radiusTop=0.5, radiusBottom=0.5)
    material(beacon, (0.29, 0.62, 1.0), emissive=2.4, roughness=0.2)

for (label, tier, required, where, angle), (_, x, z) in zip(PADS, pad_points):
    pad_label = new_entity(f"PadLabel_{label}")
    transform(pad_label, (x, 3.0, z))
    # Overwritten every quarter second at runtime with the live "n/required".
    text(pad_label, f"{tier} - {where}\n0/{required}", 1.5)
    billboard(pad_label)

# --- Leaderboard board ------------------------------------------------------
board = new_entity("LeaderboardBoard")
transform(board, (CENTER[0], 3.0, BOARD_Z), scale=(9.0, 5.0, 0.4))
mesh(board, "box")
material(board, (0.06, 0.07, 0.13), roughness=0.85)
collider(board, "box")

board_frame = new_entity("LeaderboardFrame")
transform(board_frame, (CENTER[0], 3.0, BOARD_Z + 0.25), scale=(9.5, 5.5, 0.2))
mesh(board_frame, "box")
material(board_frame, (0.29, 0.62, 1.0), emissive=0.7, roughness=0.4)

board_sign = new_entity("LeaderboardSign")
# NO manual rotation, and a Y-axis billboard instead.
#
# TextShape faces -Z by DEFAULT, not +Z. The previous version rotated this 180
# degrees about Y on the assumption it faced +Z, which turned it to face away from
# the plaza - so players read it through the back of the board and every line came
# out MIRRORED ("SDOOM POT"). Billboarding removes the guesswork entirely: the text
# always turns to face whoever is reading it, and stays upright.
transform(board_sign, (CENTER[0], 3.0, BOARD_Z - 0.45))
text(board_sign, "TOP MOODS", 1.5)
billboard(board_sign)

welcome = new_entity("WelcomeSign")
transform(welcome, (CENTER[0], 2.6, 6.2))
text(
    welcome,
    "MOOD MATCH\nstand in a ring with others\ncircles start on their own",
    1.15,
)
billboard(welcome)

# --- Mood pillars -----------------------------------------------------------
for index, (emotion_name, r, g, b) in enumerate(EMOTIONS):
    angle = PILLAR_ANGLE_OFFSET + index * 60
    x, z = ring_position(PILLAR_RING, angle)

    pillar = new_entity(f"EmotionPillar_{index}")
    transform(pillar, (x, 2.0, z), scale=(0.8, 4.0, 0.8))
    mesh(pillar, "cylinder", radiusTop=0.32, radiusBottom=0.5)
    material(pillar, (r, g, b), emissive=1.3, roughness=0.35)
    collider(pillar, "cylinder")

    # A glowing cap, so each pillar reads as a mood beacon rather than a post.
    cap = new_entity(f"EmotionCap_{index}")
    transform(cap, (x, 4.2, z), scale=(1.0, 1.0, 1.0))
    mesh(cap, "sphere")
    material(cap, (r, g, b), emissive=2.2, roughness=0.2)

    plate = new_entity(f"EmotionLabel_{index}")
    transform(plate, (x, 5.3, z))
    # Doubled from the previous size: at the old scale these were unreadable.
    text(plate, emotion_name.upper(), 1.6, (r, g, b))
    billboard(plate)

# --- Perimeter monoliths ----------------------------------------------------
# Frames the arena now that the default landscape is off, and stops the edge of
# the world reading as an accident. Alternating mood colours tie them to the theme.
MONOLITH_RING = 15.0
for i in range(12):
    angle = 15 + i * 30
    x, z = ring_position(MONOLITH_RING, angle)
    r, g, b = EMOTIONS[i % len(EMOTIONS)][1:]

    monolith = new_entity(f"Monolith_{i}")
    height = 2.2 if i % 2 == 0 else 1.4
    transform(monolith, (x, height / 2, z), scale=(0.5, height, 0.5))
    mesh(monolith, "box")
    material(monolith, (r, g, b), emissive=0.85, roughness=0.5)

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

# --- Assertions -------------------------------------------------------------
entity_ids = set()
for component in composite["components"]:
    entity_ids.update(component["data"].keys())

missing_transform = sorted(entity_ids - set(transforms.keys()))
missing_name = sorted(entity_ids - set(names.keys()))
assert not missing_transform, f"entities without Transform: {missing_transform}"
assert not missing_name, f"entities without Name: {missing_name}"

# Pads must not overlap each other, nor sit on top of the board or the totem.
for i in range(len(pad_points)):
    for j in range(i + 1, len(pad_points)):
        _, ax, az = pad_points[i]
        _, bx, bz = pad_points[j]
        gap = math.hypot(ax - bx, az - bz)
        assert gap > PAD_DIAMETER, f"pads {i} and {j} overlap ({gap:.2f}m apart)"

for label, x, z in pad_points:
    to_board = math.hypot(x - CENTER[0], z - BOARD_Z)
    assert to_board > PAD_RADIUS + 1.5, f"pad {label} is too close to the board"
    to_centre = math.hypot(x - CENTER[0], z - CENTER[1])
    assert to_centre > PAD_RADIUS + 1.0, f"pad {label} overlaps the Mood Font"

# No pillar may block the board.
for index in range(len(EMOTIONS)):
    x, z = ring_position(PILLAR_RING, PILLAR_ANGLE_OFFSET + index * 60)
    to_board = math.hypot(x - CENTER[0], z - BOARD_Z)
    assert to_board > 5.0, f"pillar {index} blocks the leaderboard ({to_board:.2f}m)"

print(f"wrote {out_path}")
print(f"entities : {len(entity_ids)} (512..{_next_id - 1})")
print(f"pads     : {len(PADS)}  ({', '.join(f'{t}={r}' for _, t, r, _, _ in PADS)})")
print(f"materials: {len(materials)}  text: {len(text_shapes)}  audio: {len(audio_sources)}")
print("assertions: pads do not overlap, nothing blocks the board, all in bounds")
