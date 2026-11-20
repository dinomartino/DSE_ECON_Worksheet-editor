/**
 * A data-response question (DRQ), its marking scheme and its exam results, imported as
 * the editor makes them (k-0480). Invented papers and answer files only: the repo is public.
 */
import { describe, expect, it } from 'vitest';
import type { InlineRun, McqQuestion, Question, StructuredQuestion } from '@/model/types';
import { getQuestionType } from '@/registry';
import { makeDocx, para, tbl } from './fixtures/docx';
import { analyseLines, buildImport, matchAnswers, readAnswerSheet, readDocx, readPaste, type ImportBatch } from './index';

const text = (runs: readonly InlineRun[] | undefined) => (runs ?? []).map((r) => r.text).join('');
const built = (batch: ImportBatch): Question[] => batch.builds.map((b) => b.fill(getQuestionType(b.typeId)!.create()) as Question);

/** An invented DRQ, laid out as a teacher's Word file sets one. */
const DRQ_BODY = [
  para('12.\tThe city of Riverton is planning a music festival.'),
  para('Source A: Visitors to Riverton'),
  tbl([[para('Year'), para('Visitors (thousand)')], [para('2024'), para('320')], [para('2025'), para('410')]]),
  para('Source B: A news extract'),
  para('Hotel rooms in Riverton were almost full during last year’s festival week.'),
  para('(a)\tRefer to Source A. Calculate the growth rate of visitors.\t(2 marks)'),
  para('(b)\tRefer to Source B.'),
  para('(i)\tIllustrate the hotel market with a supply-demand diagram.'),
  para('(ii)\tExplain the change in the hotel room rate.\t(5 marks)'),
  para(
    'For part (c), candidates are required to present their answers in an essay form. Criteria for marking will include the use of the sources and economic theories, relevant content, logical presentation and clarity of expression.',
  ),
  para('(c)\tSuppose the council is considering two strategies.\t(14 marks)'),
  tbl([[para('Strategy 1'), para('Building a new hotel next to the park')], [para('Strategy 2'), para('Giving a subsidy to home-stay hosts')]]),
  para('With reference to the above sources and your own knowledge in Economics, discuss which strategy is better.'),
].join('');

