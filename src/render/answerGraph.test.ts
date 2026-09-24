import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  ANSWER_GRAPH_MAX_LINES,
  ANSWER_GRAPH_MIN_LINES,
  DEFAULT_ANSWER_GRAPH_LINES,
  answerGraphWidthShare,
  clampAnswerGraphLines,
  createAnswerGraph,
} from '@/model/answerGraph';
import { createWorksheet } from '@/model/factories';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { contentWidth, pageSetupOf } from '@/model/page';
import { bi } from '@/model/text';
import type {
  AnswerGraph,
  OutputMode,
  QuestionPart,
  StructuredQuestion,
  Worksheet,
} from '@/model/types';
import { packPages, placementKey, type BreakPoint, type PackItem } from '@/components/preview/pagination';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { buildDocxParts, exportDocxBuffer } from '@/export/docx';
import { TINY_PNG } from '@/test/fixtures';
import {
  ANSWER_GRAPH_INSET_PX,
  answerGraphBox,
  answerGraphNode,
  answerGraphSvg,
} from './answerGraph';
import { includeNode, type AnswerGraphNode, type RenderNode } from './ir';
import { renderWorksheet } from './worksheet';

/**
 * The graph answer space (§ `AnswerGraph`): blank axes a student draws on, printed after
 * its part and before the dotted lines, one PNG in a line box of whole 12pt lines.
 */

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };

const paragraph = (id: string, text: string) => ({
  kind: 'paragraph' as const,
  id,
  text: bi(text, text),
});

function worksheetWith(parts: QuestionPart[], extra: Partial<StructuredQuestion> = {}): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [paragraph('stem', 'A government imposes a price ceiling on rice.')],
    parts,
    ...extra,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

function questionNodes(worksheet: Worksheet, mode: OutputMode = STUDENT_EN): RenderNode[] {
  return renderWorksheet(worksheet, mode).items.flatMap((item) =>
    item.type === 'question' ? item.question.nodes : [],
  );
}

function shapeOf(worksheet: Worksheet): string[] {
  return questionNodes(worksheet).map((node) =>
    node.kind === 'text'
      ? (node.listRef?.marker ?? 'text')
      : node.kind === 'answerSpace'
        ? `space:${node.lines}`
        : node.kind === 'answerGraph'
          ? `graph:${node.lines}`
          : node.kind,
  );
}

const graphOf = (worksheet: Worksheet) =>
  questionNodes(worksheet).find((node): node is AnswerGraphNode => node.kind === 'answerGraph');

describe('the model', () => {
  it('clamps the height to whole lines inside the range', () => {
    expect(clampAnswerGraphLines(16)).toBe(16);
    expect(clampAnswerGraphLines(15.6)).toBe(16);
    expect(clampAnswerGraphLines(1)).toBe(ANSWER_GRAPH_MIN_LINES);
    expect(clampAnswerGraphLines(999)).toBe(ANSWER_GRAPH_MAX_LINES);
    expect(clampAnswerGraphLines(Number.NaN)).toBe(DEFAULT_ANSWER_GRAPH_LINES);
  });

  it('is full width unless it says half', () => {
    expect(answerGraphWidthShare({ lines: 12 })).toBe(1);
    expect(answerGraphWidthShare({ lines: 12, width: 'half' })).toBe(0.5);
  });

  it('seeds a half-width Price / Quantity box with its origin', () => {
    const graph = createAnswerGraph();
    expect(graph.lines).toBe(DEFAULT_ANSWER_GRAPH_LINES);
    expect(graph.width).toBe('half');
    expect(graph.showOrigin).toBe(true);
    expect(graph.yTitle?.en[0].text).toBe('Price');
    expect(graph.xTitle?.zh[0].text).toBe('數量');
  });

  it('survives a save and reload untouched (question fields pass through migrate)', () => {
    const graph: AnswerGraph = { ...createAnswerGraph(), grid: true };
    const worksheet = worksheetWith(
      [{ id: 'a', blocks: [paragraph('pa', 'Draw.')], answerGraph: graph, subParts: [
        { id: 'i', blocks: [paragraph('pi', 'Sub.')], answerGraph: { lines: 12 } },
      ] }],
      { answerGraph: { lines: 20 } },
    );
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    const question = reloaded.questions[0] as StructuredQuestion;
    expect(question.parts[0].answerGraph).toEqual(graph);
    expect(question.parts[0].subParts?.[0].answerGraph).toEqual({ lines: 12 });
    expect(question.answerGraph).toEqual({ lines: 20 });
    expect(reloaded.__unknown).toBeUndefined();
  });
});

