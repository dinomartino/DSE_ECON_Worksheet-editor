"""Paths, the timeline, sample-rate helpers and WAV I/O shared by every stage."""
import json
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.io import wavfile

SR = 48000
SCORE_DIR = Path(__file__).resolve().parent.parent
FILM_DIR = SCORE_DIR.parent


def _main_root():
    # The asset store lives in the main checkout so every worktree shares it (FILM.md §6).
    try:
        common = subprocess.check_output(
            ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
            cwd=FILM_DIR, text=True, stderr=subprocess.DEVNULL).strip()
        return Path(common).parent
    except (OSError, subprocess.CalledProcessError):
        return FILM_DIR.parent.parent


MAIN_ROOT = _main_root()
OUT = MAIN_ROOT / 'demo-media' / 'film'
AUDIO = OUT / 'audio'
STEMS = AUDIO / 'stems'
BUILD = OUT / 'build'
EVENTS = BUILD / 'events.json'


def ensure_dirs():
    for d in (AUDIO, STEMS, BUILD):
        d.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def timeline():
    out = subprocess.check_output(['node', str(FILM_DIR / 'timeline-json.mjs')], text=True)
    return json.loads(out)


def nsamples():
    return S(float(timeline()['DURATION']))


def S(t):
    """Film seconds -> sample index (sample-accurate: every grid time is an integer here)."""
    return int(round(t * SR))


def write_wav(path, x, subtype='FLOAT'):
    """Float WAVs go through scipy: libsndfile stamps a time into their PEAK chunk, which
    would make identical renders differ byte-wise."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if subtype == 'FLOAT':
        wavfile.write(str(path), SR, np.asarray(x, dtype=np.float32))
    else:
        sf.write(str(path), np.asarray(x, dtype=np.float64), SR, subtype=subtype)


def read_wav(path):
    x, sr = sf.read(str(path), dtype='float64', always_2d=True)
    assert sr == SR, f'{path}: {sr} Hz, expected {SR}'
    return x
