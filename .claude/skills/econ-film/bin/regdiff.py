#!/usr/bin/env python3
"""regdiff.py A_dir B_dir [thr] — per-frame mean abs diff (0-255, full res) between same-named PNGs; lists frames over thr."""
import sys, os, glob
import numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]
thr = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
rows = []
for f in sorted(glob.glob(os.path.join(a, '*.png'))):
    g = os.path.join(b, os.path.basename(f))
    if not os.path.exists(g):
        print('missing', os.path.basename(f)); continue
    x = np.asarray(Image.open(f).convert('RGB'), dtype=np.int16)
    y = np.asarray(Image.open(g).convert('RGB'), dtype=np.int16)
    d = np.abs(x - y)
    rows.append((os.path.basename(f), d.mean(), d.max(), (d.max(2) > 8).sum()))
m = np.array([r[1] for r in rows])
print(f'frames {len(rows)}  mean {m.mean():.4f}  max-frame {m.max():.4f}  frames>thr {sum(1 for r in rows if r[1] > thr)}')
for n, mean, mx, big in rows:
    if mean > thr: print(f'  {n}  mad {mean:.4f}  max {mx}  px>8 {big}')
