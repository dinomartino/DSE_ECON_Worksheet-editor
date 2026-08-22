import { describe, it, expect } from 'vitest';
import { renderWorksheet } from '@/render/worksheet';
import { exportDocxBuffer } from '@/export/docx';
import { createWorksheet, createMcqQuestion } from '@/model/factories';
import { applyDeleteTarget, applyResizeBlock, replaceBlockById, questionOwnsBlock } from '@/model/edits';
import { resolveOptionLayout } from './mcq';
import { OPTION_LIST_INDENT } from '@/model/numbering';
import { bi, plain } from '@/model/text';
import type { Diagram } from '@/model/diagram';
import type { McqQuestion, Worksheet, DiagramBlock } from '@/model/types';
import JSZip from 'jszip';

/**
 * An MCQ option can carry its own blocks.
 *
 * DSE 2021 P1 Q36 asks "which of the following diagrams best describes…" and its four
 * options *are* AD-AS diagrams. Without blocks on an option the question is unanswerable
 * — the letters print and the figures do not — so these pin the whole path: the model
 * holds them, the IR emits them, the exporter embeds them, and the editing verbs reach
 * them.
 */

function plot(label: string): Diagram {
  return {
    x: { title: bi('Output Level', '') },
    y: { title: bi('Price Level', '') },
    curves: [
      {
        id: `${label}-c`,
        points: [
          { x: 0.1, y: 0.8 },
          { x: 0.9, y: 0.2 },
        ],
        shape: 'straight',
        label: bi(label, ''),
      },
    ],
    points: [],
    labels: [],
    arrows: [],
  };
}

function diagramOption(id: string, label: string): DiagramBlock {
  return {
    kind: 'diagram',
    id,
    diagram: plot(label),
    widthPx: 220,
    heightPx: 180,
    altText: bi(`${label} diagram`, ''),
  };
}

/** Q36's shape: a stem, then four options each carrying a diagram. */
function q36(): { worksheet: Worksheet; question: McqQuestion } {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [
    {
      kind: 'paragraph',
      id: 'stem',
      text: bi('Which of the following diagrams can best describe the consequence?', ''),
    },
  ];
  question.options = question.options.map((option, index) => ({
    ...option,
    text: bi('', ''),
    blocks: [diagramOption(`d${index}`, `AD${index + 1}`)],
  }));

  const base = createWorksheet();
  const worksheet: Worksheet = {
    ...base,
    questions: [question],
    flow: [{ type: 'question', id: question.id }],
  };
  return { worksheet, question };
}

const MODE = { language: 'en', version: 'student' } as const;

