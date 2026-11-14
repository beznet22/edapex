#!/usr/bin/env python3
"""Generate the workspace PWA icon set.

The icons are drawn here rather than committed as opaque binaries so the source
of truth stays reviewable in the repo. Run this only when the mark changes:

    pnpm run build:icons

Design: the "E" monogram on the Gold-on-Slate background used by the workspace
shell, at the two sizes the manifest declares plus a maskable variant with the
extra safe-zone padding the maskable spec requires.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "workspace" / "icons"

BACKGROUND = (22, 26, 36, 255)
GOLD = (226, 183, 87, 255)

# Maskable icons are cropped to a circle on some launchers, so the mark must sit
# inside the inner 80% and the background must reach every edge.
SAFE_ZONE = 0.80


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    raise SystemExit("No bold sans font found; install fonts-dejavu or edit load_font().")


def draw_icon(size: int, *, maskable: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(image)

    # Corner radius: near-square for "any", fully flat for "maskable" because the
    # launcher applies its own mask.
    if not maskable:
        radius = int(size * 0.22)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
        image.putalpha(mask)
        draw = ImageDraw.Draw(image)

    scale = SAFE_ZONE if maskable else 0.62
    font = load_font(int(size * scale * 0.9))
    text = "E"
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(
        ((size - (right - left)) / 2 - left, (size - (bottom - top)) / 2 - top),
        text,
        font=font,
        fill=GOLD,
    )
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
        ("favicon-32.png", 32, False),
    ]
    for name, size, maskable in targets:
        draw_icon(size, maskable=maskable).save(OUT / name, "PNG", optimize=True)
        print(f"wrote {name} ({size}x{size})")


if __name__ == "__main__":
    main()
