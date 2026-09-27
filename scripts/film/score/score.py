#!/usr/bin/env python3
"""The film's original score and sound design (FILM.md §7).

    python3.13 scripts/film/score/score.py music|sfx|mix|report|all

music  timeline -> audio/music.wav + audio/stems/*.wav
sfx    build/events.json (or the timeline cues) -> audio/sfx.wav
mix    music + sfx -> mastered audio/score.wav, reports, spectrogram, mp3s
report re-run the verification on the existing score.wav
all    music, sfx, mix

First run builds scripts/film/score/.venv from requirements.txt, then re-executes inside it.
"""
import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV = HERE / '.venv'
REQ = HERE / 'requirements.txt'
BIN = VENV / ('Scripts' if os.name == 'nt' else 'bin')
PY = BIN / ('python.exe' if os.name == 'nt' else 'python')


def ensure_venv():
    if Path(sys.prefix).resolve() == VENV.resolve():
        return
    want = hashlib.sha256(REQ.read_bytes()).hexdigest()
    stamp = VENV / '.requirements-sha256'
    if not PY.exists() or not stamp.exists() or stamp.read_text().strip() != want:
        if sys.version_info < (3, 10):
            sys.exit(f'score: needs Python >= 3.10 to build .venv (this is {sys.version.split()[0]})')
        print('score: building .venv from requirements.txt ...', file=sys.stderr)
        subprocess.check_call([sys.executable, '-m', 'venv', '--clear', str(VENV)])  # exactly the pins
        subprocess.check_call([str(PY), '-m', 'pip', 'install', '--quiet',
                               '--disable-pip-version-check', '-r', str(REQ)])
        stamp.write_text(want)
    os.execv(str(PY), [str(PY), str(Path(__file__).resolve()), *sys.argv[1:]])


def main():
    cmds = ('music', 'sfx', 'mix', 'report', 'all')
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if cmd not in cmds:
        sys.exit(f'usage: score.py {"|".join(cmds)}')
    ensure_venv()
    sys.path.insert(0, str(HERE))
    from scorelib import common
    common.ensure_dirs()
    t0 = time.time()
    if cmd in ('music', 'all'):
        from scorelib import music
        music.run()
    if cmd in ('sfx', 'all'):
        from scorelib import sfx
        sfx.run()
    if cmd in ('mix', 'all'):
        from scorelib import master
        master.run()
    if cmd in ('mix', 'report', 'all'):
        from scorelib import analyze
        ok = analyze.run()
        if not ok:
            print('score: verification FAILED (see audio/report.txt)', file=sys.stderr)
            sys.exit(1)
    print(f'score: {cmd} done in {time.time() - t0:.1f} s -> {common.AUDIO}')


if __name__ == '__main__':
    main()
