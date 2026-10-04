// Where film v2 reads and writes (Node only). The asset store and the stock audio live in
// the main checkout so every worktree shares them (demo-media/ is gitignored).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN_ROOT } from '../film/paths.mjs';
import { MUSIC } from './music.mjs';

export { MAIN_ROOT };
export const FILM2_DIR = dirname(fileURLToPath(import.meta.url));
export const MEDIA = resolve(MAIN_ROOT, 'demo-media/film-v2');
// FILM_OUT moves every output (build, audio, the film) elsewhere; the stores stay shared.
export const OUT = process.env.FILM_OUT ? resolve(process.env.FILM_OUT) : MEDIA;
export const ASSETS = resolve(MEDIA, 'assets');
export const STOCK = resolve(MEDIA, 'audio-stock');
export const BUILD = resolve(OUT, 'build');
export const AUDIO = resolve(OUT, 'audio');
/** The muxed music master and its verified grid (music.mjs picks the track). */
export const MUSIC_FILE = resolve(MEDIA, MUSIC.audio);
export const MUSIC_GRID = resolve(MEDIA, MUSIC.grid);
/** The synthesised SFX kit (audio/kit/gen.mjs writes it; gitignored, regenerated from params). */
export const KIT_DIR = resolve(MEDIA, 'audio/kit');

export function ensureDirs() {
  for (const dir of [OUT, BUILD, AUDIO]) mkdirSync(dir, { recursive: true });
}
