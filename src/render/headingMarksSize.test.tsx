import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeView } from '@/components/preview/Preview';
import { clipboardNodeHtml } from '@/export/clipboard';
import { exportDocxBuffer } from '@/export/docx';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { createPartHeaderElement, createSectionElement } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { applyRunFormat, bi } from '@/model/text';
import type { BiText, LayoutElement, OutputMode, TextFormat, Worksheet } from '@/model/types';
import type { TextNode } from './ir';
import { renderWorksheet } from './worksheet';

/**
 * The derived "(2 marks)" / 「（2分）」 after a section heading or part header takes the
 * label's own size and look (u-d4n6): before, a heading resized by selecting its text
 * printed its marks at the style's 14pt (Section Heading) or the QAB's 10pt, on the page,
 * in the .docx and on the clipboard alike — the suffix was a bare run.
 */

const EN: OutputMode = { language: 'en', version: 'student' };
const ZH: OutputMode = { language: 'zh', version: 'student' };

/** A heading element, then two MCQs (1 mark each), so the derived total is 2. */
function paper(heading: LayoutElement): Worksheet {
  const questions = [createMcqQuestion(), createMcqQuestion()];
  return {
    ...createWorksheet(),
    layout: [heading],
    questions,
    flow: [{ type: 'layout', id: heading.id }, ...questions.map((q) => ({ type: 'question' as const, id: q.id }))],
  };
}

function section(text: BiText, format?: TextFormat): LayoutElement {
  return { ...createSectionElement(text), showMarks: true, ...(format ? { format } : {}) };
}

function partHeader(text: BiText, format?: TextFormat): LayoutElement {
  return { ...createPartHeaderElement(text), ...(format ? { format } : {}) };
}

/** Both sides of a heading with the whole text set to `size` (select all → size). */
function sizedRuns(en: string, zh: string, size: number): BiText {
  return {
    en: applyRunFormat([{ text: en }], 0, en.length, { fontSize: size }),
    zh: applyRunFormat([{ text: zh }], 0, zh.length, { fontSize: size }),
  };
}

function headingNode(worksheet: Worksheet, mode: OutputMode): TextNode {
  for (const item of renderWorksheet(worksheet, mode).items) {
    if (item.type !== 'layout') continue;
    const node = item.layout.nodes.find((entry) => entry.kind === 'text' && entry.style === 'Section Heading');
    if (node) return node as TextNode;
  }
  throw new Error('no heading node');
}

const suffixOf = (mode: OutputMode) => (mode.language === 'zh' ? '（2分）' : ' (2 marks)');

function suffixRun(worksheet: Worksheet, mode: OutputMode) {
  const runs = headingNode(worksheet, mode).text[mode.language === 'zh' ? 'zh' : 'en'];
  const last = runs[runs.length - 1];
  expect(last.text).toBe(suffixOf(mode));
  return last;
}

/** The `<w:rPr>` of the .docx run that prints the suffix. */
async function docxSuffixProps(worksheet: Worksheet, mode: OutputMode): Promise<string> {
  const buffer = await exportDocxBuffer(worksheet, mode, new Map());
  const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
  const runs = xml.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [];
  const run = runs.find((entry) => entry.includes(suffixOf(mode).trim()));
  if (!run) throw new Error('suffix run not found in document.xml');
  return run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
}

/** The inline style of the page's (or clipboard's) element that holds the suffix text. */
function htmlSuffixStyle(html: string, mode: OutputMode): string {
  const text = suffixOf(mode).trim().replace(/[()]/g, (c) => `\\${c}`);
  const match = html.match(new RegExp(`<span[^>]*style="([^"]*)"[^>]*>\\s*${text}`));
  return match?.[1] ?? '';
}