describe('the IR', () => {
  it('prints a part\'s blank axes after the part and before its dotted lines', () => {
    const shape = shapeOf(
      worksheetWith([
        {
          id: 'a',
          blocks: [paragraph('pa', 'Draw a diagram to illustrate the shortage.')],
          marks: 4,
          answerGraph: { lines: 16 },
          answerSpace: 6,
        },
        { id: 'b', blocks: [paragraph('pb', 'Explain.')], marks: 2 },
      ]),
    );
    const graph = shape.indexOf('graph:16');
    expect(graph).toBeGreaterThan(shape.indexOf('(a)'));
    expect(shape[graph + 1]).toBe('space:6');
    expect(graph).toBeLessThan(shape.indexOf('(b)'));
    expect(shape.filter((s) => s.startsWith('graph:'))).toHaveLength(1);
  });

  it('prints a sub-part\'s box after that sub-part', () => {
    const shape = shapeOf(
      worksheetWith([
        {
          id: 'a',
          blocks: [paragraph('pa', 'Lead-in.')],
          subParts: [
            { id: 'i', blocks: [paragraph('pi', 'Draw.')], marks: 2, answerGraph: { lines: 12 } },
            { id: 'ii', blocks: [paragraph('pii', 'Explain.')], marks: 2 },
          ],
        },
      ]),
    );
    expect(shape.indexOf('graph:12')).toBeGreaterThan(shape.indexOf('(i)'));
    expect(shape.indexOf('graph:12')).toBeLessThan(shape.indexOf('(ii)'));
  });

  it('prints a leaf question\'s box under its stem, and ignores it once parts exist', () => {
    const leaf = worksheetWith([], { answerGraph: { lines: 20 }, answerSpace: 4 });
    expect(shapeOf(leaf).slice(-2)).toEqual(['graph:20', 'space:4']);
    const withParts = worksheetWith([{ id: 'a', blocks: [paragraph('pa', 'Part.')] }], {
      answerGraph: { lines: 20 },
    });
    expect(shapeOf(withParts)).not.toContain('graph:20');
  });

  it('prints nothing when absent — an untouched question renders as before', () => {
    const shape = shapeOf(worksheetWith([{ id: 'a', blocks: [paragraph('pa', 'Part.')] }]));
    expect(shape.some((s) => s.startsWith('graph:'))).toBe(false);
  });

  it('is writing room: the "no answer space" export leaves it out', () => {
    const worksheet = worksheetWith([
      { id: 'a', blocks: [paragraph('pa', 'Draw.')], answerGraph: { lines: 12 } },
    ]);
    const node = graphOf(worksheet)!;
    expect(includeNode(node, { ...STUDENT_EN, omitAnswerSpace: true })).toBe(false);
    expect(includeNode(node, STUDENT_EN)).toBe(true);
  });

  it('resolves its fields, and keys identical boxes alike and different boxes apart', () => {
    const node = answerGraphNode({ lines: 13.2, width: 'half', xTitle: bi('', '') });
    expect(node).toMatchObject({ lines: 13, widthShare: 0.5, grid: false, showOrigin: false });
    expect(node.xTitle).toBeUndefined();
    expect(answerGraphNode(createAnswerGraph()).key).toBe(answerGraphNode(createAnswerGraph()).key);
    expect(answerGraphNode({ lines: 12 }).key).not.toBe(answerGraphNode({ lines: 12, grid: true }).key);
  });
});

