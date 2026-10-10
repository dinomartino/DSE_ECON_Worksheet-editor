import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { McqQuestion, StructuredQuestion } from '@/model/types';
import type { OutBlock } from './types';
import { analyseLines, analysePaste, buildImport, readPaste } from '.';
import { materialise } from './fixtures/score';

const STRUCTURED = ['1.\tA shop raises its prices.', 'a)\tState the law of demand.\t(2 marks)', 'b)\tExplain the change in revenue.\t(3 marks)'].join('\n');

describe('solver', () => {
  it('a role pin spreads to the whole family', () => {
    const read = readPaste({ plain: STRUCTURED });
    const before = analyseLines(read);
    expect(before.outline.questions[0].parts).toHaveLength(2);
    // Telling it one "a)" is a statement relabels every "x)" line.
    const pinned = analyseLines(read, { pins: [{ kind: 'role', line: 1, role: 'statement' }] });
    expect(pinned.profile.statement).toContain('a)');
    expect(pinned.roles[2].role).not.toBe('part');
    expect(pinned.roles[1].pinned).toBe(true);
  });

  it('starts a question where pinned, and joins a line to the one above', () => {
    const read = readPaste({ plain: '1.\tWhy do firms merge?\nExplain with an example.\n2.\tWhat is GDP?' });
    expect(analyseLines(read).outline.questions).toHaveLength(2);
    const split = analyseLines(read, { pins: [{ kind: 'newQuestion', line: 1 }] });
    expect(split.outline.questions).toHaveLength(3);
    const joined = analyseLines(read, { pins: [{ kind: 'join', line: 2 }] });
    expect(joined.outline.questions).toHaveLength(1);
    expect(joined.outline.questions[0].stem.flatMap((b) => b.lines)).toEqual([0, 1, 2]);
  });

  it('a noise pin on a header remembers its text for every copy of it', () => {
    const plain = 'School Quiz 3\n1.\tWhat is scarcity?\nSchool Quiz 3\n2.\tWhat is a free good?';
    const read = readPaste({ plain });
    const result = analyseLines(read, { pins: [{ kind: 'role', line: 0, role: 'noise' }] });
    expect(result.roles[2].role).toBe('noise');
    expect(result.profile.noise.length).toBe(1);
  });

  it('a saved profile reproduces the layout it was inferred from', () => {
    const read = readPaste({ plain: STRUCTURED });
    const { profile } = analyseLines(read);
    expect(profile).toMatchObject({ question: ['n.'], part: ['a)'], marks: ['(n marks)'], lineMode: 'paragraph' });
    expect(analyseLines(read, { profile }).outline).toEqual(analyseLines(read).outline);
  });

  it('rejects an instructions list that looks like questions', () => {
    const plain = ['INSTRUCTIONS', '1.\tWrite your name on the answer sheet.', '2.\tAnswer ALL questions.', 'Section A', '1.\tWhich is a free good?', 'A.\tair', 'B.\twater', 'C.\tland', 'D.\tfood'].join('\n');
    const result = analysePaste({ plain });
    expect(result.outline.questions).toHaveLength(1);
    expect(result.roles[1].role).toBe('heading');
  });

  it('flags a skipped number and an MC without an answer', () => {
    const result = analysePaste({ plain: '1.\tFirst?\n2.\tSecond?\n4.\tFourth?\nA.\ta\nB.\tb\nC.\tc\nD.\td' });
    expect(result.flags.map((f) => f.kind)).toEqual(expect.arrayContaining(['sequenceBreak', 'noAnswer']));
  });

  it('answer and language pins win', () => {
    const read = readPaste({ plain: '1.\tWhich?\nA.\ta\nB.\tb\nC.\tc\nD.\td' });
    const result = analyseLines(read, { pins: [{ kind: 'answer', line: 3, index: 2 }, { kind: 'language', line: 0, side: 'zh' }] });
    expect(result.outline.questions[0]).toMatchObject({ answer: { index: 2, from: 'pin' }, side: 'zh' });
  });
});

