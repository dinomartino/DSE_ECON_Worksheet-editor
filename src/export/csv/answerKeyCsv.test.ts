import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createMcqQuestion, createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { createSectionElement } from '@/model/flow';
import { bi } from '@/model/text';
import type { McqQuestion } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import {
  answerKeyRows,
  appFileName,
  blooketCsv,
  BOM,
  buildAppExport,
  csvField,
  kahootRows,
  keyCsv,
  quizQuestions,
  toCsv,
  zipGradeCsv,
} from './answerKeyCsv';
import { buildXlsx, columnName, sheetXml } from './xlsx';

function mcq(answerIndex: number, stem = 'Which?', options = ['a', 'b', 'c', 'd']): McqQuestion {
  const question = createMcqQuestion();
  question.answerIndex = answerIndex;
  question.blocks = [{ kind: 'paragraph', id: newId(), text: bi(stem, `${stem}中`) }];
  question.options = options.map((text) => ({ id: newId(), text: bi(text, `${text}中`) }));
  return question;
}

const lines = (text: string) => text.replace(BOM, '').split('\r\n');

describe('CSV quoting (RFC 4180)', () => {
  it('quotes only fields holding a comma, quote or line break, doubling quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(3)).toBe('3');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('需求')).toBe('需求');
  });

  it('ends every row with CRLF and leads with a BOM only when asked', () => {
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2\r\n');
    expect(toCsv([['a']], { bom: true })).toBe('﻿a\r\n');
  });
});

describe('answer-key rows', () => {
  it('numbers as the paper prints, restarting at a section, and skips non-choice questions', () => {
    const worksheet = withFlow(
      createWorksheet(),
      [
        createSectionElement(bi('Section A', '甲部')),
        mcq(0),
        mcq(2),
        createStructuredQuestion(),
        createSectionElement(bi('Section B', '乙部')),
        mcq(3),
      ],
      { replaceLayout: true },
    );
    expect(answerKeyRows(worksheet).map((row) => [row.number, row.letter])).toEqual([
      [1, 'A'],
      [2, 'C'],
      [1, 'D'],
    ]);
  });

  it('leaves an unkeyed question blank, never guessed', () => {
    const worksheet = withFlow(createWorksheet(), [mcq(-1), mcq(1)], { replaceLayout: true });
    const { text, warnings } = keyCsv(answerKeyRows(worksheet), 'en');
    expect(text.startsWith(BOM)).toBe(true);
    expect(lines(text)).toEqual(['Question,Answer', '1,', '2,B', '']);
    expect(warnings).toEqual(['Q1: no key set — its answer is left blank.']);
  });

  it('adds a Section column to the plain key only when numbers repeat', () => {
    const worksheet = withFlow(
      createWorksheet(),
      [createSectionElement(bi('Part, one', '甲部')), mcq(0), createSectionElement(bi('B', '乙部')), mcq(1)],
      { replaceLayout: true },
    );
    expect(lines(keyCsv(answerKeyRows(worksheet), 'zh').text)).toEqual([
      'Section,Question,Answer',
      '甲部,1,A',
      '乙部,1,B',
      '',
    ]);
    expect(lines(keyCsv(answerKeyRows(worksheet), 'en').text)[1]).toBe('"Part, one",1,A');
  });
});

describe('ZipGrade key', () => {
  it('writes key version A, the printed number, the letter and the marks as points', () => {
    const worth2 = mcq(1);
    worth2.marks = 2;
    const worksheet = withFlow(createWorksheet(), [mcq(0), worth2, mcq(-1)], { replaceLayout: true });
    const { text, warnings } = zipGradeCsv(answerKeyRows(worksheet));
    expect(text.startsWith('Key')).toBe(true);
    expect(lines(text)).toEqual([
      'Key Letter,Question Number,Response/Mapping,Point Value',
      'A,1,A,1',
      'A,2,B,2',
      'A,3,,1',
      '',
    ]);
    expect(warnings).toEqual(['Q3: no key set — its response is left blank.']);
  });

  it('numbers 1–N in paper order when a section restart would repeat a number', () => {
    const worksheet = withFlow(
      createWorksheet(),
      [createSectionElement(bi('A', '甲')), mcq(0), createSectionElement(bi('B', '乙')), mcq(1)],
      { replaceLayout: true },
    );
    const { text, warnings } = zipGradeCsv(answerKeyRows(worksheet));
    expect(lines(text).slice(1, 3)).toEqual(['A,1,A,1', 'A,2,B,1']);
    expect(warnings[0]).toMatch(/1–2 in paper order/);
  });
});

