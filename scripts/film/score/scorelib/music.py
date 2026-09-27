"""Render the arrangement: every track through its effects, sidechain and level calibration,
summed into the five stems and music.wav (pre-master; stems sum exactly to music.wav)."""
import json

import numpy as np
import pedalboard as pb

from . import drums as D
from . import synths as Y
from .arrangement import Score, at
from .common import AUDIO, SR, STEMS, S, nsamples, timeline_sha256, write_wav
from .dsp import (add_at, cosramp, db, gate_breaths, hp, lp, integrated_lufs, loudness_curve, lufs_window, mono_low,
                  pingpong, reverb, sidechain)

DOTTED_8TH = 0.375  # the 3/16 ping-pong

# Level targets, pre-master LUFS. ('win', bar0, bar1): loudness over that window;
# ('max',): the loudest momentary (400 ms) value, for sparse tracks.
TARGETS = {
    'drums': (-18.0, ('win', 17, 21)),  # full-groove bars (21-22 open up for the orbit)
    'bass': (-21.0, ('win', 17, 21)),
    'pad': (-22.5, ('win', 8, 16)),
    'arp': (-25.5, ('win', 8, 16)),
    'ep': (-24.5, ('win', 24, 31)),
    'piano': (-26.0, ('win', 32, 34)),
    'bell': (-20.0, ('win', 16, 24)),
    'ep_lead': (-21.5, ('win', 28, 31)),
    'motif': (-17.5, ('max',)),
    'flourish': (-22.5, ('max',)),
    'revcym': (-21.0, ('max',)),
    'downlifter': (-26.0, ('max',)),
}
# Drum voices relative to the kick (LU, integrated over where each plays).
DRUM_REL = {'kick': 0.0, 'clap': -2.5, 'snare': -6.5, 'tom': -4.0, 'hat': -12.5, 'ohat': -11.5,
            'shaker': -16.5, 'rim': -15.5, 'tamb': -15.0, 'crash': -9.0}
STEM_OF = {'drums': 'drums', 'bass': 'bass', 'pad': 'harmony', 'arp': 'harmony', 'ep': 'harmony',
           'piano': 'harmony', 'bell': 'lead', 'ep_lead': 'lead', 'motif': 'lead', 'flourish': 'lead',
           'revcym': 'fx', 'downlifter': 'fx'}
STEM_NAMES = ('drums', 'bass', 'harmony', 'lead', 'fx')
# Harmony and lead make room (-5 dB, 10 ms in, 180 ms out) for the picture's accents where the
# music is densest: the final chorus's ticks and whooshes, and the hero's whooshes.
DUCKED = ('pad', 'arp', 'ep', 'piano', 'bell', 'ep_lead', 'motif', 'flourish')
DUCK_DB, DUCK_ATTACK, DUCK_RELEASE = -5.0, 0.01, 0.18


def accent_duck(sc, n):
    fi, he = ([at(b) for b in sc.sec[k]] for k in ('final', 'hero'))
    times = []
    for c in sc.cues:
        t = c['t']
        if c['kind'] == 'tick' and fi[0] <= t < fi[1]:
            times.append(t - DUCK_ATTACK)
        elif c['kind'] == 'whoosh' and (fi[0] <= t < fi[1] or he[0] < t < he[1]):
            times.append(c.get('peak', t + 0.06) - 0.08)
    return sidechain(n, times, 1 - float(db(DUCK_DB)), DUCK_RELEASE, attack=DUCK_ATTACK)[:, None]


def effects(dry, sends, breaths, n, dry_gain=1.0):
    """dry + effect returns. Before a full breath the whole chain (tails included) is cut, so
    the breath is true silence and no tail resumes after it."""
    starts = [0, *(S(b) for _, b in breaths)]
    ends = [*(S(a) for a, _ in breaths), n]
    out = np.zeros((n, 2))
    for a, b in zip(starts, ends):
        x = dry[a:b]
        if not np.any(x):
            continue
        y = dry_gain * x
        for kind, amt, *args in sends:
            y += amt * (pingpong(x, *args) if kind == 'pingpong' else reverb(x, kind))
        if b < n:
            f = S(0.012)
            y[-f:] *= (1 - cosramp(f))[:, None]
        out[a:b] += y
    return out


def chorus(x, mix=0.3):
    fx = pb.Chorus(rate_hz=0.45, depth=0.18, centre_delay_ms=8.0, feedback=0.0, mix=mix)
    return fx(x.T.astype(np.float32), SR).T.astype(np.float64)


def level(x, spec):
    if spec[0] == 'max':
        return float(np.max(loudness_curve(x, 0.4, 0.05)[1]))
    _, b0, b1 = spec
    return lufs_window(x[S(at(b0)):S(at(b1))])


def calibrate(x, name):
    target, spec = TARGETS[name]
    g = target - level(x, spec)
    return x * db(g), g


