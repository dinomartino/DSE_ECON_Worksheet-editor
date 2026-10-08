import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { InlineRun, McqQuestion, StructuredQuestion } from '@/model/types';
import { keyLine } from './answerSheet';
import { nameSimilarity, nameTokens } from './answerFiles';
import { makeDocx, para, tbl } from './fixtures/docx';
import { bufferOf, makePdf } from './fixtures/pdfWriter';
import {
  analyseLines,
  buildImport,
  classifyImport,
  isPdfReadError,
  matchAnswers,
  readAnswerSheet,
  readDocx,
  readPaste,
  readPdf,
  splitAnswers,
  suggestPairs,
  type AnswerSheet,
  type Pin,
  type ReadPaste,
} from './index';

// Invented papers and answer files only: the repo is public.

const text = (runs: readonly InlineRun[] | undefined) => (runs ?? []).map((r) => r.text).join('');
const plain = (s: string) => readPaste({ plain: s });
const points = (sheet: AnswerSheet, n: number) => (sheet.entries[n].points ?? []).map((p) => [text(p.runs), p.marks]);

const PAPER = [
  'Part A',
  '1.\tWhich of the following is a free good?',
  'A.\tAir in the countryside',
  'B.\tBottled water',
  'C.\tA school textbook',
  'D.\tA cinema ticket',
  '2.\tWhich of the following is a stock concept?',
  'A.\tSavings in a bank account',
  'B.\tMonthly income',
  'C.\tDaily output',
  'D.\tAnnual exports',
  '3.\tA rise in the price of tea will',
  'A.\traise the demand for coffee.',
  'B.\tlower the supply of tea.',
  'C.\traise the demand for tea.',
  'D.\tlower the demand for coffee.',
  'Part B',
  '1.\tExplain what is meant by opportunity cost.\t(2 marks)',
  '2.\tMs Wong runs a bakery in Sha Tin.',
  '(a)\tExplain why the price of bread may rise.\t(2 marks)',
  '(b)\tSuppose the rent of the shop rises.',
  '(i)\tState what happens to the fixed cost.\t(1 mark)',
  '(ii)\tExplain whether output changes.\t(2 marks)',
].join('\n');

const SCHEME = [
  'Marking Scheme',
  'Part A',
  '1. A\t2. D\t3. A',
  'Part B',
  '1.\tOpportunity cost is the highest-valued option forgone (1)',
  '\tIt is the cost of making a choice. (1)',
  '2(a)\tDemand for bread rises (1) so its price rises (1)',
  '(b)(i)\tThe fixed cost rises.\t[1]',
  '(ii)\tOutput does not change\t1M',
  '\tas the marginal cost is unchanged.\t1M',
  '\tMax: 2',
].join('\n');

describe('keyLine', () => {
  it('reads grids, runs, tables and full-width keys', () => {
    expect(keyLine('1. B  2. C\t3. D')).toEqual([
      { question: 1, letters: [1] },
      { question: 2, letters: [2] },
      { question: 3, letters: [3] },
    ]);
    expect(keyLine('1–5 BCDAA')?.map((p) => p.letters[0])).toEqual([1, 2, 3, 0, 0]);
    expect(keyLine('6-10: ABCDA')?.map((p) => p.question)).toEqual([6, 7, 8, 9, 10]);
    expect(keyLine('1C\t6B\t11B')?.map((p) => [p.question, p.letters[0]])).toEqual([[1, 2], [6, 1], [11, 1]]);
    expect(keyLine('１．Ｂ')).toEqual([{ question: 1, letters: [1] }]);
    expect(keyLine('19. A/C')).toEqual([{ question: 19, letters: [0, 2] }]);
    expect(keyLine('Q4 (D)')).toEqual([{ question: 4, letters: [3] }]);
  });

  it('leaves prose, table rows and a range whose letters do not fit', () => {
    expect(keyLine('1. Because demand rises')).toBeNull();
    expect(keyLine('50\t400\t5')).toBeNull();
    expect(keyLine('1–5 BCDA')).toBeNull();
    expect(keyLine('3a) Labour')).toBeNull();
  });
});

