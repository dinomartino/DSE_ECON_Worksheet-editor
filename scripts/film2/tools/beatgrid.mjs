#!/usr/bin/env node
// Copies the track's verified beat grid (MUSIC.grid, under demo-media/film-v2/) into
// scripts/film2/beatgrid.<slug>.json, the versioned copy timeline.mjs loads (the stage
// cannot read demo-media/). Never derive the grid from librosa's analysis: its 136 BPM
// drifts ~0.7 s over the track. The verified grid's unit is the 135 BPM eighth ("pulse").
//   node scripts/film2/tools/beatgrid.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MUSIC } from '../music.mjs';
import { FILM2_DIR, MEDIA } from '../paths.mjs';

const known = { help: 'this text' };
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)/.exec(a);
  if (!m || !(m[1] in known)) {
    console.error(`beatgrid: unknown argument ${a} (--help)`);
    process.exit(2);
  }
  console.log('node scripts/film2/tools/beatgrid.mjs   copies MUSIC.grid (music.mjs) into scripts/film2/');
  process.exit(0);
}

const src = resolve(MEDIA, MUSIC.grid);
const g = JSON.parse(readFileSync(src, 'utf8'));
const beat = g.beat_s;
const out = {
  slug: MUSIC.slug,
  source: MUSIC.grid,
  title: g.title,
  bpm: g.bpm, // quarter notes
  beat, // quarter note, s
  pulse: beat / 2, // the eighth (135 BPM): the unit for accents and cuts
  bar: 4 * beat,
  beatsPerBar: 4,
  firstDownbeat: g.first_downbeat_s,
  duration: g.duration_s,
  audibleEnd: g.audible_end_s,
  sections: g.sections.map(({ t, label }) => ({ t, label })),
  residualMs: g.residual_ms,
};
const file = resolve(FILM2_DIR, `beatgrid.${MUSIC.slug}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${MUSIC.slug}: pulse ${out.pulse.toFixed(5)} s (${(out.bpm * 2).toFixed(2)} BPM eighths), bar ${out.bar.toFixed(4)} s, first downbeat ${out.firstDownbeat} s → ${file}`);
