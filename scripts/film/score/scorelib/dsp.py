"""DSP toolbox: band-limited oscillators, zipper-free filters, envelopes, reverb, delay,
sidechain, loudness (BS.1770) and a true-peak limiter. Signals are float64, mono (n,) or
stereo (n, 2). All randomness is seeded from a key, so every render is identical."""
import hashlib
import re
from functools import lru_cache

import numpy as np
from numba import njit
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

from .common import SR, S

# ---------------------------------------------------------------- basics


def rng(*key):
    h = hashlib.sha256(repr(key).encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], 'little'))


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def db(x):
    return 10.0 ** (np.asarray(x, dtype=float) / 20.0)


def todb(x, floor=1e-12):
    return 20.0 * np.log10(np.maximum(np.abs(x), floor))


_NOTE = re.compile(r'^([A-G])([#b]?)(-?\d)$')
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def nm(name):
    """'F#4' -> 66 (C4 = 60)."""
    m = _NOTE.match(name)
    if not m:
        raise ValueError(f'bad note {name!r}')
    pc = _PC[m[1]] + (1 if m[2] == '#' else -1 if m[2] == 'b' else 0)
    return 12 * (int(m[3]) + 1) + pc


def cosramp(n):
    """0 -> 1 raised cosine over n samples (no step at either end)."""
    if n <= 0:
        return np.ones(0)
    return 0.5 - 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / n)


def env_ar(n, attack, release_at, release):
    """Raised-cosine attack, hold, raised-cosine release starting at `release_at` (seconds)."""
    e = np.ones(n)
    a = min(S(attack), n)
    e[:a] *= cosramp(a)
    r0 = min(S(release_at), n)
    rl = max(S(release), 1)
    r1 = min(r0 + rl, n)
    e[r0:r1] *= 1.0 - cosramp(rl)[: r1 - r0]
    e[r1:] = 0.0
    return e


def tail_fade(x, secs=0.004):
    """Force a buffer to end at zero."""
    k = min(S(secs), len(x))
    if k:
        f = 1.0 - cosramp(k)
        x[-k:] *= f[:, None] if x.ndim == 2 else f
    return x


def seconds(n):
    return np.arange(n) / SR


def smooth_drift(n, rate, key, depth=1.0):
    """Slow deterministic wander in [-depth, depth]: three incommensurate sines."""
    r = rng('drift', key)
    t = seconds(n)
    y = np.zeros(n)
    for k, mul in enumerate((1.0, 1.618, 2.414)):
        y += np.sin(2 * np.pi * rate * mul * t + r.uniform(0, 2 * np.pi)) / (k + 1.5)
    return depth * y / 1.3


# ---------------------------------------------------------------- oscillators


def phase(freq, phase0=0.0):
    """Running phase in cycles for a per-sample frequency array, starting at phase0."""
    inc = np.asarray(freq, dtype=float) / SR
    return np.cumsum(inc) - inc + phase0


def sine(freq, n=None, phase0=0.0):
    f = np.full(n, float(freq)) if np.ndim(freq) == 0 else freq
    return np.sin(2 * np.pi * phase(f, phase0))


def saw(freq, n=None, phase0=0.0):
    """PolyBLEP band-limited sawtooth."""
    f = np.full(n, float(freq)) if np.ndim(freq) == 0 else np.asarray(freq, dtype=float)
    dt = np.minimum(f / SR, 0.49)
    p = np.mod(phase(f, phase0), 1.0)
    y = 2.0 * p - 1.0
    m = p < dt
    t = p[m] / dt[m]
    y[m] -= t + t - t * t - 1.0
    m = p > 1.0 - dt
    t = (p[m] - 1.0) / dt[m]
    y[m] -= t * t + t + t + 1.0
    return y


def noise(n, key):
    return rng('noise', key).standard_normal(n)


# ---------------------------------------------------------------- filters


@njit(cache=True)
def _svf(x, g, k, mode):
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    for i in range(n):
        gi = g[i]
        ki = k[i]
        a1 = 1.0 / (1.0 + gi * (gi + ki))
        a2 = gi * a1
        a3 = gi * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = ki * v1
        else:
            y[i] = x[i] - ki * v1 - v2
    return y


