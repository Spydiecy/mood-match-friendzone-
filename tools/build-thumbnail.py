#!/usr/bin/env python3
"""
Generates `images/scene-thumbnail.png` - the image shown in the Decentraland map
modal, the teleport confirmation and the Places listing.

Written with raw zlib/struct rather than an image library so it has no
dependencies beyond the standard library. Re-run after changing the palette:

    python3 tools/build-thumbnail.py

The recommended size is 228x160 (minimum 196x143). This renders at 3x that
(684x480) so it stays crisp on high-density screens while keeping the exact
aspect ratio.
"""

import math
import os
import struct
import zlib

SCALE = 3
WIDTH = 228 * SCALE
HEIGHT = 160 * SCALE

# Must match EMOTIONS in src/shared/emotions.ts
EMOTION_COLORS = [
    (74, 158, 255),   # Calm
    (255, 212, 61),   # Joy
    (168, 107, 255),  # Focus
    (255, 89, 84),    # Energy
    (255, 115, 194),  # Love
    (89, 222, 140),   # Curiosity
]

# 5x7 bitmap font. Only the glyphs the title needs.
FONT = {
    "M": ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    " ": ["00000"] * 7,
}

# Framebuffer of (r, g, b) rows.
pixels = [[(0, 0, 0)] * WIDTH for _ in range(HEIGHT)]


def clamp(value):
    return max(0, min(255, int(round(value))))


def blend(base, color, alpha):
    """Alpha-composites `color` over `base`."""
    return (
        clamp(base[0] * (1 - alpha) + color[0] * alpha),
        clamp(base[1] * (1 - alpha) + color[1] * alpha),
        clamp(base[2] * (1 - alpha) + color[2] * alpha),
    )


def put(x, y, color, alpha=1.0):
    if 0 <= x < WIDTH and 0 <= y < HEIGHT and alpha > 0:
        pixels[y][x] = blend(pixels[y][x], color, min(1.0, alpha))


# --- Background: vertical gradient, dark navy to near-black -----------------
TOP = (16, 20, 42)
BOTTOM = (5, 6, 12)
for y in range(HEIGHT):
    t = y / (HEIGHT - 1)
    row_color = (
        TOP[0] + (BOTTOM[0] - TOP[0]) * t,
        TOP[1] + (BOTTOM[1] - TOP[1]) * t,
        TOP[2] + (BOTTOM[2] - TOP[2]) * t,
    )
    for x in range(WIDTH):
        pixels[y][x] = (clamp(row_color[0]), clamp(row_color[1]), clamp(row_color[2]))


def draw_glow(cx, cy, radius, color, strength=0.55):
    """A soft radial glow, falling off quadratically."""
    r_int = int(radius)
    for y in range(cy - r_int, cy + r_int + 1):
        for x in range(cx - r_int, cx + r_int + 1):
            distance = math.hypot(x - cx, y - cy)
            if distance > radius:
                continue
            falloff = 1.0 - (distance / radius)
            put(x, y, color, strength * falloff * falloff)


def draw_ellipse_ring(cx, cy, rx, ry, thickness, color, alpha=1.0):
    """An anti-aliased elliptical ring - a pad seen in perspective."""
    samples = 2000
    for i in range(samples):
        angle = (i / samples) * math.tau
        for offset in range(-thickness, thickness + 1):
            x = cx + (rx + offset) * math.cos(angle)
            y = cy + (ry + offset * (ry / rx)) * math.sin(angle)
            edge = 1.0 - abs(offset) / (thickness + 1)
            put(int(x), int(y), color, alpha * edge)


def draw_disc(cx, cy, radius, color, alpha=1.0):
    """An anti-aliased filled circle."""
    r_int = int(radius) + 1
    for y in range(cy - r_int, cy + r_int + 1):
        for x in range(cx - r_int, cx + r_int + 1):
            distance = math.hypot(x - cx, y - cy)
            if distance <= radius - 0.5:
                put(x, y, color, alpha)
            elif distance <= radius + 0.5:
                # Feather the last pixel so small dots do not look jagged.
                put(x, y, color, alpha * (radius + 0.5 - distance))


