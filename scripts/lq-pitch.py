#!/usr/bin/env python3
"""Measure the dotted answer-line pitch on a rendered page.

Usage: lq-pitch.py <150dpi-grayscale-page.png> <expected-px>

Clusters dark pixel rows into lines and takes the median gap between consecutive
line centres. Prints PITCH OK / PITCH FAIL; the caller treats FAIL as a harness
failure. Measured rather than asserted from the XML because the XML was right the
last time the rendered page was wrong (§ verify by rendering).
"""

from __future__ import annotations

import statistics
import sys

import numpy as np
from PIL import Image


def main() -> int:
    path, expected = sys.argv[1], float(sys.argv[2])
    im = np.asarray(Image.open(path).convert("L"))
    dark = (im < 128).sum(axis=1)
    rows = [y for y in range(im.shape[0]) if dark[y] > 100]
    clusters: list[list[int]] = []
    for y in rows:
        if clusters and y - clusters[-1][-1] <= 2:
            clusters[-1].append(y)
        else:
            clusters.append([y])
    centers = [sum(c) / len(c) for c in clusters]
    gaps = [b - a for a, b in zip(centers, centers[1:])]
    # Uniform line gaps only: page furniture and footers sit at other distances.
    line_gaps = [g for g in gaps if 30 < g < 90]
    if len(line_gaps) < 5:
        print(f"PITCH FAIL: only {len(line_gaps)} usable gaps on {path}")
        return 0
    pitch = statistics.median(line_gaps)
    ok = abs(pitch - expected) <= 1.0
    label = "PITCH OK" if ok else "PITCH FAIL"
    print(f"{label}: median {pitch:.1f}px over {len(line_gaps)} gaps, expected {expected:.0f}±1px")
    return 0


if __name__ == "__main__":
    sys.exit(main())