describe('bare option letters and labelled table rows', () => {
  const tables = (blocks: readonly OutBlock[]): string[][][] =>
    blocks.flatMap((b) => (b.kind === 'table' ? [b.rows.map((row) => row.map((c) => c.map((r) => r.text).join('')))] : b.kind === 'source' ? tables(b.blocks) : []));

  it('reads an MC whose option B lost its dot, and takes its answer from a bare-letter key', () => {
    const plain = ['41.\tWhich is a free good?', 'A.\tair', 'B.\tbooks', 'C.\tland', 'D.\tfood', '42.\tWhich of the above are correct?', 'A. (1) and (3) only', 'B (1) and (4) only', 'C. (2) and (3) only', 'D. (2) and (4) only', 'Answers', '41 A\t42 B'].join('\n');
    const [, q] = analysePaste({ plain }).outline.questions;
    expect(q).toMatchObject({ kind: 'mc', answer: { index: 1, from: 'key' } });
    expect(q.options.map((o) => o.runs.map((r) => r.text).join(''))).toEqual(['(1) and (3) only', '(1) and (4) only', '(2) and (3) only', '(2) and (4) only']);
  });

  it('keeps a capital letter that opens prose as text', () => {
    const plain = ['1.\tRead the passage.', 'A firm raises its price.', 'B cannot follow.', '2.\tWhy?'].join('\n');
    const result = analysePaste({ plain });
    expect(result.outline.questions).toHaveLength(2);
    expect(result.outline.questions[0]).toMatchObject({ kind: 'written', options: [] });
  });

  it('reads (a)–(d) rows of a source table as rows, and the parts after it as parts', () => {
    const plain = [
      '10.\tRead the sources.',
      'Source B: The tax rates are shown below:',
      'Taxable value\tRate',
      '(a) on the first $150,000\t46%',
      '(b) on the next $150,000\t86%',
      '(c) on the remainder\t132%',
      '(a)\tRefer to Source B. Is the tax progressive?\t(3 marks)',
      '(b)\tExplain one effect of the tax.\t(2 marks)',
    ].join('\n');
    const [q] = analysePaste({ plain }).outline.questions;
    expect(q.parts.map((p) => [p.label, p.marks])).toEqual([
      ['(a)', 3],
      ['(b)', 2],
    ]);
    expect(tables(q.stem)).toEqual([
      [
        ['Taxable value', 'Rate'],
        ['(a) on the first $150,000', '46%'],
        ['(b) on the next $150,000', '86%'],
        ['(c) on the remainder', '132%'],
      ],
    ]);
  });

  it('reads labelled rows with no header as rows when the labels start again as parts', () => {
    const plain = ['3.\tStudy the data.', '(a)\tFirm A\t50', '(b)\tFirm B\t20', '(a)\tCompare the firms.\t(2 marks)'].join('\n');
    const [q] = analysePaste({ plain }).outline.questions;
    expect(q.parts).toHaveLength(1);
    expect(tables(q.stem)).toEqual([
      [
        ['(a)', 'Firm A', '50'],
        ['(b)', 'Firm B', '20'],
      ],
    ]);
  });

  it('keeps parts as parts: after a plain table, set out with TABs, or with marks in a column', () => {
    const afterTable = analysePaste({ plain: ['1.\tStudy the table.', 'Year\t2024\t2025', 'GDP\t100\t110', '(a)\tCalculate the growth rate.\t(2 marks)', '(b)\tExplain one cause.\t(2 marks)'].join('\n') });
    expect(afterTable.outline.questions[0].parts.map((p) => p.label)).toEqual(['(a)', '(b)']);
    const tabbed = analysePaste({ plain: ['1.\tDefine each term.', '(a)\tOpportunity cost\tUse an example.', '(b)\tScarcity\tUse an example.'].join('\n') });
    expect(tabbed.outline.questions[0].parts).toHaveLength(2);
    const marksColumn = analysePaste({ plain: ['1.\tAnswer both.', 'Part\tQuestion\tMarks', '(a)\tExplain demand.\t2 marks', '(b)\tExplain supply.\t3 marks'].join('\n') });
    expect(marksColumn.outline.questions[0].parts).toHaveLength(2);
  });
});

describe('scan and empty pastes', () => {
  it('says empty for whitespace and scan for an image-only HTML paste', () => {
    expect(analysePaste({ plain: ' \n\t\n' }).kind).toBe('empty');
    expect(analysePaste({ plain: '', html: '<p><img src="data:image/png;base64,AAAA" width="10" height="10"></p>' }).kind).toBe('scan');
  });

  it('does not mistake typed full-width brackets in a Word paste for OCR', () => {
    const plain = ['1.\tWhich are costs？', '（1）\trent', '（2）\twages', '（3）\ttax', 'A.\t（1）and（2）only', 'B.\t（1）and（3）only', 'C.\t（2）and（3）only', 'D.\t（1）,（2）and（3）'].join('\n');
    expect(analysePaste({ plain }).kind).toBe('ok');
  });

  it('turns a paste with no number into one question, flagged', () => {
    const result = analysePaste({ plain: 'Explain why the demand for salt is inelastic.\t(3 marks)' });
    expect(result.outline.questions).toMatchObject([{ kind: 'written', marks: 3 }]);
    expect(result.flags.map((f) => f.kind)).toContain('unlabelledStart');
  });

  it('prefers HTML only when it carries the text', () => {
    expect(readPaste({ plain: '1.\tWhy?', html: '<p>1.\tWhy?</p>' }).source).toBe('html');
    expect(readPaste({ plain: '1.\tWhy is the sky blue today?', html: '<img src="x.png">' }).source).toBe('plain');
  });
});

