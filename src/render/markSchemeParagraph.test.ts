import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportAnswerKeyDocxBuffer } from '@/export/docx';
import {
  createMarkEc,
  HKEAA_EC_STANDARD,
  isStandardEc,
  schemeDisplay,
  schemeMax,
  withSchemeDisplay,
} from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi, plain } from '@/model/text';
import type { AnswerKeyLayout, StructuredQuestion, Worksheet } from '@/model/types';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { renderAnswerKey } from './answerKey';
import { trailLabel, type RenderNode, type TableNode, type TextNode } from './ir';
import { renderMarkScheme, schemeParagraphs } from './markScheme';
import { renderWorksheet } from './worksheet';

/**
 * k-0470 (issue #7 point 3): a DRQ marking scheme in HKEAA's paragraph style — the points
 * run together, the total once beside them — and the standard EC table.
 */

const lines = (nodes: TextNode[], side: 'en' | 'zh' = 'en') =>
  nodes.map((node) => [plain(node.text[side]), node.trail ? trailLabel(node.trail, 'en') : '']);

const texts = (nodes: RenderNode[]) => nodes.filter((node): node is TextNode => node.kind === 'text');

/** The fixture's question with every scheme shown as a paragraph. */
function paragraphWorksheet(layout?: AnswerKeyLayout): Worksheet {
  const worksheet = buildMarkSchemeWorksheet();
  const question = worksheet.questions[0] as StructuredQuestion;
  const asParagraph = (scheme: MarkScheme | undefined) => (scheme ? withSchemeDisplay(scheme, 'paragraph') : scheme);
  const parts = question.parts.map((part) => ({
    ...part,
    scheme: asParagraph(part.scheme),
    ...(part.subParts ? { subParts: part.subParts.map((sub) => ({ ...sub, scheme: asParagraph(sub.scheme) })) } : {}),
  }));
  return {
    ...worksheet,
    questions: [{ ...question, parts }],
    ...(layout ? { answerKeyLayout: layout } : {}),
  };
}

const schemes = (worksheet: Worksheet) => {
  const question = worksheet.questions[0] as StructuredQuestion;
  const [a, b] = question.parts;
  return { a: a.scheme!, i: b.subParts![0].scheme!, ii: b.subParts![1].scheme! };
};

describe('the display field', () => {
  it('absent, or a value this build does not know, reads as points', () => {
    const { a } = schemes(buildMarkSchemeWorksheet());
    expect(schemeDisplay(a)).toBe('points');
    expect(schemeDisplay({ ...a, display: 'whatever' as 'paragraph' })).toBe('points');
    expect(schemeDisplay(undefined)).toBe('points');
  });

  it('set back to points stores nothing, so the scheme is as it was', () => {
    const { a } = schemes(buildMarkSchemeWorksheet());
    const paragraph = withSchemeDisplay(a, 'paragraph');
    expect(paragraph.display).toBe('paragraph');
    expect(withSchemeDisplay(paragraph, 'points')).toEqual(a);
    expect('display' in withSchemeDisplay(paragraph, 'points')).toBe(false);
  });

  it('changes no total: the rules still count', () => {
    const before = schemes(buildMarkSchemeWorksheet());
    const after = schemes(paragraphWorksheet());
    expect([schemeMax(after.a), schemeMax(after.i), schemeMax(after.ii)]).toEqual([
      schemeMax(before.a),
      schemeMax(before.i),
      schemeMax(before.ii),
    ]);
  });
});

