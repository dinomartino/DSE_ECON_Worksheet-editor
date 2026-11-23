/**
 * Not a unit test: draws every AI-made diagram case (`src/diagramGen/fixtures.ts`) as
 * SVG in English, 中文 and bilingual, plus the editor JSON of each block, for review.
 * `scripts/diagram-gen-samples.mjs` runs this and turns the SVGs into PNGs.
 * Run alone: `DIAGRAM_OUT=/tmp/x npx vitest run scripts/diagram-gen-samples.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CASES, replyOf } from '@/diagramGen/fixtures';
import { blockOf, evaluateReply } from '@/diagramGen/run';
import { diagramSvg } from '@/render/diagram';
import type { Side } from '@/model/textSlots';

const OUT = process.env.DIAGRAM_OUT ?? path.resolve('out-diagram-gen');

it('draws every case', () => {
  mkdirSync(OUT, { recursive: true });
  const index: Array<{ id: string; file: string; status: string; issues: string[] }> = [];
  const variants: Array<[string, Side[]]> = [
    ['en', ['en']],
    ['zh', ['zh']],
    ['bilingual', ['en', 'zh']],
  ];
  for (const c of CASES) {
    for (const [name, sides] of variants) {
      // The Chinese-only case has no English words to draw.
      if (c.id.endsWith('-zh') && name !== 'zh') continue;
      const evaluated = evaluateReply(replyOf(c.spec), { sides, key: c.key })!;
      const block = blockOf(evaluated, sides)!;
      expect(block).toBeTruthy();
      const language = name as 'en' | 'zh' | 'bilingual';
      const svg = diagramSvg(block.diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language, scale: 2, answers: 'show' });
      const file = `${c.id}.${name}.svg`;
      writeFileSync(path.join(OUT, file), svg);
      if (name !== 'zh' || c.id.endsWith('-zh')) writeFileSync(path.join(OUT, `${c.id}.block.json`), JSON.stringify(block, null, 2));
      const errors = evaluated.issues.filter((i) => i.level === 'error');
      index.push({ id: c.id, file, status: errors.length ? 'failed' : evaluated.issues.length ? 'look' : 'ok', issues: evaluated.issues.map((i) => `${i.level}: ${i.text}`) });
    }
  }
  writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
});
