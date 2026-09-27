"""The verification picture, drawn with Pillow. Not matplotlib: its web backend ships .js files,
which the repo's ESLint would lint inside .venv."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import signal

from .common import SR
from .dsp import loudness_curve

BG, FG, GRID = (11, 11, 12), (235, 235, 235), (95, 95, 100)
MAGMA = ((0.0, (0, 0, 4)), (0.13, (28, 16, 68)), (0.25, (79, 18, 123)), (0.38, (129, 37, 129)),
         (0.5, (181, 54, 122)), (0.63, (229, 80, 100)), (0.75, (251, 135, 97)),
         (0.88, (254, 194, 135)), (1.0, (252, 253, 191)))
CUE = {'hit': (255, 90, 90), 'tick': (127, 208, 255), 'whoosh': (184, 242, 138), 'riser': (255, 209, 102),
       'swell': (201, 167, 255), 'breath': (255, 255, 255), 'drop': (255, 159, 67), 'end': (136, 136, 136)}
W, H = 2400, 1260
L, R = 100, 2370            # plot x range
T1, B1 = 70, 870            # spectrogram panel
T2, B2 = 950, 1190          # loudness panel
F_LO, F_HI, DB_RANGE = 25.0, 20000.0, 90.0
LU_LO, LU_HI = -60.0, -5.0


def _lut():
    xs = [p for p, _ in MAGMA]
    cs = np.array([c for _, c in MAGMA], dtype=float)
    u = np.linspace(0, 1, 256)
    return np.stack([np.interp(u, xs, cs[:, k]) for k in range(3)], axis=1).astype(np.uint8)


def _font(size):
    for p in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/SFNS.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def _dashed(d, x, y0, y1, fill):
    y = y0
    while y < y1:
        d.line([(x, y), (x, min(y + 8, y1))], fill=fill, width=1)
        y += 14


def render(x, tl, path, title, breaths):
    dur = float(tl['DURATION'])
    X = lambda t: L + t / dur * (R - L)
    Yf = lambda f: B1 - (np.log(f) - np.log(F_LO)) / (np.log(F_HI) - np.log(F_LO)) * (B1 - T1)
    Yl = lambda v: B2 - (np.clip(v, LU_LO, LU_HI) - LU_LO) / (LU_HI - LU_LO) * (B2 - T2)
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    small, med, big = _font(17), _font(20), _font(28)

    # spectrogram of the mid channel on a log-frequency axis
    mid = 0.5 * (x[:, 0] + x[:, 1])
    f, t, Z = signal.stft(mid, SR, nperseg=4096, noverlap=4096 - 480, boundary=None)
    P = 20 * np.log10(np.abs(Z) + 1e-10)
    fl = np.geomspace(F_LO, F_HI, 420)
    Pl = np.stack([np.interp(fl, f, P[:, i]) for i in range(P.shape[1])], axis=1)
    ref = np.percentile(Pl, 99.9)
    u = np.clip((Pl - (ref - DB_RANGE)) / DB_RANGE, 0, 1)
    rgb = _lut()[(u * 255).astype(int)][::-1]
    x0, x1 = int(round(X(t[0]))), int(round(X(t[-1])))
    img.paste(Image.fromarray(rgb).resize((x1 - x0, B1 - T1), Image.BILINEAR), (x0, T1))
    for a, b in breaths:
        box = (int(X(a)), T1, int(X(b)), B1)
        img.paste(Image.blend(img.crop(box), Image.new('RGB', (box[2] - box[0], B1 - T1), FG), 0.1), box[:2])

    d.text((L, 18), title, fill=FG, font=big)
    for v in (30, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 16000):
        y = Yf(v)
        d.line([(L - 6, y), (L, y)], fill=FG)
        d.text((L - 10, y), f'{v // 1000}k' if v >= 1000 else str(v), fill=FG, font=small, anchor='rm')
    d.text((12, T1 - 2), 'Hz', fill=FG, font=small)

    # sections: dashed boundaries through both panels, labels alternating in height
    for i, s in enumerate(tl['SECTIONS']):
        xs = X(s['from'] * 2.0)
        _dashed(d, xs, T1, B1, (200, 200, 205))
        _dashed(d, xs, T2, B2, GRID)
        d.text((xs + 6, T1 + (8 if i % 2 == 0 else 34)), f"{s['id']} ({s['energy']})", fill=FG, font=med)
    # cues: triangles under the spectrogram, and a legend
    for c in tl['CUES']:
        xc = X(c['t'])
        d.polygon([(xc, B1 + 4), (xc - 7, B1 + 18), (xc + 7, B1 + 18)], fill=CUE.get(c['kind'], FG))
    lx = R - 8 * 120
    for k, (kind, col) in enumerate(CUE.items()):
        xk = lx + k * 120
        d.polygon([(xk, 24), (xk - 7, 38), (xk + 7, 38)], fill=col)
        d.text((xk + 12, 31), kind, fill=FG, font=small, anchor='lm')
    for tt in range(0, int(dur) + 1, 10):
        for yb in (B1 + 20, B2):
            d.line([(X(tt), yb), (X(tt), yb + 6)], fill=FG)
        d.text((X(tt), B2 + 10), str(tt), fill=FG, font=small, anchor='mt')
    d.text(((L + R) / 2, B2 + 36), 'film seconds', fill=FG, font=med, anchor='mt')

    # loudness panel: momentary and short-term, with the energy map scaled onto LUFS
    d.rectangle([L, T2, R, B2], outline=GRID)
    for v in range(-50, -5, 10):
        d.line([(L, Yl(v)), (R, Yl(v))], fill=(40, 40, 44))
        d.text((L - 10, Yl(v)), str(v), fill=FG, font=small, anchor='rm')
    d.text((12, T2 - 4), 'LUFS', fill=FG, font=small)
    for s in tl['SECTIONS']:
        v = -16 + 20 * np.log10(s['energy']) * 0.75
        d.line([(X(s['from'] * 2.0), Yl(v)), (X(s['to'] * 2.0), Yl(v))], fill=(255, 90, 90), width=4)
    tm, m = loudness_curve(x, 0.4, 0.05)
    d.line(list(zip(X(tm), Yl(m))), fill=(127, 208, 255), width=1)
    ts, st = loudness_curve(x, 3.0, 0.1)
    d.line(list(zip(X(ts), Yl(st))), fill=(255, 209, 102), width=3)
    for k, (label, col) in enumerate((('momentary (400 ms)', (127, 208, 255)), ('short-term (3 s)', (255, 209, 102)),
                                      ('energy map (scaled)', (255, 90, 90)))):
        xk = L + 20 + k * 260
        d.line([(xk, T2 - 16), (xk + 30, T2 - 16)], fill=col, width=4)
        d.text((xk + 38, T2 - 16), label, fill=FG, font=small, anchor='lm')
    img.save(path, optimize=True)