describe.each([
  ['English', EN],
  ['Chinese', ZH],
] as const)('a heading’s derived marks follow its size — %s', (_name, mode) => {
  const side = mode.language === 'zh' ? 'zh' : 'en';

  it('run-level size (the text selected and resized) reaches the suffix', async () => {
    const worksheet = paper(section(sizedRuns('Section A', '甲部', 20)));
    expect(suffixRun(worksheet, mode).fontSize).toBe(20);
    expect(await docxSuffixProps(worksheet, mode)).toContain('<w:sz w:val="40"/>');
    const node = headingNode(worksheet, mode);
    expect(htmlSuffixStyle(renderToStaticMarkup(<NodeView node={node} language={mode.language} />), mode)).toContain(
      'font-size:20pt',
    );
    expect(htmlSuffixStyle(clipboardNodeHtml(node, mode.language, ''), mode)).toContain('font-size:20pt');
  });

  it('mixed runs: the suffix takes the last run’s size and look', async () => {
    const text: BiText = {
      en: [{ text: 'Section ', fontSize: 18 }, { text: 'A', fontSize: 12, bold: true, italic: true }],
      zh: [{ text: '甲', fontSize: 18 }, { text: '部', fontSize: 12, bold: true, italic: true }],
    };
    const worksheet = paper(section(text));
    const run = suffixRun(worksheet, mode);
    expect(run).toMatchObject({ fontSize: 12, bold: true, italic: true });
    const props = await docxSuffixProps(worksheet, mode);
    expect(props).toContain('<w:sz w:val="24"/>');
    expect(props).toContain('<w:i/>');
  });

  it('skips a trailing blank run, and leaves sub/superscript and fraction behind', () => {
    const text: BiText = {
      en: [{ text: 'Section A', fontSize: 16, vertAlign: 'subscript' }, { text: ' ' }],
      zh: [{ text: '甲部', fontSize: 16, vertAlign: 'subscript' }, { text: ' ' }],
    };
    const run = suffixRun(paper(section(text)), mode);
    expect(run.fontSize).toBe(16);
    expect(run.vertAlign).toBeUndefined();
    expect(run.fraction).toBeUndefined();
  });

  it('paragraph-level size (the whole heading resized) prints the suffix at that size', async () => {
    const worksheet = paper(section(bi('Section A', '甲部'), { fontSize: 20 }));
    const node = headingNode(worksheet, mode);
    // The suffix stays a bare run; the element's format sizes the whole paragraph.
    expect(suffixRun(worksheet, mode)).toEqual({ text: suffixOf(mode) });
    expect(node.format?.fontSize).toBe(20);
    expect(await docxSuffixProps(worksheet, mode)).toContain('<w:sz w:val="40"/>');
  });

  it('an untouched heading’s suffix stays a bare run (unchanged output)', () => {
    expect(suffixRun(paper(section(bi('Section A', '甲部'))), mode)).toEqual({ text: suffixOf(mode) });
  });

  it('the page edits the authored words only: the total sits beside the field, never in it', () => {
    const authored = sizedRuns('Section A', '甲部', 20);
    for (const element of [section(authored), partHeader(authored)]) {
      const node = headingNode(paper(element), mode);
      const pieces = node.segments![side];
      expect(pieces).toHaveLength(2);
      expect(pieces[0]).toEqual({ edit: { kind: 'layoutText', elementId: element.id }, value: authored });
      expect(pieces[1]).toEqual({ runs: [node.text[side][node.text[side].length - 1]] });
      // Joined, the pieces are the printed line.
      expect([...authored[side], ...('runs' in pieces[1] ? pieces[1].runs : [])]).toEqual(node.text[side]);
    }
    // A heading without marks keeps the plain single field.
    const plainSection = createSectionElement(bi('Section A', '甲部'));
    expect(headingNode(paper(plainSection), mode).segments).toBeUndefined();
  });

  it('a part header’s derived marks follow its run size too', async () => {
    const worksheet = paper(partHeader(sizedRuns('Part A', '甲部', 9)));
    expect(suffixRun(worksheet, mode).fontSize).toBe(9);
    expect(await docxSuffixProps(worksheet, mode)).toContain('<w:sz w:val="18"/>');
  });

  it('the QAB’s 10pt section heading, resized by its text, takes the marks along', async () => {
    const worksheet = createWorksheetFrom({ documentType: 'lqMock' });
    const heading = worksheet.layout.find((entry) => entry.kind === 'section' && entry.showMarks);
    if (!heading || heading.kind !== 'section') throw new Error('QAB has no marked section');
    const length = heading.text[side].reduce((sum, run) => sum + run.text.length, 0);
    // Untouched: the element's 10pt bold sizes the bare suffix, as before.
    const before = headingNode(worksheet, mode).text[side];
    expect(Object.keys(before[before.length - 1])).toEqual(['text']);
    heading.text = { ...heading.text, [side]: applyRunFormat(heading.text[side], 0, length, { fontSize: 13 }) };
    const after = headingNode(worksheet, mode).text[side];
    expect(after[after.length - 1].fontSize).toBe(13);
  });
});
