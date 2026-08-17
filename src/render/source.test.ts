import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  createDiagramBlock,
  createImageBlock,
  createMcqQuestion,
  createParagraphBlock,
  createSourceBlock,
  createTableBlock,
  createWorksheet,
  nextSourceLetter,
} from '@/model/factories';
import { bi, plain } from '@/model/text';
import { flattenBlocks, applyEditTarget, describeDelete } from '@/model/edits';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { STEM_TEXT_INDENT } from '@/model/numbering';
import { contentWidth, pageSetupOf } from '@/model/page';
import { collectDiagramNodes } from '@/export/diagramImage';
import { exportDocxBuffer } from '@/export/docx/index';
import { TINY_PNG } from '@/test/fixtures';
import type { ContentBlock, McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { renderContentBlocks, type RenderNode } from './ir';

/**
 * A labelled source panel (§`SourceBlock`) — the data-response question's unit.
 *
 * The shape 2025 Q11 Source A needs and nothing else could make: a paragraph, a table
 * and another paragraph inside one frame. The body is ordinary blocks one level down,
 * so everything already true of a table or a picture must stay true inside a source.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

/** 2025 Source A's shape: prose, a table, then more prose, all in one frame. */
function sourceA(): Extract<ContentBlock, { kind: 'source' }> {
  const block = createSourceBlock('A');
  block.label = bi('Source A: Basic information about housing', '資料A：香港住屋的基本資料');
  block.blocks = [
    createParagraphBlock(bi('Private and public housing are the two major types.', '')),
    createTableBlock(3, 3),
    createParagraphBlock(bi('The total rental value contributed $300 billion.', '')),
  ];
  return block;
}

function render(blocks: ContentBlock[]): RenderNode[] {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, blocks, 'Body');
  return nodes;
}

/** Through JSON and back, the way localStorage actually stores a document. */
function roundTrip(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value));
}