def svf(x, cutoff, q=0.707, mode='lp'):
    """Zavalishin TPT state-variable filter; `cutoff` and `q` may be per-sample arrays (no zipper)."""
    n = x.shape[0]
    fc = np.clip(np.broadcast_to(np.asarray(cutoff, dtype=float), (n,)), 5.0, SR * 0.47)
    g = np.ascontiguousarray(np.tan(np.pi * fc / SR))
    k = np.ascontiguousarray(np.broadcast_to(1.0 / np.asarray(q, dtype=float), (n,)))
    m = {'lp': 0, 'bp': 1, 'hp': 2}[mode]
    if x.ndim == 1:
        return _svf(np.ascontiguousarray(x, dtype=float), g, k, m)
    return np.stack([_svf(np.ascontiguousarray(x[:, c]), g, k, m)
                     for c in range(x.shape[1])], axis=1)


@lru_cache(maxsize=None)
def _sos(kind, f, order):
    if kind == 'bp':
        return signal.butter(order, f, btype='bandpass', fs=SR, output='sos')
    return signal.butter(order, f, btype=kind, fs=SR, output='sos')


def hp(x, f, order=2):
    return signal.sosfilt(_sos('highpass', float(f), order), x, axis=0)


def lp(x, f, order=2):
    return signal.sosfilt(_sos('lowpass', float(f), order), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos('bp', (float(lo), float(hi)), order), x, axis=0)


def onepole_lp(x, f):
    a = np.exp(-2 * np.pi * f / SR)
    return signal.lfilter([1 - a], [1, -a], x, axis=0)


# ---------------------------------------------------------------- stereo & placement


def pan(x, p):
    """Constant-power pan, p in [-1, 1] (scalar or per-sample)."""
    th = (np.asarray(p, dtype=float) + 1.0) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1)


def add_at(buf, x, start):
    """Mix x into buf at sample `start`, clipped to the buffer."""
    if x.ndim == 1 and buf.ndim == 2:
        x = np.stack([x, x], axis=1)
    a = max(start, 0)
    b = min(start + len(x), len(buf))
    if b > a:
        buf[a:b] += x[a - start: b - start]


def mono_low(x, f=150.0):
    """Mono below ~120 Hz: high-pass the side channel at f (4th order)."""
    m = 0.5 * (x[:, 0] + x[:, 1])
    s = 0.5 * (x[:, 0] - x[:, 1])
    s = signal.sosfilt(_sos('highpass', float(f), 4), s)
    return np.stack([m + s, m - s], axis=1)


def softclip(x, drive=1.0):
    return np.tanh(drive * x) / np.tanh(drive)


# ---------------------------------------------------------------- reverb


@lru_cache(maxsize=None)
def reverb_ir(kind):
    """Synthetic stereo impulse response: decorrelated noise, per-band decay, soft build-up."""
    spec = {
        #        length rt@125  rt@8k  predelay build
        'hall': (4.5, 3.4, 1.4, 0.024, 0.030),
        'plate': (3.0, 2.0, 1.1, 0.008, 0.010),
        'room': (0.9, 0.45, 0.25, 0.003, 0.006),
        'tail': (6.0, 4.5, 1.8, 0.012, 0.020),
    }[kind]
    length, rt_lo, rt_hi, pre, build = spec
    n = S(length)
    t = seconds(n)
    edges = [20, 180, 400, 900, 2000, 4500, 9000, 20000]
    out = np.zeros((n, 2))
    for c in range(2):
        r = rng('ir', kind, c)
        w = r.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi in zip(edges[:-1], edges[1:]):
            fc = np.sqrt(lo * hi)
            u = np.clip((np.log(fc) - np.log(125)) / (np.log(8000) - np.log(125)), 0, 1)
            rt = rt_lo * (rt_hi / rt_lo) ** u
            band = signal.sosfilt(_sos('bp', (float(lo), float(min(hi, SR * 0.45))), 2), w)
            acc += band * np.exp(-6.9078 * t / rt)
        acc *= 1.0 - np.exp(-t / max(build, 1e-4))
        acc = tail_fade(acc, 0.2)
        out[:, c] = acc
    out /= np.sqrt(np.sum(out ** 2, axis=0, keepdims=True))
    return np.concatenate([np.zeros((S(pre), 2)), out], axis=0)


def reverb(send, kind, hp_hz=180.0, lp_hz=9000.0):
    """Wet-only stereo return for a mono or stereo send (summed to mono into the IR)."""
    m = send if send.ndim == 1 else 0.5 * (send[:, 0] + send[:, 1])
    if not np.any(m):
        return np.zeros((len(m), 2))
    ir = reverb_ir(kind)
    wet = np.stack([signal.oaconvolve(m, ir[:, c])[: len(m)] for c in range(2)], axis=1)
    return lp(hp(wet, hp_hz), lp_hz)


