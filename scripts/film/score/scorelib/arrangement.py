"""The composition (FILM.md §3, §7.1): harmony from the timeline's CHORDS, voice-led
voicings, and every part's notes. Pure data: no audio here.

Grid: 120 BPM, a bar is 2 s, a 16th step is 0.125 s. Sections come from the timeline's
SECTIONS; the full breath (music silent) is the strength-1 `breath` cue up to the next `drop`."""
import re
from collections import defaultdict
from itertools import combinations

import numpy as np

from .common import timeline
from .dsp import nm, rng

STEP = 0.125


def at(bar, step=0.0):
    return bar * 2.0 + step * STEP


# ---------------------------------------------------------------- harmony

_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
# quality -> (intervals above the root, intervals a voicing must contain)
QUAL = {
    'maj9': ((0, 4, 7, 11, 14), (4, 11)),
    'm11': ((0, 3, 7, 10, 14, 17), (3, 10, 17)),
    'maj7': ((0, 4, 7, 11), (4, 11)),
    '6': ((0, 4, 7, 9), (4, 9)),
    'm7': ((0, 3, 7, 10), (3, 10)),
    'm9': ((0, 3, 7, 10, 14), (3, 10, 14)),
    '6sus4': ((0, 5, 7, 9), (5, 9)),
    'maj9(add6)': ((0, 4, 7, 9, 11, 14), (4, 9, 11)),
    '': ((0, 4, 7), (4,)),
}
# Bass register: the chord's bass pitch class -> MIDI (G1..D2, a deep, stepwise line).
BASS_NOTE = {2: 38, 1: 37, 11: 35, 9: 33, 7: 31, 6: 30, 4: 40}


def _pc(name):
    return (_PC[name[0]] + (1 if name[1:] == '#' else -1 if name[1:] == 'b' else 0)) % 12


def parse_chord(sym):
    m = re.match(r'^([A-G][#b]?)(.*?)(?:/([A-G][#b]?))?$', sym)
    if not m or m[2] not in QUAL:
        raise ValueError(f'unknown chord symbol {sym!r}')
    root = _pc(m[1])
    ivs, req = QUAL[m[2]]
    return {
        'sym': sym,
        'root': root,
        'bass': _pc(m[3]) if m[3] else root,
        'tones': {(root + i) % 12 for i in ivs},
        'req': {(root + i) % 12 for i in req},
    }


def _candidates(ch, n, lo, hi):
    pool = [p for p in range(lo, hi + 1) if p % 12 in ch['tones']]
    out = []
    for c in combinations(pool, n):
        if not ch['req'] <= {p % 12 for p in c}:
            continue
        if any(b - a in (1, 13, 25) for a, b in combinations(c, 2)):
            continue  # no minor 2nds / 9ths: lush, never harsh
        gaps = np.diff(c)
        if gaps.max() > 7 or (c[0] < 60 and gaps[0] < 3):
            continue  # close voicing, no mud at the bottom
        out.append(c)
    if not out:
        raise ValueError(f'no voicing for {ch["sym"]}')
    return out


def _unary(c, ch):
    top = c[-1]
    return 0.12 * abs(top - 65) + 0.05 * abs(np.mean(c) - 59) + 0.3 * sum(p % 12 == ch['root'] for p in c)


def _move(a, b):
    d = sum(abs(x - y) for x, y in zip(a, b))
    top = abs(a[-1] - b[-1])
    return d + 0.5 * top + (2.0 if top > 4 else 0.0)


def voice_lead(chords, n=4, lo=50, hi=72):
    """Viterbi over all bars: the voicing sequence with the least total voice movement."""
    cands = [_candidates(ch, n, lo, hi) for ch in chords]
    cost = [np.array([_unary(c, chords[0]) for c in cands[0]])]
    back = []
    for i in range(1, len(chords)):
        prev = cands[i - 1]
        cur = cands[i]
        m = np.array([[cost[-1][j] + _move(p, c) for j, p in enumerate(prev)] for c in cur])
        back.append(m.argmin(axis=1))
        cost.append(m.min(axis=1) + np.array([_unary(c, chords[i]) for c in cur]))
    k = int(np.argmin(cost[-1]))
    path = [k]
    for b in reversed(back):
        k = int(b[k])
        path.append(k)
    path.reverse()
    return [list(cands[i][k]) for i, k in enumerate(path)]