function documentWith(blocks: ContentBlock[]): Worksheet {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = blocks;
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

describe('a source panel holds a mix of blocks in one frame', () => {
  it('carries prose, a table and prose as ordinary nodes one level down', () => {
    const nodes = render([sourceA()]);
    const source = nodes.find((node) => node.kind === 'source');
    expect(source && source.kind === 'source' && source.framed).toBe(true);
    const kinds =
      source && source.kind === 'source' ? source.nodes.map((node) => node.kind) : [];
    // The table's own separating blank line still applies *inside* the frame — the body
    // recurses through the same renderer, so there is one gap rule, not two.
    expect(kinds).toContain('table');
    expect(kinds.filter((kind) => kind === 'text').length).toBe(2);
  });

  it('prints its label above the frame and holds it there', () => {
    const nodes = render([sourceA()]);
    const label = nodes.find((node) => node.kind === 'text');
    expect(label && label.kind === 'text' && plain(label.text.en)).toContain('Source A');
    // A label that stranded at a page bottom would head a panel on the next sheet.
    expect(label && label.kind === 'text' && label.keepNext).toBe(true);
    expect(label && label.kind === 'text' && label.edit?.kind).toBe('sourceLabel');
  });

  it('prints its footnote below the frame, italic, and keeps the frame with it', () => {
    const block = sourceA();
    block.footnote = bi('* Waiting time refers to the time taken…', '');
    const nodes = render([block]);
    const source = nodes.find((node) => node.kind === 'source');
    // The frame keeps with the footnote, or the note widows at a page top.
    expect(source && source.kind === 'source' && source.keepNext).toBe(true);
    const footnote = nodes.find(
      (node) => node.kind === 'text' && node.edit?.kind === 'sourceFootnote',
    );
    expect(footnote && footnote.kind === 'text' && footnote.format?.italic).toBe(true);
  });

  it('clears the frame before the footnote and after the panel', () => {
    const block = sourceA();
    block.footnote = bi('* A note about the table.', '');
    const nodes = render([block]);
    const frame = nodes.findIndex((node) => node.kind === 'source');
    const footnote = nodes.findIndex(
      (node) => node.kind === 'text' && node.edit?.kind === 'sourceFootnote',
    );
    // Flush against the rule, a footnote reads as a row of the panel, not a note on it.
    expect(nodes[frame + 1].kind).toBe('spacer');
    expect(footnote).toBe(frame + 2);
    // And the part that follows must not sit on the frame either.
    expect(nodes[nodes.length - 1].kind).toBe('spacer');
  });

  it('does not double the gap when the body already ends in one', () => {
    // A gap counts what is already there — the rule the whole fixed-line model rests on.
    const block = sourceA();
    const nodes = render([block]);
    const trailing = nodes.filter((node, index) => node.kind === 'spacer' && index >= nodes.length - 2);
    expect(trailing.length).toBe(1);
  });

  it('lines the frame up with its own label, not the page margin', () => {
    // The reference (2025 Q11) puts "11.", the stem sentence, every "Source X:" line
    // and every frame edge on ONE column — only the question number hangs out in the
    // gutter. A frame at the page margin would sit left of the label naming it.
    const nodes: RenderNode[] = [];
    renderContentBlocks(nodes, [sourceA()], 'Question Stem', {
      indent: STEM_TEXT_INDENT,
    });
    const label = nodes.find((node) => node.kind === 'text');
    const frame = nodes.find((node) => node.kind === 'source');
    expect(label && label.kind === 'text' && label.indent).toBe(STEM_TEXT_INDENT);
    expect(frame && frame.kind === 'source' && frame.indent).toBe(STEM_TEXT_INDENT);
  });

  it('does not indent the body a second time inside an indented frame', () => {
    const nodes: RenderNode[] = [];
    renderContentBlocks(nodes, [sourceA()], 'Question Stem', {
      indent: STEM_TEXT_INDENT,
    });
    const frame = nodes.find((node) => node.kind === 'source');
    if (!frame || frame.kind !== 'source') throw new Error('no frame');
    // The frame has already moved right by the indent; the body starts from its edge.
    for (const child of frame.nodes) {
      if (child.kind === 'text') expect(child.indent).toBeUndefined();
    }
  });

  it('narrows the exported frame by its indent instead of overhanging the column', async () => {
    const question = createMcqQuestion() as McqQuestion;
    question.blocks = [sourceA()];
    const base = createWorksheet();
    const buffer = await exportDocxBuffer(
      { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] },
      MODE,
      new Map(),
    );
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    // An MCQ stem indents its continuation blocks, so the frame carries a real offset.
    const frame = xml.match(/<w:tbl><w:tblPr>[\s\S]*?<\/w:tblPr>/)![0];
    const width = Number(frame.match(/<w:tblW w:w="(\d+)"/)![1]);
    const ind = Number(frame.match(/<w:tblInd w:w="(\d+)"/)?.[1] ?? 0);
    expect(ind).toBeGreaterThan(0);
    // Width plus indent must still be the live content column, or the frame runs off
    // the page — the same base every other table resolves against.
    expect(width + ind).toBe(contentWidth(pageSetupOf(base)));
  });

  it('renders nothing at all when it has nothing to say', () => {
    // Nothing may render an unmeasurable box: an empty frame measures zero in the probe
    // but occupies a line on the sheet, which is what makes pagination oscillate.
    const block = createSourceBlock('A');
    block.label = undefined;
    block.blocks = [];
    expect(render([block])).toEqual([]);
  });

  it('leaves a table-only source unframed — the table draws its own box', () => {
    // 2025 Source B: label, ruled table, footnote, and no outer rule anywhere.
    // Framing it would put a box around a box with the panel's cell margins showing
    // as a gutter between the two, which neither reference paper prints.
    const block = createSourceBlock('B');
    block.blocks = [createTableBlock(2, 2)];
    const source = render([block]).find((node) => node.kind === 'source');
    expect(source && source.kind === 'source' && source.framed).toBe(false);
  });

  it('reframes by itself once the body stops being one bare table', () => {
    // Derived from the content, never stored — adding prose makes it a mix again.
    const block = createSourceBlock('B');
    block.blocks = [createTableBlock(2, 2), createParagraphBlock(bi('A note.', ''))];
    const source = render([block]).find((node) => node.kind === 'source');
    expect(source && source.kind === 'source' && source.framed).toBe(true);
  });

  it('honours an explicit choice over the derived one, both ways', () => {
    const framed = createSourceBlock('B');
    framed.blocks = [createTableBlock(2, 2)];
    framed.framed = true;
    const a = render([framed]).find((node) => node.kind === 'source');
    expect(a && a.kind === 'source' && a.framed).toBe(true);

    const bare = sourceA();
    bare.framed = false;
    const b = render([bare]).find((node) => node.kind === 'source');
    expect(b && b.kind === 'source' && b.framed).toBe(false);
  });

  it('renders a bare source with no frame, keeping its label and footnote', () => {
    // 2025 Source B: the table draws the only box, but the label and footnote still
    // belong to the panel — which is why the wrapper is worth having unframed.
    const block = createSourceBlock('B');
    block.framed = false;
    block.blocks = [createTableBlock(2, 2)];
    const source = render([block]).find((node) => node.kind === 'source');
    expect(source && source.kind === 'source' && source.framed).toBe(false);
  });
});

describe('a source panel reaches every block edit', () => {
  it('surfaces its body to the read walk, recursively', () => {
    const block = sourceA();
    const ids = flattenBlocks([block]).map((entry) => entry.id);
    // A block the write walk can patch must be findable, or it is a field a teacher
    // can click and silently lose.
    for (const child of block.blocks) expect(ids).toContain(child.id);
  });

  it('writes its label and drops the field when it is emptied', () => {
    const block = sourceA();
    const worksheet = documentWith([block]);
    const target = { kind: 'sourceLabel', blockId: block.id } as const;

    const typed = applyEditTarget(worksheet, target, bi('Source A: housing', ''));
    const written = typed.questions[0].blocks[0];
    expect(written.kind === 'source' && plain(written.label!.en)).toBe('Source A: housing');

    // A field cleared to nothing stores nothing — otherwise it prints a phantom line.
    const cleared = applyEditTarget(worksheet, target, { en: [], zh: [] });
    const empty = cleared.questions[0].blocks[0];
    expect(empty.kind === 'source' && empty.label).toBeUndefined();
  });

  it('clears its lines on Delete rather than removing the panel', () => {
    expect(describeDelete({ kind: 'sourceLabel', blockId: 'x' })?.kind).toBe('clear');
    expect(describeDelete({ kind: 'sourceFootnote', blockId: 'x' })?.kind).toBe('clear');
  });
});

