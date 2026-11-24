/**
 * k-0544, hand-run, step 1 of 2: the picture sets (a grid in a stem table, a picture under every
 * option) of a local bank copy, as the studio hands them to `composite.ts:drawComposite`.
 * Writes `$COMPOSITE_CELLS` (JSON); `scripts/studio-composite-sheet.mjs` then draws each set in
 * a real browser and a contact sheet to check them by eye.
 *   PASTPAPER_BANK=… COMPOSITE_CELLS=/tmp/cells.json npx vitest run scripts/studio-composite-sheet.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { parseManifest, parseTopic, type PastPaperItem } from '@/pastpapers/pack';
import { withFigures, type Composer } from '@/questionStudio/figures';
import { referenceOf } from '@/questionStudio/references';
import type { CompositeCell } from '@/questionStudio/composite';

const BANK = process.env.PASTPAPER_BANK ?? path.resolve('public/pastpaper-bank');
const OUT = process.env.COMPOSITE_CELLS ?? '/tmp/studio-composite-cells.json';
const OPTION_SETS = Number(process.env.OPTION_SETS ?? 5);

it('collects the picture sets', { timeout: 600_000 }, async () => {
  if (!existsSync(path.join(BANK, 'manifest.json'))) return console.warn(`No bank at ${BANK}`);
  const manifest = parseManifest(JSON.parse(readFileSync(path.join(BANK, 'manifest.json'), 'utf8')));
  if ('error' in manifest) throw new Error('manifest');
  const items: PastPaperItem[] = [];
  for (const entry of manifest.topics) {
    const file = path.join(BANK, 'topics', `${entry.id}.json`);
    const data = existsSync(file) ? parseTopic(JSON.parse(readFileSync(file, 'utf8')), entry) : undefined;
    if (data) items.push(...data.items);
  }
  const rank = (i: PastPaperItem) => (i.source.exam === 'HKDSE' ? 3000 : 2000) + (i.source.year ?? 0);
  const sets: Array<{ tag: string; lang: string; at: string; cells: CompositeCell[] }> = [];
  for (const item of items.sort((a, b) => rank(b) - rank(a))) {
    const reference = referenceOf(item, false);
    if (!reference?.figureGrid) continue;
    for (const lang of ['en', 'zh'] as const) {
      const got: CompositeCell[][] = [];
      const compose: Composer = async (cells) => {
        got.push([...cells]);
        return undefined;
      };
      await withFigures([reference], lang, compose);
      for (const cells of got) sets.push({ tag: item.source.tag, lang, at: cells[0].label.startsWith('(') ? 'stem grid' : 'options', cells });
    }
  }
  const grids = sets.filter((s) => s.at === 'stem grid');
  const options = sets.filter((s) => s.at === 'options');
  const optionTags = [...new Set(options.map((s) => s.tag))].slice(0, OPTION_SETS);
  writeFileSync(OUT, JSON.stringify([...grids, ...options.filter((s) => optionTags.includes(s.tag))]));
  console.log(`${new Set(grids.map((s) => s.tag)).size} grids, ${optionTags.length} option sets (of ${new Set(options.map((s) => s.tag)).size}) → ${OUT}`);
});
