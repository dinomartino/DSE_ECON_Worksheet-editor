#!/usr/bin/env python3
"""Compare the cover's three renderings to each other and to the reference scan.

Reads the PNGs `cover-verify.mjs` produced into its out dir and, per paper style:

  - builds a labelled contact sheet (`<paper>-contact.png`) so a human can eyeball
    all four side by side,
  - prints a pairwise mean-absolute-difference table (grayscale, both images
    resized to a common raster) so drift shows up as a number.

The numbers are a tripwire, not a verdict: the reference carries HKEAA wording we
deliberately do not reproduce, so `ref` columns never reach zero. What matters is
that preview / print / docx agree with each other, and that the ref distance falls
as geometry work lands rather than rising.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# Common raster for diffing: A4 aspect at a size where a 1.5pt rule is still >1px.
DIFF_SIZE = (620, 877)
TILE_HEIGHT = 800
LABEL_BAND = 28

LEGS = ["ref", "preview", "print", "docx"]


def load(path: Path) -> Image.Image | None:
    if not path.exists():
        return None
    return Image.open(path).convert("L")


def mean_abs_diff(a: Image.Image, b: Image.Image) -> float:
    xa = np.asarray(a.resize(DIFF_SIZE), dtype=np.int16)
    xb = np.asarray(b.resize(DIFF_SIZE), dtype=np.int16)
    return float(np.abs(xa - xb).mean())


def contact_sheet(images: dict[str, Image.Image], out: Path) -> None:
    tiles = []
    for label, img in images.items():
        w = round(img.width * TILE_HEIGHT / img.height)
        tiles.append((label, img.resize((w, TILE_HEIGHT))))
    width = sum(t.width for _, t in tiles) + 8 * (len(tiles) + 1)
    sheet = Image.new("L", (width, TILE_HEIGHT + LABEL_BAND + 16), 200)
    draw = ImageDraw.Draw(sheet)
    x = 8
    for label, tile in tiles:
        draw.text((x + 4, 6), label, fill=0)
        sheet.paste(tile, (x, LABEL_BAND))
        x += tile.width + 8
    sheet.save(out)


def main() -> int:
    outdir = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/cover-verify")
    failed = False
    for paper in ["p1", "p2"]:
        images = {}
        for leg in LEGS:
            img = load(outdir / f"{paper}-{leg}.png")
            if img is not None:
                images[leg] = img
        missing = [leg for leg in LEGS if leg not in images]
        print(f"\n== {paper.upper()} ==")
        if missing:
            print(f"  missing: {', '.join(missing)}")
        if len(images) < 2:
            print("  not enough images to compare")
            failed = True
            continue
        contact_sheet(images, outdir / f"{paper}-contact.png")
        print(f"  contact sheet -> {outdir / f'{paper}-contact.png'}")
        labels = list(images)
        for i, a in enumerate(labels):
            for b in labels[i + 1 :]:
                score = mean_abs_diff(images[a], images[b])
                print(f"  {a:>7} vs {b:<7} mean|Δ| = {score:6.2f}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
