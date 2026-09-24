import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml, worksheetPlainText } from '@/export/clipboard';
import { createStructuredQuestion, createSubPart, createWorksheet } from '@/model/factories';
import { createMarkEc, createMarkLevel } from '@/model/markScheme';
import type { MarkPoint, MarkScheme } from '@/model/markSchemeTypes';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi, plain } from '@/model/text';
import type { OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import v1Corpus from '@/test/corpus/v1-published.json';
import { withFlow } from '@/test/fixtures';
import { renderAnswerKey } from './answerKey';
import { trailLabel, type RenderNode, type TextNode } from './ir';
import { MARK_SCHEME_WORDING, renderMarkScheme } from './markScheme';
import { renderWorksheet } from './worksheet';

const TEACHER: OutputMode = { language: 'en', version: 'teacher' };
const STUDENT: OutputMode = { language: 'en', version: 'student' };

let ids = 0;
const point = (en: string, marks?: number, alternatives?: string[]): MarkPoint => ({
  id: `p${ids++}`,
  text: bi(en, `${en}（中）`),
  ...(marks !== undefined ? { marks } : {}),
  ...(alternatives ? { alternatives: alternatives.map((alt) => bi(alt, `${alt}（中）`)) } : {}),
});

/** A scheme using every piece of notation. */
function fullScheme(): MarkScheme {
  return {
    routes: [
      {
        id: 'r1',
        groups: [
          { id: 'g1', points: [point('Price rises', 1, ['cost rises'])] },
          {
            id: 'g2',
            points: [point('Reason A'), point('Reason B'), point('Reason C')],
            take: 2,
            each: 1,
            firstOnly: true,
            max: 2,
          },
        ],
      },
      { id: 'r2', groups: [{ id: 'g3', points: [point('Other approach', 3)] }] },
    ],
    levels: [
      { ...createMarkLevel(), min: 1, max: 3, descriptor: bi('Limited', '有限') },
      { ...createMarkLevel(), min: 4, max: 6, descriptor: bi('Sound', '良好') },
    ],
    ec: createMarkEc(),
  };
}

const lines = (nodes: TextNode[]) =>
  nodes.map((node) => [plain(node.text.en), node.trail ? trailLabel(node.trail, 'en') : '']);

const texts = (nodes: RenderNode[]) => nodes.filter((node): node is TextNode => node.kind === 'text');

describe('renderMarkScheme', () => {
  it('prints HKEAA notation, one paragraph per line, marks in the marks column', () => {
    expect(lines(renderMarkScheme(fullScheme()))).toEqual([
      ['Price rises / cost rises', '(1)'],
      ['Any TWO of the following:', '1@'],
      ['[Mark the FIRST TWO points only.]', ''],
      // Under n@ the lead line states the value; the points print none of their own.
      ['Reason A', ''],
      ['Reason B', ''],
      ['Reason C', ''],
      ['', 'max: 2'],
      ['OR', ''],
      ['Other approach', '(3)'],
      ['Levels of performance', ''],
      ['Level 1: Limited', '(1–3)'],
      ['Level 2: Sound', '(4–6)'],
      ['Effective communication (EC)', 'max: 2'],
      [plain(createMarkEc().descriptors[0].text.en), '(2)'],
      [plain(createMarkEc().descriptors[1].text.en), '(1)'],
      [plain(createMarkEc().descriptors[2].text.en), '(0)'],
    ]);
  });

  it('uses the Marking Scheme style at the given column, and carries no edit target', () => {
    const nodes = renderMarkScheme(fullScheme(), { indent: 720, teacherOnly: true });
    for (const node of nodes) {
      expect(node.style).toBe('Marking Scheme');
      expect(node.indent).toBe(720);
      expect(node.teacherOnly).toBe(true);
      expect(node.edit).toBeUndefined();
      expect(node.marks).toBeUndefined();
    }
  });

  it('writes the Chinese side in Chinese, and "(1)" once in bilingual mode', () => {
    const [first, lead] = renderMarkScheme(fullScheme());
    expect(plain(first.text.zh)).toBe('Price rises（中） / cost rises（中）');
    expect(plain(lead.text.zh)).toBe('以下任何兩項：');
    expect(trailLabel(first.trail!, 'bilingual')).toBe('(1)');
    expect(trailLabel(MARK_SCHEME_WORDING.max(4), 'bilingual')).toBe('max: 4 最高4分');
    expect(trailLabel(MARK_SCHEME_WORDING.max(4), 'zh')).toBe('最高4分');
  });

  it('prints nothing for an empty or absent scheme, and skips wordless points', () => {
    expect(renderMarkScheme(undefined)).toEqual([]);
    const wordless: MarkPoint = { id: 'w', text: bi('', ''), marks: 1 };
    expect(renderMarkScheme({ routes: [{ id: 'r', groups: [{ id: 'g', points: [wordless] }] }] })).toEqual([]);
    const partly: MarkScheme = {
      routes: [{ id: 'r', groups: [{ id: 'g', points: [wordless, point('Kept', 2)] }] }],
    };
    expect(lines(renderMarkScheme(partly))).toEqual([['Kept', '(2)']]);
  });

  it('survives a malformed saved scheme', () => {
    const broken = { routes: [{ id: 'r' }], levels: 'x', ec: { max: 2 } } as unknown as MarkScheme;
    expect(() => renderMarkScheme(broken)).not.toThrow();
  });
});

/** A worksheet with one structured question: (a) leaf, (b) with sub-parts (i), (ii). */
function schemeWorksheet(withScheme: boolean): Worksheet {
  const question = createStructuredQuestion();
  question.blocks = [{ kind: 'paragraph', id: 'stem', text: bi('Stem', '題幹') }];
  const [a] = question.parts;
  a.id = 'a';
  a.blocks = [{ kind: 'paragraph', id: 'pa', text: bi('Explain.', '解釋。') }];
  a.marks = 3;
  a.answer = bi('Plain answer', '答案');
  const b = { ...question.parts[0], id: 'b', answer: undefined, marks: undefined, subParts: [createSubPart(), createSubPart()] };
  b.blocks = [{ kind: 'paragraph', id: 'pb', text: bi('Discuss.', '討論。') }];
  b.subParts[0].blocks = [{ kind: 'paragraph', id: 'pbi', text: bi('Part i', '(i)') }];
  b.subParts[0].marks = 2;
  b.subParts[1].blocks = [{ kind: 'paragraph', id: 'pbii', text: bi('Part ii', '(ii)') }];
  b.subParts[1].marks = 8;
  question.parts = [a, b];
  if (withScheme) {
    a.scheme = fullScheme();
    b.subParts[0].scheme = { routes: [{ id: 'r', groups: [{ id: 'g', points: [point('Sub point', 2)] }] }] };
    b.scheme = { routes: [], ec: createMarkEc() };
  }
  return withFlow(createWorksheet(), [question]);
}

const questionNodes = (worksheet: Worksheet, mode: OutputMode) =>
  renderWorksheet(worksheet, mode).items.flatMap((item) => (item.type === 'question' ? item.question.nodes : []));

describe('a scheme on the paper', () => {
  it('leaves the student paper untouched: identical IR with or without a scheme', () => {
    const withScheme = schemeWorksheet(true);
    const without = structuredClone(withScheme);
    for (const question of without.questions as StructuredQuestion[]) {
      for (const part of question.parts) {
        delete part.scheme;
        for (const sub of part.subParts ?? []) delete sub.scheme;
      }
    }
    expect(questionNodes(withScheme, STUDENT)).toEqual(questionNodes(without, STUDENT));
    // And the scheme really is on the teacher side of that same document.
    expect(questionNodes(withScheme, TEACHER)).not.toEqual(questionNodes(without, TEACHER));
  });

  it('prints in the teacher version after the plain answer, at the answer’s column', () => {
    const nodes = texts(questionNodes(schemeWorksheet(true), TEACHER));
    const answer = nodes.findIndex((node) => plain(node.text.en) === 'Plain answer');
    expect(plain(nodes[answer + 1].text.en)).toBe('Price rises / cost rises');
    expect(nodes[answer + 1].indent).toBe(nodes[answer].indent);
    // The sub-part's scheme sits under (i), before (ii) is asked.
    const sub = nodes.findIndex((node) => plain(node.text.en) === 'Sub point');
    const partTwo = nodes.findIndex((node) => plain(node.text.en) === 'Part ii');
    expect(sub).toBeGreaterThan(-1);
    expect(sub).toBeLessThan(partTwo);
    // The part's own scheme (EC only) closes the group.
    expect(plain(nodes[nodes.length - 1].text.en)).toBe(plain(createMarkEc().descriptors[2].text.en));
  });

  it('keeps the teacher version unchanged for a document with no scheme', () => {
    const plainDoc = schemeWorksheet(false);
    const nodes = texts(questionNodes(plainDoc, TEACHER));
    expect(nodes.some((node) => node.trail)).toBe(false);
  });

  it('exports to .docx with the trail on a right tab, and to the clipboard', async () => {
    const worksheet = schemeWorksheet(true);
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, TEACHER));
    const xml = await zip.file('word/document.xml')!.async('string');
    // The point, its alternative, then the mark on the paragraph's right tab stop.
    expect(xml).toMatch(
      /<w:pStyle w:val="MarkingScheme"\/><w:ind w:left="\d+"\/><w:tabs><w:tab w:val="right" w:pos="\d+"\/><\/w:tabs><\/w:pPr>(?:(?!<\/w:p>).)*>Price rises<\/w:t>(?:(?!<\/w:p>).)*> \/ <\/w:t>(?:(?!<\/w:p>).)*>cost rises<\/w:t><\/w:r><w:r><w:tab\/><\/w:r><w:r>(?:(?!<\/w:r>).)*>\(1\)<\/w:t><\/w:r><\/w:p>/,
    );
    expect(xml).toContain('max: 2');
    expect(xml).not.toContain('data-edit');

    const student = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT));
    const studentXml = await student.file('word/document.xml')!.async('string');
    expect(studentXml).not.toContain('Price rises');

    const html = worksheetClipboardHtml(worksheet, TEACHER);
    expect(html).toContain('<span style="float:right">(1)</span>');
    expect(worksheetPlainText(worksheet, TEACHER)).toContain('Price rises / cost rises (1)');
  });
});

