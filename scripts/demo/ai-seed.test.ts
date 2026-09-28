/**
 * Not a unit test: writes the ✦ AI film's seed as JSON, for `scripts/demo/ai.mjs`.
 *
 * - `worksheet`: the bilingual rent-control worksheet in content.mjs:AI, built from the
 *   model's own factories, with the 中文 of three texts missing.
 * - `fills`: English source → the 中文 the film's canned provider returns for it.
 * - `untranslated`: the ✦ AI badge's count in EN+中.
 *
 * Fails, instead of writing, when the film would show something untrue: a badge that is
 * not the number of missing texts, a fill whose terms the EDB glossary would question
 * (the film says they follow it), or a Check terms that finds anything but the one
 * planted term.
 *
 * Run with `npx vitest run scripts/demo/ai-seed.test.ts` (DEMO_SEED sets the file).
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import {
  createMcqQuestion,
  createParagraphBlock,
  createPart,
  createStructuredQuestion,
  createWorksheet,
} from '@/model/factories';
import { bi } from '@/model/text';
import { countUntranslated } from '@/model/textWalk';
import type { Worksheet } from '@/model/types';
import { buildTermCheck } from '@/translate/termCheck';
import { AI } from './content.mjs';

const OUT = process.env.DEMO_SEED ?? '/tmp/ai-demo-seed.json';

interface Missing { en: string; zh: string | null; fill?: string }
const text = (t: Missing) => bi(t.en, t.zh ?? '');

function worksheet(filled: boolean): Worksheet {
  const pick = (t: Missing) => (filled && t.zh === null ? { ...t, zh: t.fill ?? '' } : t);
  const doc = createWorksheet();
  doc.id = 'demo-ai-rent-control';
  doc.title = bi(AI.title[0], AI.title[1]);
  doc.instructions = bi('', ''); // room on the page (§ content.mjs:AI)

  const mcq = createMcqQuestion();
  mcq.blocks = [createParagraphBlock(text(pick(AI.mcq.stem)))];
  mcq.options = mcq.options.map((option, i) => ({ ...option, text: bi(AI.mcq.options[i][0], AI.mcq.options[i][1]) }));
  mcq.answerIndex = AI.mcq.answer;

  const structured = createStructuredQuestion();
  structured.blocks = [createParagraphBlock(bi(AI.structured.stem[0], AI.structured.stem[1]))];
  structured.parts = AI.structured.parts.map((p) => ({
    ...createPart(),
    blocks: [createParagraphBlock(text(pick(p)))],
    marks: p.marks,
    answerSpace: p.lines,
  }));

  // The factory's two sections (甲部, 乙部), each with its question under it.
  const [sectionA, sectionB] = doc.layout;
  doc.questions = [mcq, structured];
  doc.flow = [
    { type: 'layout', id: sectionA.id },
    { type: 'question', id: mcq.id },
    { type: 'layout', id: sectionB.id },
    { type: 'question', id: structured.id },
  ];
  return doc;
}

it('emits the ✦ AI demo seed', async () => {
  const doc = worksheet(false);
  const missing = [AI.mcq.stem, ...AI.structured.parts].filter((t) => t.zh === null) as Missing[];
  const untranslated = countUntranslated(doc, { language: 'bilingual', version: 'student' });
  expect(untranslated).toBe(missing.length);

  // After the fill, Check terms must find the planted term and nothing else.
  const glossary = await loadGlossary();
  const rows = buildTermCheck(worksheet(true), glossary, { kind: 'paper' });
  const found = rows.flatMap((row) => row.checks.map((check) => ({ zh: row.zh.map((r) => r.text).join(''), check })));
  expect(found).toHaveLength(1);
  expect(found[0].zh).toContain(AI.planted.wrong);
  expect(found[0].check.fix).toMatchObject({ kind: 'deny', to: AI.planted.fix });

  const fills = Object.fromEntries(missing.map((t) => [t.en, t.fill]));
  writeFileSync(OUT, JSON.stringify({ worksheet: doc, fills, untranslated }));
});
