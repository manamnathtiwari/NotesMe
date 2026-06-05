#!/usr/bin/env python3
"""Generate NotesMe blue circular PNG icons (16, 48, 128). Pure stdlib."""
import struct, zlib, math, os

def png(path, size):
    cx = cy = (size - 1) / 2.0
    r_outer = size / 2.0 - max(1, size * 0.06)
    r_inner = r_outer - max(1, size * 0.08)
    # Colors (RGBA)
    navy = (10, 25, 41)        # #0a1929
    panel = (19, 47, 76)       # #132f4c
    bright = (41, 182, 246)    # #29b6f6
    white = (235, 245, 255)

    def blend(bg, fg, a):
        return tuple(int(bg[i] + (fg[i] - bg[i]) * a) for i in range(3))

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type 0
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            # Anti-aliased circle edge
            edge = r_outer - dist
            if edge <= -1:
                rows += bytes((0, 0, 0, 0))
                continue
            alpha = max(0.0, min(1.0, edge + 0.5))
            # Vertical gradient navy -> panel inside the disc
            t = y / size
            base = blend(navy, panel, t)
            col = base
            # Bright ring
            ring = abs(dist - (r_outer - max(1, size * 0.04)))
            if ring < max(1.2, size * 0.05):
                col = blend(base, bright, 1 - ring / max(1.2, size * 0.05))
            # Highlighter/pen diagonal stroke (bright) in the middle
            # Line from lower-left to upper-right
            line_d = abs((dx + dy)) / math.sqrt(2)
            along = (dx - dy) / math.sqrt(2)
            half = r_inner * 0.62
            if line_d < max(1.4, size * 0.075) and abs(along) < half:
                strength = 1 - line_d / max(1.4, size * 0.075)
                col = blend(col, bright, strength)
            # Small white nib at the upper-right end of the stroke
            nx = cx + half * (1 / math.sqrt(2))
            ny = cy - half * (1 / math.sqrt(2))
            ndist = math.sqrt((x - nx) ** 2 + (y - ny) ** 2)
            if ndist < max(1.2, size * 0.07):
                col = blend(col, white, 1 - ndist / max(1.2, size * 0.07))
            rows += bytes((col[0], col[1], col[2], int(255 * alpha)))

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(rows), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path, size)

os.makedirs("icons", exist_ok=True)
for s in (16, 48, 128):
    png(f"icons/icon{s}.png", s)