describe('a source panel does not strand its pictures', () => {
  it('collects an image inside the frame, or the .docx reports as damaged', async () => {
    const block = createSourceBlock('A');
    block.blocks = [createImageBlock(TINY_PNG, 120, 90)];
    const buffer = await exportDocxBuffer(documentWith([block]), MODE, new Map());
    const zip = await JSZip.loadAsync(buffer);
    // Emitted but uncollected is a dangling `r:embed`, which Word reports against the
    // whole file rather than as one missing picture.
    expect(zip.file('word/media/image1.png')).not.toBeNull();
    const xml = await zip.file('word/document.xml')!.async('string');
    const embed = xml.match(/r:embed="(rId\d+)"/)?.[1];
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).toContain(`Id="${embed}"`);
  });

  it('finds a diagram inside the frame so the pre-pass rasterizes it', () => {
    const block = createSourceBlock('A');
    block.blocks = [createDiagramBlock('pie', 300)];
    // A diagram the pre-pass never yields is never rasterized, and `exportDocx` then
    // refuses the whole file naming it.
    const found = collectDiagramNodes(documentWith([block]), MODE);
    expect(found).toHaveLength(1);
  });
});

describe('the source panel exports as one unbreakable frame', () => {
  it('draws its four sides and rules nothing inside, in one cantSplit row', async () => {
    const buffer = await exportDocxBuffer(documentWith([sourceA()]), MODE, new Map());
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    const frame = xml.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)![0];
    for (const side of ['top', 'left', 'bottom', 'right']) {
      expect(frame).toContain(`<w:${side} w:val="single"`);
    }
    // Never omitted: an unstated border inherits from the table style.
    expect(frame).toContain('<w:insideH w:val="none"');
    // A frame that broke across a page would print half a box.
    expect(xml).toContain('<w:cantSplit/>');
    // The real table sits nested inside the frame's one cell.
    expect(xml.match(/<w:tbl>/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('draws no rule at all when the panel is bare', async () => {
    const block = createSourceBlock('B');
    block.framed = false;
    block.blocks = [createParagraphBlock(bi('An extract.', ''))];
    const buffer = await exportDocxBuffer(documentWith([block]), MODE, new Map());
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    const frame = xml.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)![0];
    expect(frame).not.toContain('w:val="single"');
  });

  it('leaves a document using no source byte-identical', async () => {
    const plainDoc = documentWith([createParagraphBlock(bi('Just prose.', ''))]);
    const buffer = await exportDocxBuffer(plainDoc, MODE, new Map());
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).not.toContain('cantSplit');
  });
});

describe('a source survives being saved and loaded', () => {
  it('round-trips through serialize → migrate with its body and both lines intact', () => {
    const block = sourceA();
    block.footnote = bi('* A note.', '');
    block.framed = false;
    const worksheet = documentWith([block]);

    // New nested data needs no migration and no version bump — but it must actually
    // survive the load path, which validates and normalizes on the way through.
    const reloaded = migrate(roundTrip(serializeWorksheet(worksheet)));
    const after = reloaded.questions[0].blocks[0];
    expect(after.kind).toBe('source');
    if (after.kind !== 'source') return;
    expect(plain(after.label!.en)).toContain('Source A');
    expect(plain(after.footnote!.en)).toContain('* A note.');
    expect(after.framed).toBe(false);
    expect(after.blocks.map((entry) => entry.kind)).toEqual([
      'paragraph',
      'table',
      'paragraph',
    ]);
  });

  it('carries a diagonal cell across the same round trip', () => {
    const table = createTableBlock(2, 2);
    table.rows[1].cells[0].diagonal = true;
    const reloaded = migrate(roundTrip(serializeWorksheet(documentWith([table]))));
    const after = reloaded.questions[0].blocks[0];
    expect(after.kind === 'table' && after.rows[1].cells[0].diagonal).toBe(true);
  });
});

describe('the seeded source letter', () => {
  it('counts up the alphabet and keeps counting past Z', () => {
    expect(nextSourceLetter(0)).toBe('A');
    expect(nextSourceLetter(3)).toBe('D');
    // Wrapping would relabel a second panel "A"; the papers never go this far.
    expect(nextSourceLetter(26)).toBe('27');
  });

  it('is only an initial value — nothing stores an index', () => {
    const block = createSourceBlock('C');
    expect(plain(block.label!.en)).toBe('Source C: ');
    expect('index' in block).toBe(false);
  });
});