describe('renderMarkScheme, shown as a paragraph', () => {
  it('runs each route’s points into one paragraph, its total beside it, OR between routes', () => {
    const { a } = schemes(paragraphWorksheet());
    expect(lines(renderMarkScheme(a))).toEqual([
      [
        'Supply decreases / the supply curve shifts upward At the original price there is a shortage The equilibrium price rises',
        '(3)',
      ],
      ['OR', ''],
      ['Diagram: parallel upward shift of S by the tax, new equilibrium at a higher price', '(3)'],
    ]);
  });

  it('joins Chinese sentences without a space', () => {
    const { a } = schemes(paragraphWorksheet());
    expect(plain(renderMarkScheme(a)[0].text.zh)).toBe('供應減少 / 供應曲線向上移在原來價格下出現短缺均衡價格上升');
  });

  it('prints no group rules, and totals them: any TWO @1, max 2 → (2)', () => {
    const { i } = schemes(paragraphWorksheet());
    expect(lines(renderMarkScheme(i))).toEqual([
      [
        'To raise tax revenue To reduce consumption of a harmful good To internalise the external cost of smoking Any other relevant point',
        '(2)',
      ],
    ]);
  });

  it('with levels, the paragraph is indicative content: no total on it; levels and EC print as before', () => {
    const { ii } = schemes(paragraphWorksheet());
    const pointsStyle = renderMarkScheme(schemes(buildMarkSchemeWorksheet()).ii);
    const nodes = renderMarkScheme(ii);
    expect(lines(nodes)[0]).toEqual([
      'Demand for cigarettes is price-inelastic Deadweight loss vs. the external cost corrected',
      '',
    ]);
    // Everything after the points is the same lines as the points style prints.
    expect(lines(nodes).slice(1)).toEqual(lines(pointsStyle).slice(2));
  });

  it('on the page, each point is typed where it sits in the paragraph', () => {
    const { a } = schemes(paragraphWorksheet());
    const at = { questionId: 'q', partId: 'p' };
    const [paragraph] = renderMarkScheme(a, { at });
    const edits = paragraph.segments!.en.filter((segment) => 'edit' in segment);
    expect(edits.map((segment) => ('edit' in segment ? segment.edit.kind : ''))).toEqual([
      'schemePoint',
      'schemeAlternative',
      'schemePoint',
      'schemePoint',
    ]);
    // The derived glue is a space in English, nothing in Chinese.
    expect(paragraph.segments!.en.some((segment) => 'runs' in segment && segment.runs[0].text === ' ')).toBe(true);
    expect(paragraph.segments!.zh.some((segment) => 'runs' in segment && segment.runs[0].text === ' ')).toBe(false);
  });

  it('while typing, an empty point keeps a place in the paragraph for the caret', () => {
    const { a } = schemes(paragraphWorksheet());
    const blank = { id: 'blank', text: bi('', ''), marks: 1 };
    const scheme: MarkScheme = {
      ...a,
      routes: [{ ...a.routes[0], groups: [{ ...a.routes[0].groups[0], points: [...a.routes[0].groups[0].points, blank] }] }],
    };
    const at = { questionId: 'q', partId: 'p' };
    const [typing] = schemeParagraphs(scheme, { at, editing: true });
    const [printed] = schemeParagraphs(scheme, { at });
    const ids = (paragraph: typeof typing) =>
      paragraph.segments!.en.flatMap((segment) =>
        'edit' in segment && segment.edit.kind === 'schemePoint' ? [segment.edit.pointId] : [],
      );
    expect(ids(typing)).toContain('blank');
    expect(ids(printed)).not.toContain('blank');
    expect(plain(typing.text.en)).toBe(plain(printed.text.en));
  });
});

describe('the paper', () => {
  it('the teacher version prints the paragraph, teacher-only; the student version never does', () => {
    const worksheet = paragraphWorksheet();
    const teacher = JSON.stringify(renderWorksheet(worksheet, { language: 'bilingual', version: 'teacher' }));
    const student = JSON.stringify(renderWorksheet(worksheet, { language: 'bilingual', version: 'student' }));
    expect(teacher).toContain('Supply decreases');
    expect(student).not.toContain('Supply decreases');
    expect(student).not.toContain('Support arguments with the source/data');
    const { a } = schemes(worksheet);
    expect(renderMarkScheme(a, { teacherOnly: true }).every((node) => node.teacherOnly)).toBe(true);
  });
});

describe('the answer key layouts, shown as a paragraph', () => {
  it('HKEAA marking scheme: the total sits in the Marks column beside the paragraph', () => {
    const nodes = texts(renderAnswerKey(paragraphWorksheet({ preset: 'hkeaa' }), 'en'));
    const paragraph = nodes.find((node) => plain(node.text.en).startsWith('Supply decreases'))!;
    expect(trailLabel(paragraph.trail!, 'en')).toBe('(3)');
    expect(paragraph.marksColumn).toBeGreaterThan(0);
    expect(nodes.some((node) => plain(node.text.en) === 'Any TWO of the following:')).toBe(false);
  });

  it('Detailed table: a row per route, its total in Marks, OR said in Guidance', () => {
    const table = renderAnswerKey(paragraphWorksheet({ preset: 'detailed' }), 'en').find(
      (node): node is TableNode => node.kind === 'table',
    )!;
    const rows = table.rows.map((cells) => cells.map((cell) => plain(cell.text.en)));
    const first = rows.find((cells) => cells[1].startsWith('Supply decreases'))!;
    expect(first[2]).toBe('3');
    const route = rows.find((cells) => cells[1].startsWith('Diagram:'))!;
    expect(route.slice(2)).toEqual(['3', 'OR: an alternative answer. Mark one route only.']);
    const reasons = rows.find((cells) => cells[1].startsWith('To raise tax revenue'))!;
    expect(reasons.slice(0, 3)).toEqual(['1(b)(i)', reasons[1], '2']);
    expect(rows.some((cells) => cells[3] === 'Any TWO of the following:')).toBe(false);
    expect(rows[rows.length - 1].slice(1, 3)).toEqual(['Total', '13']);
  });

  it('Suggested answers: the first route as one paragraph, no bullet and no marks', () => {
    const nodes = renderAnswerKey(paragraphWorksheet({ preset: 'suggested' }), 'en');
    const paragraph = texts(nodes).find((node) => plain(node.text.en).startsWith('Supply decreases'))!;
    expect(paragraph.trail).toBeUndefined();
    expect(nodes.some((node) => node.kind === 'columns')).toBe(false);
    expect(JSON.stringify(nodes)).not.toContain('Diagram: parallel upward shift');
  });

  it('the .docx carries the paragraph and its total', async () => {
    const buffer = await exportAnswerKeyDocxBuffer(paragraphWorksheet({ preset: 'hkeaa' }), 'en');
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    const words = xml.replace(/<[^>]+>/g, '');
    expect(words).toContain('Supply decreases / the supply curve shifts upward At the original price there is a shortage');
    expect(words).not.toContain('Any TWO of the following:');
  });
});

