import { describe, expect, it } from 'vitest';
import '@/registry';
import { BLANK_LINE_PT, endsInBlankLine, type RenderNode } from './ir';
import {
  boundaryGapLines,
  defaultGapLines,
  gapAboveStatus,
  gapNumberApplies,
  stimulusGapLines,
  type PreviousItem,
} from './questionGap';
import { renderWorksheet } from './worksheet';
import { createWorksheet } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { documentShape, type DocumentShape } from '@/model/documentShape';
import { migrate } from '@/model/migrations';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { bi, rt } from '@/model/text';
import type {
  LayoutElement,
  McqQuestion,
  OutputMode,
  Question,
  StructuredQuestion,
  Worksheet,
} from '@/model/types';
import v1Corpus from '@/test/corpus/v1-published.json';
import v2Corpus from '@/test/corpus/v2-published.json';
import optionalCorpus from '@/test/corpus/v2-optional-sections.json';
import bankPaperCorpus from '@/test/corpus/bank-v0.6.0-paper.json';

/**
 * Space between questions on every paper shape (format-settings.md § 4.2, built as #2).
 *
 * Until now the wide boundary existed on a Paper 1 only: a classroom worksheet or a booklet
 * printed one blank line between questions whatever the teacher wished. Now the *number* is
 * the teacher's on every shape — Setup → Between questions (`Worksheet.examGapLines`) and a
 * question's Space above (`gapBefore`) — under the Paper 1 rule: straight under a question of
 * the same type, never the first item, never across a heading or a page break. What stays the
 * exam paper's is the *default*: every other shape defaults to one line, so a saved paper that
 * carries no number prints exactly as it did.
 *
 * The three backends read the gap off the IR (`withLeadingGap`), so this file proves the rule
 * and the IR; `questionGapSurfaces.test.tsx` proves each surface draws it.
 */

const EN: OutputMode = { language: 'en', version: 'student' };

// ── fixtures ────────────────────────────────────────────────────────────────

const mcq = (id: string): McqQuestion => ({
  id,
  type: 'mcq',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`stem ${id}`), zh: [] } }],
  options: [
    { id: `${id}-o1`, text: { en: rt('one'), zh: [] } },
    { id: `${id}-o2`, text: { en: rt('two'), zh: [] } },
    { id: `${id}-o3`, text: { en: rt('three'), zh: [] } },
    { id: `${id}-o4`, text: { en: rt('four'), zh: [] } },
  ],
  answerIndex: 0,
  marks: 1,
});

const structured = (id: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion => ({
  id,
  type: 'structured',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: bi(`Stem ${id}`, '') }],
  parts: [{ id: `${id}-p`, blocks: [{ id: `${id}-pb`, kind: 'paragraph', text: bi('part a', '') }], marks: 2 }],
  ...extra,
});

const note = (id = 'note'): LayoutElement => ({ id, kind: 'text', text: bi('A note', '') });
const heading = (id = 'head'): LayoutElement => ({ id, kind: 'section', text: bi('Section A', ''), restartNumbering: false });
const pageBreak = (id = 'brk'): LayoutElement => ({ id, kind: 'pageBreak' });
const stimulus = (id = 'stim'): LayoutElement => ({ ...createStimulusElement(), id });

const isLayout = (item: Question | LayoutElement): item is LayoutElement => 'kind' in item;

/** The four document types the new-paper wizard offers, as a bare document of that shape. */
const base = (documentType: DocumentType): Worksheet => createWorksheetFrom({ documentType, seedSample: false });

/** `items` as the document's whole flow, in order, with nothing else in it. */
function paper(from: Worksheet, items: Array<Question | LayoutElement>, extra: Partial<Worksheet> = {}): Worksheet {
  return {
    ...from,
    ...extra,
    questions: items.filter((item): item is Question => !isLayout(item)),
    layout: items.filter(isLayout),
    flow: items.map((item) => ({ type: isLayout(item) ? ('layout' as const) : ('question' as const), id: item.id })),
  } as Worksheet;
}

