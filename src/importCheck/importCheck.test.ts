/**
 * The import check (k-0494). Every fixture is invented: the user's real papers are only
 * ever read by the hand-run `scripts/import-check-probe.test.ts`, outside the repo.
 */
import { describe, expect, it } from 'vitest';
import { analyseLines, buildImport, readDocx, readPaste } from '@/import';
import { A4_SECT, makeDocx, para, ruledLine } from '@/import/fixtures/docx';
import { createWorksheet } from '@/model/factories';
import { plain } from '@/model/text';
import type { ContentBlock, McqQuestion, ParagraphBlock, Question, StructuredQuestion } from '@/model/types';
import { blockKey } from './address';
import { SYMBOL_PUA, splitOptionText } from './checks';
import { applyOp, applyOps, type CheckOp } from './ops';
import { alignQuestions, batchWithFixes, checkPaper, checkReview, materializeBatch, paperRecipe, safeFixes } from './run';
import { findingText } from './text';
import type { ImportFinding } from './types';

const PAPER = [
  '1. A rise in the price of tea leads to a fall in the quantity demanded of tea. This shows',
  'A. the law of demand.',
  'B. the law of supply.',
  'C. a change in demand.',
  'D. a change in supply.',
  '2. Which of the following is a free good?',
  'A. sea water in the ocean',
  'B. tap water at home',
  'C. bottled water',
  'D. water in a swimming pool',
  '3. Mary runs a bakery in Mong Kok. She hires two workers.',
  '(a) State TWO factors of production used by the bakery. (2 marks)',
  '(b) Explain why the bakery is a private limited company. (3 marks)',
].join('\n');

function imported(text = PAPER) {
  const read = readPaste({ plain: text });
  const analysis = analyseLines(read);
  const batch = buildImport(analysis);
  return { read, analysis, batch, questions: materializeBatch(batch) };
}

const kinds = (fs: readonly ImportFinding[]) => fs.map((f) => `${f.kind}@${f.q}`);
const para1 = (q: Question) => q.blocks[0] as ParagraphBlock;
const text = (b: ContentBlock | undefined) => (b?.kind === 'paragraph' ? plain(b.text.en) + plain(b.text.zh) : '');
const opOf = (f: ImportFinding | undefined): CheckOp => {
  if (!f?.fix || !('op' in f.fix)) throw new Error('no op');
  return f.fix.op;
};

function worksheetOf(questions: Question[]) {
  return { ...createWorksheet(), questions, flow: questions.map((q) => ({ type: 'question' as const, id: q.id })) };
}

describe('the review door: a clean import has nothing to fix', () => {
  it('finds nothing on a paper the importer read whole', () => {
    const { analysis, batch } = imported();
    expect(checkReview(analysis, batch, batch, { maxWidthPx: 605 })).toEqual([]);
  });
});