def render_drums(sc, n):
    tracks = D.render(sc.drums, n)
    gains = {}
    ref = integrated_lufs(tracks['kick'])
    bus = np.zeros((n, 2))
    room = np.zeros((n, 2))
    for v, tr in tracks.items():
        g = ref + DRUM_REL[v] - integrated_lufs(tr)
        gains[v] = round(float(g), 2)
        tr = tr * db(g)
        bus += tr
        if v in ('clap', 'snare', 'tom', 'rim'):
            room += tr * {'clap': 0.35, 'snare': 0.3, 'tom': 0.25, 'rim': 0.3}[v]
    bus += effects(room, [('room', 0.9)], sc.breaths, n, dry_gain=0.0)
    bus += effects(tracks['clap'] * db(gains['clap']), [('plate', 0.12)], sc.breaths, n, dry_gain=0.0)
    return effects(lp(bus, 13000), [], sc.breaths, n), gains  # air, not fizz


def run():
    n = nsamples()
    sc = Score()
    kicks = sc.kicks()
    br = sc.breaths
    P = sc.parts
    log = {}

    def sc_gain(depth, release):
        return sidechain(n, kicks, depth, release)[:, None]

    tracks = {}
    drums, drum_gains = render_drums(sc, n)
    tracks['drums'] = drums
    log['drum_voice_gains_db'] = drum_gains

    tracks['bass'] = effects(Y.bass(P['bass'], n), [], br, n) * sc_gain(0.75, 0.22)

    pad = Y.pad(P['pad'] + P['pad_hi'], n, sc.pad_cutoff())
    tracks['pad'] = hp(effects(pad, [('hall', 0.42)], br, n), 90) * sc_gain(0.45, 0.32) * sc.pad_gain()[:, None]

    arp = hp(Y.pluck(P['arp'], n, sc.arp_cutoff()), 220)
    tracks['arp'] = effects(arp, [('pingpong', 0.34, DOTTED_8TH, 0.42), ('plate', 0.2)], br, n) \
        * sc_gain(0.22, 0.25)

    ep = hp(chorus(Y.ep(P['ep'], n)), 150)
    tracks['ep'] = effects(ep, [('plate', 0.22)], br, n) * sc_gain(0.25, 0.25)

    tracks['piano'] = effects(hp(Y.piano(P['piano'], n, 'piano'), 30), [('hall', 0.32)], br, n)

    bell = hp(Y.bell(P['bell'], n), 220)
    tracks['bell'] = effects(bell, [('pingpong', 0.22, DOTTED_8TH, 0.3), ('plate', 0.2),
                                    ('hall', 0.12)], br, n)

    motif = Y.piano(P['motif'], n, 'motif') + 0.35 * Y.ep(P['motif'], n, 'motif-ep')
    tracks['motif'] = effects(hp(motif, 160), [('hall', 0.5)], br, n)

    tracks['flourish'] = effects(hp(Y.bell(P['flourish'], n, 'flourish'), 300),
                                 [('hall', 0.45), ('pingpong', 0.2, DOTTED_8TH, 0.3)], br, n)

    ep_lead = hp(chorus(Y.ep(P['ep_lead'], n, 'ep-lead'), 0.35), 180)
    tracks['ep_lead'] = effects(ep_lead, [('pingpong', 0.2, DOTTED_8TH, 0.32), ('plate', 0.22)], br, n)

    duck = accent_duck(sc, n)
    for name in DUCKED:
        tracks[name] = tracks[name] * duck

    rev = np.zeros((n, 2))
    for i, (t_end, length, vel) in enumerate(sc.fx['revcym']):
        start, y = D.revcym(t_end, length, vel, i)
        add_at(rev, y, start)
    tracks['revcym'] = effects(rev, [('hall', 0.25)], br, n)
    down = np.zeros((n, 2))
    for i, (t, length, vel) in enumerate(sc.fx['downlifter']):
        add_at(down, D.downlifter(length, vel, i), S(t))
    tracks['downlifter'] = effects(down, [('hall', 0.3)], br, n)

    stems = {k: np.zeros((n, 2)) for k in STEM_NAMES}
    log['track_gains_db'] = {}
    for name, x in tracks.items():
        x, g = calibrate(x, name)
        log['track_gains_db'][name] = round(float(g), 2)
        stems[STEM_OF[name]] += x

    music = np.zeros((n, 2))
    for k in STEM_NAMES:
        s = gate_breaths(mono_low(stems[k]), br)
        s[-S(0.005):] *= (1 - cosramp(S(0.005)))[:, None]
        stems[k] = s
        music += s
        write_wav(STEMS / f'{k}.wav', s)
    write_wav(AUDIO / 'music.wav', music)
    log['timeline_sha256'] = timeline_sha256()
    log['notes'] = {k: len(v) for k, v in P.items()}
    log['hits'] = {k: len(v) for k, v in sc.drums.items()}
    log['voicings'] = [[sc.chords[b]['sym'], sc.voicing[b]] for b in range(sc.nbars)]
    (AUDIO / 'music-levels.json').write_text(json.dumps(log, indent=1))
    print(f'music: {n / SR:.2f} s, peak {np.max(np.abs(music)):.3f}, '
          f'integrated {integrated_lufs(music):.1f} LUFS (pre-master)')
