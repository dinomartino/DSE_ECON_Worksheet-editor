/**
 * Not a unit test (k-0577): draws every scene of the catalogue (and its variants) in English
 * and 中文 with its regions lettered, as the offline sheet of every graph type the studio's
 * scenes can produce. `node scripts/k0577-sheet.mjs <dir>` turns it into PNGs and a sheet.
 * Run: `SCENES_OUT=/tmp/x npx vitest run scripts/k0577-scenes.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { blockOf, evaluateSpec } from '@/diagramGen/run';
import { SCENE_SAMPLES } from '@/diagramGen/sceneSamples';
import { diagramSvg } from '@/render/diagram';

const OUT = process.env.SCENES_OUT ?? path.resolve('out-k0577-scenes');

it('draws every scene', () => {
  mkdirSync(path.join(OUT, 'svg'), { recursive: true });
  const rows: unknown[] = [];
  for (const sample of SCENE_SAMPLES) {
    const evaluated = evaluateSpec(sample.spec, { sides: ['en', 'zh'], key: '' });
    const block = blockOf(evaluated, ['en', 'zh']);
    expect(block, sample.id).toBeTruthy();
    for (const language of ['en', 'zh'] as const) {
      writeFileSync(path.join(OUT, 'svg', `${sample.id}.${language}.svg`), diagramSvg(block!.diagram, { widthPx: block!.widthPx, heightPx: block!.heightPx, language, scale: 2, answers: 'show' }));
    }
    const issues = evaluated.issues.map((i) => `${i.level} ${i.code}: ${i.text}`);
    rows.push({ id: sample.id, type: sample.type, status: evaluated.issues.some((i) => i.level === 'error') ? 'failed' : issues.length ? 'look' : 'ok', issues });
  }
  writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ rows }, null, 2));
});