describe('fix operations', () => {
  it('removes junk words and keeps the run formatting around them', () => {
    const { questions } = imported();
    const q = structuredClone(questions[0]);
    q.blocks = [{ kind: 'paragraph', id: 'p1', text: { en: [{ text: 'Study the table ', bold: true }, { text: '- 3 -' }, { text: ' below.' }], zh: [] } }];
    const op: CheckOp = { op: 'editText', at: { q: 0, list: { list: 'stem' }, key: blockKey(q.blocks[0]) }, side: 'en', from: '- 3 -', to: '' };
    const [next] = applyOp([q], op)!;
    expect(text(next.blocks[0])).toBe('Study the table below.');
    expect((next.blocks[0] as ParagraphBlock).text.en[0].bold).toBe(true);
  });

  it('no longer applies once the words were edited: nothing is written', () => {
    const { questions } = imported();
    const op: CheckOp = { op: 'editText', at: { q: 0, list: { list: 'stem' }, key: blockKey(questions[0].blocks[0]) }, side: 'en', from: 'tea', to: 'coffee' };
    const edited = structuredClone(questions);
    para1(edited[0]).text.en = [{ text: 'Something else entirely' }];
    expect(applyOp(edited, op)).toBeNull();
    expect(applyOps(edited, [op])).toMatchObject({ applied: 0, stale: 1 });
  });

  it('two fixes on one paragraph both apply (the second finds the block by its new words)', () => {
    const { questions } = imported();
    const key = blockKey(questions[0].blocks[0]);
    const at = { q: 0, list: { list: 'stem' as const }, key };
    const { questions: out, applied } = applyOps(questions, [
      { op: 'editText', at, side: 'en', from: 'tea', to: 'TEA' },
      { op: 'editText', at, side: 'en', from: 'This shows', to: 'This shows:' },
    ]);
    expect(applied).toBe(2);
    expect(text(out[0].blocks[0])).toContain('This shows:');
  });

  it('never overwrites marks a teacher set (setMarks expects what it found)', () => {
    const { questions } = imported();
    const owner = { owner: 'part' as const, part: 0 };
    expect(applyOp(questions, { op: 'setMarks', q: 2, owner, marks: 5, expect: null })).toBeNull();
    const [, , q3] = applyOp(questions, { op: 'setMarks', q: 2, owner, marks: 5, expect: 2 })!;
    expect((q3 as StructuredQuestion).parts[0].marks).toBe(5);
  });

  it('keeps every question id and the number of questions', () => {
    const { questions } = imported();
    const ops: CheckOp[] = [
      { op: 'moveSide', q: 1, from: 'en', to: 'zh' },
      { op: 'setAnswerSpace', q: 2, owner: { owner: 'part', part: 1 }, lines: 6, expect: null },
    ];
    const { questions: out } = applyOps(questions, ops);
    expect(out.map((q) => q.id)).toEqual(questions.map((q) => q.id));
    expect(plain((out[1] as McqQuestion).options[0].text.zh)).toBe('sea water in the ocean');
    expect((out[2] as StructuredQuestion).parts[1].answerSpace).toBe(6);
  });

  it('splits "A. … B. …" read as one option, letters following on', () => {
    expect(splitOptionText('cats  B. dogs  C. mice', 0)).toEqual(['cats', 'dogs', 'mice']);
    expect(splitOptionText('price falls (C) price rises', 1)).toEqual(['price falls', 'price rises']);
    expect(splitOptionText('Plan B. is cheaper', 0)).toBeNull();
    expect(splitOptionText('only one', 2)).toBeNull();
  });
});

/** The open paper with faults an import leaves, each the checker should name and fix. */
function faulty() {
  const base = imported();
  const qs = structuredClone(base.questions);
  const mc = qs[0] as McqQuestion;
  mc.options = [{ ...mc.options[0], text: { en: [{ text: 'the law of demand.  B. the law of supply.' }], zh: [] } }, mc.options[2], mc.options[3]];
  qs[1].blocks = [...qs[1].blocks, { kind: 'paragraph', id: 'j1', text: { en: [{ text: 'Go on to the next page' }], zh: [] } }];
  const sq = qs[2] as StructuredQuestion;
  sq.parts = [{ ...sq.parts[0], marks: undefined }, { ...sq.parts[1], blocks: [{ kind: 'paragraph', id: 'm1', text: { en: [{ text: 'Explain why the bakery is a private limited company. (3 marks)' }], zh: [] } }], marks: undefined }];
  sq.blocks = [{ kind: 'paragraph', id: 's1', text: { en: [{ text: `Mary runs a bakery in Mong Kok. She hires two workers ${''} more output.` }], zh: [] } }];
  return { ...base, qs, ws: worksheetOf(qs) };
}

