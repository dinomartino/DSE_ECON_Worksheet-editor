"""Mix music + sfx and master (FILM.md §7.2): high-pass 25 Hz, mono below 120 Hz, gentle glue
compression, a look-ahead true-peak limiter, and a fade to digital silence at the end. The gain
is iterated until ffmpeg's ebur128 reads -16 LUFS integrated with true peak <= -1 dBTP."""
import subprocess

import numpy as np
import pedalboard as pb

from .analyze import ebur128
from .arrangement import Score
from .common import AUDIO, SR, S, read_wav, write_wav
from .dsp import cosramp, db, gate_breaths, hp, integrated_lufs, mono_low, tp_limit

TARGET_I = -16.0
TOL = 0.1           # iterate until within this (the spec allows 0.5)
CEILING = -1.3      # limiter ceiling, dBTP; leaves margin for the -1.0 dBTP rule
FADE = 2.5          # seconds of final fade, ending exactly at the film's end
EXCERPT = (12.0, 30.0)  # riser, breath, drop, groove A, the hero melody
# The run-up to a big hit ducks for its last 8th note, so the hit lands in air (a hit coming
# out of a full breath already does).
BIG_HIT, DIP_DB, DIP = 0.85, -10.0, (0.25, 0.004, 0.06)  # strength; depth; start, end, fade-in (s)


def pre_hit_dips(x, cues, breaths):
    g = np.ones(len(x))
    depth = float(db(DIP_DB))
    lead, tail, fade = DIP
    for c in cues:
        t = c['t']
        if c['kind'] != 'hit' or c['strength'] < BIG_HIT or any(a < t <= b for a, b in breaths):
            continue
        i0, i1, i2 = S(t - lead), S(t - tail), S(t)
        env = np.full(i2 - i0, depth)
        k = S(fade)
        env[:k] = 1 - (1 - depth) * cosramp(k)
        env[i1 - i0:] = depth + (1 - depth) * cosramp(i2 - i1)
        g[i0:i2] = np.minimum(g[i0:i2], env)
    return x * g[:, None]


def glue(x):
    """A touch of presence (+1.5 dB around 3.5 kHz), then gentle 1.8:1 bus compression."""
    chain = pb.Pedalboard([
        pb.PeakFilter(cutoff_frequency_hz=3500, gain_db=1.5, q=0.7),
        pb.Compressor(threshold_db=-17.0, ratio=1.8, attack_ms=30.0, release_ms=220.0),
    ])
    return chain(x.T.astype(np.float32), SR).T.astype(np.float64)


def end_fade(x):
    k = S(FADE)
    x[-k:] *= (np.cos(np.pi / 2 * cosramp(k)) ** 2)[:, None]
    x[-1] = 0.0
    return x


def mp3(src, dst, start=None, length=None):
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
    if start is not None:
        cmd += ['-ss', str(start), '-t', str(length)]
    cmd += ['-i', str(src)]
    if start is not None:
        cmd += ['-af', f'afade=t=in:d=0.25,afade=t=out:st={length - 1.2}:d=1.2']
    cmd += ['-c:a', 'libmp3lame', '-b:a', '256k', str(dst)]
    subprocess.run(cmd, check=True)


def run():
    sc = Score()
    breaths = sc.breaths
    music = read_wav(AUDIO / 'music.wav')
    sfx = read_wav(AUDIO / 'sfx.wav')
    x = mono_low(hp(music + sfx, 25.0, order=2))
    x *= db(-18.0 - integrated_lufs(x))  # stage the glue compressor
    x = end_fade(pre_hit_dips(glue(x), sc.cues, breaths))
    g = TARGET_I - integrated_lufs(x)
    for it in range(6):
        y, gain = tp_limit(x * db(g), CEILING)
        y = end_fade(gate_breaths(y, breaths))
        write_wav(AUDIO / 'score.wav', y, 'PCM_24')
        m = ebur128(AUDIO / 'score.wav')
        print(f'master: pass {it + 1}: gain {g:+.2f} dB -> I {m["I"]:.2f} LUFS, TP {m["TP"]:.2f} dBTP, '
              f'max limiting {-20 * np.log10(gain.min()):.2f} dB')
        if abs(m['I'] - TARGET_I) <= TOL and m['TP'] <= -1.0:
            break
        g += TARGET_I - m['I']
    mp3(AUDIO / 'score.wav', AUDIO / 'score.mp3')
    mp3(AUDIO / 'score.wav', AUDIO / 'score-excerpt.mp3', *EXCERPT)
