import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { readDocx } from '@/import';

const files = (process.env.DRAW_PROBE ?? '').split(';').filter(Boolean);
const out = process.env.DRAW_PROBE_OUT ?? '/tmp/k0498/svg';

it('dumps drawn pictures', async () => {
  mkdirSync(out, { recursive: true });
  for (const file of files) {
    const bytes = readFileSync(file);
    const r = await readDocx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const tag = /Paper (\d)/.exec(file)?.[1] ?? 'x';
    let n = 0;
    const log: string[] = [];
    r.lines.forEach((l, i) => {
      if (!l.image) return;
      const src = l.image.src;
      if (src.startsWith('data:image/svg')) {
        n++;
        const name = `p${tag}-${String(n).padStart(2, '0')}-line${i}.svg`;
        writeFileSync(path.join(out, name), Buffer.from(src.split(',')[1], 'base64'));
        const before = r.lines.slice(Math.max(0, i - 3), i).map((x) => x.text).join(' | ').slice(-120);
        log.push(`${name} ${l.image.widthPx}x${l.image.heightPx} after: ${before}`);
      } else if (!src) log.push(`LOST line${i} ${l.image.alt}`);
    });
    writeFileSync(path.join(out, `p${tag}.log`), log.join('\n'));
  }
}, 120_000);
