#!/usr/bin/env python3
"""
Generates UI background textures into `images/`.

The mini-game panels were flat colour, which read as unfinished. These give them
depth without shipping any real artwork: a faint grid with a soft vignette, drawn
procedurally so it stays tiny (a few KB) and needs no licensing.

Deliberately LOW CONTRAST. These sit behind live gameplay text and targets, so
anything busier would fight the thing the player is actually reading.

Re-run after editing:

    python3 tools/build-textures.py
"""

import math
import os
import struct
import zlib


def write_rgba_png(path, pixels, width, height):
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, payload):
        data = tag + payload
        return struct.pack(">I", len(payload)) + data + struct.pack(">I", zlib.crc32(data))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)
    return len(png)


def clamp(v):
    return max(0, min(255, int(round(v))))


# --- panel-grid: faint grid + vignette, stretched behind mini-game panels ----
#
# Stretched rather than tiled, so it is authored at a wide aspect to limit how
# much the stretch distorts the grid on a wide panel.
W, H = 256, 128
GRID = 16

pixels = []
for y in range(H):
    row = []
    for x in range(W):
        # Distance from centre, normalised, for the vignette.
        dx = (x - W / 2) / (W / 2)
        dy = (y - H / 2) / (H / 2)
        radial = min(1.0, math.hypot(dx, dy) / 1.35)

        # Base: near-black, lifting very slightly toward the centre.
        base = 16 + (1.0 - radial) * 12

        # Grid lines: a touch brighter, and softened at the intersections.
        on_line = (x % GRID == 0) or (y % GRID == 0)
        line_lift = 14 if on_line else 0

        value = base + line_lift
        # Alpha fades out at the edges so the panel's own rounded corners win.
        alpha = clamp(210 * (1.0 - radial * 0.55))

        row.append((clamp(value * 0.85), clamp(value * 0.9), clamp(value * 1.5), alpha))
    pixels.append(row)

os.makedirs("images", exist_ok=True)
size = write_rgba_png(os.path.join("images", "panel-grid.png"), pixels, W, H)
print(f"  wrote images/panel-grid.png  {W}x{H}  {size / 1024:.1f} KB")

# --- beat-ring: a soft radial glow used behind the Rhythm Tap ring -----------
R = 128
pixels = []
for y in range(R):
    row = []
    for x in range(R):
        dx = (x - R / 2) / (R / 2)
        dy = (y - R / 2) / (R / 2)
        d = math.hypot(dx, dy)
        if d > 1.0:
            row.append((0, 0, 0, 0))
            continue
        # Bright core falling off quadratically; tinted white so the call site can
        # colour it with uiBackground.color.
        falloff = (1.0 - d) ** 2
        row.append((255, 255, 255, clamp(falloff * 190)))
    pixels.append(row)

size = write_rgba_png(os.path.join("images", "glow.png"), pixels, R, R)
print(f"  wrote images/glow.png       {R}x{R}  {size / 1024:.1f} KB")
