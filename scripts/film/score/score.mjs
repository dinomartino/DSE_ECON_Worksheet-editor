#!/usr/bin/env node
// Runs score.py with the first Python >= 3.10 found (FILM_PYTHON overrides); score.py builds
// and uses its own .venv. Usage: node scripts/film/score/score.mjs [music|sfx|mix|report|all]
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.FILM_PYTHON,
  'python3.13', 'python3.12', 'python3.11', 'python3.10',
  '/opt/homebrew/bin/python3', 'python3',
].filter(Boolean);
const ok = (py) =>
  spawnSync(py, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)']).status === 0;
const python = candidates.find(ok);
if (!python) {
  console.error('score: no Python >= 3.10 found (set FILM_PYTHON)');
  process.exit(1);
}
const r = spawnSync(python, [join(HERE, 'score.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
