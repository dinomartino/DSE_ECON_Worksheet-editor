"""Drum and transition voices, all synthesised. Hits are (t, vel) or (t, vel, midi) for toms;
each voice renders into a stereo track and starts sample-accurately at t."""
from functools import lru_cache

import numpy as np

from .common import S
from .dsp import (add_at, bp, cosramp, hp, lp, mtof, noise, pan, phase, rng, seconds, sine,
                  softclip, svf, tail_fade)

TWO_PI = 2 * np.pi


def _onset(n, ms=0.3):
    e = np.ones(n)
    k = max(S(ms / 1000), 1)
    e[:k] = cosramp(k)
    return e


@lru_cache(maxsize=None)
def _metal():
    """Band-limited metallic source (six additive squares at 808-style ratios), 7 s."""
    n = S(7.0)
    t = seconds(n)
    r = rng('metal')
    y = np.zeros(n)
    for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        f *= 1.85
        for h in range(1, 80, 2):
            if f * h > 19000:
                break
            y += np.sin(TWO_PI * f * h * t + r.uniform(0, TWO_PI)) / h
    y = bp(y, 5200, 15500, 2)
    return y / np.max(np.abs(y))


def _metal_slice(n, key):
    m = _metal()
    off = int(rng('metal-off', key).integers(0, len(m) - n - 1))
    return m[off:off + n]


def kick(vel, key, big=False):
    n = S(3.5 if big else 1.0)
    t = seconds(n)
    f = 55 + 115 * np.exp(-t / 0.03) + 60 * np.exp(-t / 0.004)  # settles on A1, the fifth
    body = np.sin(TWO_PI * phase(f))
    env = np.exp(-t / (0.45 if big else 0.17))
    y = softclip(1.6 * body * env, 1.2)
    click = hp(noise(S(0.02), ('kclick', key)), 2200) * np.exp(-seconds(S(0.02)) / 0.0022)
    y[: len(click)] += 0.30 * click
    y *= _onset(n)
    return tail_fade(y, 0.1) * vel


def clap(vel, key):
    n = S(0.8)
    t = seconds(n)
    band = bp(noise(n, ('clap', key)), 850, 2700, 2)
    env = np.zeros(n)
    for k, d in enumerate((0.0, 0.0095, 0.0185, 0.028)):
        i = S(d)
        tau = 0.0045 if k < 3 else 0.10
        env[i:] += np.exp(-t[: n - i] / tau) * _onset(n - i)
    snap = hp(noise(n, ('clap-snap', key)), 5000) * np.exp(-t / 0.05)
    y = band * env * 0.9 + 0.22 * snap * _onset(n)
    return tail_fade(y, 0.08) * vel * 0.55


def snare(vel, key):
    n = S(0.85)
    t = seconds(n)
    tone = 0.8 * np.sin(TWO_PI * phase(185 * (1 + 0.3 * np.exp(-t / 0.012)))) * np.exp(-t / 0.09)
    tone += 0.3 * sine(330, n) * np.exp(-t / 0.05)
    nz = hp(noise(n, ('snare', key)), 1800) * np.exp(-t / (0.10 + 0.06 * vel))
    y = (tone + 0.85 * nz) * _onset(n)
    return tail_fade(y, 0.08) * vel * 0.5


def hat(vel, key, open_=False):
    n = S(1.3 if open_ else 0.25)
    t = seconds(n)
    tau = 0.22 if open_ else 0.022 + 0.018 * vel
    src = 0.6 * _metal_slice(n, key) + 0.55 * hp(noise(n, ('hat', key)), 7500)
    src = svf(src, 9000 + 4000 * vel, 0.7, 'hp') * 0.6 + src * 0.4
    y = lp(src, 12500) * np.exp(-t / tau) * _onset(n)
    return tail_fade(y, 0.04) * vel * (0.16 if open_ else 0.14)


def shaker(vel, key):
    n = S(0.1)
    t = seconds(n)
    a = 0.011
    env = (t / a) * np.exp(1 - t / a)
    y = lp(bp(noise(n, ('shaker', key)), 4200, 11000), 11000) * env
    return tail_fade(y, 0.01) * vel * 0.10


def tamb(vel, key):
    n = S(0.5)
    t = seconds(n)
    jingle = _metal_slice(n, ('tamb', key)) * np.exp(-t / 0.07)
    y = lp(0.7 * jingle + 0.4 * bp(noise(n, ('tamb', key)), 6000, 13000) * np.exp(-t / 0.05), 12000) * _onset(n)
    return tail_fade(y, 0.01) * vel * 0.12


