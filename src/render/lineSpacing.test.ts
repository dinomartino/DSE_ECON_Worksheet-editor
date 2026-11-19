import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { exactLineFor, FIXED_LINE_TWIPS } from '@/export/docx/styles';
import { questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createTableBlock, createWorksheet, newId } from '@/model/factories';
import { LINE_SPACINGS, lineSpacingOf, withLineSpacing } from '@/model/lineSpacing';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { LayoutElement, McqQuestion, OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { withSpacedLines, type NodeStyle, type RenderNode, type TextNode } from '@/render/ir';
import { singleLineTwips, spacedLineTwips } from '@/render/lineBox';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';

/**
 * Document setup → Line spacing (`Worksheet.lineSpacing`, k-0468; GitHub issue #7 point 4,
 * "行距是否可以調整？"): Single (the default, stored as absence), 1.15, 1.5 and Double. Every
 * line of the questions and the elements between them is that many times its single box,
 * stamped on the IR so the page, the .docx and Copy for Word state the same box. Tables,
 * answer lines, gaps, the cover, masthead and title keep theirs.
 */

const TEACHER: OutputMode = { language: 'bilingual', version: 'teacher' };

const LONG =
  'The government imposes a price ceiling below the equilibrium price, so the quantity ' +
  'demanded exceeds the quantity supplied and a shortage results in the market.';

function paper(): Worksheet {
  const stacked: McqQuestion = {
    ...createMcqQuestion(),
    blocks: [createParagraphBlock(bi(LONG, '政府把價格上限定於均衡價格以下。'))],
    options: ['A', 'B', 'C', 'D'].map((letter, index) => ({ id: `opt-${index}`, text: bi(`${LONG} (${letter})`, '丙') })),
  };
  const inline: McqQuestion = {
    ...createMcqQuestion(),
    blocks: [createParagraphBlock(bi('Short options follow:', '短選項：'))],
    optionLayout: 'inline',
    options: ['1', '2', '3', '4'].map((value, index) => ({ id: `in-${index}`, text: bi(value, '') })),
  };
  const table = createTableBlock(2, 2);
  table.rows[0].cells[0].text = bi(LONG, '表');
  const structured: StructuredQuestion = {
    ...createStructuredQuestion(),
    blocks: [createParagraphBlock(bi(LONG, '考慮一個市場。')), table],
    parts: [
      {
        id: newId(),
        blocks: [createParagraphBlock(bi(LONG, '部分'))],
        marks: 4,
        answer: bi('Price is held below equilibrium.\nA shortage results.', '價格低於均衡。'),
        scheme: {
          routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('Quantity demanded rises', '需求量上升'), marks: 1 }] }] }],
        },
        answerSpace: 3,
      },
    ],
  };
  const heading: LayoutElement = { kind: 'heading', id: 'heading', text: bi('Section A', '甲部') };
  const note: LayoutElement = { kind: 'text', id: 'note', text: bi(LONG, '附註') };
  const worksheet = withFlow(createWorksheet(), [heading, stacked, inline, note, structured], { replaceLayout: true });
  worksheet.title = bi('Spaced paper', '行距');
  return worksheet;
}

function flowNodes(worksheet: Worksheet, mode: OutputMode = TEACHER): RenderNode[] {
  return renderWorksheet(worksheet, mode).items.flatMap((item) =>
    item.type === 'question' ? item.question.nodes : item.layout.nodes,
  );
}

async function documentXml(worksheet: Worksheet, mode: OutputMode = TEACHER): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
  return zip.file('word/document.xml')!.async('string');
}

/** Every paragraph's `w:pPr` in one style, in document order. */
function paragraphProps(xml: string, styleId: string): string[] {
  return [...xml.matchAll(/<w:pPr>(?:(?!<\/w:pPr>).)*<\/w:pPr>/g)]
    .map((match) => match[0])
    .filter((props) => props.includes(`<w:pStyle w:val="${styleId}"/>`));
}