# --- Three Mood Pads, as glowing rings in perspective -----------------------
PAD_LAYOUT = [
    # (centre x fraction, centre y fraction, radius x, emotion index)
    (0.24, 0.70, 0.115, 0),  # Calm
    (0.50, 0.775, 0.145, 4),  # Love
    (0.76, 0.70, 0.115, 5),  # Curiosity
]

for fx, fy, frx, emotion in PAD_LAYOUT:
    cx = int(WIDTH * fx)
    cy = int(HEIGHT * fy)
    rx = int(WIDTH * frx)
    ry = max(4, int(rx * 0.36))
    color = EMOTION_COLORS[emotion]

    draw_glow(cx, cy, rx * 1.5, color, strength=0.30)
    draw_ellipse_ring(cx, cy, rx, ry, max(1, SCALE), color, alpha=0.95)
    # A brighter inner ring reads as the beacon base.
    draw_ellipse_ring(cx, cy, int(rx * 0.45), max(2, int(ry * 0.45)), SCALE, color, alpha=0.5)

# --- Beacon columns rising from each pad ------------------------------------
for fx, fy, _frx, emotion in PAD_LAYOUT:
    cx = int(WIDTH * fx)
    base_y = int(HEIGHT * fy)
    color = EMOTION_COLORS[emotion]
    height = int(HEIGHT * 0.22)
    half_width = max(1, SCALE)

    for y in range(base_y - height, base_y):
        # Fade out toward the top of the column.
        t = (base_y - y) / height
        alpha = 0.55 * (1.0 - t) ** 1.4
        for x in range(cx - half_width, cx + half_width + 1):
            put(x, y, color, alpha)


def draw_text(text, cx, cy, pixel_size, color, letter_gap=1):
    """Draws `text` centred on (cx, cy) using the 5x7 bitmap font."""
    glyphs = [FONT[ch] for ch in text]
    total_cells = sum(len(g[0]) for g in glyphs) + letter_gap * (len(glyphs) - 1)
    total_width = total_cells * pixel_size
    total_height = 7 * pixel_size

    x_cursor = cx - total_width // 2
    y_start = cy - total_height // 2

    for glyph in glyphs:
        glyph_width = len(glyph[0])
        for row_index, row in enumerate(glyph):
            for col_index, cell in enumerate(row):
                if cell != "1":
                    continue
                x0 = x_cursor + col_index * pixel_size
                y0 = y_start + row_index * pixel_size
                for dy in range(pixel_size):
                    for dx in range(pixel_size):
                        put(x0 + dx, y0 + dy, color)
        x_cursor += (glyph_width + letter_gap) * pixel_size


# --- Title ------------------------------------------------------------------
title_y = int(HEIGHT * 0.235)
# A subtle dark halo behind the text keeps it legible over the glows.
draw_glow(WIDTH // 2, title_y, int(WIDTH * 0.42), (6, 8, 18), strength=0.75)
draw_text("MOOD MATCH", WIDTH // 2, title_y, max(2, SCALE), (255, 255, 255))

# --- Six emotion dots, the mood palette -------------------------------------
dot_y = int(HEIGHT * 0.40)
dot_radius = max(2.5, 3.2 * SCALE / 3)
spacing = int(WIDTH * 0.055)
start_x = WIDTH // 2 - (spacing * (len(EMOTION_COLORS) - 1)) // 2

for index, color in enumerate(EMOTION_COLORS):
    cx = start_x + index * spacing
    draw_glow(cx, dot_y, dot_radius * 4, color, strength=0.35)
    draw_disc(cx, dot_y, dot_radius * 1.6, color)

# --- Encode PNG -------------------------------------------------------------
raw = bytearray()
for row in pixels:
    raw.append(0)  # filter type 0 (None) for each scanline
    for r, g, b in row:
        raw += bytes((r, g, b))


def chunk(tag, payload):
    data = tag + payload
    return struct.pack(">I", len(payload)) + data + struct.pack(">I", zlib.crc32(data))


png = b"\x89PNG\r\n\x1a\n"
# Bit depth 8, colour type 2 (truecolour RGB), no interlace.
png += chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += chunk(b"IEND", b"")

os.makedirs("images", exist_ok=True)
out_path = os.path.join("images", "scene-thumbnail.png")
with open(out_path, "wb") as handle:
    handle.write(png)

print(f"wrote {out_path}  {WIDTH}x{HEIGHT}  {len(png) / 1024:.1f} KB")