/** Blank lines standing above a node list: its first paragraph's `spaceBefore`, in lines. */
function gapAbove(nodes: RenderNode[]): number {
  const first = nodes[0];
  const pt =
    first?.kind === 'text' ? first.format?.spaceBefore : first?.kind === 'columns' ? first.spaceBefore : undefined;
  return pt === undefined ? 0 : pt / BLANK_LINE_PT;
}

/** The gap above flow item `index` (questions and layout elements, in order). */
function gapOfItem(worksheet: Worksheet, index: number, mode: OutputMode = EN): number {
  const item = renderWorksheet(worksheet, mode).items[index];
  return gapAbove(item.type === 'question' ? item.question.nodes : item.layout.nodes);
}

/** The shapes, each with a name and the document that is that shape. */
const SHAPES: Array<{ name: string; shape: DocumentShape; make: () => Worksheet }> = [
  { name: 'classroom worksheet', shape: 'classroom', make: () => base('classroom') },
  { name: 'LQ worksheet', shape: 'classroom', make: () => base('lqWorksheet') },
  { name: 'booklet', shape: 'lqMock', make: () => base('lqMock') },
  { name: 'Paper 1', shape: 'paper1', make: () => base('paper1') },
];

it('builds each fixture as the shape it names', () => {
  for (const { name, shape, make } of SHAPES) expect(documentShape(make()), name).toBe(shape);
});

// ── the rule on every shape ─────────────────────────────────────────────────

describe.each(SHAPES)('between questions on a $name', ({ shape, make }) => {
  const paper1 = shape === 'paper1';

  it(paper1 ? 'defaults to the reference paper’s three lines' : 'defaults to one line, as every saved paper prints', () => {
    expect(gapOfItem(paper(make(), [mcq('a'), mcq('b')]), 1)).toBe(paper1 ? 3 : 1);
  });

  it('takes the paper’s number between two questions of one type', () => {
    for (const lines of [2, 4, 6]) {
      const w = paper(make(), [mcq('a'), mcq('b')], { examGapLines: lines });
      expect(gapOfItem(w, 1), `MC, ${lines} lines`).toBe(lines);
      const long = paper(make(), [structured('a'), structured('b')], { examGapLines: lines });
      expect(gapOfItem(long, 1), `structured, ${lines} lines`).toBe(lines);
    }
  });

  it('lets one question state its own gap over the paper’s', () => {
    const w = paper(make(), [mcq('a'), { ...mcq('b'), gapBefore: 2 }, mcq('c')], { examGapLines: 5 });
    expect([gapOfItem(w, 1), gapOfItem(w, 2)]).toEqual([2, 5]);
    const long = paper(make(), [structured('a'), { ...structured('b'), gapBefore: 7 }], { examGapLines: 2 });
    expect(gapOfItem(long, 1)).toBe(7);
  });

  it('reaches a question of another kind not at all: an MC under a structured question keeps one line', () => {
    const mixed = paper(make(), [mcq('a'), structured('b'), mcq('c')], { examGapLines: 4 });
    expect([gapOfItem(mixed, 1), gapOfItem(mixed, 2)]).toEqual([1, 1]);
    const own = paper(make(), [structured('a'), { ...mcq('b'), gapBefore: 6 }]);
    expect(gapOfItem(own, 1)).toBe(1);
  });

  it('keeps the ordinary spacing across a heading, a note or a page break', () => {
    for (const between of [heading(), note(), pageBreak()]) {
      const w = paper(make(), [mcq('a'), between, mcq('b')], { examGapLines: 4 });
      expect(gapOfItem(w, 2), between.kind).toBe(1);
    }
  });

  it('never widens the first question, which has nothing above it to be separated from', () => {
    const w = paper(make(), [{ ...mcq('a'), gapBefore: 6 }, mcq('b')], { examGapLines: 5 });
    const bare = { ...w, bands: [], cover: undefined, title: { en: [], zh: [] }, instructions: { en: [], zh: [] } } as Worksheet;
    // A paper with something printed above the flow gives it the ordinary single line.
    expect(gapOfItem({ ...w, title: bi('Paper', '') } as Worksheet, 0)).toBeLessThanOrEqual(1);
    expect(gapOfItem(bare, 0)).toBe(0);
  });

  it('reads a number below one line, or a broken one, as one line', () => {
    for (const bad of [0, 0.5, -3, Number.NaN]) {
      const w = paper(make(), [mcq('a'), mcq('b')], { examGapLines: bad });
      expect(gapOfItem(w, 1), String(bad)).toBe(1);
    }
  });

  it('treats an explicit one line like no number, off the exam paper', () => {
    if (paper1) return;
    const items = [mcq('a'), mcq('b'), structured('c'), structured('d')];
    const none = renderWorksheet(paper(make(), items), EN);
    const one = renderWorksheet(paper(make(), items, { examGapLines: 1 }), EN);
    expect(JSON.stringify(one.items)).toBe(JSON.stringify(none.items));
  });

  it('counts a line the question above already spent, as every gap does', () => {
    const ended = structured('a', {
      parts: [{ id: 'p', blocks: [{ id: 'pb', kind: 'paragraph', text: { en: rt('part a\n'), zh: [] } }], marks: 2 }],
    });
    const rendered = renderWorksheet(paper(make(), [ended, structured('b')], { examGapLines: 4 }), EN);
    expect(endsInBlankLine(rendered.questions[0].nodes)).toBe(true);
    // The break prints its own line; the boundary owes the other three.
    expect(gapAbove(rendered.questions[1].nodes)).toBe(3);
  });

  it('reports the boundary a number sets, straight under a like question and nowhere else', () => {
    const w = paper(make(), [mcq('a'), mcq('b'), structured('c'), note(), structured('d')], { examGapLines: 3 });
    const adjustable = renderWorksheet(w, EN).questions.map((q) => q.adjustableGap);
    // MC under nothing, MC under MC, structured under MC, structured under a note.
    expect(adjustable[0]).toBeUndefined();
    expect(adjustable[1]).toBe(3);
    expect(adjustable[2]).toBeUndefined();
    expect(adjustable[3]).toBeUndefined();
  });

  it('lets a change of number reach the page at once, with no stale question handed back', () => {
    const items = [mcq('a'), mcq('b')];
    const lines = [3, 5, undefined, 2].map((examGapLines) =>
      gapOfItem(paper(make(), items, examGapLines === undefined ? {} : { examGapLines }), 1),
    );
    expect(lines).toEqual([3, 5, paper1 ? 3 : 1, 2]);
  });
});