describe('Line spacing: the model', () => {
  it('offers Word’s four, Single first', () => {
    expect([...LINE_SPACINGS]).toEqual([1, 1.15, 1.5, 2]);
  });

  it('stores only a spacing above single, and Single leaves no field behind', () => {
    const worksheet = paper();
    expect(withLineSpacing(worksheet, 1)).toBe(worksheet);
    const spaced = withLineSpacing(worksheet, 1.5);
    expect(spaced.lineSpacing).toBe(1.5);
    expect(withLineSpacing(spaced, 1.5)).toBe(spaced);
    expect('lineSpacing' in withLineSpacing(spaced, 1)).toBe(false);
  });

  it('survives save and reload', () => {
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(withLineSpacing(paper(), 2)))));
    expect(reloaded.lineSpacing).toBe(2);
    expect(reloaded.__unknown).toBeUndefined();
  });

  it('reads anything it cannot print as single', () => {
    for (const value of [undefined, 1, 0.5, 0, -2, 3.5, Number.NaN, Number.POSITIVE_INFINITY, '1.5', null]) {
      expect(lineSpacingOf({ lineSpacing: value as unknown as number }), String(value)).toBe(1);
    }
    expect(lineSpacingOf({ lineSpacing: 1.15 })).toBe(1.15);
    expect(lineSpacingOf({ lineSpacing: 3 })).toBe(3);
  });
});

describe('Line spacing: the line box', () => {
  it('is the exporter’s exact line at single, for every style and size', () => {
    const styles: NodeStyle[] = ['Worksheet Title', 'Section Heading', 'Question Stem', 'MCQ Option', 'Sub-question', 'Answer', 'Marking Scheme', 'Table Caption', 'Body'];
    for (const style of styles) expect(singleLineTwips(style), style).toBe(
      style === 'Worksheet Title' ? exactLineFor(16) : style === 'Section Heading' ? exactLineFor(14) : FIXED_LINE_TWIPS,
    );
    for (const size of [8, 10, 11, 12, 14, 20, 28]) expect(singleLineTwips('Body', size), String(size)).toBe(exactLineFor(size));
  });

  it('multiplies it, in whole twips', () => {
    expect(spacedLineTwips('Body', undefined, 1.15)).toBe(276);
    expect(spacedLineTwips('Body', undefined, 1.5)).toBe(360);
    expect(spacedLineTwips('Body', undefined, 2)).toBe(480);
    expect(spacedLineTwips('Worksheet Title', undefined, 2)).toBe(exactLineFor(16) * 2);
    expect(spacedLineTwips('Body', 28, 1.5)).toBe(Math.round(exactLineFor(28) * 1.5));
  });
});

describe('Line spacing: the IR', () => {
  it('changes nothing at single: the same nodes, untouched', () => {
    const worksheet = paper();
    expect(JSON.stringify(flowNodes(worksheet))).not.toContain('"lineSpacing"');
    expect(flowNodes(withLineSpacing(worksheet, 1))).toEqual(flowNodes(worksheet));
    const nodes = flowNodes(worksheet);
    expect(withSpacedLines(nodes, 1)).toBe(nodes);
  });

  it('spaces every line of text in the flow, answers and marking points included', () => {
    const spaced = flowNodes(withLineSpacing(paper(), 1.5));
    const text = spaced.filter((node): node is TextNode => node.kind === 'text');
    expect(text.length).toBeGreaterThan(10);
    for (const node of text) expect(node.lineSpacing, node.style).toBe(1.5);
    for (const style of ['Section Heading', 'Question Stem', 'MCQ Option', 'Sub-question', 'Marking Scheme', 'Body'] as NodeStyle[]) {
      expect(text.some((node) => node.style === style), style).toBe(true);
    }
    const row = spaced.find((node) => node.kind === 'columns');
    expect(row && row.kind === 'columns' && row.lineSpacing).toBe(1.5);
  });

  it('is the only change, and leaves tables, answer lines and gaps alone', () => {
    const worksheet = paper();
    const plain = flowNodes(worksheet);
    const spaced = flowNodes(withLineSpacing(worksheet, 2));
    expect(spaced).toHaveLength(plain.length);
    spaced.forEach((node, index) => {
      if (node.kind === 'text' || node.kind === 'columns') {
        expect({ ...node, lineSpacing: undefined }).toEqual({ ...plain[index], lineSpacing: undefined });
      } else {
        expect(node, node.kind).toEqual(plain[index]);
      }
    });
    expect(spaced.some((node) => node.kind === 'table')).toBe(true);
    expect(spaced.some((node) => node.kind === 'answerSpace' || node.kind === 'answerLines')).toBe(true);
  });

  it('leaves the cover, masthead, title and instructions alone', () => {
    const worksheet = buildAcceptanceWorksheet();
    const a = renderWorksheet(worksheet, TEACHER);
    const b = renderWorksheet(withLineSpacing(worksheet, 2), TEACHER);
    expect(b.cover).toEqual(a.cover);
    expect(b.bands).toEqual(a.bands);
    expect(b.title).toEqual(a.title);
    expect(b.instructions).toEqual(a.instructions);
  });

  it('re-renders a cached question when only the spacing changes', () => {
    const worksheet = paper();
    flowNodes(worksheet);
    // The same question objects: the render cache must not hand back the single lines.
    const spaced = flowNodes({ ...worksheet, lineSpacing: 1.15 });
    expect(spaced.filter((node) => node.kind === 'text').every((node) => node.kind === 'text' && node.lineSpacing === 1.15)).toBe(true);
    expect(JSON.stringify(flowNodes(worksheet))).not.toContain('"lineSpacing"');
  });

  it('reaches into source panels and MC option grids', () => {
    const nested: RenderNode[] = [
      { kind: 'source', nodes: [{ kind: 'text', style: 'Body', text: bi('In a panel', '') }] } as RenderNode,
      { kind: 'optionRow', cells: [[{ kind: 'text', style: 'MCQ Option', text: bi('A', '') }]] },
      { kind: 'spacer', heightPt: 12 },
    ];
    const spaced = withSpacedLines(nested, 1.5);
    expect(JSON.stringify(spaced).match(/"lineSpacing":1.5/g)).toHaveLength(2);
    expect(spaced[2]).toBe(nested[2]);
  });
});