describe('the paper door: an open paper against its file', () => {
  it('names each fault, where it is, with a preview and a fix', () => {
    const { read, analysis, ws } = faulty();
    const { findings } = checkPaper(ws, { name: 'x.docx', read, analysis }, { maxWidthPx: 605 });
    expect(kinds(findings)).toEqual(expect.arrayContaining(['optionsMerged@0', 'junk@1', 'marksMissing@2', 'marksInText@2', 'garbled@2']));
    const merged = findings.find((f) => f.kind === 'optionsMerged')!;
    expect(merged).toMatchObject({ place: 'A', safe: true, after: 'A. the law of demand.\nB. the law of supply.' });
    const garbled = findings.find((f) => f.kind === 'garbled')!;
    expect(garbled.after).toContain('→');
    expect(findingText('en', merged)).toBe('2 options were read as one');
    expect(findingText('zh', merged)).toBe('2 個選項被讀成一個');
  });

  it('Apply all safe fixes, one commit: the paper then matches the file', () => {
    const { read, analysis, ws } = faulty();
    const { findings } = checkPaper(ws, { name: 'x.docx', read, analysis }, { maxWidthPx: 605 });
    const fixed = paperRecipe(safeFixes(findings).map(opOf))(ws);
    const again = checkPaper(fixed, { name: 'x.docx', read, analysis }, { maxWidthPx: 605 }).findings;
    expect(again).toEqual([]);
    const q = fixed.questions[2] as StructuredQuestion;
    expect(q.parts.map((p) => p.marks)).toEqual([2, 3]);
    expect(text(q.parts[1].blocks[0])).toBe('Explain why the bakery is a private limited company.');
    expect((fixed.questions[0] as McqQuestion).options.map((o) => plain(o.text.en))).toEqual(['the law of demand.', 'the law of supply.', 'a change in demand.', 'a change in supply.']);
  });

  it('a recipe whose fix no longer applies returns the draft itself (no empty commit)', () => {
    const { ws } = faulty();
    const recipe = paperRecipe([{ op: 'removeBlock', at: { q: 'nope', list: { list: 'stem' }, key: 'x' } }]);
    expect(recipe(ws)).toBe(ws);
  });

  it('matches questions in order by their words, a teacher’s added question left out', () => {
    const { questions } = imported();
    const extra = structuredClone(questions[1]);
    extra.id = 'added';
    (extra.blocks[0] as ParagraphBlock).text.en = [{ text: 'A brand new question nobody imported' }];
    expect(alignQuestions([questions[0], extra, questions[1], questions[2]], questions)).toEqual([0, undefined, 1, 2]);
  });

  it('puts a lost line back where the words before it are', () => {
    const { read, analysis, questions } = imported();
    const qs = structuredClone(questions);
    const mc = qs[0] as McqQuestion;
    para1(mc).text.en = [{ text: 'A rise in the price of tea leads to a fall in the quantity demanded of tea.' }];
    const ws = worksheetOf(qs);
    const { findings } = checkPaper(ws, { name: 'x', read, analysis }, { maxWidthPx: 605 });
    // The stem is cut short ("This shows" lost): the fix gives that paragraph the whole line.
    const cut = findings.find((f) => f.kind === 'lostText' && f.q === 0);
    expect(cut?.before).toBe('A rise in the price of tea leads to a fall in the quantity demanded of tea.');
    expect(text(paperRecipe([opOf(cut)])(ws).questions[0].blocks[0])).toMatch(/of tea\. This shows$/);
    para1(mc).text.en = [];
    const lost = checkPaper(worksheetOf(qs), { name: 'x', read, analysis }, { maxWidthPx: 605 }).findings.find((f) => f.kind === 'lostText');
    expect(lost?.q).toBe(0);
    const back = paperRecipe([opOf(lost)])(worksheetOf(qs));
    expect(text(back.questions[0].blocks[0])).toContain('A rise in the price of tea');
  });
});

