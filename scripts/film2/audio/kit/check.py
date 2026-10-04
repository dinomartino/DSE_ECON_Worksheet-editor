#!/usr/bin/env python3
# Checks the synthesised kit from DSP, since nobody can listen in CI (FILM.md §6): per file a
# small spectrogram PNG (demo-media/film-v2/audio/kit/spec/), and
#   onset/offset  the first 2 ms and last 15 ms rise/fall smoothly (no step: |x| at the very
#                 first and last sample < 1 % of peak, and the first 1 ms stays under 50 % of peak: a rise of at least 2 ms)
#   harshness     energy above 8 kHz < 1 % of the file's energy
#   pitch         detected f0 of each intended note (spectral peak near it, ±50 cents) vs intended
#   room          RT60 of room-ir.wav (Schroeder, T20 ×3) in 0.4..0.8 s; wet share ≤ 0.25
# Exit 1 on any failure.  <venv>/bin/python scripts/film2/audio/kit/check.py [<kit dir>]
import json, os, sys
import numpy as np, soundfile as sf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
def main_root():
    d = HERE
    while d != '/' and not os.path.isdir(os.path.join(d, 'demo-media/film-v2')):
        d = os.path.dirname(d)
    return d
KIT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(main_root(), 'demo-media/film-v2/audio/kit')
SPEC = os.path.join(KIT, 'spec'); os.makedirs(SPEC, exist_ok=True)
cat = json.load(open(os.path.join(KIT, 'catalog.json')))['files']
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def hz(n):
    acc = 1 if '#' in n else -1 if n[1:2] == 'b' and len(n) > 2 else 0
    return 440 * 2 ** (((int(n[-1]) + 1) * 12 + PC[n[0]] + acc - 69) / 12)

bad = []
rows = []
for c in cat:
    x, sr = sf.read(os.path.join(KIT, c['name'] + '.wav'))
    m = x.mean(1); pk = np.abs(x).max()
    first, last = np.abs(x[0]).max() / pk, np.abs(x[-1]).max() / pk
    early = np.abs(x[:int(0.001 * sr)]).max() / pk  # a ≥ 2 ms raised-cosine rise is ≤ 50 % at 1 ms
    a0 = int(c['anchor_s'] * sr)
    # the anchor's own onset (bloom: the thump; air: its peak is soft anyway)
    spec = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2
    f = np.fft.rfftfreq(len(m), 1 / sr)
    hi = spec[f > 8000].sum() / spec.sum()
    ok = first < 0.01 and last < 0.01 and early < 0.5 and hi < 0.01
    pitch = []
    seg = m[a0:a0 + int(0.5 * sr)] if c['sound'] != 'bloom' else m[a0 + int(0.15 * sr):a0 + int(1.2 * sr)]
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 1 << 18)); F = np.fft.rfftfreq(1 << 18, 1 / sr)
    for n in c['notes']:
        t = hz(n); w = (F > t * 2 ** (-50 / 1200)) & (F < t * 2 ** (50 / 1200))
        got = F[w][np.argmax(S[w])]
        cents = 1200 * np.log2(got / t)
        pitch.append(f'{n} {t:.1f}→{got:.1f} ({cents:+.0f}c)')
        if abs(cents) > 15: ok = False
    if not ok: bad.append(c['name'])
    rows.append(f"{'ok ' if ok else 'BAD'} {c['name']:<12} first {first*100:4.1f}% last {last*100:4.1f}% 1ms {early*100:4.0f}%  >8k {hi*100:5.2f}%  wet {c['wet']:.2f}  {'; '.join(pitch)}")
    fig = plt.figure(figsize=(3.2, 1.6), dpi=100)
    P, _, _, _ = plt.specgram(m, NFFT=1024, Fs=sr, noverlap=768, cmap='magma')
    plt.clf(); plt.specgram(m, NFFT=1024, Fs=sr, noverlap=768, cmap='magma', vmin=10 * np.log10(P.max()) - 80)  # an 80 dB window
    plt.ylim(0, 10000); plt.title(c['name'], fontsize=7); plt.xticks(fontsize=5); plt.yticks(fontsize=5)
    plt.tight_layout(); fig.savefig(os.path.join(SPEC, c['name'] + '.png')); plt.close(fig)

ir, sr = sf.read(os.path.join(KIT, 'room-ir.wav'))
rts = []
for ch in ir.T:
    edc = np.cumsum((ch ** 2)[::-1])[::-1]; edc = 10 * np.log10(edc / edc[0] + 1e-30)
    t5, t25 = np.argmax(edc <= -5) / sr, np.argmax(edc <= -25) / sr
    rts.append(3 * (t25 - t5))
rt = float(np.mean(rts))
print('\n'.join(rows))
print(f'room RT60 {rt:.2f} s (T20 x3, broadband); max wet share {max(c["wet"] for c in cat):.2f}')
if not (0.4 <= rt <= 0.8) or max(c['wet'] for c in cat) > 0.25: bad.append('room')
if bad:
    print('check: FAIL', bad); sys.exit(1)
print(f'check: all {len(cat)} files pass; spectrograms in {SPEC}')