describe('Line spacing: the .docx', () => {
  it('writes an untouched document exactly as before', async () => {
    const worksheet = paper();
    expect(await documentXml(withLineSpacing(worksheet, 1))).toBe(await documentXml(worksheet));
  });

  it('states each spaced line as an exact box, the one the page draws', async () => {
    const xml = await documentXml(withLineSpacing(paper(), 1.5));
    for (const style of ['QuestionStem', 'MCQOption', 'Subquestion', 'MarkingScheme', 'Answer', 'BodyTextCustom']) {
      // The flow's paragraphs: the centred "Teacher Version" line under the title is not one.
      const props = paragraphProps(xml, style).filter((entry) => !entry.includes('<w:jc w:val="center"/>'));
      expect(props.some((entry) => /<w:spacing[^>]* w:line="360" w:lineRule="exact"\/>/.test(entry)), style).toBe(true);
      // Every other line of these styles is a table cell's, which keeps its single box.
      for (const entry of props) expect(entry, style).toMatch(/ w:line="(360|240)" w:lineRule="exact"\/>|^(?!.*w:spacing)/);
    }
    for (const entry of paragraphProps(xml, 'QuestionStem')) expect(entry).toContain('w:line="360"');
    // The heading's own 14pt box, half as tall again.
    for (const entry of paragraphProps(xml, 'SectionHeading')) {
      expect(entry).toContain(`w:line="${Math.round(exactLineFor(14) * 1.5)}"`);
    }
    // The dotted answer lines keep their own pitch.
    for (const entry of paragraphProps(xml, 'AnswerLine')) expect(entry).not.toContain('w:line="360"');
  });

  it('keeps a boundary gap beside the spaced line', async () => {
    const xml = await documentXml(withLineSpacing(paper(), 2));
    const gapped = [...xml.matchAll(/<w:spacing w:before="\d+"[^>]*\/>/g)].map((match) => match[0]);
    expect(gapped.length).toBeGreaterThan(0);
    // Body lines at 480, the section heading's 14pt box at twice its 305.
    for (const spacing of gapped) expect(spacing).toMatch(/ w:line="(480|610)" w:lineRule="exact"/);
    expect(gapped.some((spacing) => spacing.includes('w:line="480"'))).toBe(true);
  });
});

describe('Line spacing: Copy for Word', () => {
  it('copies a spaced question with its exact line, and a single one as before', () => {
    const worksheet = paper();
    const question = worksheet.questions[0];
    const plain = questionClipboardHtml(worksheet, question.id, TEACHER);
    expect(plain).not.toContain('mso-line-height-rule');
    const spaced = questionClipboardHtml(withLineSpacing(worksheet, 1.5), question.id, TEACHER);
    expect(spaced).toContain('line-height:18pt;mso-line-height-rule:exactly;');
    expect(worksheetClipboardHtml(withLineSpacing(worksheet, 1), TEACHER)).toBe(worksheetClipboardHtml(worksheet, TEACHER));
  });
});