# ---------------------------------------------------------------- the hero melody

# (bar offset, beat, beats, note). Bars 0-7 over Gmaj7 A6 F#m7 Bm9 | Dmaj9 A/C# Bm9 Gmaj9.
# Every odd bar answers; the rhythm "8th 8th dotted-quarter / 8th 8th 8th~" opens each call and
# the call's first three notes are the logo motif (F#-A-D) or its sequence.
HERO = [
    (0, 0.0, 0.5, 'F#4'), (0, 0.5, 0.5, 'A4'), (0, 1.0, 1.5, 'D5'), (0, 2.5, 0.5, 'C#5'),
    (0, 3.0, 0.5, 'D5'), (0, 3.5, 1.5, 'E5'),
    (1, 1.5, 0.5, 'F#5'), (1, 2.0, 1.5, 'E5'), (1, 3.5, 0.5, 'C#5'),
    (2, 0.0, 0.5, 'A4'), (2, 0.5, 0.5, 'C#5'), (2, 1.0, 1.5, 'E5'), (2, 2.5, 0.5, 'D5'),
    (2, 3.0, 0.5, 'E5'), (2, 3.5, 1.5, 'F#5'),
    (3, 1.5, 0.5, 'E5'), (3, 2.0, 0.5, 'D5'), (3, 2.5, 1.0, 'C#5'), (3, 3.5, 0.5, 'B4'),
    (4, 0.0, 0.5, 'A4'), (4, 0.5, 0.5, 'D5'), (4, 1.0, 1.5, 'F#5'), (4, 2.5, 0.5, 'E5'),
    (4, 3.0, 0.5, 'F#5'), (4, 3.5, 1.5, 'A5'),
    (5, 1.5, 0.5, 'B5'), (5, 2.0, 1.0, 'A5'), (5, 3.0, 0.5, 'F#5'), (5, 3.5, 0.5, 'E5'),
    (6, 0.0, 0.5, 'D5'), (6, 0.5, 0.5, 'F#5'), (6, 1.0, 1.5, 'A5'), (6, 2.5, 0.5, 'B5'),
    (6, 3.0, 0.5, 'A5'), (6, 3.5, 1.5, 'F#5'),
    (7, 1.0, 0.5, 'E5'), (7, 1.5, 2.5, 'D5'),
]
MOTIF = ('F#4', 'A4', 'D5')
# Breakdown right hand (Gmaj9 | A6sus4): the top line of the first bar is the motif.
BREAKDOWN_RH = (('B3', 'D4', 'F#4', 'A4', 'D5', 'A4', 'F#4', 'D4'),
                ('D4', 'E4', 'F#4', 'A4', 'D5', 'E5', 'F#5', 'A5'))
ARP = (0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 4, 3, 2)


def melody(start_bar, transpose=0, vel=0.8, bars=8):
    out = []
    for b, beat, beats, name in HERO:
        if b >= bars:
            continue
        v = vel * (1.0 if beats >= 1.0 else 0.88) * (1.04 if beat == 0 else 1.0)
        out.append((at(start_bar + b) + beat * 0.5, beats * 0.5, nm(name) + transpose, v))
    return out


# ---------------------------------------------------------------- automation

def curve(points, n_sec, log=True):
    """Breakpoints [(t, value)] -> a per-sample array, smoothed so no corner clicks."""
    from .common import SR
    from scipy.ndimage import uniform_filter1d
    t = np.arange(int(round(n_sec * SR))) / SR
    xs, ys = zip(*points)
    ys = np.log(ys) if log else np.asarray(ys, dtype=float)
    y = np.interp(t, xs, ys)
    y = uniform_filter1d(y, size=int(0.05 * SR), mode='nearest')
    return np.exp(y) if log else y


