import { describe, it, expect } from 'vitest';
import { renderWorksheet } from '@/render/worksheet';
import { exportDocxBuffer } from '@/export/docx';
import { createWorksheet, createMcqQuestion } from '@/model/factories';
import { applyResizeBlock, replaceBlockById, questionOwnsBlock } from '@/model/edits';
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

  it('forces the stacked layout, whatever is stored', () => {
    const { question } = q36();
    // Four short (empty) options would otherwise be laid out side by side, and a row of
    // tab stops cannot carry a picture per cell — the figures would vanish silently.
    question.optionLayout = 'inline';
    expect(resolveOptionLayout(question)).toBe('stacked');

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
