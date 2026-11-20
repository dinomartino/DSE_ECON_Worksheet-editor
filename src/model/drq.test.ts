import { describe, expect, it } from 'vitest';
import '@/registry';
import {
  createDrqContent,
  createDrqQuestion,
  createSourceOf,
  essayNote,
  hasEssayNote,
  isBlankStructured,
  nextLetterIn,
  referencedSources,
  sourceLetter,
  sourceReference,
  SOURCE_KINDS,
  withSourceReference,
} from './drq';
import { createParagraphBlock, createSourceBlock, createStructuredQuestion } from './factories';
import { questionMarks } from './marks';
import { bi, plain } from './text';
import type { ContentBlock, ParagraphBlock } from './types';

/** The DRQ helpers behind the right panel's Add → Source ▾, Refer to and DRQ starter (k-0474). */

const firstText = (blocks: ContentBlock[]) => {
  const first = blocks[0] as ParagraphBlock;
  return { en: plain(first.text.en), zh: plain(first.text.zh) };
};

describe('sourceReference', () => {
  it('words one source, two, and more as the papers do', () => {
    expect(sourceReference(['A'])).toEqual(bi('Refer to Source A.', '參閱資料A。'));
    expect(sourceReference(['C', 'D'])).toEqual(bi('Refer to Sources C and D.', '參閱資料C及D。'));
    expect(sourceReference(['A', 'B', 'E'])).toEqual(bi('Refer to Sources A, B and E.', '參閱資料A、B及E。'));
  });
});

describe('withSourceReference', () => {
  it('puts the sentence before what the part already says, in both languages', () => {
    const blocks = [createParagraphBlock(bi('Explain the change.', '解釋有關變化。'))];
    const next = withSourceReference(blocks, ['B']);
    expect(firstText(next)).toEqual({ en: 'Refer to Source B. Explain the change.', zh: '參閱資料B。解釋有關變化。' });
    expect(referencedSources(next)).toEqual(['B']);
  });

  it('rewrites the sentence already there, in letter order, keeping the formatting after it', () => {
    const blocks: ContentBlock[] = [
      {
        ...createParagraphBlock(),
        text: {
          en: [{ text: 'Refer to Source D. ' }, { text: 'TWO', bold: true }, { text: ' reasons.' }],
          zh: [{ text: '參閱資料D。' }, { text: '兩個', bold: true }],
        },
      },
    ];
    const next = withSourceReference(blocks, ['D', 'C']);
    const first = next[0] as ParagraphBlock;
    expect(plain(first.text.en)).toBe('Refer to Sources C and D. TWO reasons.');
    expect(first.text.en[1]).toEqual({ text: 'TWO', bold: true });
    expect(plain(first.text.zh)).toBe('參閱資料C及D。兩個');
    expect(referencedSources(next)).toEqual(['C', 'D']);
  });

  it('removes the sentence when no source is chosen, leaving the rest', () => {
    const blocks = [createParagraphBlock(bi('Refer to Source A. Explain.', '參閱資料A。解釋。'))];
    const next = withSourceReference(blocks, []);
    expect(firstText(next)).toEqual({ en: 'Explain.', zh: '解釋。' });
    expect(referencedSources(next)).toEqual([]);
  });

  it('adds a paragraph when the part opens with a table', () => {
    const table = createSourceOf('table').blocks[0];
    const next = withSourceReference([table], ['A']);
    expect(next).toHaveLength(2);
    expect(firstText(next).en).toBe('Refer to Source A.');
    expect(withSourceReference([table], [])).toEqual([table]);
  });

  it('reads the Chinese sentence when the English is still empty', () => {
    expect(referencedSources([createParagraphBlock(bi('', '參閱資料A及C。'))])).toEqual(['A', 'C']);
  });
});

describe('sources', () => {
  it('starts each kind with the body the papers print', () => {
    const bodies = Object.fromEntries(SOURCE_KINDS.map((kind) => [kind, createSourceOf(kind, 'C').blocks]));
    expect(bodies.table.map((b) => b.kind)).toEqual(['table']);
    expect(bodies.text.map((b) => b.kind)).toEqual(['paragraph']);
    expect(bodies.views[0]).toMatchObject({ kind: 'table', columnWidths: [0.3, 0.7] });
    for (const figure of ['barChart', 'lineChart', 'forum', 'stakeholders'] as const) {
      expect(bodies[figure][0]).toMatchObject({ kind: 'diagram', align: 'center' });
    }
    expect(createSourceOf('table', 'C').label).toEqual(bi('Source C: ', '資料C：'));
  });

  it('a views table names who speaks and leaves what they say to the teacher', () => {
    const views = createSourceOf('views').blocks[0];
    if (views.kind !== 'table') throw new Error('expected a table');
    expect(views.rows.map((row) => plain(row.cells[0].text.en))).toEqual(['A shop owner', 'An economist', 'A government official']);
    expect(views.rows.every((row) => plain(row.cells[1].text.en) === '' && plain(row.cells[1].text.zh) === '')).toBe(true);
  });

  it('letters the next source after those already there', () => {
    expect(nextLetterIn([createParagraphBlock()])).toBe('A');
    expect(nextLetterIn([createSourceBlock('A'), createParagraphBlock(), createSourceBlock('B')])).toBe('C');
  });

  it('reads a source letter from its caption, else from its place', () => {
    const renamed = { ...createSourceBlock('A'), label: bi('Source F: Exchange rates', '資料F：匯率') };
    expect(sourceLetter(renamed, 0)).toBe('F');
    expect(sourceLetter({ ...createSourceBlock(), label: bi('', '資料 E：') }, 0)).toBe('E');
    expect(sourceLetter({ ...createSourceBlock(), label: undefined }, 2)).toBe('C');
  });
});