describe('the lead-in above a source', () => {
  it('stands off from the question above by the paper’s number on every shape', () => {
    for (const { name, make } of SHAPES) {
      const w = paper(make(), [mcq('a'), stimulus(), mcq('b'), mcq('c')], { examGapLines: 4 });
      expect(gapOfItem(w, 1), name).toBe(4);
    }
  });

  it('keeps the one line it always had when nobody chose a number, off the exam paper', () => {
    for (const { name, shape, make } of SHAPES.filter(({ shape }) => shape !== 'paper1')) {
      const w = paper(make(), [mcq('a'), stimulus(), mcq('b')]);
      expect([gapOfItem(w, 1), gapOfItem(w, 2)], `${name} (${shape})`).toEqual([1, 1]);
    }
  });

  it('does not widen the question under it: that is the reference paper’s own measured rhythm', () => {
    const classroom = paper(base('classroom'), [mcq('a'), stimulus(), mcq('b')], { examGapLines: 4 });
    expect(gapOfItem(classroom, 2)).toBe(1);
    const paper1 = paper(base('paper1'), [mcq('a'), stimulus(), mcq('b')], { examGapLines: 4 });
    expect(gapOfItem(paper1, 2)).toBe(2);
  });

  it('takes no gap from a question’s own number, which belongs to questions', () => {
    const w = paper(base('classroom'), [mcq('a'), stimulus(), { ...mcq('b'), gapBefore: 6 }]);
    expect(gapOfItem(w, 1)).toBe(1);
  });
});

// ── a saved paper does not move ─────────────────────────────────────────────

/**
 * The rule exactly as 0.8.4 shipped it, frozen here so "a paper nobody set a number on prints
 * as it did" is checked against the old behaviour itself, not against a restatement of the new.
 */
