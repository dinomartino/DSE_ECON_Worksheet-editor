#!/usr/bin/env node
// Seam table: the frames ± N around every scene boundary of timeline.mjs SCENES in a rendered
// video, each with its mean luma and its MAD to the previous frame. A hard cut reads as one
// big MAD at frame 0 and quiet either side; a transition reads as a smooth run; a bad seam
// shows a spike next to the cut (a duplicate or a half-state frame). --strict exits 1 when a
// hard cut shows no change or has a spike (> --spike × the quieter side) within ± N frames.
//   node scripts/film2/tools/seam.mjs <video> [--from=<film s>] [--frames=3] [--scene=<id>] [--strict]
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, halfIn, isCut } from '../timeline.mjs';
import { frameStats, parseFlags, probe } from './motion-check.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { o, pos } = parseFlags('node scripts/film2/tools/seam.mjs', 'frames ± N around each scene boundary: mean luma and MAD to the previous frame', {
    from: '<s> film time of the video\'s first frame (default 0)',
    frames: '<n> frames either side (default 3)',
    scene: '<id> only the boundary into this scene',
    spike: '<x> with --strict: neighbour MAD over this × the quieter side is a spike (default 4)',
    strict: 'exit 1 on a weak hard cut or a spike beside a cut',
  });
  const video = resolve(pos[0]);
  const n = Number(o.frames ?? 3), from = Number(o.from ?? 0), spike = Number(o.spike ?? 4);
  const { fps } = await probe(video);
  const { mad, luma } = await frameStats(video);
  const end = from + mad.length / fps;
  let bad = 0;
  SCENES.forEach((s, i) => {
    if (i === 0 || (o.scene && s.id !== o.scene) || s.from < from || s.from >= end) return;
    const type = s.in?.type ?? 'cut';
    const k = Math.round((s.from - from) * fps);
    console.log(`\n${SCENES[i - 1].id} -> ${s.id}  ${type}  at ${s.from.toFixed(3)} s (frame ${k})${!isCut(s) ? `, window ±${halfIn(s).toFixed(3)} s` : ''}`);
    console.log('  rel   frame   time      luma    MAD');
    for (let d = -n; d <= n; d++) {
      const f = k + d;
      if (f < 0 || f >= mad.length) continue;
      console.log(`  ${String(d).padStart(3)}   ${String(f).padStart(5)}   ${(from + f / fps).toFixed(3).padStart(7)}   ${luma[f].toFixed(1).padStart(6)}  ${mad[f].toFixed(2).padStart(6)}${d === 0 ? '   <- first frame of the new scene' : ''}`);
    }
    if (isCut(s)) {
      const at = Math.max(mad[k] ?? 0, mad[k - 1] ?? 0, mad[k + 1] ?? 0);
      const side = [...Array.from({ length: n }, (_, j) => mad[k - 2 - j]), ...Array.from({ length: n }, (_, j) => mad[k + 2 + j])].filter((x) => x != null);
      const other = Math.max(0, ...side), quiet = Math.max(0.3, side.length ? Math.min(...side) : 0.3);
      const flag = at < 1.5 ? 'weak cut (no visible change)' : other > spike * quiet && other > 3 ? `spike beside the cut (MAD ${other.toFixed(2)})` : null;
      if (flag) {
        bad++;
        console.log(`  FLAG: ${flag}`);
      }
    }
  });
  if (o.strict && bad) process.exit(1);
}