describe('a scheme in the answer key', () => {
  it('prints under its row, after the answer', () => {
    const nodes = texts(renderAnswerKey(schemeWorksheet(true), 'en'));
    const words = nodes.map((node) => plain(node.text.en));
    const answer = words.indexOf('Plain answer');
    expect(words[answer + 1]).toBe('Price rises / cost rises');
    expect(words).toContain('Sub point');
    // The part-level EC closes the key, in a trailing continuation row.
    expect(words[words.length - 1]).toBe(plain(createMarkEc().descriptors[2].text.en));
    for (const node of nodes.filter((entry) => entry.trail)) expect(node.teacherOnly).toBeUndefined();
  });

  it('exports the answer key .docx with the scheme', async () => {
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(schemeWorksheet(true), 'bilingual'));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('以下任何兩項：');
    expect(xml).toContain('max: 2 最高2分');
  });

  it('keeps an answer key with no schemes unchanged', () => {
    const nodes = renderAnswerKey(schemeWorksheet(false), 'en');
    expect(texts(nodes).some((node) => node.trail)).toBe(false);
  });
});

describe('the published-document promise', () => {
  it('opens the frozen v1 corpus unchanged, and a scheme added to it round-trips', () => {
    const worksheet = migrate(structuredClone(v1Corpus));
    expect(worksheet.__unknown).toBeUndefined();
    // Nothing in the corpus carries a scheme, so its teacher version is as it was.
    const teacher = renderWorksheet(worksheet, { language: 'bilingual', version: 'teacher' });
    expect(teacher.items.some((item) => item.type === 'question' && item.question.nodes.some((node) => node.kind === 'text' && node.trail))).toBe(false);

    const structured = worksheet.questions.find(
      (q): q is StructuredQuestion =>
        q.type === 'structured' && q.parts.some((p) => (p.subParts ?? []).length > 0),
    )!;
    const part = structured.parts.find((p) => (p.subParts ?? []).length > 0)!;
    const scheme = fullScheme();
    part.subParts![0].scheme = scheme;
    structured.parts[0].scheme = scheme;

    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    expect(reloaded.__unknown).toBeUndefined();
    const again = reloaded.questions.find((q): q is StructuredQuestion => q.id === structured.id)!;
    expect(again.parts[0].scheme).toEqual(scheme);
    expect(again.parts.find((p) => p.id === part.id)!.subParts![0].scheme).toEqual(scheme);
    // The rest of the document is exactly as the corpus saved it.
    const original = migrate(structuredClone(v1Corpus));
    expect(reloaded.layout).toEqual(original.layout);
    expect(reloaded.flow).toEqual(original.flow);
  });
});