describe('readAnswerSheet', () => {
  it('reads a sectioned key and a scheme with part labels, marks and rules', () => {
    const sheet = readAnswerSheet(plain(SCHEME));
    expect(sheet.kind).toBe('mixed');
    expect(sheet.sections.map((s) => s.key)).toEqual(['A', 'B']);
    expect(sheet.entries.map((e) => [e.sectionIndex, e.question, e.part, e.subPart, e.letter])).toEqual([
      [0, 1, undefined, undefined, 0],
      [0, 2, undefined, undefined, 3],
      [0, 3, undefined, undefined, 0],
      [1, 1, undefined, undefined, undefined],
      [1, 2, 'a', undefined, undefined],
      [1, 2, 'b', 'i', undefined],
      [1, 2, 'b', 'ii', undefined],
    ]);
    expect(points(sheet, 3)).toEqual([
      ['Opportunity cost is the highest-valued option forgone', 1],
      ['It is the cost of making a choice.', 1],
    ]);
    expect(points(sheet, 4)).toEqual([
      ['Demand for bread rises', 1],
      ['so its price rises', 1],
    ]);
    expect(points(sheet, 5)).toEqual([['The fixed cost rises.', 1]]);
    expect(sheet.entries[6]).toMatchObject({ max: 2, marks: 2 });
    expect(points(sheet, 6)).toEqual([
      ['Output does not change', 1],
      ['as the marginal cost is unchanged.', 1],
    ]);
    expect(sheet.uses[0]).toBe('title');
    expect(sheet.unknown).toEqual([]);
  });

  it('starts a section where numbering restarts with no heading', () => {
    const keys = readAnswerSheet(plain('1. A 2. B 3. C\n1. D 2. A'));
    expect(keys.kind).toBe('key');
    expect(keys.entries.map((e) => [e.sectionIndex, e.question])).toEqual([[0, 1], [0, 2], [0, 3], [1, 1], [1, 2]]);
    const mixed = readAnswerSheet(plain('1. A\n2. B\n1.\tDemand rises. (1)\n2.\tSupply falls. (1)'));
    expect(mixed.entries.map((e) => [e.sectionIndex, e.question, e.letter])).toEqual([[0, 1, 0], [0, 2, 1], [1, 1, undefined], [1, 2, undefined]]);
  });

  it('reads "1–5 BCDAA" runs and a key table laid sideways', () => {
    expect(readAnswerSheet(plain('1–5 BCDAA\n6–10 ABCDD')).entries.map((e) => e.letter)).toEqual([1, 2, 3, 0, 0, 0, 1, 2, 3, 3]);
    const sideways = readAnswerSheet(plain('Question\t1\t2\t3\t4\nAnswer\tB\tC\tD\tA'));
    expect(sideways.entries.map((e) => [e.question, e.letter])).toEqual([[1, 1], [2, 2], [3, 3], [4, 0]]);
    expect(sideways.uses).toEqual(['key', 'key', 'key']);
  });

  it('reads a Chinese key and scheme with 甲部 / 乙部 and (1分)', () => {
    const sheet = readAnswerSheet(plain('評卷參考\n甲部\n1. B\n2. D\n乙部\n1. (a) 需求增加。(1分)\n價格上升。(1分)\n(b) 供應減少 (1)'));
    expect(sheet.sections.map((s) => s.key)).toEqual(['A', 'B']);
    expect(sheet.entries.map((e) => [e.sectionIndex, e.question, e.part ?? '', e.letter ?? ''])).toEqual([
      [0, 1, '', 1],
      [0, 2, '', 3],
      [1, 1, 'a', ''],
      [1, 1, 'b', ''],
    ]);
    expect(points(sheet, 2)).toEqual([
      ['需求增加。', 1],
      ['價格上升。', 1],
    ]);
    expect(points(sheet, 3)).toEqual([['供應減少', 1]]);
  });

  it('splits inline marks, reads half marks, and keeps a repeated label as a marker note', () => {
    const sheet = readAnswerSheet(
      plain(['1a. Yes (1) the tax lowers the return on shares (1)', '1a. no → 0', 'reason only → 1 mark', '1b. no (0.5), the value of saving rises (1.5)', 'Options (1) and (2) only (1)'].join('\n')),
    );
    expect(sheet.entries.map((e) => `${e.question}${e.part}`)).toEqual(['1a', '1b']);
    expect(points(sheet, 0)).toEqual([
      ['Yes', 1],
      ['the tax lowers the return on shares', 1],
    ]);
    expect(sheet.entries[0].notes?.map((n) => text(n.runs))).toEqual(['1a. no → 0', 'reason only → 1 mark']);
    expect(points(sheet, 1)).toEqual([
      ['no,', 0.5],
      ['the value of saving rises', 1.5],
      ['Options (1) and (2) only', 1],
    ]);
    expect(sheet.entries[1].marks).toBe(3);
  });

  it('reads "(1@, max 2)" after a point as the group rule', () => {
    const sheet = readAnswerSheet(plain('3(c)\tFeatures of a partnership: (1@, max 2)\n- unlimited liability\n- simple to set up'));
    expect(sheet.entries[0]).toMatchObject({ question: 3, part: 'c', each: 1, max: 2, marks: 2 });
    expect(points(sheet, 0).map((p) => p[0])).toEqual(['Features of a partnership:', '- unlimited liability', '- simple to set up']);
  });

  it('keeps every line: an unplaced line is unknown, never dropped', () => {
    const sheet = readAnswerSheet(plain('1. B  2. C\nSee the teacher for the diagrams.\n'));
    expect(sheet.entries).toHaveLength(2);
    expect(sheet.uses).toEqual(['key', 'unknown', 'blank']);
    expect(sheet.unknown).toEqual([1]);
  });

  it('says scan for an image-only file and carries the page count', () => {
    const read = { lines: [{ i: 0, runs: [], text: '', raw: '', depth: 0, image: { src: '' } }], source: 'pdf' as const, pages: 6 };
    expect(readAnswerSheet(read)).toMatchObject({ kind: 'scan', pages: 6, entries: [] });
  });

  it('reads a .docx key table and a two-column answer | marker-notes table', async () => {
    const body =
      para('Answers') +
      tbl([
        [para('Question'), para('Answer')],
        [para('1'), para('B')],
        [para('2'), para('A/C')],
      ]) +
      para('Paper 2') +
      tbl([
        [para('1(a) Demand rises (1)'), para('accept "demand increases"')],
        [para('Price rises (1)'), para('no reason → 0')],
        [para('1(b) Supply falls'), para('(2)')],
      ]);
    const sheet = readAnswerSheet(await readDocx(await makeDocx({ body })));
    expect(sheet.entries.map((e) => [e.question, e.part ?? '', e.letter ?? '', e.letters ?? ''])).toEqual([
      [1, '', 1, ''],
      [2, '', 0, [0, 2]],
      [1, 'a', '', ''],
      [1, 'b', '', ''],
    ]);
    expect(sheet.sections.map((s) => s.paper)).toEqual([undefined, 'P2']);
    expect(points(sheet, 2)).toEqual([
      ['Demand rises', 1],
      ['Price rises', 1],
    ]);
    expect(sheet.entries[2].notes?.map((n) => text(n.runs))).toEqual(['accept "demand increases"', 'no reason → 0']);
    expect(points(sheet, 3)).toEqual([['Supply falls', 2]]);
  });

  it('reads a key from HTML and from a .pdf', async () => {
    const html = readPaste({ html: '<table><tr><td>1</td><td>D</td></tr><tr><td>2</td><td>C</td></tr></table>' });
    expect(readAnswerSheet(html).entries.map((e) => e.letter)).toEqual([3, 2]);
    const pdf = await readPdf(
      bufferOf(
        makePdf([
          {
            texts: [
              { text: 'Answers', x: 60, y: 760, bold: true },
              { text: '1. C   2. B   3. A', x: 60, y: 730 },
              { text: '4(a) Demand rises (1)', x: 60, y: 700 },
            ],
          },
        ]),
      ),
    );
    if (isPdfReadError(pdf)) throw new Error(pdf.kind);
    const sheet = readAnswerSheet(pdf);
    expect(sheet.pages).toBe(1);
    expect(sheet.entries.map((e) => [e.question, e.part ?? '', e.letter ?? ''])).toEqual([
      [1, '', 2],
      [2, '', 1],
      [3, '', 0],
      [4, 'a', ''],
    ]);
  });
});

