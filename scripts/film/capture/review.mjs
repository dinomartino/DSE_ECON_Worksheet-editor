// Review media for a captured clip: a quick mp4, a contact sheet (ffmpeg tile, each tile
// labelled with its time when python3 + Pillow are present) and the frame-diff report.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkClip } from './check-clip.mjs';
import { OUT, REVIEW } from './session.mjs';

const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

const LABEL_PY = `
import sys
from PIL import Image, ImageDraw
path, step, fps, cols, tw, th = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
im = Image.open(path).convert('RGB')
d = ImageDraw.Draw(im)
rows = im.height // th
for i in range(cols * rows):
    x, y = (i % cols) * tw, (i // cols) * th
    f = i * step
    d.rectangle([x, y, x + 118, y + 20], fill=(0, 0, 0))
    d.text((x + 4, y + 4), f"{f / fps:5.2f}s #{f}", fill=(255, 255, 255))
im.save(path, quality=90)
`;

/** Contact sheet of `dir`'s frames: `cols`×rows tiles of `tw`×`th`, one every `step` frames. */
export function contactSheet(dir, frames, file, { cols = 6, tiles = 36, tw = 480, th = 300, fps = 60 } = {}) {
  const step = Math.max(1, Math.ceil(frames / tiles));
  const rows = Math.ceil(Math.ceil(frames / step) / cols);
  ff('-framerate', String(fps), '-start_number', '0', '-i', path.join(dir, '%05d.jpg'),
    '-vf', `select='not(mod(n\\,${step}))',scale=${tw}:${th}:flags=area,tile=${cols}x${rows}:padding=4:color=white`,
    '-frames:v', '1', '-q:v', '3', file);
  const py = spawnSync('python3', ['-c', LABEL_PY, file, String(step), String(fps), String(cols), String(tw + 4), String(th + 4)], { encoding: 'utf8' });
  return { file, step, labelled: py.status === 0 };
}

export async function review(name, meta, log = () => {}) {
  fs.mkdirSync(REVIEW, { recursive: true });
  const dir = path.join(OUT.clips, name);
  const mp4 = path.join(REVIEW, `${name}.mp4`);
  ff('-framerate', '60', '-start_number', '0', '-i', path.join(dir, '%05d.jpg'),
    '-vf', 'scale=1440:900:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-movflags', '+faststart', mp4);
  const sheet = contactSheet(dir, meta.frames, path.join(REVIEW, `${name}-sheet.jpg`));
  const stats = checkClip(dir, meta);
  fs.writeFileSync(path.join(REVIEW, `${name}-check.json`), JSON.stringify(stats, null, 1));
  log(`  review ${name}: diff mean ${stats.mean} p95 ${stats.p95} max ${stats.max}; ` +
    `identical ${stats.identicalPairs}, duplicates in motion ${stats.duplicatesInMotion.length}, spikes ${stats.spikes.length}` +
    `${stats.spikes.length ? ` (${stats.spikes.map((s) => `#${s.frame}`).join(' ')})` : ''}; sheet every ${sheet.step} frames`);
  return stats;
}