describe('quiz tools', () => {
  it('flattens the stem and statements to one line in the chosen language', () => {
    const question = mcq(1, 'Which\nis true?');
    question.statements = [bi('Demand rises', '需求上升'), bi('Supply falls', '供應下降')];
    const worksheet = withFlow(createWorksheet(), [question], { replaceLayout: true });
    const [en] = quizQuestions(worksheet, 'en');
    expect(en.question).toBe('Which is true? (1) Demand rises (2) Supply falls');
    expect(en.answers).toEqual(['a', 'b', 'c', 'd']);
    expect(en.correct).toBe(2);
    const [both] = quizQuestions(worksheet, 'bilingual');
    expect(both.answers[0]).toBe('a / a中');
  });

  it('warns, without truncating, when Kahoot limits are passed', () => {
    const long = 'x'.repeat(121);
    const worksheet = withFlow(createWorksheet(), [mcq(0, long, ['a', 'y'.repeat(76), 'c', 'd'])], {
      replaceLayout: true,
    });
    const { rows, warnings } = kahootRows(quizQuestions(worksheet, 'en'));
    expect(rows[8][1]).toBe(long);
    expect(warnings).toEqual([
      'Q1: question is 121 characters; Kahoot allows 120.',
      'Q1: option B is 76 characters; Kahoot allows 75.',
    ]);
  });

  it('lays Kahoot out as its template: headers on row 8 from B, data from row 9', () => {
    const worksheet = withFlow(createWorksheet(), [mcq(2), mcq(-1, 'Q', ['a', 'b'])], { replaceLayout: true });
    const { rows, warnings } = kahootRows(quizQuestions(worksheet, 'en'));
    expect(rows.slice(0, 7).every((row) => row.length === 0)).toBe(true);
    expect(rows[7][1]).toMatch(/^Question - max 120/);
    expect(rows[7][7]).toMatch(/^Correct answer/);
    expect(rows[8]).toEqual([1, 'Which?', 'a', 'b', 'c', 'd', 30, 3]);
    expect(rows[9]).toEqual([2, 'Q', 'a', 'b', '', '', 30, '']);
    expect(warnings).toEqual(['Q2: no key set — Kahoot needs a correct answer.']);
  });

  it('leaves out a question with more than four options, and says so', () => {
    const worksheet = withFlow(createWorksheet(), [mcq(0, 'Five', ['a', 'b', 'c', 'd', 'e']), mcq(1)], {
      replaceLayout: true,
    });
    const { text, warnings } = blooketCsv(quizQuestions(worksheet, 'en'));
    expect(lines(text)).toHaveLength(4);
    expect(lines(text)[2]).toBe('1,Which?,a,b,c,d,30,2');
    expect(warnings[0]).toMatch(/^Q1: more than 4 options — left out/);
  });

  it('writes Blooket as its template: an eight-field title row, then the header, no BOM', () => {
    const worksheet = withFlow(createWorksheet(), [mcq(0, 'Price, quantity')], { replaceLayout: true });
    const { text } = blooketCsv(quizQuestions(worksheet, 'zh'));
    expect(text.startsWith('Blooket Import Template,,,,,,,\r\n')).toBe(true);
    expect(lines(text)[1]).toMatch(/^Question #,Question Text,Answer 1,Answer 2,/);
    expect(lines(text)[2]).toBe('1,"Price, quantity中",a中,b中,c中,d中,30,1');
  });

  it('flags a stem table or option figure as text-only', () => {
    const question = mcq(0);
    question.options[1].blocks = [{ kind: 'paragraph', id: newId(), text: bi('fig', '') }];
    const worksheet = withFlow(createWorksheet(), [question], { replaceLayout: true });
    const { warnings } = blooketCsv(quizQuestions(worksheet, 'en'));
    expect(warnings).toEqual(['Q1: a table or figure is left out — Blooket gets the text only.']);
  });
});

describe('buildAppExport', () => {
  it('names each file for its app and reports an empty paper', () => {
    const worksheet = withFlow(createWorksheet(), [createStructuredQuestion()], { replaceLayout: true });
    worksheet.name = 'Unit 3: Demand';
    expect(appFileName(worksheet, 'zipgrade')).toBe('Unit 3- Demand (ZipGrade key).csv');
    expect(appFileName(worksheet, 'kahoot')).toBe('Unit 3- Demand (Kahoot).xlsx');
    expect(buildAppExport(worksheet, 'keyCsv', 'en').empty).toBe(true);
    expect(buildAppExport(worksheet, 'kahoot', 'en').data.kind).toBe('xlsx');
  });
});

describe('xlsx', () => {
  it('names columns past Z', () => {
    expect([0, 25, 26, 27, 701].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  });

  it('writes inline strings and numbers at their cell references, escaped', () => {
    const xml = sheetXml([[], ['', 'a & <b>', 30]]);
    expect(xml).toContain('<row r="2"><c r="B2" t="inlineStr"><is><t xml:space="preserve">a &amp; &lt;b&gt;</t></is></c><c r="C2"><v>30</v></c></row>');
    expect(xml).not.toContain('<row r="1">');
  });

  it('packages a workbook Excel can open', async () => {
    const blob = await buildXlsx([['需求', 1]]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']),
    );
    expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('需求');
  });
});