def pingpong(send, delay, feedback, taps=8, lp_hz=5500.0, hp_hz=250.0):
    """Ping-pong echo (wet only), each repeat darker than the last; first repeat left."""
    m = send if send.ndim == 1 else 0.5 * (send[:, 0] + send[:, 1])
    n = len(m)
    out = np.zeros((n, 2))
    d = S(delay)
    cur = hp(m, hp_hz)
    for k in range(1, taps + 1):
        cur = onepole_lp(cur, lp_hz)
        off = k * d
        if off >= n:
            break
        out[off:, (k - 1) % 2] += feedback ** (k - 1) * cur[: n - off]
    return out


# ---------------------------------------------------------------- dynamics


def sidechain(n, times, depth, release, attack=0.008):
    """Kick-keyed volume shaper: dip to 1-depth over `attack`, cos^2 recovery over `release`."""
    g = np.ones(n)
    a = max(S(attack), 1)
    r = S(release)
    shape = np.concatenate([1 - depth * cosramp(a), 1 - depth * np.cos(np.pi / 2 * np.arange(r) / r) ** 2])
    for tk in times:
        i = S(tk)
        j = min(i + len(shape), n)
        if 0 <= i < n:
            g[i:j] = np.minimum(g[i:j], shape[: j - i])
    return g


def gate_breaths(x, breaths, fade=0.005):
    """Hard musical silence in each (start, end) window: fade out before start, zero inside."""
    y = x.copy()
    for a, b in breaths:
        i0, i1 = S(a), S(b)
        k = S(fade)
        f = 1.0 - cosramp(k)
        y[i0 - k:i0] *= f[:, None] if y.ndim == 2 else f
        y[i0:i1] = 0.0
    return y


# ---------------------------------------------------------------- loudness (ITU-R BS.1770-4)

_K1 = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
_K2 = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def kweight(x):
    y = signal.lfilter(*_K1, x, axis=0)
    return signal.lfilter(*_K2, y, axis=0)


def _ms(x):
    y = kweight(x)
    return np.sum(y ** 2, axis=1) if y.ndim == 2 else y ** 2


def lufs_window(x):
    """Ungated loudness of a whole (short) signal."""
    p = np.mean(_ms(x))
    return -0.691 + 10 * np.log10(max(p, 1e-20))


def loudness_curve(x, window=0.4, hop=0.1):
    """Momentary (0.4 s) or short-term (3 s) loudness every hop seconds -> (times, LUFS)."""
    p = _ms(x)
    w, h = S(window), S(hop)
    if len(p) < w:
        p = np.concatenate([p, np.zeros(w - len(p))])
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - w + 1, h)
    m = (c[starts + w] - c[starts]) / w
    return (starts + w) / SR, -0.691 + 10 * np.log10(np.maximum(m, 1e-20))


def integrated_lufs(x):
    p = _ms(x)
    w, h = S(0.4), S(0.1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - w + 1, h)
    z = (c[starts + w] - c[starts]) / w
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z = z[lk > -70]
    if not len(z):
        return -np.inf
    rel = -0.691 + 10 * np.log10(np.mean(z)) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return -0.691 + 10 * np.log10(np.mean(z))


def true_peak(x, os=4):
    y = signal.resample_poly(x, os, 1, axis=0)
    return float(np.max(np.abs(y)))


@njit(cache=True)
def _release(g, coef):
    out = np.empty_like(g)
    cur = 1.0
    for i in range(g.shape[0]):
        gi = g[i]
        if gi < cur:
            cur = gi
        else:
            cur = cur + (gi - cur) * coef
        out[i] = cur
    return out


def tp_limit(x, ceiling_db=-1.3, lookahead=0.005, release=0.15, os=4):
    """Look-ahead true-peak limiter: gain never exceeds what the 4x-oversampled peak allows."""
    n = len(x)
    c = float(db(ceiling_db))
    up = np.abs(signal.resample_poly(x, os, 1, axis=0)).max(axis=1)
    pk = np.maximum(up[: n * os].reshape(n, os).max(axis=1), np.abs(x).max(axis=1))
    req = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    L = max(S(lookahead), 1)
    fwd = minimum_filter1d(req, size=L + 1, origin=-(L // 2), mode='nearest')
    g = uniform_filter1d(fwd, size=L + 1, origin=L // 2, mode='nearest')  # mean of fwd[i-L..i] <= req[i]
    g = _release(np.ascontiguousarray(g), 1.0 - np.exp(-1.0 / (release * SR)))
    return x * g[:, None], g
