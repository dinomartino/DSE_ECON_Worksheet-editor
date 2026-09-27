#!/usr/bin/env python3
"""seam.py <stills dir> [grid.png] [--pick=i,j,...] — per frame: mean abs diff to the previous
frame and mean luma (at 480x270), plus an optional grid of picked frames. A seam is clean when
the cut frame's diff is no bigger than its neighbours' and the luma does not pop."""
import sys, os, glob
import numpy as np
from PIL import Image

d = sys.argv[1]
out = next((a for a in sys.argv[2:] if not a.startswith('--')), None)
pick = next((a[7:] for a in sys.argv[2:] if a.startswith('--pick=')), None)
files = sorted(glob.glob(os.path.join(d, '*.png')))
prev = None
rows = []
for f in files:
    im = Image.open(f).convert('RGB')
    a = np.asarray(im.resize((480, 270), Image.BILINEAR), dtype=np.float32)
    luma = a.mean()
    mad = np.abs(a - prev).mean() if prev is not None else 0.0
    rows.append((os.path.basename(f), mad, luma))
    prev = a
for n, mad, luma in rows:
    print(f'{n}  mad {mad:6.2f}  luma {luma:6.1f}')
if out:
    idx = [int(x) for x in pick.split(',')] if pick else list(range(0, len(files), max(1, len(files) // 12)))[:12]
    ims = [Image.open(files[i]).convert('RGB').resize((480, 270), Image.BILINEAR) for i in idx]
    cols = 4
    rws = (len(ims) + cols - 1) // cols
    g = Image.new('RGB', (cols * 480, rws * 270), 'black')
    for k, im in enumerate(ims):
        g.paste(im, ((k % cols) * 480, (k // cols) * 270))
    g.save(out)
    print('grid', out, [os.path.basename(files[i]) for i in idx])