def rim(vel, key):
    n = S(0.07)
    t = seconds(n)
    y = (0.6 * sine(1650, n) + 0.2 * sine(3500, n)) * np.exp(-t / 0.009)
    y += 0.35 * hp(noise(n, ('rim', key)), 2000) * np.exp(-t / 0.004)
    return tail_fade(y * _onset(n), 0.01) * vel * 0.18


def tom(vel, m, key):
    n = S(0.9)
    t = seconds(n)
    f0 = float(mtof(m))
    y = np.sin(TWO_PI * phase(f0 * (1 + 0.45 * np.exp(-t / 0.035)))) * np.exp(-t / 0.24)
    y += 0.18 * bp(noise(n, ('tom', key)), 200, 3500) * np.exp(-t / 0.02)
    return tail_fade(softclip(1.3 * y, 1.0) * _onset(n), 0.08) * vel * 0.5


def crash(vel, key, length=4.5):
    n = S(length)
    t = seconds(n)
    out = np.zeros((n, 2))
    for c in range(2):
        src = 0.55 * _metal_slice(n, (key, c)) + 0.7 * hp(noise(n, ('crash', key, c)), 4000)
        src = lp(hp(src, 380), 13000)
        env = 0.75 * np.exp(-t / 1.05) + 0.25 * np.exp(-t / 0.06)
        out[:, c] = src * env * _onset(n, 0.5)
    return tail_fade(out, 0.5) * vel * 0.12


def revcym(t_end, length, vel, key):
    """Reversed cymbal swelling into t_end and stopping exactly there."""
    c = crash(1.0, ('rev', key), length + 0.3)[::-1][-S(length):].copy()
    c *= cosramp(len(c))[:, None] ** 0.5
    k = S(0.003)
    c[-k:] *= (1 - cosramp(k))[:, None]
    return S(t_end) - len(c), c * vel * 1.6


def downlifter(length, vel, key):
    n = S(length)
    t = seconds(n)
    u = t / length
    out = np.zeros((n, 2))
    fc = 6000 * (300 / 6000) ** u
    for c in range(2):
        x = noise(n, ('down', key, c))
        out[:, c] = svf(x, fc, 1.4, 'bp')
    env = (1 - u) ** 2 * _onset(n, 5)
    return tail_fade(out * env[:, None], 0.05) * vel * 0.12


# ---------------------------------------------------------------- render


PANS = {'kick': 0.0, 'clap': 0.0, 'snare': 0.0, 'hat': -0.22, 'ohat': -0.18, 'shaker': 0.32,
        'tamb': 0.38, 'rim': 0.15}
VOICES = {'kick': kick, 'clap': clap, 'snare': snare, 'hat': hat, 'shaker': shaker,
          'tamb': tamb, 'rim': rim}
TOM_PAN = {57: 0.3, 54: 0.3, 50: 0.0, 45: -0.3}


def render(hits, n):
    """hits: {voice: [(t, vel, ...)]} -> ({voice: stereo track}, room send)."""
    tracks = {}
    for voice, evs in hits.items():
        out = np.zeros((n, 2))
        for i, ev in enumerate(evs):
            t, vel = ev[0], ev[1]
            key = (voice, i)
            if voice == 'crash':
                add_at(out, crash(vel, key, ev[2] if len(ev) > 2 else 4.5), S(t))
            elif voice == 'kick':
                add_at(out, pan(kick(vel, key, big=len(ev) > 2 and ev[2] == 'big'), 0.0), S(t))
            elif voice == 'ohat':
                y = hat(vel, key, open_=True)
                choke = ev[2] if len(ev) > 2 else None
                if choke is not None:
                    k = S(choke - t)
                    if k < len(y):
                        f = S(0.012)
                        y[k:k + f] *= 1 - cosramp(min(f, len(y) - k))
                        y[k + f:] = 0
                add_at(out, pan(y, PANS['ohat']), S(t))
            elif voice == 'tom':
                add_at(out, pan(tom(vel, ev[2], key), TOM_PAN.get(ev[2], 0.0)), S(t))
            else:
                add_at(out, pan(VOICES[voice](vel, key), PANS[voice]), S(t))
        tracks[voice] = out
    return tracks