describe('matchAnswers', () => {
  const paper = () => analyseLines(plain(PAPER));

  it('reads the paper as two numbering runs', () => {
    const a = paper();
    expect(a.outline.questions.map((q) => [q.number, q.kind])).toEqual([[1, 'mc'], [2, 'mc'], [3, 'mc'], [1, 'written'], [2, 'written']]);
    expect(a.outline.questions[4].parts.map((p) => p.subParts.length)).toEqual([0, 2]);
  });

  it('matches by section, number and part, then the builder writes answers and schemes', () => {
    const a = paper();
    const { pins, report, sections, unused } = matchAnswers(a, readAnswerSheet(plain(SCHEME)));
    expect(report.map((r) => r.status)).toEqual(['matched', 'matched', 'matched', 'matched', 'matched']);
    expect(sections).toEqual([0, 1]);
    expect(unused).toEqual([]);
    expect(pins.filter((p) => p.kind === 'answer').map((p) => (p as { index: number }).index)).toEqual([0, 3, 0]);

    const solved = analyseLines(plain(PAPER), { pins });
    expect(solved.outline.questions.slice(0, 3).map((q) => q.answer)).toEqual([0, 3, 0].map((index) => ({ index, from: 'sheet' })));
    const batch = buildImport(solved);
    const built = batch.builds.map((b) => b.fill(b.typeId === 'mcq' ? mcqStub() : structuredStub()));
    expect((built[1] as McqQuestion).answerIndex).toBe(3);

    const essay = built[3] as StructuredQuestion;
    expect(schemeLines(essay.scheme)).toEqual([['Opportunity cost is the highest-valued option forgone', 1], ['It is the cost of making a choice.', 1]]);
    const q2 = built[4] as StructuredQuestion;
    expect(schemeLines(q2.parts[0].scheme)).toEqual([['Demand for bread rises', 1], ['so its price rises', 1]]);
    expect(schemeLines(q2.parts[1].subParts?.[0].scheme)).toEqual([['The fixed cost rises.', 1]]);
    expect(q2.parts[1].subParts?.[1].scheme?.routes[0].groups[0].max).toBe(2);
    expect(q2.parts[1].scheme).toBeUndefined();
  });

  it('aligns a sheet with no headings to the paper by restart and kind', () => {
    const sheet = readAnswerSheet(plain('1. A\n2. D\n3. A\n1.\tThe cost of the best option given up. (2)\n2(a)\tDemand rises (2)'));
    const { report, pins } = matchAnswers(paper(), sheet);
    expect(report.map((r) => r.status)).toEqual(['matched', 'matched', 'matched', 'matched', 'matched']);
    expect(report[4].missingParts).toEqual([{ part: 1 }]);
    expect(pins.filter((p) => p.kind === 'scheme')).toHaveLength(2);
  });

  it('reports missing, extra, an out-of-range letter, a conflict and several answers', () => {
    const own = PAPER.replace('A.\tSavings in a bank account', 'A.\tSavings in a bank account').replace('Part B', 'Ans: B\nPart B');
    const a = analyseLines(plain(own));
    expect(a.outline.questions[2].answer).toMatchObject({ index: 1, from: 'inline' });
    const sheet = readAnswerSheet(plain('Part A\n1. E\n2. A/C\n3. D\n4. B'));
    const { report, pins } = matchAnswers(a, sheet);
    expect(report.map((r) => [r.status, r.detail ?? ''])).toEqual([
      ['mismatch', 'letterOutOfRange'],
      ['matched', 'severalAnswers'],
      ['conflict', ''],
      ['missing', ''],
      ['missing', ''],
      ['extra', 'noSuchQuestion'],
    ]);
    expect(report[1].letters).toEqual([0, 2]);
    expect(report[2]).toMatchObject({ paperAnswer: 1, sheetAnswer: 3 });
    expect(pins.some((p) => p.kind === 'answer' && p.index === 4)).toBe(false);
    // The sheet wins, and a later click by the teacher wins over the sheet.
    const withSheet = analyseLines(plain(own), { pins });
    expect(withSheet.outline.questions[2].answer).toEqual({ index: 3, from: 'sheet' });
    const click: Pin = { kind: 'answer', line: withSheet.outline.questions[2].start, index: 0 };
    expect(analyseLines(plain(own), { pins: [...pins, click] }).outline.questions[2].answer).toEqual({ index: 0, from: 'pin' });
  });

  it('flags a part the paper does not have and a scheme with no part for a question with parts', () => {
    const sheet = readAnswerSheet(plain('Part B\n2(c)\tSomething else (1)\n2.\tA whole answer (2)'));
    const { report } = matchAnswers(paper(), sheet);
    expect(report.filter((r) => r.status === 'extra').map((r) => r.detail)).toEqual(['noSuchPart']);
  });

  it('uses only the part of a two-paper answer file that fits, and leaves the rest unused', () => {
    const both = readAnswerSheet(plain('Paper 1\n1. B 2. C 3. D 4. A\nPaper 2\n1(a)\tDemand rises (1)\n1(b)\tSupply falls (1)\n2.\tA public good is non-rival (1)'));
    expect(both.sections.map((s) => s.paper)).toEqual(['P1', 'P2']);
    const p1 = analyseLines(plain(PAPER.split('Part B')[0].replace('Part A\n', '') + '4.\tWhich is a flow?\nA.\tIncome\nB.\tWealth\nC.\tCapital\nD.\tLand'));
    const m1 = matchAnswers(p1, both);
    expect(m1.report.map((r) => r.status)).toEqual(['matched', 'matched', 'matched', 'matched']);
    expect(m1.unused).toEqual([4, 5, 6]);
    const p2 = analyseLines(plain('1.\tMr Lee owns a shop.\n(a)\tExplain the change in demand.\t(1 mark)\n(b)\tExplain the change in supply.\t(1 mark)\n2.\tExplain what a public good is.\t(1 mark)'));
    const m2 = matchAnswers(p2, both);
    expect(m2.report.map((r) => r.status)).toEqual(['matched', 'matched']);
    expect(m2.unused).toEqual([0, 1, 2, 3]);
  });

  it('puts an unmarked answer in `answer`, notes after the points, and an MC explanation', () => {
    const a = analyseLines(plain('1.\tWhich is a free good?\nA.\tAir\nB.\tFood\nC.\tLand\nD.\tPetrol\n2.\tDefine scarcity.\n3.\tDefine choice.\t(2 marks)'));
    const sheet = readAnswerSheet(plain('1. A.  Air has no cost of production.\n2.\tWants exceed resources.\n\tResources are limited.\n3.\tChoosing between uses (1)\n3.\tdo not accept "picking" → 0'));
    const { pins, report } = matchAnswers(a, sheet);
    expect(report.map((r) => r.status)).toEqual(['matched', 'matched', 'matched']);
    const built = buildImport(analyseLines(plain('1.\tWhich is a free good?\nA.\tAir\nB.\tFood\nC.\tLand\nD.\tPetrol\n2.\tDefine scarcity.\n3.\tDefine choice.\t(2 marks)'), { pins }))
      .builds.map((b) => b.fill(b.typeId === 'mcq' ? mcqStub() : structuredStub()));
    const mc = built[0] as McqQuestion;
    expect(mc.answerIndex).toBe(0);
    expect(text(mc.explanation?.en)).toBe('Air has no cost of production.');
    const answer = built[1] as StructuredQuestion;
    expect(answer.scheme).toBeUndefined();
    expect(text(answer.answer?.en)).toBe('Wants exceed resources.\nResources are limited.');
    const noted = built[2] as StructuredQuestion;
    expect(noted.scheme?.routes[0].groups.map((g) => g.points.map((p) => [text(p.text.en), p.marks]))).toEqual([
      [['Choosing between uses', 1]],
      [['3. do not accept "picking" → 0', undefined]],
    ]);
  });

  it('keeps scheme pins through other fixes, and drops them when the pin goes', () => {
    const { pins } = matchAnswers(paper(), readAnswerSheet(plain(SCHEME)));
    const heading = analyseLines(plain(PAPER)).lines.findIndex((l) => l.text === 'Part B');
    const fixed: Pin[] = [{ kind: 'role', line: heading, role: 'noise' }, ...pins];
    const again = analyseLines(plain(PAPER), { pins: fixed });
    expect(again.outline.questions[4].parts[0].scheme?.points).toHaveLength(2);
    const undone = analyseLines(plain(PAPER), { pins: fixed.filter((p) => p.kind !== 'scheme') });
    expect(undone.outline.questions[4].parts[0].scheme).toBeUndefined();
  });
});