function legacyBoundary(
  shape: DocumentShape,
  previous: PreviousItem | undefined,
  next: Question,
  override: number | undefined,
  typeDefault: number | undefined,
): number {
  if (shape !== 'paper1' || !previous) return 1;
  if (previous.layout) {
    return previous.layout.kind === 'questionCount' || previous.layout.kind === 'stimulus' ? 2 : 1;
  }
  if (previous.question?.type !== next.type) return 1;
  const wide = next.gapBefore ?? override ?? typeDefault;
  return wide !== undefined && wide > 1 ? wide : 1;
}

function legacyStimulus(
  shape: DocumentShape,
  previous: PreviousItem | undefined,
  override: number | undefined,
  typeDefault: number | undefined,
): number {
  if (shape !== 'paper1' || !previous?.question) return 1;
  const wide = override ?? typeDefault;
  return wide !== undefined && wide > 1 ? wide : 1;
}

describe('a saved paper keeps its pagination', () => {
  const SHAPE_NAMES: DocumentShape[] = ['classroom', 'paper1', 'lqWorksheet', 'lqMock'];
  const previousItems: Array<[string, PreviousItem | undefined]> = [
    ['nothing', undefined],
    ['an MC', { question: mcq('p') }],
    ['a structured question', { question: structured('p') }],
    ...(['questionCount', 'stimulus', 'text', 'section', 'pageBreak', 'spacer', 'answerSpace'] as const).map(
      (kind): [string, PreviousItem] => [`a ${kind}`, { layout: { id: 'l', kind } as LayoutElement }],
    ),
  ];
  const nexts: Array<[string, Question]> = [['an MC', mcq('n')], ['a structured question', structured('n')]];
  /** The measured number the MC type states for a Paper 1; the other type states none. */
  const typeDefault = (question: Question) => (question.type === 'mcq' ? 3 : undefined);

  it('prints the boundary above every question as before wherever no number is stored', () => {
    let compared = 0;
    for (const shape of SHAPE_NAMES) {
      for (const [above, previous] of previousItems) {
        for (const [below, next] of nexts) {
          const legacy = legacyBoundary(shape, previous, next, undefined, shape === 'paper1' ? typeDefault(next) : undefined);
          expect(boundaryGapLines(shape, previous, next), `${shape}: ${below} under ${above}`).toBe(legacy);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(SHAPE_NAMES.length * previousItems.length * nexts.length);
  });

  it('prints a lead-in above a source as before wherever no number is stored', () => {
    for (const shape of SHAPE_NAMES) {
      for (const [above, previous] of previousItems) {
        const legacy = legacyStimulus(shape, previous, undefined, previous?.question ? (shape === 'paper1' ? typeDefault(previous.question) : undefined) : undefined);
        expect(stimulusGapLines(shape, previous), `${shape}: source under ${above}`).toBe(legacy);
      }
    }
  });

  it('leaves a Paper 1 exactly as it was, with a number stored or not', () => {
    for (const [above, previous] of previousItems) {
      for (const [below, next] of nexts) {
        for (const override of [undefined, 1, 2, 5]) {
          for (const own of [undefined, 1, 4]) {
            const asked = own === undefined ? next : ({ ...next, gapBefore: own } as Question);
            expect(
              boundaryGapLines('paper1', previous, asked, override),
              `Paper 1: ${below} under ${above}, paper ${override}, own ${own}`,
            ).toBe(legacyBoundary('paper1', previous, asked, override, typeDefault(next)));
          }
        }
      }
    }
  });

  it('reads a stored number only straight under a like question, on the shapes that never read one', () => {
    for (const shape of ['classroom', 'lqMock'] as DocumentShape[]) {
      for (const [above, previous] of previousItems) {
        for (const [below, next] of nexts) {
          const asked = { ...next, gapBefore: 5 } as Question;
          const widened = boundaryGapLines(shape, previous, asked, 4);
          const straightUnderLike = previous?.question?.type === next.type;
          expect(widened, `${shape}: ${below} under ${above}`).toBe(straightUnderLike ? 5 : 1);
        }
      }
    }
  });

  it('renders every frozen corpus paper with one line between its questions, in every language', () => {
    const corpora: Array<[string, unknown]> = [
      ['v1-published', v1Corpus],
      ['v2-published', v2Corpus],
      ['v2-optional-sections', optionalCorpus],
      ['bank-v0.6.0-paper', bankPaperCorpus],
    ];
    for (const [name, json] of corpora) {
      const worksheet = migrate(structuredClone(json) as Parameters<typeof migrate>[0]);
      // The premise: papers saved by released builds carry no number of this kind, so the new
      // rule has nothing to read in them and their boundaries are the default.
      expect(worksheet.examGapLines, `${name} examGapLines`).toBeUndefined();
      expect(worksheet.questions.some((q) => q.gapBefore !== undefined), `${name} gapBefore`).toBe(false);
      expect(documentShape(worksheet), name).not.toBe('paper1');
      for (const language of ['en', 'zh', 'bilingual'] as const) {
        const rendered = renderWorksheet(worksheet, { language, version: 'teacher' });
        rendered.items.forEach((item, index) => {
          const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
          expect(gapAbove(nodes), `${name} ${language} item ${index}`).toBeLessThanOrEqual(1);
        });
        for (const question of rendered.questions) {
          expect(question.adjustableGap === undefined || question.adjustableGap === 1, name).toBe(true);
        }
      }
    }
  });
});

// ── the labels and the notes the controls print ─────────────────────────────

describe('what the controls say', () => {
  it('names the default the shape gives a question', () => {
    expect(defaultGapLines('paper1', mcq('a'))).toBe(3);
    expect(defaultGapLines('paper1', structured('a'))).toBe(1);
    expect(defaultGapLines('classroom', mcq('a'))).toBe(1);
    expect(defaultGapLines('lqMock', structured('a'))).toBe(1);
  });

  it('says a number applies straight under a like question', () => {
    expect(gapNumberApplies({ question: mcq('a') }, mcq('b'))).toBe(true);
    expect(gapNumberApplies({ question: structured('a') }, mcq('b'))).toBe(false);
    expect(gapNumberApplies({ layout: note() }, mcq('b'))).toBe(false);
    expect(gapNumberApplies(undefined, mcq('b'))).toBe(false);
  });

  it('says why a number does not apply, from the same flow the page reads', () => {
    const w = paper(createWorksheet(), [mcq('a'), mcq('b'), structured('c'), note('n'), structured('d'), heading('h'), mcq('e')]);
    expect(gapAboveStatus(w, 'a')).toBe('first');
    expect(gapAboveStatus(w, 'b')).toBe('applies');
    expect(gapAboveStatus(w, 'c')).toBe('unlikeAbove');
    expect(gapAboveStatus(w, 'd')).toBe('afterElement');
    expect(gapAboveStatus(w, 'e')).toBe('afterElement');
  });

  it('says a like question that starts a new page has no air above it, whatever number it holds', () => {
    // The walker stamps no gap on what opens a sheet (`startOnNewPage`), so a number stored on it
    // would be a choice that quietly does nothing; the panel says so.
    const asks = <Q extends Question>(question: Q): Q => ({ ...question, startOnNewPage: true });
    const w = paper(createWorksheet(), [mcq('a'), asks(mcq('b')), mcq('c')]);
    expect(gapAboveStatus(w, 'b')).toBe('startsPage');
    expect(gapAboveStatus(w, 'c')).toBe('applies');
    // Where another reason already applies, that one is the more useful thing to say.
    const first = paper(createWorksheet(), [asks(mcq('a')), mcq('b')]);
    expect(gapAboveStatus(first, 'a')).toBe('first');
    const unlike = paper(createWorksheet(), [mcq('a'), asks(structured('s'))]);
    expect(gapAboveStatus(unlike, 's')).toBe('unlikeAbove');
  });

  it('follows a reorder', () => {
    const w = paper(createWorksheet(), [mcq('a'), structured('c'), mcq('b')]);
    expect(gapAboveStatus(w, 'b')).toBe('unlikeAbove');
    expect(gapAboveStatus(paper(createWorksheet(), [mcq('a'), mcq('b'), structured('c')]), 'b')).toBe('applies');
  });

  it('stays quiet about a question it cannot find', () => {
    expect(gapAboveStatus(paper(createWorksheet(), [mcq('a')]), 'gone')).toBe('applies');
  });
});