describe('the box and its drawing', () => {
  const A4_TEXT = 9026;

  it('is a whole number of 12pt lines tall, and the picture sits inside it', () => {
    const box = answerGraphBox({ lines: 16, widthShare: 1 }, A4_TEXT);
    expect(box.boxHeightPx).toBe(16 * 16); // 16 lines × 12pt × 4/3 px
    expect(box.imageHeightPx).toBe(box.boxHeightPx - ANSWER_GRAPH_INSET_PX);
    expect(box.widthPx).toBe(Math.floor(A4_TEXT / 15));
    expect(answerGraphBox({ lines: 16, widthShare: 0.5 }, A4_TEXT).widthPx).toBe(
      Math.floor(A4_TEXT / 30),
    );
  });

  it('draws two arrowed axes, the titles and the origin; a grid only when asked', () => {
    const plain = answerGraphSvg(answerGraphNode(createAnswerGraph()), {
      widthPx: 300,
      heightPx: 252,
      language: 'bilingual',
    });
    // Two heads as plain triangles — no `<marker>`, whose id the print path can lose.
    expect(plain.match(/data-arrowhead/g)).toHaveLength(2);
    expect(plain).not.toContain('marker');
    expect(plain).toContain('>Price<');
    expect(plain).toContain('>價格<');
    expect(plain).toContain('>Quantity<');
    expect(plain).toContain('>0<');
    expect(plain).not.toContain('#bfbfbf');

    const gridded = answerGraphSvg(answerGraphNode({ ...createAnswerGraph(), grid: true }), {
      widthPx: 300,
      heightPx: 252,
      language: 'en',
    });
    expect(gridded).toContain('#bfbfbf');
    expect(gridded).not.toContain('價格');
  });

  it('prints a symbol once in bilingual, and escapes what it prints', () => {
    const svg = answerGraphSvg(
      answerGraphNode({ lines: 12, yTitle: bi('P & Q', 'P & Q') }),
      { widthPx: 300, heightPx: 188, language: 'bilingual' },
    );
    expect(svg.match(/P &amp; Q/g)).toHaveLength(1);
  });
});

describe('the .docx and the clipboard', () => {
  const MODE: OutputMode = { language: 'en', version: 'student' };

  function withGraph(): { worksheet: Worksheet; node: AnswerGraphNode; images: Map<string, string> } {
    const worksheet = worksheetWith([
      {
        id: 'a',
        blocks: [paragraph('pa', 'Draw a diagram.')],
        marks: 4,
        answerGraph: { ...createAnswerGraph(), lines: 20 },
        answerSpace: 3,
      },
    ]);
    const node = graphOf(worksheet)!;
    return { worksheet, node, images: new Map([[node.key, TINY_PNG]]) };
  }

  it('emits one picture in a line box of exactly its lines, and embeds the PNG', async () => {
    const { worksheet, node, images } = withGraph();
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, MODE, images));
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toContain('<w:spacing w:line="4800" w:lineRule="atLeast"/>');
    const box = answerGraphBox(node, contentWidth(pageSetupOf(worksheet)));
    expect(xml).toContain(`<wp:extent cx="${box.widthPx * 9525}" cy="${box.imageHeightPx * 9525}"/>`);
    // The picture fits its box, so the line never grows past 20 × 12pt.
    expect(box.imageHeightPx * 0.75).toBeLessThan(20 * 12);
    expect(Object.keys(zip.files).filter((name) => /^word\/media\/.+\.png$/.test(name))).toHaveLength(1);

    const { XMLValidator } = await import('fast-xml-parser');
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it('emits nothing (and no dangling relationship) without a raster', () => {
    const { worksheet } = withGraph();
    const parts = buildDocxParts(worksheet, MODE);
    expect(parts.documentXml).not.toContain('w:lineRule="atLeast"');
    expect(parts.assets).toHaveLength(0);
  });

  it('pastes as the same PNG at the same size', () => {
    const { worksheet, node, images } = withGraph();
    const box = answerGraphBox(node, contentWidth(pageSetupOf(worksheet)));
    const html = worksheetClipboardHtml(worksheet, MODE, images);
    expect(html).toContain(`width="${box.widthPx}" height="${box.imageHeightPx}"`);
    expect(html).toContain('text-align:center');
  });
});