describe('the review door: fixes change the batch before Save', () => {
  it('a fixed batch keeps its questions, shows the fix in the preview build, and saves it', () => {
    const { analysis, batch } = imported(PAPER.replace('This shows', 'This shows This Photo by Unknown Author is licensed under CC BY-SA'));
    const found = checkReview(analysis, batch, batch, { maxWidthPx: 605 });
    expect(kinds(found)).toEqual(['junk@0']);
    const { batch: fixed, stale } = batchWithFixes(batch, [opOf(found[0])]);
    expect(stale).toBe(0);
    expect(fixed.builds).toHaveLength(batch.builds.length);
    expect(fixed.builds[0].key).toMatch(/^fix:/);
    expect(fixed.builds[1]).toBe(batch.builds[1]);
    expect(text(materializeBatch(fixed)[0].blocks[0])).toMatch(/This shows$/);
    expect(checkReview(analysis, batch, fixed, { maxWidthPx: 605 })).toEqual([]);
  });

  it('offers a pin for structure the review can re-solve: the next question kept as text', () => {
    // The solver kept question 2's line as text of question 1 (its mistake, made by hand here).
    const solved = analyseLines(readPaste({ plain: PAPER }));
    const analysis = {
      ...solved,
      roles: solved.roles.map((r, i) => (i >= 5 && i < 10 ? { ...r, role: i === 5 ? ('stem' as const) : r.role, question: 0 } : r)),
      outline: { ...solved.outline, questions: [solved.outline.questions[0], solved.outline.questions[2]] },
    };
    const batch = buildImport(analysis);
    const merged = checkReview(analysis, batch, batch, { maxWidthPx: 605 }).find((f) => f.kind === 'questionMerged');
    expect(merged).toMatchObject({ q: 0, line: 5, params: { number: 2 }, fix: { pins: [{ kind: 'newQuestion', line: 5 }] } });
    // The teacher's own join is theirs: settled, not reported.
    expect(checkReview(analysis, batch, batch, { maxWidthPx: 605, settled: new Set([5]) }).some((f) => f.kind === 'questionMerged')).toBe(false);
  });

  it('a Chinese question on the English side moves over, safely', () => {
    const { analysis, batch } = imported();
    const qs = materializeBatch(batch);
    const zh = '下列哪一項是免費物品？';
    para1(qs[1]).text = { en: [{ text: zh }], zh: [] };
    (qs[1] as McqQuestion).options = (qs[1] as McqQuestion).options.map((o, k) => ({ ...o, text: { en: [{ text: ['海水', '自來水', '樽裝水', '泳池水'][k] }], zh: [] } }));
    const fixed = { ...batch, builds: qs.map((q) => ({ typeId: q.type, fill: (f: Question) => ({ ...q, id: f.id }) })) };
    const lang = checkReview(analysis, batch, fixed, { maxWidthPx: 605 }).find((f) => f.kind === 'language');
    expect(lang).toMatchObject({ q: 1, safe: true, params: { from: 'en', to: 'zh' } });
  });
});

describe('symbol-font characters', () => {
  it('maps only characters it knows, each to one printable character', () => {
    for (const [from, to] of Object.entries(SYMBOL_PUA)) {
      expect(from.codePointAt(0)!).toBeGreaterThanOrEqual(0xf020);
      expect([...to]).toHaveLength(1);
    }
  });
});

describe('ruled answer lines drawn as shapes (k-0494)', () => {
  it('read as answer lines, so the part gets its answer space, not a lost picture', async () => {
    const lines = Array.from({ length: 6 }, () => ruledLine(640)).join('');
    const body = para('1.\tMary runs a bakery.') + para('(a)\tState TWO factors of production. (2 marks)') + lines + para('(b)\tExplain one cost. (3 marks)') + lines;
    const read = await readDocx(await makeDocx({ sectPr: A4_SECT, body }));
    const analysis = analyseLines(read);
    expect(analysis.flags.filter((f) => f.kind === 'imageLost')).toEqual([]);
    const [q] = materializeBatch(buildImport(analysis)) as StructuredQuestion[];
    expect(q.parts.map((p) => p.answerSpace)).toEqual([6, 6]);
  });

  it('a short or slanted line is still a drawing', async () => {
    const short = Array.from({ length: 3 }, () => ruledLine(80)).join('');
    const read = await readDocx(await makeDocx({ sectPr: A4_SECT, body: para('1.\tLook at the figure.') + short + para('What does it show? (2 marks)') }));
    const [q] = materializeBatch(buildImport(analyseLines(read))) as StructuredQuestion[];
    expect(q.answerSpace ?? q.parts[0]?.answerSpace).toBeUndefined();
  });
});