describe('a paper with its answers after it', () => {
  it('cuts a written paper from the marking scheme that follows it', () => {
    const file = plain(`${PAPER.split('Part A')[0]}${PAPER.slice(PAPER.indexOf('Part B'))}\n-- End of Paper --\nAnswers:\n1.\tThe value of the best option given up (1)\n\tIt is a cost. (1)\n2(a)\tDemand rises (1) so price rises (1)\n(b)(i)\tFixed cost rises (1)`);
    const split = splitAnswers(file);
    expect(split.answers?.offset).toBe(file.lines.findIndex((l) => l.text.startsWith('-- End')));
    expect(analyseLines(split.questions).outline.questions).toHaveLength(2);
    const { report } = matchAnswers(analyseLines(split.questions), readAnswerSheet(split.answers!));
    expect(report.map((r) => r.status)).toEqual(['matched', 'matched']);
    expect(classifyImport(file, 'Mock Paper 2.docx').role).toBe('both');
  });

  it('leaves a paper alone when "End of paper" sits above MC questions', () => {
    const file = plain(`-- End of Paper --\n${PAPER.split('Part B')[0]}`);
    expect(splitAnswers(file).answers).toBeUndefined();
  });
});

describe('classifyImport', () => {
  it('tells a question paper, an answer file and a paper with its key apart', () => {
    expect(classifyImport(plain(PAPER), 'S5 Test 1.docx')).toMatchObject({ role: 'questions' });
    expect(classifyImport(plain(SCHEME), 'S5 Test 1 ans.pdf')).toMatchObject({ role: 'answers' });
    const key = classifyImport(plain('1. B\t2. C\t3. D\t4. A\t5. B'), 'untitled.docx');
    expect(key.role).toBe('answers');
    expect(key.reasons).toContain('keyEntries');
    const withKey = readFileSync(new URL('./fixtures/12-answer-key-grid.txt', import.meta.url), 'utf8');
    expect(classifyImport(plain(withKey), 'Quiz 3.docx')).toMatchObject({ role: 'both', reasons: expect.arrayContaining(['answersInPaper']) });
  });

  it('falls back on the name for a scan', () => {
    const scan: ReadPaste = { lines: [{ i: 0, runs: [], text: '', raw: '', depth: 0, image: { src: '' } }], source: 'pdf' };
    expect(classifyImport(scan, 'Mock 答案.pdf')).toMatchObject({ role: 'answers', reasons: ['nameSaysAnswers', 'noText'] });
    expect(classifyImport(scan, 'Mock.pdf').role).toBe('questions');
  });
});