describe('an MCQ option carrying blocks', () => {
  it('renders a diagram under each option letter', () => {
    const { worksheet } = q36();
    const nodes = renderWorksheet(worksheet, MODE).questions[0].nodes;

    const diagrams = nodes.filter((node) => node.kind === 'diagram');
    expect(diagrams).toHaveLength(4);

    // Each diagram follows its own option's numbered paragraph, so the letter and the
    // figure that answers it stay together and in order.
    const shape = nodes
      .filter((node) => node.kind === 'diagram' || (node.kind === 'text' && node.listRef))
      .map((node) => (node.kind === 'text' ? node.listRef!.marker : 'figure'));
    expect(shape).toEqual([
      '1.', 'A.', 'figure', 'B.', 'figure', 'C.', 'figure', 'D.', 'figure',
    ]);
  });

  it('coerces inline to stacked, but honours columns2 as the grid', () => {
    const { question } = q36();
    // Four short (empty) options would otherwise be laid out inline, and a row of
    // tab stops cannot carry a picture per cell — the figures would vanish silently.
    question.optionLayout = 'inline';
    expect(resolveOptionLayout(question)).toBe('stacked');

    // Two per row escapes the tab-stop limit: with blocks it renders as a real
    // layout-table grid (§ OptionRowNode), the reference's own 2×2 diagram shape.
    question.optionLayout = 'columns2';
    expect(resolveOptionLayout(question)).toBe('columns2');

    const plain = createMcqQuestion() as McqQuestion;
    plain.optionLayout = 'inline';
    expect(resolveOptionLayout(plain)).toBe('inline');
  });

  it('keeps each option with its own figure across a page break', () => {
    const { worksheet } = q36();
    const nodes = renderWorksheet(worksheet, MODE).questions[0].nodes;
    const letters = nodes.filter(
      (node) => node.kind === 'text' && node.listRef?.definition === 'option',
    ) as Extract<(typeof nodes)[number], { kind: 'text' }>[];
    // Every option letter keeps with the diagram printed under it, including the last —
    // otherwise Word breaks between "D." and the figure that answers it.
    expect(letters).toHaveLength(4);
    for (const letter of letters) expect(letter.keepNext).toBe(true);
  });

  it('indents an option block to the option\'s own text column', () => {
    const question = createMcqQuestion() as McqQuestion;
    question.options = question.options.map((option, index) =>
      index === 0
        ? {
            ...option,
            blocks: [{ kind: 'paragraph' as const, id: 'p', text: bi('under A', '') }],
          }
        : option,
    );
    const base = createWorksheet();
    const worksheet: Worksheet = {
      ...base,
      questions: [question],
      flow: [{ type: 'question', id: question.id }],
    };

    const nodes = renderWorksheet(worksheet, MODE).questions[0].nodes;
    const block = nodes.find(
      (node) => node.kind === 'text' && plain(node.text.en) === 'under A',
    ) as Extract<(typeof nodes)[number], { kind: 'text' }>;

    // The blocks continue the answer the letter introduces, so they start where its
    // *words* do — not at the page margin, which is where an unset indent puts them and
    // is only visible on a rendered page.
    expect(block.indent).toBe(OPTION_LIST_INDENT.left);
  });

  it('embeds all four diagrams in the .docx', async () => {
    const { worksheet } = q36();
    // The rasterizer needs a canvas, so the pre-pass map is supplied directly — the same
    // route the scripts and the synchronous export path use.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const images = new Map(['d0', 'd1', 'd2', 'd3'].map((id) => [id, png]));

    const buffer = await exportDocxBuffer(worksheet, MODE, images);
    const zip = await JSZip.loadAsync(buffer);
    const document = await zip.file('word/document.xml')!.async('string');

    // Four drawings, each with a relationship that resolves — a dangling one is a Word
    // repair error rather than a missing picture.
    const drawings = document.match(/<w:drawing>/g) ?? [];
    expect(drawings).toHaveLength(4);

    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const id of document.match(/r:embed="(rId\d+)"/g) ?? []) {
      const relId = id.replace(/r:embed="|"/g, '');
      expect(rels).toContain(`Id="${relId}"`);
    }
  });

  it('renders columns2 as a 2×2 grid of option rows', () => {
    const { worksheet, question } = q36();
    question.optionLayout = 'columns2';
    const nodes = renderWorksheet(worksheet, MODE).questions[0].nodes;

    const rows = nodes.filter((node) => node.kind === 'optionRow');
    expect(rows).toHaveLength(2);

    // Each cell is the option's own nodes: its lettered line, then its figure. The
    // letters are literal markers (the side-by-side trade-off), reading A B / C D.
    const letters = rows.flatMap((row) =>
      row.cells.map((cell) => {
        const line = cell[0];
        return line?.kind === 'columns' ? line.cells[0].marker : undefined;
      }),
    );
    expect(letters).toEqual(['A.', 'B.', 'C.', 'D.']);
    for (const row of rows) {
      for (const cell of row.cells) {
        expect(cell.some((child) => child.kind === 'diagram')).toBe(true);
      }
    }

    // The rows chain: the first keeps with the second, the last is free to break.
    expect(rows[0].keepNext).toBe(true);
    expect(rows[1].keepNext).toBe(false);
  });

  it('squares an odd last row off with an empty cell', () => {
    const { worksheet, question } = q36();
    question.optionLayout = 'columns2';
    question.options = question.options.slice(0, 3);
    question.answerIndex = 0;
    const nodes = renderWorksheet(worksheet, MODE).questions[0].nodes;

    const rows = nodes.filter((node) => node.kind === 'optionRow');
    expect(rows).toHaveLength(2);
    // C keeps the same half-column its siblings print in, not the whole page.
    expect(rows[1].cells).toHaveLength(2);
    expect(rows[1].cells[1]).toEqual([]);
  });

  it('exports the grid as a borderless layout table with all four diagrams', async () => {
    const { worksheet, question } = q36();
    question.optionLayout = 'columns2';
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const images = new Map(['d0', 'd1', 'd2', 'd3'].map((id) => [id, png]));

    const buffer = await exportDocxBuffer(worksheet, MODE, images);
    const zip = await JSZip.loadAsync(buffer);
    const document = await zip.file('word/document.xml')!.async('string');

    // Two grid rows, each a two-cell borderless table whose row cannot split; all four
    // drawings embedded with resolving relationships (a dangling one is a repair error).
    expect(document.match(/<w:cantSplit\/>/g)).toHaveLength(2);
    expect(document.match(/<w:drawing>/g)).toHaveLength(4);
    // The grid draws nothing: every border spelled `none`, never omitted.
    expect(document).not.toContain('<w:top w:val="single"');

    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const id of document.match(/r:embed="(rId\d+)"/g) ?? []) {
      const relId = id.replace(/r:embed="|"/g, '');
      expect(rels).toContain(`Id="${relId}"`);
    }
  });

  it('deletes an option block from the page, dropping the key when emptied', () => {
    const { worksheet, question } = q36();
    // The shape the "+ Figure" seed used to leave behind: an empty paragraph the
    // teacher cannot see past — it prints as a phantom placeholder line under the
    // letter and Delete must be able to take it while the diagram stays.
    question.options = question.options.map((option, index) =>
      index === 0
        ? {
            ...option,
            blocks: [
              { kind: 'paragraph' as const, id: 'phantom', text: bi('', '') },
              ...(option.blocks ?? []),
            ],
          }
        : option,
    );

    const afterParagraph = applyDeleteTarget(worksheet, {
      kind: 'blockText',
      blockId: 'phantom',
    });
    const optionA = (afterParagraph.questions[0] as McqQuestion).options[0];
    expect(optionA.blocks?.map((block) => block.id)).toEqual(['d0']);

    // Deleting the last block drops the key rather than storing `[]` — the same rule
    // the panel's write path follows, so the layout stops being pinned by a figure
    // that is no longer there.
    const afterDiagram = applyDeleteTarget(afterParagraph, {
      kind: 'blockText',
      blockId: 'd0',
    });
    expect((afterDiagram.questions[0] as McqQuestion).options[0].blocks).toBeUndefined();
    // Untouched siblings keep theirs.
    expect((afterDiagram.questions[0] as McqQuestion).options[1].blocks).toHaveLength(1);
  });

  it('reaches an option block with the ordinary editing verbs', () => {
    const { worksheet, question } = q36();

    // Found by the generic walk, so delete/format/selection all locate it.
    expect(questionOwnsBlock(question, 'd2')).toBe(true);

    // Resized by the page's drag handle...
    const resized = applyResizeBlock(worksheet, 'd2', 300);
    const option = (resized.questions[0] as McqQuestion).options[2];
    expect(option.blocks?.[0]).toMatchObject({ widthPx: 300 });

    // ...and rewritten by the drawing canvas, which addresses blocks by id alone.
    const edited = replaceBlockById(worksheet, 'd2', {
      ...diagramOption('d2', 'REPLACED'),
    });
    const after = (edited.questions[0] as McqQuestion).options[2].blocks?.[0] as DiagramBlock;
    expect(after.diagram.curves[0].label?.en[0].text).toBe('REPLACED');
    // The untouched siblings are left alone.
    expect(question.options[1].blocks?.[0].id).toBe('d1');
  });
});
