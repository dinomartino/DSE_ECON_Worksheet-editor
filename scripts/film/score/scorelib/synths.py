"""Pitched instruments. Each renders a list of notes into a dry stereo track of n samples.
A note is (t, dur, midi, vel) with t, dur in seconds; every note starts and ends at zero."""
import numpy as np

from .common import S
from .dsp import (add_at, env_ar, mtof, noise, pan, phase, rng, saw, seconds, sine,
                  smooth_drift, softclip, svf, bp)

TWO_PI = 2 * np.pi


def _pan_for(m, spread=0.35):
    return float(np.clip((m - 64) / 30.0, -spread, spread))


# ---------------------------------------------------------------- felt piano


def piano_note(m, vel, dur, key):
    """Additive felt piano: stretched partials, two detuned strings each, double decay,
    soft felt attack and a little hammer noise. `dur` is how long the note rings."""
    f0 = float(mtof(m))
    n = S(dur + 0.45)
    t = seconds(n)
    r = rng('piano', key)
    b = 0.00011 * 2 ** ((m - 48) / 14)
    tau1 = float(np.clip(5.5 * (220 / f0) ** 0.55, 0.9, 9.0))
    soft = 1.0 - 0.55 * vel
    y = np.zeros(n)
    for k in range(1, 29):
        fk = k * f0 * np.sqrt(1 + b * k * k)
        if fk > 14000:
            break
        amp = k ** -1.2 * np.exp(-(k - 1) * 0.40 * soft - (k - 1) ** 1.4 * 0.025)
        tk = tau1 / (1 + 0.28 * (k - 1) ** 1.2)
        nk = min(n, S(tk * 9))
        tt = t[:nk]
        env = 0.6 * np.exp(-tt / (0.22 * tk)) + 0.4 * np.exp(-tt / tk)
        det = 1 + r.uniform(0.00010, 0.00040)
        p1, p2 = np.pi * r.integers(0, 2, 2)  # zero-crossing starts, random polarity
        y[:nk] += amp * env * (np.sin(TWO_PI * fk * tt + p1) + 0.85 * np.sin(TWO_PI * fk * det * tt + p2))
    felt = bp(noise(S(0.05), ('felt', key)), 180, 2400) * np.exp(-seconds(S(0.05)) / 0.007)
    y[: len(felt)] += 0.05 * vel * felt
    y *= env_ar(n, 0.006 - 0.003 * vel, dur, 0.4)
    return y * 0.22 * vel ** 1.25


def piano(notes, n, key='piano'):
    out = np.zeros((n, 2))
    for i, (t, dur, m, vel) in enumerate(notes):
        add_at(out, pan(piano_note(m, vel, dur, (key, i)), _pan_for(m)), S(t))
    return out


# ---------------------------------------------------------------- soft FM electric piano


def ep_note(m, vel, dur, key):
    f0 = float(mtof(m))
    n = S(dur + 0.35)
    t = seconds(n)
    idx = (0.3 + 1.6 * vel) * np.exp(-t / 0.3) + 0.2 * vel
    ph = TWO_PI * f0 * t
    y = np.sin(ph + idx * np.sin(ph))
    if 14 * f0 < 16000:
        y += 0.10 * vel * np.sin(14 * ph) * np.exp(-t / 0.012)
    y *= 0.65 * np.exp(-t / 0.55) + 0.35 * np.exp(-t / 2.2)
    y *= env_ar(n, 0.0025, dur, 0.3)
    return y * 0.2 * vel


def ep(notes, n, key='ep'):
    out = np.zeros((n, 2))
    for i, (t, dur, m, vel) in enumerate(notes):
        add_at(out, pan(ep_note(m, vel, dur, (key, i)), _pan_for(m, 0.25)), S(t))
    return out


# ---------------------------------------------------------------- warm analog pad