describe('suggestPairs', () => {
  const pair = (names: Array<[string, 'questions' | 'answers' | 'both']>) =>
    Object.fromEntries(suggestPairs(names.map(([name, role]) => ({ id: name, name, role }))).map((p) => [p.questions, p.answers]));

  it('pairs by name with the answer words gone', () => {
    expect(
      pair([
        ['S5 Test 1.docx', 'questions'],
        ['Mock P1.pdf', 'questions'],
        ['卷一.docx', 'questions'],
        ['Notes on trade.docx', 'questions'],
        ['卷一 答案.pdf', 'answers'],
        ['Mock P1 Answers.docx', 'answers'],
        ['S5 Test 1 ans.pdf', 'answers'],
        ['Budget key.pdf', 'answers'],
      ]),
    ).toEqual({ 'S5 Test 1.docx': 'S5 Test 1 ans.pdf', 'Mock P1.pdf': 'Mock P1 Answers.docx', '卷一.docx': '卷一 答案.pdf', 'Notes on trade.docx': undefined });
  });

  it('never pairs papers whose numbers differ', () => {
    expect(pair([['S5 Test 2.docx', 'questions'], ['S5 Test 1 ans.pdf', 'answers']])).toEqual({ 'S5 Test 2.docx': undefined });
    expect(nameSimilarity('Mock Paper 1', 'Mock P2 MS').score).toBe(0);
  });

  it('lets one answer file serve a series and the .docx and .pdf of one paper', () => {
    expect(
      pair([
        ['2023-24 F4 mock paper I.pdf', 'questions'],
        ['2023-24 F4 mock paper II.pdf', 'questions'],
        ['2023-2024 F4 Mock marking scheme.pdf', 'answers'],
      ]),
    ).toEqual({ '2023-24 F4 mock paper I.pdf': '2023-2024 F4 Mock marking scheme.pdf', '2023-24 F4 mock paper II.pdf': '2023-2024 F4 Mock marking scheme.pdf' });
    expect(pair([['Quiz 4.docx', 'questions'], ['Quiz 4.pdf', 'questions'], ['Quiz 4 MS.docx', 'answers']])).toEqual({ 'Quiz 4.docx': 'Quiz 4 MS.docx', 'Quiz 4.pdf': 'Quiz 4 MS.docx' });
  });

  it('pairs a both file with itself and a lone "Answers" file with a lone paper', () => {
    expect(pair([['Quiz.docx', 'both'], ['Other.docx', 'questions'], ['Answers.pdf', 'answers']])).toEqual({ 'Quiz.docx': 'Quiz.docx', 'Other.docx': 'Answers.pdf' });
    expect(nameTokens('2021-22 S6 Paper II')).toEqual(['y2021y22', 's6', 'paper', '2']);
    expect(nameTokens('P1_MS (final).docx')).toEqual(['paper', '1', 'final']);
  });
});

// ---- helpers ----

function mcqStub(): McqQuestion {
  return { id: 'q', type: 'mcq', blocks: [], options: [0, 1, 2, 3].map((k) => ({ id: `o${k}`, text: { en: [], zh: [] } })), answerIndex: 0, marks: 1 } as unknown as McqQuestion;
}

function structuredStub(): StructuredQuestion {
  return { id: 'q', type: 'structured', blocks: [], parts: [] } as unknown as StructuredQuestion;
}

function schemeLines(scheme: MarkScheme | undefined) {
  return scheme?.routes[0].groups[0].points.map((p) => [text(p.text.en), p.marks]);
}