describe('builder', () => {
  it('drops labels, keeps text verbatim and leaves absent marks absent', () => {
    const plain = ['1.\tA shop raises its prices.', '\t(a)\tState the law of demand.', '\t(b)\tExplain why.\t(3 marks)', '\t\t(i)\tfor buyers;', '\t\t(ii)\tfor sellers.', '\t\t\t(4 marks)', '\t', '\t'].join('\n');
    const [q] = materialise(buildImport(analysePaste({ plain }))) as StructuredQuestion[];
    expect(q.type).toBe('structured');
    expect(q.blocks).toMatchObject([{ kind: 'paragraph', text: { en: [{ text: 'A shop raises its prices.' }], zh: [] } }]);
    expect(q.parts[0].marks).toBeUndefined();
    expect(q.parts[1]).toMatchObject({ marks: 4, subParts: [{ blocks: [{ text: { en: [{ text: 'for buyers;' }] } }] }, { answerSpace: 2 }] });
    expect(q.parts[1].subParts?.every((s) => s.marks === undefined)).toBe(true);
  });

  it('builds MC statements, options and an answer from bold, with the bold removed', () => {
    const html = '<p>1.\tWhich are costs?</p><p>(1)\trent</p><p>(2)\twages</p><p>A.\t(1) only</p><p><b>B.\t(1) and (2)</b></p><p>C.\t(2) only</p><p>D.\tnone</p>';
    const [q] = materialise(buildImport(analysePaste({ html }))) as McqQuestion[];
    expect(q.statements?.map((s) => s.en[0].text)).toEqual(['rent', 'wages']);
    expect(q.options.map((o) => o.text.en[0].text)).toEqual(['(1) only', '(1) and (2)', '(2) only', 'none']);
    expect(q.answerIndex).toBe(1);
    expect(q.options[1].text.en[0].bold).toBeUndefined();
  });

  it('puts Chinese text on the zh side and a leading shared stem in the lead', () => {
    const plain = ['Study the table and answer Questions 1 and 2.', 'Year\tPrice', '2025\t$40', '1.\t下列哪項是公共財品？', 'A.\t燈塔', 'B.\t書本', 'C.\t病床', 'D.\t單位', '2.\tWhy?', 'A.\ta', 'B.\tb', 'C.\tc', 'D.\td'].join('\n');
    const batch = buildImport(analysePaste({ plain }));
    const [q] = materialise(batch) as McqQuestion[];
    expect(q.blocks[0]).toMatchObject({ text: { en: [], zh: [{ text: '下列哪項是公共財品？' }] } });
    expect(batch.lead).toMatchObject({ kind: 'stimulus', span: 2, prefix: { en: [{ text: 'Study the table and answer ' }] }, suffix: { en: [{ text: '.' }] } });
  });
});

describe('src/import', () => {
  it('names the question types only in the builder', () => {
    const files = readdirSync('src/import').filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== 'build.ts');
    for (const name of files) {
      const source = readFileSync(`src/import/${name}`, 'utf8');
      expect(source, name).not.toMatch(/['"]mcq['"]/);
      expect(source, name).not.toMatch(/['"]structured['"]/);
    }
  });

  it('re-solves a 60-question paste fast enough to run on every pin', () => {
    const mc = (n: number) => [`${n}.\tWhich of the following is question ${n} about scarcity and choice?`, '(1)\tthe first statement', '(2)\tthe second statement', 'A.\t(1) only', 'B.\t(2) only', 'C.\t(1) and (2)', 'D.\tneither', ''];
    const sq = (n: number) => [`${n}.\tA firm in Kwun Tong hires workers.`, '\t(a)\tExplain the law of diminishing returns.\t(3 marks)', '\t(b)\tCalculate the average product.', '\t\t(i)\tfor two workers;', '\t\t(ii)\tfor three workers.', '\t\t\t(4 marks)', '\t', '\t', ''];
    const plain = Array.from({ length: 60 }, (_, k) => (k % 3 === 2 ? sq(k + 1) : mc(k + 1))).flat().join('\n');
    const read = readPaste({ plain });
    analyseLines(read);
    const start = performance.now();
    const runs = 5;
    for (let k = 0; k < runs; k++) analyseLines(read, { pins: [{ kind: 'role', line: 1, role: 'statement' }] });
    const each = (performance.now() - start) / runs;
    expect(analyseLines(read).outline.questions).toHaveLength(60);
    // Target < 30 ms; the bound is generous for slow CI machines.
    expect(each).toBeLessThan(200);
  });
});