describe('the standard EC table (HKEAA)', () => {
  it('a new EC block is HKEAA’s: max 2, rows 2 / 1 / 0, four statements each, in both languages', () => {
    const ec = createMarkEc();
    expect(ec.max).toBe(2);
    expect(ec.descriptors.map((row) => row.marks)).toEqual([2, 1, 0]);
    for (const row of ec.descriptors) {
      expect(plain(row.text.en).split('\n')).toHaveLength(4);
      expect(plain(row.text.zh).split('\n')).toHaveLength(4);
    }
    expect(plain(ec.descriptors[0].text.en)).toContain(
      'Support arguments with the source/data and appropriate economic theories.',
    );
    expect(plain(ec.descriptors[2].text.zh)).toContain('答案組織鬆散欠連貫。');
    expect(ec.descriptors.map((row) => row.text)).toEqual(HKEAA_EC_STANDARD.map((row) => row.text));
  });

  it('every block gets its own ids, so two questions never share a row', () => {
    const [one, two] = [createMarkEc(), createMarkEc()];
    expect(one.descriptors.map((row) => row.id)).not.toEqual(two.descriptors.map((row) => row.id));
  });

  it('tells the standard from an edited or older table', () => {
    const ec = createMarkEc();
    expect(isStandardEc(ec)).toBe(true);
    expect(isStandardEc(undefined)).toBe(false);
    expect(isStandardEc({ ...ec, max: 3 })).toBe(false);
    expect(isStandardEc({ ...ec, descriptors: ec.descriptors.slice(0, 2) })).toBe(false);
    expect(
      isStandardEc({ ...ec, descriptors: [{ ...ec.descriptors[0], text: bi('My own words', '我的字') }, ...ec.descriptors.slice(1)] }),
    ).toBe(false);
    // The rows every build before k-0470 created.
    expect(
      isStandardEc({
        max: 2,
        descriptors: [
          { id: 'a', marks: 2, text: bi('Clear and logical presentation; economic terms used accurately.', '表達清晰、有條理；準確運用經濟學術語。') },
          { id: 'b', marks: 1, text: bi('Some lapses.', '有欠妥善。') },
          { id: 'c', marks: 0, text: bi('Disorganised, or largely irrelevant.', '組織混亂或大部分內容不相關。') },
        ],
      }),
    ).toBe(false);
    // A malformed stored table reads as not standard, and does not throw.
    expect(isStandardEc({ max: 2, descriptors: undefined } as never)).toBe(false);
  });

  it('the answer key prints it as HKEAA’s ruled Marks | Performance table, at the answer’s indent', () => {
    for (const preset of ['classic', 'hkeaa'] as const) {
      const nodes = renderAnswerKey(paragraphWorksheet({ preset }), 'zh');
      const heading = nodes.findIndex((node) => node.kind === 'text' && plain(node.text.zh) === '有效傳意評分（EC：最高2分）');
      expect(heading, preset).toBeGreaterThan(-1);
      const table = nodes[heading + 1] as TableNode;
      expect(table.kind).toBe('table');
      expect(table.headerRows).toBe(1);
      expect(table.rows.map((row) => plain(row[0].text.zh))).toEqual(['分數', '2', '1', '0']);
      expect(plain(table.rows[0][1].text.zh)).toBe('表現');
      expect(table.indent).toBeGreaterThan(0);
      // HKEAA's Marks column stays clear: the table ends before it.
      if (preset === 'hkeaa') expect(table.indent + table.width).toBeLessThan(0.95);
      else expect(table.indent + table.width).toBeCloseTo(1);
      expect(plain((nodes[heading + 2] as TextNode).text.zh)).toBe('內容最高6分。');
    }
  });

  it('prints a mark beside each row and every statement on its own line', () => {
    const nodes = renderMarkScheme({ routes: [], ec: createMarkEc() });
    expect(lines(nodes).map(([, trail]) => trail)).toEqual(['max: 2', '(2)', '(1)', '(0)']);
    expect(plain(nodes[1].text.en).split('\n')[0]).toBe(
      '• Support arguments with the source/data and appropriate economic theories.',
    );
  });
});