def pad(notes, n, cutoff, key='pad'):
    """notes: (t, dur, m, vel, attack, release). Three detuned PolyBLEP saws per voice,
    left/centre/right (width from detune, mono-safe), 24 dB low-pass following `cutoff`
    (a per-sample array for the whole film), slow analog drift."""
    out = np.zeros((n, 2))
    for i, (t, dur, m, vel, atk, rel) in enumerate(notes):
        k = (key, i)
        r = rng('pad', k)
        f0 = float(mtof(m))
        ln = S(dur + rel)
        i0 = S(t)
        ln = min(ln, n - i0)
        if ln <= 0:
            continue
        lr = np.zeros((ln, 2))
        for j, (cents, wl, wr) in enumerate(((-8.0, 1.0, 0.22), (0.0, 0.62, 0.62), (8.0, 0.22, 1.0))):
            drift = smooth_drift(ln, 0.11, (k, j), depth=2.2)
            s = saw(f0 * 2 ** ((cents + drift) / 1200), phase0=r.uniform())
            lr[:, 0] += wl * s
            lr[:, 1] += wr * s
        cut = cutoff[i0:i0 + ln] * (1 + 0.04 * (m - 60) / 12)
        lr = svf(svf(lr, cut, 0.55), cut * 1.15, 0.75)
        lr *= env_ar(ln, atk, dur, rel)[:, None]
        add_at(out, lr * 0.16 * vel, i0)
    return out


# ---------------------------------------------------------------- glassy pluck


def pluck_note(m, vel, cut0, key, length=0.75):
    f0 = float(mtof(m))
    n = S(length)
    t = seconds(n)
    ph = phase(np.full(n, f0))
    body = 0.55 * saw(np.full(n, f0), phase0=0.5) + 0.3 * np.sin(TWO_PI * 2 * ph)
    cut = np.minimum(cut0 * (1 + 6.0 * np.exp(-t / 0.05)), 16000)
    body = svf(body, cut, 1.05)
    glass = np.sin(TWO_PI * ph + 1.3 * np.exp(-t / 0.035) * np.sin(TWO_PI * 3 * ph))
    y = body + 0.32 * glass * np.exp(-t / 0.10)
    y *= np.exp(-t / 0.17) * env_ar(n, 0.002, length - 0.02, 0.02)
    return y * 0.26 * vel


def pluck(notes, n, cutoff, key='pluck'):
    """notes: (t, dur, m, vel); timbre opens with the per-sample `cutoff` array."""
    out = np.zeros((n, 2))
    for i, (t, dur, m, vel) in enumerate(notes):
        i0 = S(t)
        y = pluck_note(m, vel, float(cutoff[min(i0, n - 1)]), (key, i), min(0.75, dur + 0.02))
        add_at(out, pan(y, _pan_for(m, 0.3) * 0.6), i0)
    return out


# ---------------------------------------------------------------- round sub bass


def bass(notes, n, key='bass'):
    """Sine sub with gentle tanh saturation plus a low-passed saw for small speakers. Mono.
    A note may carry a fifth field: an exponential decay time (s)."""
    out = np.zeros(n)
    for i, (t, dur, m, vel, *tau) in enumerate(notes):
        f0 = float(mtof(m))
        ln = S(dur + 0.03)
        sub = softclip(sine(f0, ln), 2.1)
        mid = svf(saw(f0, ln, phase0=0.5), 520.0, 0.8)
        y = (sub + 0.38 * mid) * env_ar(ln, 0.005, dur, 0.03) * vel * 0.5
        if tau:
            y *= np.exp(-seconds(ln) / tau[0])
        add_at(out, y, S(t))
    return np.stack([out, out], axis=1)


# ---------------------------------------------------------------- bell lead


def bell_note(m, vel, dur, key):
    f0 = float(mtof(m))
    n = S(dur + 1.8)
    t = seconds(n)
    r = rng('bell', key)
    vib = 6.0 * np.clip((t - 0.28) / 0.35, 0, 1) * np.sin(TWO_PI * 5.1 * t + r.uniform(0, TWO_PI))
    ph = phase(f0 * 2 ** (vib / 1200))
    idx = (0.4 + 1.5 * vel) * np.exp(-t / 0.15) + 0.18
    y = np.sin(TWO_PI * ph + idx * np.sin(TWO_PI * 2 * ph))
    for ratio, amp, tau in ((2.76, 0.12, 0.13), (5.40, 0.07, 0.05)):
        if ratio * f0 < 16000:
            y += amp * np.sin(TWO_PI * ratio * ph) * np.exp(-t / tau)
    y *= 0.72 * np.exp(-t / 0.75) + 0.28 * np.exp(-t / 2.6)
    y *= env_ar(n, 0.003, dur + 0.06, 0.4)
    return y * 0.24 * vel


def bell(notes, n, key='bell'):
    out = np.zeros((n, 2))
    for i, (t, dur, m, vel) in enumerate(notes):
        add_at(out, pan(bell_note(m, vel, dur, (key, i)), 0.08), S(t))
    return out