describe('a DRQ from a Word file', () => {
  it('comes in as the editor makes one: lettered sources, Refer to, a shared mark, the essay note and strategy table', async () => {
    const read = await readDocx(await makeDocx({ body: DRQ_BODY }));
    const batch = buildImport(analyseLines(read));
    const [q] = built(batch) as StructuredQuestion[];
    expect(q.type).toBe('structured');
    const sources = q.blocks.filter((b) => b.kind === 'source');
    expect(sources.map((s) => (s.kind === 'source' ? text(s.label?.en) : ''))).toEqual(['Source A: Visitors to Riverton', 'Source B: A news extract']);
    expect(sources[0].kind === 'source' && sources[0].blocks.map((b) => b.kind)).toEqual(['table']);
    expect(q.parts).toHaveLength(3);
    const [a, b, c] = q.parts;
    expect(a.marks).toBe(2);
    expect(text(a.blocks[0].kind === 'paragraph' ? a.blocks[0].text.en : [])).toMatch(/^Refer to Source A\./);
    // (i) and (ii) share one mark printed after (ii): the part's, as the DRQ starter keeps it.
    expect(b.marks).toBe(5);
    expect(b.subParts?.map((s) => s.marks)).toEqual([undefined, undefined]);
    expect(c.marks).toBe(14);
    expect(c.blocksBefore?.map((x) => (x.kind === 'paragraph' ? text(x.text.en) : ''))[0]).toMatch(/^For part \(c\), candidates are required/);
    expect(c.blocks.map((x) => x.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    // The strategy table takes the DRQ starter's look: indented to the part's text, label | text.
    const table = c.blocks[1];
    expect(table.kind === 'table' && table.columnWidths).toEqual([0.22, 0.78]);
    expect(table.kind === 'table' && table.rows.map((r) => r.cells.map((cell) => text(cell.text.en)))).toEqual([
      ['Strategy 1', 'Building a new hotel next to the park'],
      ['Strategy 2', 'Giving a subsidy to home-stay hosts'],
    ]);
  });
});

describe('a DRQ from a PDF or a scan', () => {
  it('turns "Strategy X …" rows and their wrapped lines into the strategy table, and stops at the next sentence', async () => {
    const { bufferOf, makePdf } = await import('./fixtures/pdfWriter');
    const { readPdf, isPdfReadError } = await import('./index');
    const lines: Array<[string, number]> = [
      ['12. The town of Lakeside wants fewer cars in its centre.', 42],
      ['(a) Refer to the views above. Explain ONE reason for the plan. (2 marks)', 60],
      ['(b) Consider the following two strategies. (14 marks)', 60],
      ['Strategy X  Charging a fee for every car that enters the centre on a', 90],
      ['weekday', 160],
      ['Strategy Y  Building more bus lanes', 90],
      ['With reference to your own knowledge in Economics, discuss the two strategies.', 84],
    ];
    const bytes = makePdf([{ texts: lines.map(([t, x], k) => ({ text: t, x, y: 760 - k * 16, size: 10 })) }]);
    const read = await readPdf(bufferOf(bytes));
    if (isPdfReadError(read)) throw new Error(read.kind);
    const [q] = built(buildImport(analyseLines(read))) as StructuredQuestion[];
    const essay = q.parts[1];
    expect(essay.blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    const table = essay.blocks[1];
    expect(table.kind === 'table' && table.rows.map((r) => r.cells.map((c) => text(c.text.en)))).toEqual([
      ['Strategy X', 'Charging a fee for every car that enters the centre on a weekday'],
      ['Strategy Y', 'Building more bus lanes'],
    ]);
    expect(text(essay.blocks[2].kind === 'paragraph' ? essay.blocks[2].text.en : [])).toMatch(/^With reference/);
  });
});

/** An invented scheme for DRQ_BODY, in HKEAA's layout. */
const SCHEME_EN = [
  'Marking Scheme',
  '12. (a) Visitors rose from 320 thousand to 410 thousand. The growth rate is (410 − 320) ÷ 320 × 100% = 28.1%. (2)',
  '(b) (i) Indicate in the diagram:',
  '- demand curve shifts to the right (1)',
  '- room rate rises from P0 to P1 (1)',
  '(ii) Possible reasons:',
  '- more visitors came for the festival',
  '- hotel rooms cannot be added in the short run',
  '- any other relevant point',
  '2@ max: 4',
  '[Mark the FIRST TWO points only.]',
  '(c) Marks for effective communication (EC: max 2 marks)',
  'Marks Performance',
  '2 Support arguments with the sources and economic theories.',
  'Present well-organised answers.',
  '1 Present arguments with some support of the sources.',
  '0 Present arguments with no support of the sources.',
  'The maximum mark for content is 12 marks.',
  'How Strategy 1 may help:',
  '- more rooms lower the room rate',
  'How Strategy 2 may help:',
  '- more home-stays add to the supply of rooms',
].join('\n');

describe('a DRQ marking scheme from an answer file', () => {
  it("reads HKEAA's structure into the editor's scheme: headings, 2@ max, first only, EC, content max, paragraph", async () => {
    const paper = analyseLines(await readDocx(await makeDocx({ body: DRQ_BODY })));
    const match = matchAnswers(paper, readAnswerSheet(readPaste({ plain: SCHEME_EN })));
    expect(match.report.map((r) => r.status)).toEqual(['matched']);
    const [q] = built(buildImport(analyseLines(await readDocx(await makeDocx({ body: DRQ_BODY })), { pins: match.pins }))) as StructuredQuestion[];
    const [a, b, c] = q.parts;

    // (a): one paragraph with its total beside it.
    expect(a.scheme?.display).toBe('paragraph');
    expect(a.scheme?.routes[0].groups[0].points.map((p) => p.marks)).toEqual([2]);

    // (b)(i): a heading over its points, dashes off; (b)(ii): 2@, the first two only, max 4.
    const [i, ii] = b.subParts!;
    expect(i.scheme?.routes[0].groups.map((g) => ({ heading: text(g.heading?.en), points: g.points.map((p) => [text(p.text.en), p.marks]) }))).toEqual([
      {
        heading: 'Indicate in the diagram:',
        points: [
          ['demand curve shifts to the right', 1],
          ['room rate rises from P0 to P1', 1],
        ],
      },
    ]);
    const g = ii.scheme!.routes[0].groups[0];
    expect({ heading: text(g.heading?.en), each: g.each, take: g.take, firstOnly: g.firstOnly, max: g.max, points: g.points.length }).toEqual({
      heading: 'Possible reasons:',
      each: 2,
      take: 2,
      firstOnly: true,
      max: 4,
      points: 3,
    });

    // (c): HKEAA's essay: EC 2/1/0, content max 12, indicative points under headings.
    expect(c.scheme?.ec?.max).toBe(2);
    expect(c.scheme?.ec?.descriptors.map((d) => [d.marks, text(d.text.en)])).toEqual([
      [2, 'Support arguments with the sources and economic theories.\nPresent well-organised answers.'],
      [1, 'Present arguments with some support of the sources.'],
      [0, 'Present arguments with no support of the sources.'],
    ]);
    expect(c.scheme?.contentMax).toBe(12);
    expect(c.scheme?.routes[0].groups.map((x) => [text(x.heading?.en), x.points.map((p) => text(p.text.en))])).toEqual([
      ['How Strategy 1 may help:', ['more rooms lower the room rate']],
      ['How Strategy 2 may help:', ['more home-stays add to the supply of rooms']],
    ]);
  });

  it('reads the Chinese notation: 最高：4, [只批閱首兩項。], 有效傳意, 內容最高12分 (and OCR’s 内)', () => {
    const sheet = readAnswerSheet(
      readPaste({
        plain: [
          '評卷參考',
          '3. 可能因素：',
          '- 身體特徵不同：較健康的人平均收入可能較高。',
          '- 人力資本不同：教育程度較高的人平均收入較高。',
          '- 任何其他相關點',
          '2@',
          '最高：4',
          '[只批閱首兩項。]',
          '4. (e) 有效傳意評分（EC：最高 2 分）',
          '分數 表現',
          '2 運用資料及適當的經濟理論支持論點。',
          '1 以一些資料和經濟理論支持論點。',
          '0 沒有以資料和經濟理論支持論點。',
          '内容最高12分。',
          '如何達成目標1：',
          '-當舉辦更多盛事時，總需求上升。',
        ].join('\n'),
      }),
    );
    const [three, essay] = sheet.entries;
    expect(three.groups).toEqual([{ heading: [{ text: '可能因素：' }], each: 2, max: 4, take: 2, firstOnly: true }]);
    expect(three.points?.map((p) => text(p.runs))).toEqual(['身體特徵不同：較健康的人平均收入可能較高。', '人力資本不同：教育程度較高的人平均收入較高。', '任何其他相關點']);
    expect(three.marks).toBe(4);
    expect(essay).toMatchObject({ question: 4, part: 'e', contentMax: 12, marks: 14 });
    expect(essay.ec?.rows.map((r) => r.marks)).toEqual([2, 1, 0]);
    expect(essay.points?.map((p) => text(p.runs))).toEqual(['當舉辦更多盛事時，總需求上升。']);
  });

  it('reads level descriptors under a stated range', () => {
    const sheet = readAnswerSheet(
      readPaste({ plain: ['5. (d)', 'L2 (4-6 marks): A clear explanation with a correct diagram.', 'L1 (1-3 marks): Some relevant points', 'with no diagram.'].join('\n') }),
    );
    expect(sheet.entries[0].levels?.map((l) => [l.min, l.max, text(l.runs)])).toEqual([
      [1, 3, 'Some relevant points with no diagram.'],
      [4, 6, 'A clear explanation with a correct diagram.'],
    ]);
    expect(sheet.entries[0].marks).toBe(6);
  });
});

const MC_PAPER = [
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
].join('\n');

/** An examination report's key ("B (65)": % correct) and its comments, invented. */
const REPORT = [
  'Marking Schemes',
  'Paper 1',
  'Question No.\tKey\tQuestion No.\tKey',
  '1.\tA (81)\t3.\tD (35)',
  '2.\tA (62)',
  'Note: Figures in brackets indicate the percentages of candidates choosing the correct answers.',
  "Candidates' Performance",
  'Paper 1',
  'Candidates did well on the basic concepts this year, with a mean score of 30 marks out of 45.',
  '3. A rise in the price of tea will',
  'A. raise the demand for coffee. (35%) This question tested cross effects. Many candidates chose option C as they mixed up demand and quantity demanded.',
  'Paper 2',
  'Section A',
  'Question Number\tPerformance in General',
  '1(a)\tGood. Most candidates explained the concept clearly.',
].join('\n');

describe('exam results from an examination report', () => {
  it('reads each % and the comments, and the import writes them to the paper in the one commit', async () => {
    const sheet = readAnswerSheet(readPaste({ plain: REPORT }));
    expect(sheet.entries.map((e) => [e.question, e.letter, e.percent])).toEqual([
      [1, 0, 81],
      [3, 3, 35],
      [2, 0, 62],
    ]);
    expect(sheet.comments?.map((c) => c.paper)).toEqual(['P1', 'P1', 'P1', 'P2']);
    const read = readPaste({ plain: MC_PAPER });
    const match = matchAnswers(analyseLines(read), sheet);
    const batch = buildImport(analyseLines(read, { pins: match.pins }));
    expect(batch.results?.mcPercent).toEqual([81, 62, 35]);
    // An MC paper's comments: the general one, and the commentary on Q3, not the quoted question.
    expect(text(batch.results?.mcComments?.en)).toBe(
      'Candidates did well on the basic concepts this year, with a mean score of 30 marks out of 45.\n\nQ3: This question tested cross effects. Many candidates chose option C as they mixed up demand and quantity demanded.',
    );
    expect(batch.results?.sqComments).toBeUndefined();

    const { createImportedDocument } = await import('@/components/import/fileImport');
    const { useWorksheetStore } = await import('@/store/worksheetStore');
    const report = createImportedDocument(batch, { documentType: 'paper1', name: 'Mock 1' }, (w) => useWorksheetStore.getState().replaceWorksheet(w));
    if (!report.ok) throw new Error(report.refused);
    const made = useWorksheetStore.getState().worksheet;
    const ids = made.questions.map((q) => q.id);
    expect(made.examResults?.mcPercent).toEqual({ [ids[0]]: 81, [ids[1]]: 62, [ids[2]]: 35 });
    expect((made.questions as McqQuestion[]).map((q) => q.answerIndex)).toEqual([0, 0, 3]);
    expect(text(made.examResults?.mcComments?.en)).toMatch(/^Candidates did well/);
    // One commit: one undo takes the questions and the results back together.
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet.questions).toEqual([]);
    expect(useWorksheetStore.getState().worksheet.examResults).toBeUndefined();
  });

  it('gives a written paper the written questions’ comments, under its paper', () => {
    const sheet = readAnswerSheet(readPaste({ plain: REPORT }));
    const read = readPaste({ plain: '1.\t(a)\tExplain what is meant by opportunity cost.\t(2 marks)' });
    const match = matchAnswers(analyseLines(read), sheet);
    const batch = buildImport(analyseLines(read, { pins: match.pins }));
    expect(text(batch.results?.sqComments?.en)).toBe('1(a) Good. Most candidates explained the concept clearly.');
    expect(batch.results?.mcComments).toBeUndefined();
  });

  it('imports a file with no results exactly as before: no results on the batch', () => {
    const batch = buildImport(analyseLines(readPaste({ plain: MC_PAPER })));
    expect(batch.results).toBeUndefined();
  });
});

describe('imported text never ends in a blank line (k-0468, issue #7.1)', () => {
  it('takes breaks off both ends of every field, keeps one inside, and keeps the words', async () => {
    const { importedRuns } = await import('./index');
    expect(importedRuns([{ text: '\nDemand rises.\n' }])).toEqual([{ text: 'Demand rises.' }]);
    expect(importedRuns([{ text: 'Demand rises.' }, { text: '\n', bold: true }, { text: ' \n' }])).toEqual([{ text: 'Demand rises.' }]);
    expect(importedRuns([{ text: 'First.\n\n\n\nSecond.' }])).toEqual([{ text: 'First.\n\nSecond.' }]);
    expect(importedRuns([{ text: 'Line one\nline two' }])).toEqual([{ text: 'Line one\nline two' }]);
  });

  it('a model answer whose file ends its lines with a break imports with no blank line after it', () => {
    const paper = analyseLines(readPaste({ plain: '1.\tExplain what is meant by opportunity cost.\t(2 marks)' }));
    const match = matchAnswers(paper, readAnswerSheet(readPaste({ plain: 'Answers\n1.\tThe value of the best option given up.\n\n' })));
    const [q] = built(buildImport(analyseLines(readPaste({ plain: '1.\tExplain what is meant by opportunity cost.\t(2 marks)' }), { pins: match.pins }))) as StructuredQuestion[];
    expect(text(q.answer?.en)).toBe('The value of the best option given up.');
  });
});

describe('matching a scanned paper', () => {
  it('does not start a new numbering run at a repeated number (a stray piece OCR split off)', async () => {
    const { numberRuns } = await import('./matchAnswers');
    const paper = analyseLines(readPaste({ plain: `${MC_PAPER}\n3.\t(1), (2) and (3)` }));
    expect(paper.outline.questions.map((q) => q.number)).toEqual([1, 2, 3, 3]);
    expect(numberRuns(paper)).toHaveLength(1);
  });
});

describe('subscripts, fractions and bold come in as the editor’s own marks (k-0480 after k-0479, GitHub #8)', () => {
  const sub = (base: string, n: string) => `<m:sSub><m:e><m:r><m:t>${base}</m:t></m:r></m:e><m:sub><m:r><m:t>${n}</m:t></m:r></m:sub></m:sSub>`;
  const t = (s: string) => `<m:r><m:t xml:space="preserve">${s}</m:t></m:r>`;
  // (Q₂ − Q₁) over Q₁, as Word's equation editor writes it.
  const EQUATION = `<m:oMath><m:f><m:num><m:d><m:e>${sub('Q', '2')}${t(' − ')}${sub('Q', '1')}</m:e></m:d></m:num><m:den>${sub('Q', '1')}</m:den></m:f>${t(' × 100%')}</m:oMath>`;

  it('reads Word’s subscripts, its equations as stacked fractions, and its bold as run bold', async () => {
    const { p, r } = await import('./fixtures/docx');
    const body = [
      p(r('1.\tThe quantity rises from Q') + r('1', { vert: 'subscript' }) + r(' to Q') + r('2', { vert: 'subscript' }) + r('. Which of the following is ') + r('NOT', { b: true }) + r(' correct?')),
      p(r('A.\tThe percentage change is ') + EQUATION),
      para('B.\tDemand is elastic.'),
      para('C.\tSupply is perfectly elastic.'),
      para('D.\tThe price falls.'),
    ].join('');
    const [q] = built(buildImport(analyseLines(await readDocx(await makeDocx({ body }))))) as McqQuestion[];
    const stem = q.blocks[0].kind === 'paragraph' ? q.blocks[0].text.en : [];
    expect(stem.filter((x) => x.vertAlign === 'subscript').map((x) => x.text)).toEqual(['1', '2']);
    expect(stem.find((x) => x.text === 'NOT')).toEqual({ text: 'NOT', bold: true });
    const a = q.options[0].text.en;
    expect(a.map((x) => x.text).join('')).toBe('The percentage change is (Q2 − Q1)⁄Q1 × 100%');
    expect(a.filter((x) => x.fraction === 'num').map((x) => [x.text, x.vertAlign ?? ''])).toEqual([
      ['(Q', ''],
      ['2', 'subscript'],
      [' − Q', ''],
      ['1', 'subscript'],
      [')', ''],
    ]);
    expect(a.filter((x) => x.fraction === 'den').map((x) => [x.text, x.vertAlign ?? ''])).toEqual([
      ['⁄Q', ''],
      ['1', 'subscript'],
    ]);
    expect(a[a.length - 1]).toEqual({ text: ' × 100%' });
    const { textSegments } = await import('@/model/fraction');
    expect(textSegments(a).map((s) => s.kind)).toEqual(['runs', 'fraction', 'runs']);
  });

  it('keeps a fraction inside a fraction readable as a/b, since runs stack one level', async () => {
    const { p, r } = await import('./fixtures/docx');
    const nested = `<m:oMath><m:f><m:num><m:f><m:num>${t('ΔQ')}</m:num><m:den>${t('Q')}</m:den></m:f></m:num><m:den><m:f><m:num>${t('ΔP')}</m:num><m:den>${t('P')}</m:den></m:f></m:den></m:f></m:oMath>`;
    const read = await readDocx(await makeDocx({ body: p(r('Elasticity = ') + nested) }));
    expect(read.lines[0].text).toBe('Elasticity = ΔQ/Q⁄ΔP/P');
  });

  it('reads a PDF’s subscripts and superscripts from their size and baseline, and its bold', async () => {
    const { bufferOf, makePdf } = await import('./fixtures/pdfWriter');
    const { readPdf, isPdfReadError } = await import('./index');
    // Helvetica's widths (per 1000), so each piece is set tight against the last, as in a real file.
    const AFM: Record<string, number> = { T: 611, h: 556, e: 556, ' ': 278, p: 556, r: 333, i: 222, c: 500, s: 500, f: 278, o: 556, m: 833, P: 667, t: 278, a: 556, n: 556, d: 556, u: 556, '1': 556, '0': 556, '2': 556, '3': 556 };
    const width = (str: string, size: number) => [...str].reduce((w, ch) => w + (AFM[ch] ?? 556), 0) * size / 1000;
    const pieces: Array<[string, number, number]> = [
      ['The price rises from P', 760, 11],
      ['1', 757, 7],
      [' to P', 760, 11],
      ['2', 757, 7],
      [' and output is 10', 760, 11],
      ['3', 765, 7],
      [' units. Explain the change.', 760, 11],
    ];
    let x = 66;
    const texts = pieces.map(([text, y, size]) => {
      const at = { text, x, y, size };
      x += width(text, size);
      return at;
    });
    const bytes = makePdf([{ texts: [{ text: '1.', x: 42, y: 760, size: 11 }, ...texts.map((it) => ({ ...it, text: it.text.trimStart(), x: it.text.startsWith(' ') ? it.x + 3.06 : it.x }))] }]);
    const read = await readPdf(bufferOf(bytes));
    if (isPdfReadError(read)) throw new Error(read.kind);
    const runs = read.lines[0].runs;
    expect(runs.filter((x) => x.vertAlign).map((x) => [x.text, x.vertAlign])).toEqual([
      ['1', 'subscript'],
      ['2', 'subscript'],
      ['3', 'superscript'],
    ]);
    expect(read.lines[0].text).toMatch(/^The price rises from P1 to P2 and output is 103 units\. Explain the change\./);
  });
});

describe('a marking scheme laid out with a marks column', () => {
  it('keeps two lines beside a tall "2@" apart, reads 2@ and max: 2 as the group’s rules, and joins each point’s wrapped line', async () => {
    const { bufferOf, makePdf } = await import('./fixtures/pdfWriter');
    const { readPdf, isPdfReadError } = await import('./index');
    const long = 'investment expenditure: more firms have been set up by firms from overseas after';
    const bytes = makePdf([
      {
        texts: [
          { text: '3. (a) Possible components:', x: 60, y: 760, size: 11 },
          { text: 'private consumption expenditure: households buy food and drinks at the', x: 96, y: 746, size: 11 },
          { text: 'festival.', x: 96, y: 734, size: 11 },
          { text: long, x: 96, y: 722, size: 11 },
          { text: '2@', x: 556, y: 716, size: 14 },
          { text: 'it joined the summit.', x: 96, y: 710, size: 11 },
          { text: 'max: 2', x: 556, y: 704, size: 11 },
          { text: '- net exports: tourists buy tickets for the games.', x: 96, y: 698, size: 11 },
          { text: '[Mark the FIRST point only.]', x: 84, y: 684, size: 11 },
        ],
      },
    ]);
    const read = await readPdf(bufferOf(bytes));
    if (isPdfReadError(read)) throw new Error(read.kind);
    const [entry] = readAnswerSheet(read).entries;
    expect(entry.groups).toEqual([{ heading: [{ text: 'Possible components:' }], each: 2, max: 2, take: 1, firstOnly: true }]);
    expect(entry.points?.map((p) => text(p.runs))).toEqual([
      'private consumption expenditure: households buy food and drinks at the festival.',
      `${long} it joined the summit.`,
      'net exports: tourists buy tickets for the games.',
    ]);
  });

  it('takes off a dash OCR read as 一 before English words', () => {
    const [entry] = readAnswerSheet(readPaste({ plain: '4. Possible motives:\n一 platform providers face less competition\nHigher prices for users (1)' })).entries;
    expect(entry.points?.map((p) => text(p.runs))[0]).toBe('platform providers face less competition');
  });
});