describe('pagination', () => {
  /*
   * Heights the way the preview measures them: one 16px line per text/gap node, the
   * graph its whole box, dotted lines at their pitch. Break points only where the IR
   * lets Word break (after a node that does not keep with the next).
   */
  const LINE = 16;
  function itemFor(nodes: RenderNode[]): { item: PackItem; height: number; graphAt: number } {
    const heights = nodes.map((node) =>
      node.kind === 'answerGraph'
        ? node.lines * LINE
        : node.kind === 'answerSpace'
          ? node.lines * 29.47
          : LINE,
    );
    let total = 0;
    const breakPoints: BreakPoint[] = [];
    nodes.forEach((node, index) => {
      total += heights[index];
      const keeps = 'keepNext' in node ? node.keepNext : undefined;
      if (!keeps && index < nodes.length - 1) breakPoints.push({ index, height: total });
    });
    const graphAt = nodes.findIndex((node) => node.kind === 'answerGraph');
    return { item: { key: 'q', breakPoints }, height: total, graphAt };
  }

  it('keeps the part\'s question text with its box', () => {
    const nodes = questionNodes(
      worksheetWith([{ id: 'a', blocks: [paragraph('pa', 'Draw.')], answerGraph: { lines: 16 } }]),
    );
    const at = nodes.findIndex((node) => node.kind === 'answerGraph');
    expect((nodes[at - 1] as { keepNext?: boolean }).keepNext).toBe(true);
  });

  it('moves a question whose box does not fit to the next sheet whole', () => {
    const nodes = questionNodes(
      worksheetWith([{ id: 'a', blocks: [paragraph('pa', 'Draw.')], answerGraph: { lines: 24 } }]),
    );
    const { item, height } = itemFor(nodes);
    const page = 700;
    const filler: PackItem = { key: 'filler' };
    const packed = packPages([filler, item], new Map([['filler', 500], ['q', height]]), page);
    expect(packed.pages.map((p) => p.map((i) => i.key))).toEqual([['filler'], ['q']]);
    expect(packed.fragments.size).toBe(0);
  });

  it('never cuts the box when a too-tall question splits', () => {
    const nodes = questionNodes(
      worksheetWith([
        { id: 'a', blocks: [paragraph('pa', 'Explain.')], answerSpace: 12 },
        { id: 'b', blocks: [paragraph('pb', 'Draw.')], answerGraph: { lines: 30 }, answerSpace: 8 },
      ]),
    );
    const { item, height, graphAt } = itemFor(nodes);
    const page = 600;
    expect(height).toBeGreaterThan(page);
    const packed = packPages([item], new Map([['q', height]]), page);
    expect(packed.pages.length).toBeGreaterThan(1);
    // Every piece is a range of whole nodes, and exactly one piece holds the box.
    const pieces = packed.pages.flatMap((p, pageIndex) =>
      p.map((_, position) => packed.fragments.get(placementKey(pageIndex, position))!),
    );
    const holding = pieces.filter((piece) => piece.from <= graphAt && graphAt <= piece.to);
    expect(holding).toHaveLength(1);
    // The box and the part text above it travel together.
    expect(holding[0].from).toBeLessThanOrEqual(graphAt - 1);
  });
});
