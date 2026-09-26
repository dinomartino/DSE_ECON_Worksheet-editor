// Where the film reads and writes. The asset store lives in the main checkout so every
// worktree shares it (demo-media/ is gitignored).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILM_DIR = dirname(fileURLToPath(import.meta.url));

function mainRoot() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: FILM_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return dirname(common);
  } catch {
    return resolve(FILM_DIR, '../..'); // no git: this tree is the root
  }
}

export const MAIN_ROOT = mainRoot();
export const OUT = resolve(MAIN_ROOT, 'demo-media/film');
export const ASSETS = resolve(OUT, 'assets');
export const BUILD = resolve(OUT, 'build');
export const AUDIO = resolve(OUT, 'audio');

export function ensureDirs() {
  for (const dir of [OUT, ASSETS, BUILD, AUDIO]) mkdirSync(dir, { recursive: true });
}
