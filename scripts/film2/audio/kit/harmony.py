#!/usr/bin/env python3
# The music's harmony and accents, for the synthesised SFX kit (FILM.md §6). Writes harmony.json
# beside this file (committed): the key (Krumhansl profiles on whole-track chroma), per-section
# keys, the chord on every beat (diatonic triads of the key, best cosine to the beat's chroma),
# and the accent strength of every eighth pulse (onset strength, percentile 0..100 over the track).
# The kit pitches every tonal sound from the chord under its event; sfx.mjs skips a transition
# sound whose cut already lands on a strong music accent. Re-run only when the track changes:
#   <venv with numpy, librosa, soundfile>/bin/python scripts/film2/audio/kit/harmony.py
import json, os, sys
import numpy as np, librosa, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
FILM2 = os.path.dirname(os.path.dirname(HERE))
GRID = json.load(open(os.path.join(FILM2, 'beatgrid.mixkit-31.json')))
def main_root():  # the checkout that holds demo-media/ (worktrees share the main one's)
    d = FILM2
    while d != '/' and not os.path.isdir(os.path.join(d, 'demo-media/film-v2')):
        d = os.path.dirname(d)
    return d
MAIN = sys.argv[1] if len(sys.argv) > 1 else main_root()
WAV = os.path.join(MAIN, 'demo-media/film-v2/audio/music/mixkit-31.norm.wav')

N = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

def key_of(v):
    best = max(((np.corrcoef(v, np.roll(p, i))[0, 1], i, q) for i in range(12) for p, q in ((MAJ, 'major'), (MIN, 'minor'))))
    return {'tonic': N[best[1]], 'mode': best[2], 'r': round(float(best[0]), 3)}

y, sr = sf.read(WAV)
y = librosa.resample(y.mean(1), orig_sr=sr, target_sr=22050)
sr, hop = 22050, 512
C = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
ft = librosa.frames_to_time(np.arange(C.shape[1]), sr=sr, hop_length=hop)
key = key_of(C.mean(1))
tonic = N.index(key['tonic'])
scale = [(tonic + s) % 12 for s in ([0, 2, 4, 5, 7, 9, 11] if key['mode'] == 'major' else [0, 2, 3, 5, 7, 8, 10])]
# diatonic triads (vii° left out: it never carries this track)
triads = []
for d in range(6):
    r, t3, t5 = scale[d], scale[(d + 2) % 7], scale[(d + 4) % 7]
    tpl = np.zeros(12); tpl[r] = 1.3; tpl[t3] = 1; tpl[t5] = 1
    triads.append((N[r] + ('' if (t3 - r) % 12 == 4 else 'm'), [N[r], N[t3], N[t5]], tpl / np.linalg.norm(tpl)))

beats = list(np.arange(GRID['firstDownbeat'] - 2 * GRID['beat'], GRID['audibleEnd'], GRID['beat']))
chords = []
for b in beats:
    m = (ft >= b) & (ft < b + GRID['beat'])
    if not m.any():
        continue
    v = C[:, m].mean(1); v = v / (np.linalg.norm(v) + 1e-9)
    sc = [float(v @ tpl) for _, _, tpl in triads]
    i = int(np.argmax(sc))
    chords.append({'t': round(float(b), 4), 'chord': triads[i][0], 'tones': triads[i][1], 'fit': round(sc[i], 3)})

secs = GRID['sections']
sections = []
for i, s in enumerate(secs):
    end = secs[i + 1]['t'] if i + 1 < len(secs) else GRID['audibleEnd']
    m = (ft >= s['t']) & (ft < end)
    sections.append({'t': s['t'], 'label': s['label'], **key_of(C[:, m].mean(1))})

env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
et = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=hop)
pulses = np.arange(GRID['firstDownbeat'] - 4 * GRID['pulse'], GRID['audibleEnd'], GRID['pulse'])
strength = np.array([env[(et >= p - 0.035) & (et <= p + 0.035)].max() for p in pulses])
rank = np.array([100.0 * (strength < s).mean() for s in strength])
accents = [{'t': round(float(p), 4), 'pct': int(round(r))} for p, r in zip(pulses, rank)]

out = {'source': 'audio/music/mixkit-31.norm.wav', 'key': key, 'scale': [N[s] for s in scale], 'sections': sections,
       'beat': GRID['beat'], 'pulse': GRID['pulse'], 'chords': chords, 'accents': accents}
with open(os.path.join(HERE, 'harmony.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
    f.write('\n')
print('key', key, 'scale', out['scale'])
for s in sections:
    print(' ', s['label'], s['t'], s['tonic'], s['mode'], s['r'])
from collections import Counter
print('chords', Counter(c['chord'] for c in chords).most_common())
