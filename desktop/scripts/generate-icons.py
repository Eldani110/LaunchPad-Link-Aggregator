#!/usr/bin/env python3
"""Generates cross-platform LaunchPad desktop icons (SVG, PNG, ICO, ICNS)."""

import io
import os
import struct
from PIL import Image, ImageDraw

ASSETS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))
os.makedirs(ASSETS_DIR, exist_ok=True)


def draw_icon(size: int) -> Image.Image:
    # Draw at 2x supersampling for crisp antialiasing
    scale = 2
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square gradient background (deep slate -> royal blue -> indigo)
    pad = int(s * 0.06)
    radius = int(s * 0.22)

    grad = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gpx = grad.load()
    for y in range(s):
        ty = y / max(s - 1, 1)
        for x in range(s):
            tx = x / max(s - 1, 1)
            t = (tx * 0.45 + ty * 0.55)
            r = int(17 + (37 - 17) * t)
            g = int(24 + (99 - 24) * t)
            b = int(39 + (235 - 39) * t)
            gpx[x, y] = (r, g, b, 255)

    mask = Image.new("L", (s, s), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    # Subtle glass border
    draw.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=radius,
        outline=(255, 255, 255, 65),
        width=max(2, int(s * 0.014)),
    )

    # 3x3 LaunchPad app grid tiles
    grid_pad = int(s * 0.23)
    gap = int(s * 0.06)
    cell = (s - 2 * grid_pad - 2 * gap) // 3
    tile_r = max(2, int(cell * 0.28))

    palette = [
        (96, 165, 250, 245),   # sky/blue
        (129, 140, 248, 245),  # indigo
        (52, 211, 153, 245),   # emerald
        (255, 255, 255, 235),  # white glass
        (56, 189, 248, 250),   # cyan highlight
        (255, 255, 255, 220),  # white glass
        (167, 139, 250, 245),  # violet
        (255, 255, 255, 225),  # white glass
        (251, 191, 36, 245),   # amber accent
    ]

    idx = 0
    for row in range(3):
        for col in range(3):
            x0 = grid_pad + col * (cell + gap)
            y0 = grid_pad + row * (cell + gap)
            x1 = x0 + cell
            y1 = y0 + cell
            draw.rounded_rectangle([x0, y0, x1, y1], radius=tile_r, fill=palette[idx])
            idx += 1

    return img.resize((size, size), Image.Resampling.LANCZOS)


def write_icns(base_img: Image.Image, output_path: str) -> None:
    # Modern macOS ICNS supports PNG chunks: ic07 (128), ic08 (256), ic09 (512), ic10 (1024)
    chunk_specs = [
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
    ]
    chunks = []
    for ostype, dim in chunk_specs:
        resized = base_img.resize((dim, dim), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, format="PNG")
        data = buf.getvalue()
        chunks.append(ostype + struct.pack(">I", len(data) + 8) + data)

    body = b"".join(chunks)
    header = b"icns" + struct.pack(">I", len(body) + 8)
    with open(output_path, "wb") as f:
        f.write(header + body)


def write_svg(output_path: str) -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
  </defs>
  <rect x="30" y="30" width="452" height="452" rx="110" fill="url(#bg)" stroke="rgba(255,255,255,0.25)" stroke-width="8"/>
  <g transform="translate(118, 118)">
    <rect x="0"   y="0"   width="72" height="72" rx="20" fill="#60A5FA"/>
    <rect x="102" y="0"   width="72" height="72" rx="20" fill="#818CF8"/>
    <rect x="204" y="0"   width="72" height="72" rx="20" fill="#34D399"/>
    <rect x="0"   y="102" width="72" height="72" rx="20" fill="rgba(255,255,255,0.92)"/>
    <rect x="102" y="102" width="72" height="72" rx="20" fill="#38BDF8"/>
    <rect x="204" y="102" width="72" height="72" rx="20" fill="rgba(255,255,255,0.86)"/>
    <rect x="0"   y="204" width="72" height="72" rx="20" fill="#A78BFA"/>
    <rect x="102" y="204" width="72" height="72" rx="20" fill="rgba(255,255,255,0.88)"/>
    <rect x="204" y="204" width="72" height="72" rx="20" fill="#FBBF24"/>
  </g>
</svg>
"""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(svg)


def main() -> None:
    master = draw_icon(1024)
    png_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    png_512.save(os.path.join(ASSETS_DIR, "icon.png"), format="PNG")

    master.save(
        os.path.join(ASSETS_DIR, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    write_icns(master, os.path.join(ASSETS_DIR, "icon.icns"))
    write_svg(os.path.join(ASSETS_DIR, "icon.svg"))
    print("Generated icons in", ASSETS_DIR)


if __name__ == "__main__":
    main()

