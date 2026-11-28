import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportAnswerKeyDocxBuffer } from '@/export/docx';
import { applyEditTarget, editTargetKey, textOfTarget } from '@/model/edits';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import {
  contentMax,
  groupHeading,
  isSchemeEmpty,
  routesDisagree,
  schemeMax,
  schemeTextAt,
  statedContentMax,
  withContentMax,
  withSchemeText,
} from '@/model/markScheme';
import {
  createSchemeFromPattern,
  patternPlan,
  SCHEME_HEADINGS,
  SCHEME_PATTERN_IDS,
} from '@/model/markSchemePatterns';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi, emptyBiText, plain } from '@/model/text';
import type { AnswerKeyLayout, BiText, StructuredQuestion, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { renderAnswerKey } from './answerKey';
import { trailLabel, type RenderNode, type TableNode, type TextNode } from './ir';
import { MARK_SCHEME_WORDING, renderMarkScheme as renderSchemeNodes, schemePointGroups } from './markScheme';
import { renderWorksheet } from './worksheet';

/** These schemes hold no figures (k-0595), so every node is a line. */
const renderMarkScheme = (...args: Parameters<typeof renderSchemeNodes>) => renderSchemeNodes(...args) as TextNode[];

/**
 * k-0475: a DRQ's marking scheme as HKEAA's 2022–2026 Paper 2 schemes mark it — group
 * headings ("Possible reasons:", "Verbal elaboration:"), a stated content mark over
 * indicative points, and the patterns a part's scheme starts from. Made-up content only.
 */

const texts = (nodes: RenderNode[]) => nodes.filter((node): node is TextNode => node.kind === 'text');
const lines = (nodes: TextNode[], side: 'en' | 'zh' = 'en') =>
  nodes.map((node) => [plain(node.text[side]), node.trail ? trailLabel(node.trail, side) : '']);

/** Fill a pattern's empty points with words, in order. */
function typed(scheme: MarkScheme, words: BiText[]): MarkScheme {
  let next = 0;
  return {
    ...scheme,
    routes: scheme.routes.map((route) => ({
      ...route,
      groups: route.groups.map((group) => ({
        ...group,
        points: group.points.map((point) => ({ ...point, text: words[next++] ?? point.text })),
      })),
    })),
  };
}

const reasons = () =>
  typed(createSchemeFromPattern('reasons', 4), [
    bi('Products are not homogeneous.', '產品並非同質。'),
    bi('Information is not perfect.', '資訊並不完全。'),
    bi('Entry is restricted.', '進入市場受限制。'),
  ]);

const essay = () =>
  typed(createSchemeFromPattern('essay', 14), [
    bi('Lower fares raise ridership.', '降低車費令使用人數上升。'),
    bi('A car tax shifts drivers to bikes.', '私家車稅令司機改用單車。'),
    bi('Inelastic demand for car travel.', '私家車出行需求缺乏彈性。'),
    bi('Bad weather.', '惡劣天氣。'),
  ]);

/** One structured question whose parts carry `schemes`, its key in `layout`. */
function drq(schemes: MarkScheme[], marks: number[], layout?: AnswerKeyLayout): Worksheet {
  const question = createStructuredQuestion();
  question.parts = schemes.map((scheme, index) => ({
    ...createStructuredQuestion().parts[0],
    id: `part-${index}`,
    marks: marks[index],
    scheme,
  }));
  return { ...withFlow(createWorksheet(), [question]), ...(layout ? { answerKeyLayout: layout } : {}) };
}

describe('patterns: a part’s scheme in one click, sized to its marks', () => {
  it.each([2, 4, 6, 7, 12, 14])('every pattern awards the part’s %i marks', (marks) => {
    for (const id of SCHEME_PATTERN_IDS) {
      if (id === 'reasons' && marks % 2 === 1) continue;
      expect(schemeMax(createSchemeFromPattern(id, marks)), `${id} at ${marks}`).toBe(marks);
    }
  });

  it('Any N reasons is HKEAA’s 2@, first N only, max, with one reason spare', () => {
    const scheme = createSchemeFromPattern('reasons', 4);
    const [group] = scheme.routes[0].groups;
    expect(group).toMatchObject({ each: 2, take: 2, firstOnly: true, max: 4, heading: SCHEME_HEADINGS.reasons });
    expect(group.points).toHaveLength(3);
  });

  it('Explain + diagram: a verbal paragraph and a mark per thing shown in the figure', () => {
    const [verbal, diagram] = createSchemeFromPattern('explainDiagram', 7).routes[0].groups;
    expect(verbal.heading).toEqual(SCHEME_HEADINGS.verbal);
    expect(verbal.points.map((point) => point.marks)).toEqual([3]);
    expect(diagram.heading).toEqual(SCHEME_HEADINGS.diagram);
    expect(diagram.points.map((point) => point.marks)).toEqual([1, 1, 1, 1]);
  });

  it('Essay + EC: the standard EC table, content max 12, indicative points with no marks', () => {
    const scheme = createSchemeFromPattern('essay', 14);
    expect(scheme.ec?.max).toBe(2);
    expect(scheme.contentMax).toBe(12);
    expect(scheme.routes[0].groups.map((group) => group.heading)).toEqual([SCHEME_HEADINGS.achieve, SCHEME_HEADINGS.limit]);
    expect(scheme.routes[0].groups.flatMap((group) => group.points).every((point) => point.marks === undefined)).toBe(true);
  });

  it('a part too small for EC gets none; no marks yet falls back to a usual size', () => {
    expect(createSchemeFromPattern('essay', 2).ec).toBeUndefined();
    expect(patternPlan('essay', undefined)).toMatchObject({ total: 14, ec: 2, content: 12 });
    expect(schemeMax(createSchemeFromPattern('paragraph', undefined))).toBe(3);
  });

  it('every id is fresh, so a pattern used twice never shares an edit target', () => {
    const ids = (scheme: MarkScheme) => [
      ...scheme.routes.map((route) => route.id),
      ...scheme.routes.flatMap((route) => route.groups.flatMap((group) => [group.id, ...group.points.map((point) => point.id)])),
    ];
    const first = ids(createSchemeFromPattern('essay', 14));
    const second = ids(createSchemeFromPattern('essay', 14));
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });
});

describe('a stated content mark', () => {
  it('is the content total, whatever the points add up to', () => {
    const scheme = essay();
    expect(contentMax(scheme)).toBe(12);
    expect(schemeMax(scheme)).toBe(14);
    expect(routesDisagree({ ...scheme, routes: [...scheme.routes, reasons().routes[0]] })).toBe(false);
  });

  it('a value this build cannot use reads as absent: the points derive it', () => {
    const scheme = reasons();
    expect(statedContentMax({ ...scheme, contentMax: 'twelve' as unknown as number })).toBeUndefined();
    expect(contentMax({ ...scheme, contentMax: -1 })).toBe(4);
  });

  it('set back to nothing, stores nothing', () => {
    expect('contentMax' in withContentMax(essay(), undefined)).toBe(false);
    expect(withContentMax(reasons(), 6).contentMax).toBe(6);
  });
});

describe('group headings', () => {
  it('an empty or malformed heading prints nothing and makes no scheme', () => {
    const group = { id: 'g', points: [] };
    expect(groupHeading({ ...group, heading: emptyBiText() })).toBeUndefined();
    expect(groupHeading({ ...group, heading: 'x' as unknown as BiText })).toBeUndefined();
    const onlyHeading: MarkScheme = { routes: [{ id: 'r', groups: [{ ...group, heading: bi('Possible reasons:', '') }] }] };
    expect(isSchemeEmpty(onlyHeading)).toBe(false);
  });

  it('is a text slot: read and written by group id', () => {
    const scheme = reasons();
    const id = scheme.routes[0].groups[0].id;
    expect(schemeTextAt(scheme, { heading: id })).toEqual(SCHEME_HEADINGS.reasons);
    const next = withSchemeText(scheme, { heading: id }, bi('Possible components:', '可能組成部分：'));
    expect(plain(next.routes[0].groups[0].heading!.zh)).toBe('可能組成部分：');
    expect(withSchemeText(scheme, { heading: 'gone' }, bi('x', 'x'))).toBe(scheme);
  });

  it('is typed on the page: the edit target writes it back', () => {
    const worksheet = drq([reasons()], [4]);
    const question = worksheet.questions[0] as StructuredQuestion;
    const group = question.parts[0].scheme!.routes[0].groups[0];
    const target = { kind: 'schemeHeading' as const, questionId: question.id, partId: 'part-0', groupId: group.id };
    expect(editTargetKey(target)).toBe(`schemeHeading:${group.id}`);
    expect(textOfTarget(worksheet, target)).toEqual(SCHEME_HEADINGS.reasons);
    const next = applyEditTarget(worksheet, target, bi('Possible reason:', '可能理由：'));
    expect(plain(((next.questions[0] as StructuredQuestion).parts[0].scheme!.routes[0].groups[0].heading!).en)).toBe(
      'Possible reason:',
    );
  });
});

describe('printing, as HKEAA lays a DRQ out', () => {
  it('a heading prints underlined above its group’s rule lines, typed where it prints', () => {
    const at = { questionId: 'q', partId: 'p' };
    const scheme = reasons();
    const nodes = renderMarkScheme(scheme, { at });
    expect(lines(nodes)).toEqual([
      ['Possible reasons:', ''],
      ['Any TWO of the following:', '2@'],
      ['[Mark the FIRST TWO points only.]', ''],
      ['Products are not homogeneous.', ''],
      ['Information is not perfect.', ''],
      ['Entry is restricted.', ''],
      ['', 'max: 4'],
    ]);
    expect(nodes[0].format?.underline).toBe(true);
    expect(nodes[0].edit).toEqual({ kind: 'schemeHeading', ...at, groupId: scheme.routes[0].groups[0].id });
  });

  it('in Chinese, with HKEAA’s wording: 只批閱首兩項, 最高：4', () => {
    const nodes = renderMarkScheme(reasons());
    expect(lines(nodes, 'zh')).toEqual([
      ['可能理由：', ''],
      ['以下任何兩項：', '2@'],
      ['［只批閱首兩項。］', ''],
      ['產品並非同質。', ''],
      ['資訊並不完全。', ''],
      ['進入市場受限制。', ''],
      ['', '最高：4'],
    ]);
    expect(plain(MARK_SCHEME_WORDING.firstOnly(1).zh)).toBe('［只批閱首項。］');
  });

  it('an essay: the content mark heads the indicative points, which carry no marks', () => {
    const nodes = renderMarkScheme(essay(), { omitEc: false });
    expect(lines(nodes).slice(0, 4)).toEqual([
      ['The maximum mark for content is 12 marks.', ''],
      ['How the objective may be achieved:', ''],
      ['Lower fares raise ridership.', ''],
      ['A car tax shifts drivers to bikes.', ''],
    ]);
  });

  it('the answer key (HKEAA): EC heading, Marks | Performance table, content max once, then the headings', () => {
    const nodes = renderAnswerKey(drq([essay()], [14], { preset: 'hkeaa' }), 'en');
    const words = nodes.map((node) => (node.kind === 'text' ? plain(node.text.en) : node.kind === 'table' ? '[table]' : ''));
    const start = words.indexOf('Marks for effective communication (EC: max 2 marks)');
    expect(start).toBeGreaterThan(-1);
    expect(words.slice(start, start + 4)).toEqual([
      'Marks for effective communication (EC: max 2 marks)',
      '[table]',
      'The maximum mark for content is 12 marks.',
      'How the objective may be achieved:',
    ]);
    expect(words.filter((word) => word.startsWith('The maximum mark for content'))).toHaveLength(1);
  });

  it('the paper’s teacher version prints the headings; the student version nothing', () => {
    const worksheet = drq([reasons()], [4]);
    const teacher = JSON.stringify(renderWorksheet(worksheet, { language: 'en', version: 'teacher' }));
    const student = JSON.stringify(renderWorksheet(worksheet, { language: 'en', version: 'student' }));
    expect(teacher).toContain('Possible reasons:');
    expect(student).not.toContain('Possible reasons:');
  });

  it('Detailed: the heading has its own underlined row before the points', () => {
    const table = renderAnswerKey(drq([reasons()], [4], { preset: 'detailed' }), 'en').find(
      (node): node is TableNode => node.kind === 'table' && JSON.stringify(node).includes('Possible reasons:'),
    )!;
    const row = table.rows.find((cells) => cells.some((cell) => plain(cell.text.en) === 'Possible reasons:'))!;
    expect(row.find((cell) => plain(cell.text.en) === 'Possible reasons:')!.format?.underline).toBe(true);
  });

  it('Suggested answers: the heading, underlined and unbulleted, over its bullets', () => {
    const nodes = texts(renderAnswerKey(drq([reasons()], [4], { preset: 'suggested' }), 'en'));
    const heading = nodes.find((node) => plain(node.text.en) === 'Possible reasons:');
    expect(heading?.format?.underline).toBe(true);
  });

  it('schemePointGroups keeps a group that has only a heading', () => {
    const scheme: MarkScheme = {
      routes: [{ id: 'r', groups: [{ id: 'g', heading: bi('Indicate in the figure:', ''), points: [{ id: 'p', text: emptyBiText(), marks: 1 }] }] }],
    };
    expect(schemePointGroups(scheme)[0][0].heading).toEqual(bi('Indicate in the figure:', ''));
  });

  it('the .docx carries the heading, underlined, and the content mark', async () => {
    const worksheet = drq([reasons(), essay()], [4, 14], { preset: 'hkeaa' });
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, 'en'));
    const xml = await zip.file('word/document.xml')!.async('string');
    const heading = xml.split('<w:p>').concat(xml.split('<w:p ')).find((p) => p.includes('Possible reasons:'))!;
    expect(heading).toContain('<w:u ');
    expect(xml).toContain('The maximum mark for content is 12 marks.');
    const zh = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, 'zh'));
    expect(await zh.file('word/document.xml')!.async('string')).toContain('內容最高12分。');
  });
});