describe('the essay note', () => {
  it('names the part and is recognised in either language', () => {
    const note = essayNote('(d)');
    expect(plain(note.en)).toMatch(/^For part \(d\), candidates are required to present their answers in an essay form\./);
    expect(plain(note.zh)).toMatch(/^\(d\)部須以短文形式作答/);
    const part = createStructuredQuestion().parts[0];
    expect(hasEssayNote(part)).toBe(false);
    expect(hasEssayNote({ ...part, blocksBefore: [createParagraphBlock(note)] })).toBe(true);
    expect(hasEssayNote({ ...part, blocksBefore: [createParagraphBlock(bi('', plain(note.zh)))] })).toBe(true);
  });
});

describe('the DRQ starter', () => {
  it('builds Sources A–D and parts (a)–(e) worth 28 marks, shaped like the papers', () => {
    const question = createDrqQuestion();
    const sources = question.blocks.filter((block) => block.kind === 'source');
    expect(sources.map((source, i) => sourceLetter(source as Extract<ContentBlock, { kind: 'source' }>, i))).toEqual(['A', 'B', 'C', 'D']);
    expect(question.parts.map((part) => referencedSources(part.blocks))).toEqual([['A'], ['B'], ['C', 'D'], ['D'], []]);
    expect(question.parts.map((part) => part.marks)).toEqual([2, 3, 5, 4, 14]);
    // (c): two sub-parts sharing the part's one label, as 2024 (c) and 2025 (b) print it.
    expect(question.parts[2].subParts?.map((sub) => sub.marks)).toEqual([undefined, undefined]);
    expect(questionMarks(question)).toBe(28);
    // (e): the essay note before it, and a two-row strategy table in it.
    expect(hasEssayNote(question.parts[4])).toBe(true);
    const table = question.parts[4].blocks.find((block) => block.kind === 'table');
    expect(table?.kind === 'table' && table.rows.map((row) => plain(row.cells[0].text.en))).toEqual(['Strategy 1', 'Strategy 2']);
  });

  it('gives every block a fresh id each time', () => {
    const ids = (content: ReturnType<typeof createDrqContent>) => JSON.stringify(content).match(/"id":"[^"]+"/g) ?? [];
    const a = ids(createDrqContent());
    const b = new Set(ids(createDrqContent()));
    expect(new Set(a).size).toBe(a.length);
    expect(a.some((id) => b.has(id))).toBe(false);
  });

  it('is offered only while the question is still blank', () => {
    const blank = createStructuredQuestion();
    expect(isBlankStructured(blank)).toBe(true);
    expect(isBlankStructured({ ...blank, parts: [] })).toBe(true);
    expect(isBlankStructured({ ...blank, blocks: [createParagraphBlock(bi('Hong Kong…', ''))] })).toBe(false);
    expect(isBlankStructured({ ...blank, blocks: [createSourceBlock()] })).toBe(false);
    expect(isBlankStructured({ ...blank, ...createDrqContent() })).toBe(false);
  });
});

describe('the DRQ starter and saved documents', () => {
  it('saves at schema 3 only because of its bar chart, and at 1 without it', async () => {
    const { CURRENT_SCHEMA_VERSION, writtenSchemaVersion } = await import('./migrations');
    const { createWorksheet } = await import('./factories');
    const worksheet = createWorksheet();
    const question = createDrqQuestion();
    const withChart = { ...worksheet, questions: [question], flow: [{ type: 'question' as const, id: question.id }] };
    const chart = question.blocks.find((block) => block.kind === 'source' && block.blocks[0]?.kind === 'diagram');
    expect(chart && chart.kind === 'source' && chart.blocks[0].kind === 'diagram' && chart.blocks[0].diagram.chart?.kind).toBe('bar');
    expect(writtenSchemaVersion(CURRENT_SCHEMA_VERSION, withChart)).toBe(3);
    // Everything else the starter adds (tables, views, text, the essay note) is schema 1.
    const noChart = { ...question, blocks: question.blocks.filter((block) => block !== chart) };
    expect(writtenSchemaVersion(CURRENT_SCHEMA_VERSION, { ...withChart, questions: [noChart] })).toBe(1);
  });
});
