/**
 * k-0544: every past-paper question, used as a reference in the Question studio, reaches the
 * model whole: each picture it prints (stem, table cell, option, passage) is attached to the
 * write and pick requests with where it sits, each table's words are in the example, no option
 * goes as nothing, and a 中文 paper gets the Chinese pictures. The AI is never called: the
 * requests are built and read.
 *
 * Hand-run, against a local copy of the bank (never in this repo):
 *   PASTPAPER_BANK=/path/to/dse-econ-question-bank npx vitest run scripts/studio-reference-verify.test.ts
 * Default: `public/pastpaper-bank/` (gitignored). Writes a report to `$STUDIO_VERIFY_OUT` when set.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { flattenBlocks } from '@/model/edits';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { ContentBlock, McqQuestion } from '@/model/types';
import { parseManifest, parseTopic, type PastPaperItem } from '@/pastpapers/pack';
import { makeBrief } from '@/questionStudio/brief';
import { withFigures } from '@/questionStudio/figures';
import { buildPickRequest } from '@/questionStudio/pick';
import { buildWriteRequest, emptyJob } from '@/questionStudio/prompt';
import { referenceOf } from '@/questionStudio/references';
import type { StudioRequest } from '@/questionStudio/types';

const BANK = process.env.PASTPAPER_BANK ?? path.resolve('public/pastpaper-bank');

function loadItems(): PastPaperItem[] {
  const manifest = parseManifest(JSON.parse(readFileSync(path.join(BANK, 'manifest.json'), 'utf8')));
  if ('error' in manifest) throw new Error('manifest.json is not a bank list');
  const items: PastPaperItem[] = [];
  for (const entry of manifest.topics) {
    const file = path.join(BANK, 'topics', `${entry.id}.json`);
    if (!existsSync(file)) continue;
    const data = parseTopic(JSON.parse(readFileSync(file, 'utf8')), entry);
    if (data) items.push(...data.items);
  }
  return items;
}

/** Every picture the question prints, in the language asked, and every table's cell words. */
function printed(item: PastPaperItem, lang: Side) {
  const q = item.question as McqQuestion;
  const pictures: string[] = [];
  const cellWords: string[] = [];
  const walk = (blocks: readonly ContentBlock[]) => {
    for (const b of flattenBlocks([...blocks])) {
      if (b.kind === 'image') pictures.push(lang === 'zh' && b.srcZh ? b.srcZh : b.src);
      if (b.kind === 'table') {
        for (const row of b.rows) {
          for (const cell of row.cells) {
            if (cell.covered) continue;
            if (cell.image) pictures.push(lang === 'zh' && cell.image.srcZh ? cell.image.srcZh : cell.image.src);
            const words = plain(cell.text[lang]).trim();
            if (words) cellWords.push(words);
          }
        }
      }
    }
  };
  if (item.stimulus) walk(item.stimulus.blocks);
  walk(q.blocks);
  for (const o of q.options) walk(o.blocks ?? []);
  return { pictures, cellWords, optionBlocks: q.options.map((o) => (o.blocks?.length ?? 0) > 0) };
}

it('every bank question reaches the studio whole', { timeout: 600_000 }, async () => {
  if (!existsSync(path.join(BANK, 'manifest.json'))) {
    console.warn(`No bank at ${BANK}: set PASTPAPER_BANK. Nothing checked.`);
    return;
  }
  const preset = presetFor('mentor');
  const signal = new AbortController().signal;
  const items = loadItems().filter((i) => i.question.type === 'mcq');
  const problems: string[] = [];
  let pictures = 0;
  let tables = 0;
  for (const item of items) {
    const reference = referenceOf(item, false);
    if (!reference) continue;
    for (const lang of ['en', 'zh'] as const) {
      const tag = `${item.source.tag} (${lang})`;
      const want = printed(item, lang);
      const [example] = await withFigures([reference], lang);
      const request: StudioRequest = { keyPoint: 'C.ped', points: [], examples: [example], strict: true, count: 1, level: 'same', shape: 'any', sides: [lang], note: '' };
      const brief = makeBrief(request);
      if ('error' in brief) throw new Error(brief.error);
      const write = buildWriteRequest(brief, emptyJob(brief), null, preset, signal);
      const pick = buildPickRequest({ text: '', examples: [example] }, preset, signal);
      const sent = (write.images ?? []).map((i) => i.dataUrl);
      const payload = JSON.parse(write.turns.at(-1)!.content) as { examples: Array<Record<string, unknown> & { options: Array<Record<string, string>> }> };
      const ex = payload.examples[0];
      // Pictures: all of them, in the paper's language, in order, each placed; none said to be missing.
      if (JSON.stringify(sent) !== JSON.stringify(want.pictures)) problems.push(`${tag}: ${want.pictures.length} pictures printed, ${sent.length} sent (or in another order or language)`);
      if (JSON.stringify((pick.images ?? []).map((i) => i.dataUrl)) !== JSON.stringify(want.pictures)) problems.push(`${tag}: the pick request lost pictures`);
      if (sent.length && (ex.figures !== sent.length || !Array.isArray(ex.figureAt) || ex.figureAt.length !== sent.length)) problems.push(`${tag}: pictures not counted or placed`);
      if (ex.figureNotShown) problems.push(`${tag}: says a picture is not shown`);
      // Tables: every cell's words are in the example's words.
      const words = JSON.stringify(ex);
      for (const cell of want.cellWords) {
        if (!words.includes(JSON.stringify(cell).slice(1, -1))) problems.push(`${tag}: table words lost: ${cell.slice(0, 40)}`);
      }
      // No option holding a table or picture goes as nothing.
      ex.options.forEach((o, i) => {
        if (want.optionBlocks[i] && !o[lang]) problems.push(`${tag}: option ${'ABCD'[i]} sent empty`);
      });
      if (lang === 'en') {
        pictures += want.pictures.length;
        tables += want.cellWords.length > 0 ? 1 : 0;
      }
    }
  }
  const report = { bank: BANK, questions: items.length, pictures, questionsWithTables: tables, problems };
  if (process.env.STUDIO_VERIFY_OUT) writeFileSync(process.env.STUDIO_VERIFY_OUT, JSON.stringify(report, null, 1));
  console.log(`${items.length} questions, ${pictures} pictures, ${tables} with tables: ${problems.length} problems`);
  expect(problems.slice(0, 30)).toEqual([]);
});