# ---------------------------------------------------------------- the score


class Score:
    def __init__(self):
        tl = timeline()
        self.dur = float(tl['DURATION'])
        self.sec = {s['id']: (s['from'], s['to']) for s in tl['SECTIONS']}
        self.nbars = int(round(self.dur / 2.0))
        chords = {c['bar']: c['chord'] for c in tl['CHORDS']}
        self.chords = [parse_chord(chords[b]) for b in range(self.nbars)]
        self.voicing = voice_lead(self.chords)
        cues = sorted(tl['CUES'], key=lambda c: c['t'])
        drops = [c['t'] for c in cues if c['kind'] == 'drop']
        self.breaths = [(c['t'], min(d for d in drops if d > c['t']))
                        for c in cues if c['kind'] == 'breath' and c['strength'] >= 0.99]
        self.cues = cues
        self.rand = rng('humanise')
        self.parts = defaultdict(list)
        self.drums = defaultdict(list)
        self.fx = defaultdict(list)
        self._compose()

    # -- helpers
    def bars(self, sec_id):
        a, b = self.sec[sec_id]
        return range(a, b)

    def section_of(self, bar):
        for k, (a, b) in self.sec.items():
            if a <= bar < b:
                return k
        return None

    def root(self, bar):
        return BASS_NOTE[self.chords[bar]['bass']]

    def silent(self, t):
        return any(a <= t < b for a, b in self.breaths)

    def hum(self, sd):
        return 1.0 + sd * self.rand.standard_normal()

    def hit(self, voice, bar, step, vel, *extra, jitter=0.0):
        t = at(bar, step)
        if self.silent(t):
            return
        if jitter:
            t += self.rand.uniform(-jitter, jitter)
        self.drums[voice].append((t, float(np.clip(vel, 0.03, 1.3)), *extra))

    def note(self, part, t, dur, m, vel):
        if self.silent(t):
            return
        for a, _ in self.breaths:  # nothing rings into a breath
            if t < a < t + dur:
                dur = a - t - 0.02
        self.parts[part].append((t, dur, int(m), float(vel)))

    # -- composition
    def _compose(self):
        self._pad()
        self._arp()
        self._bass()
        self._keys()
        self._lead()
        self._drums()
        self._fx()

    def _pad(self):
        sec = self.sec
        vel_of = {'intro-a': 0.62, 'intro-b': 0.85, 'groove-a': 0.85, 'hero': 0.8, 'groove-b': 0.85,
                  'breakdown': 0.85, 'final': 0.9, 'outro': 1.3}
        reattack = {at(sec['groove-a'][0]), at(sec['breakdown'][0]), at(sec['outro'][0])}
        pad_end = self.dur - 3.0
        for layer, shift, bars, lv in (('pad', 0, range(self.nbars), 1.0),
                                       ('pad_hi', 12, self.bars('final'), 0.5)):
            for v in range(4):
                cur = None
                for b in bars:
                    p = self.voicing[b][v] + shift
                    t = at(b)
                    if cur and cur[1] == p and t not in reattack:
                        continue
                    if cur:
                        self._pad_note(layer, cur[0], t, cur[1], lv, vel_of)
                    cur = (t, p)
                end = min(at(bars[-1] + 1), pad_end) if layer == 'pad' else at(bars[-1] + 1)
                self._pad_note(layer, cur[0], end, cur[1], lv, vel_of)

    def _pad_note(self, layer, t0, t1, m, lv, vel_of):
        sec = self.sec
        sid = self.section_of(int(t0 // 2))
        atk, rel = 0.22, 0.5
        if t0 == 0:
            atk = 2.8
        elif t0 < at(sec['intro-b'][1]):
            atk, rel = 0.6, 0.9
        if t0 == at(sec['groove-a'][0]):
            atk = 0.015
        if t0 == at(sec['breakdown'][0]):
            atk = 1.4
        if t0 == at(sec['final'][0]):
            atk = 0.02
        if t0 == at(sec['outro'][0]):
            atk, rel = 0.01, 2.6
        for a, _ in self.breaths:
            if t0 < a <= t1:
                t1, rel = a - 0.012, 0.012
        if t1 == at(sec['breakdown'][0]):
            t1, rel = t1 - 0.25, 0.25  # a breath before the breakdown swell
        self.parts[layer].append((t0, t1 - t0, m, vel_of[sid] * lv, atk, rel))

    def _arp(self):
        plays = ['intro-b', 'groove-a', 'hero', 'groove-b', 'final']
        base = {'groove-a': 0.8, 'hero': 0.5, 'groove-b': 0.78, 'final': 0.85}
        a0, a1 = self.sec['intro-b']
        for sid in plays:
            for b in self.bars(sid):
                notes = sorted({p + o for p in self.voicing[b] for o in (12, 24)})
                for s in range(16):
                    acc = (1.0, 0.72, 0.86, 0.72)[s % 4] * self.hum(0.05)
                    if sid == 'intro-b':
                        v = 0.4 + 0.5 * ((b - a0) * 16 + s) / ((a1 - a0) * 16)
                    else:
                        v = base[sid]
                    m = notes[ARP[s]]
                    self.note('arp', at(b, s), 0.75, m, v * acc)
                    if sid == 'final':
                        self.note('arp', at(b, s), 0.75, m + 12, 0.42 * acc)

    def _bass(self):
        # (16th step, length in steps, semitones above the root); the fifth on step 14 is a pickup
        groove = [(0, 6, 0), (6, 2, 12), (8, 5, 0), (14, 2, 7)]
        tresillo = [(0, 3, 0), (3, 3, 0), (6, 2, 12), (8, 3, 0), (11, 3, 0), (14, 2, 7)]
        final = [(0, 3, 0), (3, 3, 12), (6, 2, 0), (8, 3, 0), (11, 3, 12), (14, 2, 7)]
        half = [(0, 12, 0), (12, 4, 7)]
        pulse = [(s, 1.5, 0) for s in range(0, 16, 2)]
        a0, a1 = self.sec['intro-b']
        for b in range(self.nbars):
            sid = self.section_of(b)
            r = self.root(b)
            if sid == 'intro-b':
                pat, vel = pulse, 0.6 + 0.3 * (b - a0) / (a1 - a0)
            elif sid == 'groove-a':
                pat, vel = groove, 0.9
            elif sid == 'hero':
                pat, vel = (half if b == self.sec['hero'][0] else groove), 0.9
            elif sid == 'groove-b':
                pat, vel = tresillo, 0.9
                if b == self.sec['groove-b'][1] - 1:
                    pat = [(0, 6, 0), (8, 4, 0)]  # thins out into the breakdown
            elif sid == 'final':
                pat, vel = final, 0.95
            else:
                continue
            for s, ln, iv in pat:
                self.note('bass', at(b, s), ln * STEP - 0.01, r + iv, vel * (0.92 if s % 4 else 1.0))
        # the end: a long tonic under the impact
        o = self.sec['outro'][0]
        self.parts['bass'].append((at(o), self.dur - at(o) - 0.2, self.root(o), 1.0, 2.6))

    def _keys(self):
        sec = self.sec
        # EP stabs lock to the tresillo bass in groove B (and, softer, the final chorus).
        for sid, vel in (('groove-b', 0.62), ('final', 0.4)):
            for b in self.bars(sid):
                steps = (3, 6) if (sid == 'groove-b' and b == sec['groove-b'][1] - 1) else (3, 6, 11, 14)
                for s in steps:
                    for p in self.voicing[b]:
                        self.note('ep', at(b, s), 0.16, p + 12, vel * self.hum(0.04))
        # Breakdown piano: bass octave, and a broken chord whose top line traces the motif.
        for i, b in enumerate(self.bars('breakdown')):
            r = self.root(b) + 12
            self.note('piano', at(b), 2.4, r, 0.52)
            self.note('piano', at(b), 2.4, r + 7, 0.4)
            for k, name in enumerate(BREAKDOWN_RH[i % 2]):
                vel = 0.42 + (0.4 * k / 7 if i == 1 else 0.0)
                self.note('piano', at(b, 2 * k), at(b + 1) - at(b, 2 * k) + 0.3, nm(name), vel)
        # The end: a rolled tonic chord on the impact.
        o = sec['outro'][0]
        r = self.root(o)
        ring = self.dur - at(o) - 0.5  # rings into the final fade
        self.parts['piano'].append((at(o), ring, r - 12, 0.8))
        self.parts['piano'].append((at(o), ring, r, 0.72))
        for k, p in enumerate(sorted(self.voicing[o])):
            self.parts['piano'].append((at(o) + 0.018 * (k + 1), ring, p, 0.55))

    def _lead(self):
        sec = self.sec
        # The sonic logo on "Supply. Demand. Equilibrium." (the timeline's first two ticks and
        # first hit), again at the title, and resolved to D at the end.
        first = [c['t'] for c in self.cues if c['kind'] in ('tick', 'hit')][:3]
        for t, name, v in zip(first, MOTIF, (0.62, 0.66, 0.74)):
            self.parts['motif'].append((t, 3.6, nm(name), v))
        title = next(c['t'] for c in self.cues if c['kind'] == 'tick' and c['t'] > first[-1])
        for k, name in enumerate(MOTIF):
            self.parts['flourish'].append((title + 0.25 * k, 1.6, nm(name) + 12, 0.42 + 0.06 * k))
        o = at(sec['outro'][0])
        tag = next(c['t'] for c in self.cues if c['kind'] == 'tick' and c['t'] > o)
        for k, (name, v) in enumerate(zip(MOTIF, (0.58, 0.63, 0.74))):
            self.parts['motif'].append((tag + k, self.dur - tag - k - 0.3, nm(name), v))
        self.parts['flourish'].append((tag + 2, 3.0, nm(MOTIF[-1]) + 12, 0.4))
        # Bell lead: the hero, a quiet callback at the groove-B peak, an octave up in the final.
        self.parts['bell'] += melody(sec['hero'][0], 0, 0.8)
        self.parts['bell'] += melody(sec['groove-b'][0] + 4, 0, 0.5, bars=2)
        self.parts['bell'] += melody(sec['final'][0], 12, 0.72)

    def _drums(self):
        sec = self.sec
        H = self.hit

        def hats16(b, base, upto=16, skip=()):
            for s in range(upto):
                if s in skip:
                    continue
                acc = (0.72, 0.5, 1.0, 0.58)[s % 4]
                H('hat', b, s, base * acc * self.hum(0.09), jitter=0.0012)

        def shaker16(b, base, upto=16):
            for s in range(upto):
                H('shaker', b, s, base * (0.55, 0.8, 0.6, 1.0)[s % 4] * self.hum(0.1), jitter=0.0015)

        def four(b, vel=1.0, upto=16):
            for s in (0, 4, 8, 12):
                if s < upto:
                    H('kick', b, s, vel * (1.0 if s == 0 else 0.93))

        def backbeat(b, vel=0.9, snare_layer=0.0):
            for s in (4, 12):
                H('clap', b, s, vel)
                if snare_layer:
                    H('snare', b, s, snare_layer)

        def snare_roll(b, s0, s1, v0, v1):
            for s in range(s0, s1):
                H('snare', b, s, v0 + (v1 - v0) * (s - s0) / max(s1 - s0 - 1, 1))

        ga, he, gb, fi, out = (sec[k] for k in ('groove-a', 'hero', 'groove-b', 'final', 'outro'))

        # Groove A: four on the floor, clap 2 & 4, 16th hats; shaker joins for the second phrase.
        for b in range(*ga):
            last, mid = b == ga[1] - 1, b == ga[0] + 3
            if b == ga[0]:
                H('crash', b, 0, 0.9)
            four(b, upto=12 if last else 16)
            backbeat(b, 0.88) if not last else H('clap', b, 4, 0.88)
            hats16(b, 0.78, upto=8 if last else 16, skip=(14,) if mid else ())
            if b >= ga[0] + 4:
                shaker16(b, 0.6, upto=8 if last else 16)
            if mid:
                H('ohat', b, 14, 0.55, at(b + 1))
                H('clap', b, 14, 0.4)
                H('snare', b, 15, 0.35)
            if last:  # fill into "Diagrams."
                snare_roll(b, 8, 16, 0.3, 0.95)

        # Hero: half-time bar under "Diagrams.", then the full groove with a snare layer and rim.
        for b in range(*he):
            if b == he[0]:
                H('crash', b, 0, 1.0)
                H('kick', b, 0, 1.0)
                H('kick', b, 11, 0.7)
                H('clap', b, 8, 0.95)
                H('snare', b, 8, 0.6)
                for s in range(0, 16, 2):
                    H('hat', b, s, 0.7 * (1.0 if s % 4 else 0.75) * self.hum(0.08), jitter=0.0012)
                continue
            last, mid = b == he[1] - 1, b == he[0] + 3
            four(b, upto=12 if last else 16)
            backbeat(b, 0.9, snare_layer=0.45)
            hats16(b, 0.8, upto=8 if last else 16, skip=(14,) if mid else ())
            shaker16(b, 0.62, upto=8 if last else 16)
            if not last:
                H('rim', b, 7, 0.4)
                H('rim', b, 10, 0.3)
            if mid:
                H('ohat', b, 14, 0.55, at(b + 1))
            if last:  # tom fill into groove B
                for s, m in zip(range(8, 16), (54, 54, 50, 50, 45, 45, 50, 45)):
                    H('tom', b, s, 0.55 + 0.4 * (s - 8) / 7, m)
                H('kick', b, 12, 0.9)
                H('snare', b, 15, 0.8)

        # Groove B: tresillo kick push at the peak, skippy hats, rim on the 3-3-2, new fills.
        for b in range(*gb):
            k = b - gb[0]
            last, fill = b == gb[1] - 1, k == 3
            peak = 4 <= k <= 6
            if k in (0, 4):
                H('crash', b, 0, 0.6 if k == 0 else 0.55)
            if last:  # drums thin out into the breakdown
                H('kick', b, 0, 0.85)
                H('kick', b, 8, 0.6)
                H('clap', b, 4, 0.7)
                for s in range(12):
                    H('hat', b, s, (0.75 - 0.05 * s) * (0.72, 0.5, 1.0, 0.58)[s % 4], jitter=0.0012)
                shaker16(b, 0.5, upto=8)
                continue
            four(b)
            if peak:
                H('kick', b, 14, 0.55)
                for s in (4, 12):
                    H('tamb', b, s, 0.6)
            if fill:
                H('kick', b, 10, 0.7)
                H('kick', b, 11, 0.6)
                H('clap', b, 4, 0.88)
                H('clap', b, 12, 0.88)
                H('snare', b, 13, 0.5)
                H('snare', b, 15, 0.7)
                H('ohat', b, 14, 0.6, at(b + 1))
            else:
                backbeat(b, 0.88)
            for s in range(16):
                if fill and s == 14:
                    continue
                acc = (0.55, 0.42, 1.0, 0.6)[s % 4]
                H('hat', b, s, 0.8 * acc * self.hum(0.1), jitter=0.0012)
            shaker16(b, 0.7)
            H('rim', b, 3, 0.4)
            H('rim', b, 11, 0.35)

        # Breakdown: drums out; a soft snare build in its last bar.
        bd = sec['breakdown']
        b = bd[1] - 1
        for s in (4, 6):
            H('snare', b, s, 0.12)
        snare_roll(b, 8, 16, 0.14, 0.6)

        # Final chorus: everything, open hats on the off-beats, crashes on the phrase starts.
        for b in range(*fi):
            k = b - fi[0]
            last = b == fi[1] - 1
            if k in (0, 2, 4, 6):
                H('crash', b, 0, (1.0, 0.8, 0.6, 0.75)[k // 2])
            four(b)
            if last:  # build into the end hit
                H('clap', b, 4, 0.9)
                for s in (0, 2, 4, 6):
                    H('snare', b, s, 0.45 + 0.03 * s)
                snare_roll(b, 8, 16, 0.65, 1.0)
                hats16(b, 0.8, upto=8)
                shaker16(b, 0.7, upto=12)
                continue
            fill = k == 3
            backbeat(b, 0.92, snare_layer=0.5)
            for s in range(16):
                if fill and s >= 12:
                    break
                if s % 4 == 2:
                    H('ohat', b, s, 0.62 * self.hum(0.06), at(b, s + 2))
                elif s % 4 != 3:
                    H('hat', b, s, 0.82 * (0.75, 0.52)[s % 4] * self.hum(0.09), jitter=0.0012)
            shaker16(b, 0.75)
            for s in (4, 12):
                H('tamb', b, s, 0.55)
            if fill:
                snare_roll(b, 12, 16, 0.5, 0.85)
            if k == 5:
                H('ohat', b, 14, 0.5, at(b + 1))

        # The end hit.
        H('crash', out[0], 0, 1.1, 5.5)
        H('kick', out[0], 0, 1.1, 'big')

    def _fx(self):
        sec = self.sec
        for bar, length, vel in ((sec['hero'][0], 1.5, 0.8), (sec['groove-b'][0], 1.0, 0.45),
                                 (sec['final'][0], 2.0, 0.9), (sec['outro'][0], 2.0, 1.0)):
            self.fx['revcym'].append((at(bar), length, vel))
        for bar, length, vel in ((sec['groove-a'][0], 2.5, 0.8), (sec['final'][0], 2.0, 0.6)):
            self.fx['downlifter'].append((at(bar), length, vel))

    # -- automation (Hz, per sample)
    def pad_cutoff(self):
        s = self.sec
        return curve([
            (0, 600), (at(s['intro-b'][0]), 900), (at(s['intro-b'][1]) - 0.5, 2600),
            (at(s['groove-a'][0]), 3200), (at(s['hero'][0]), 3000), (at(s['groove-b'][0]), 3300),
            (at(s['breakdown'][0]), 1100), (at(s['breakdown'][1]) - 0.05, 3800),
            (at(s['final'][0]), 4000), (at(s['outro'][0]), 3400), (self.dur, 650),
        ], self.dur)

    def arp_cutoff(self):
        s = self.sec
        return curve([
            (0, 260), (at(s['intro-b'][0]), 260), (at(s['intro-b'][1]) - 0.5, 3200),
            (at(s['groove-a'][0]), 3000), (at(s['hero'][0]) - 0.2, 3000), (at(s['hero'][0]), 2300),
            (at(s['groove-b'][0]) - 0.2, 2300), (at(s['groove-b'][0]), 3000),
            (at(s['final'][0]) - 0.2, 2800), (at(s['final'][0]), 4200), (self.dur, 4200),
        ], self.dur)

    def pad_gain(self):
        """Pad level automation: the outro decays towards the end fade."""
        o = at(self.sec['outro'][0])
        return curve([(0, 1.0), (o, 1.0), (o + 2.0, 1.0), (self.dur - 2.0, 0.75), (self.dur, 0.45)], self.dur)

    def kicks(self):
        return sorted(t for t, *_ in self.drums['kick'])
