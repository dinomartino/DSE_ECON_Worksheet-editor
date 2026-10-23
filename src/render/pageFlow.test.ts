import { describe, expect, it } from 'vitest';
import '@/registry';
import { documentShape } from '@/model/documentShape';
import { createStimulusElement, resolveFlow } from '@/model/flow';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { bi, rt } from '@/model/text';
import type { LayoutElement, McqQuestion, OutputMode, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { requireQuestionType } from '@/registry';
import { BLANK_LINE_PT, type RenderNode } from './ir';
import { isKeptWhole, sheetOpeners, startsPageStatus } from './pageFlow';
import { renderWorksheet } from './worksheet';

/**
 * What a question asks of its page (format-settings.md § 4.3, built as #3): to start a new one
 * (`startOnNewPage`) or to be kept on one (`keepOnOnePage`). This file proves the rules and the
 * IR marks the walker derives from them; `pagination.test.ts` proves what the paginator does with
 * the marks, and `pageFlowSurfaces.test.tsx` what each backend then draws.
 */

const EN: OutputMode = { language: 'en', version: 'student' };

// ── fixtures ────────────────────────────────────────────────────────────────

const mcq = (id: string, extra: Partial<McqQuestion> = {}): McqQuestion => ({
  id,
  type: 'mcq',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`stem ${id}`), zh: [] } }],
  options: ['one', 'two', 'three', 'four'].map((text, i) => ({ id: `${id}-o${i}`, text: { en: rt(text), zh: [] } })),
  answerIndex: 0,
  marks: 1,
  ...extra,
});

const structured = (id: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion => ({
  id,
  type: 'structured',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: bi(`Stem ${id}`, '') }],
  parts: [{ id: `${id}-p`, blocks: [{ id: `${id}-pb`, kind: 'paragraph', text: bi('part a', '') }], marks: 2 }],
  ...extra,
});

const section = (id = 'sec'): LayoutElement => ({ id, kind: 'section', text: bi('Section A', ''), restartNumbering: false });
const heading = (id = 'head'): LayoutElement => ({ id, kind: 'heading', text: bi('A heading', '') });
const partHeader = (id = 'ph'): LayoutElement => ({ id, kind: 'partHeader', text: bi('Part A', '') });
const note = (id = 'note'): LayoutElement => ({ id, kind: 'text', text: bi('A note', '') });
const pageBreak = (id = 'brk'): LayoutElement => ({ id, kind: 'pageBreak' });
const stimulus = (id = 'stim'): LayoutElement => ({ ...createStimulusElement(), id });

const isLayout = (item: Question | LayoutElement): item is LayoutElement => 'kind' in item;
const base = (documentType: DocumentType = 'classroom'): Worksheet =>
  createWorksheetFrom({ documentType, seedSample: false });

/** `items` as the document's whole flow, in order, with nothing else in it. */
function paper(items: Array<Question | LayoutElement>, from: Worksheet = base(), extra: Partial<Worksheet> = {}): Worksheet {
  return {
    ...from,
    ...extra,
    questions: items.filter((item): item is Question => !isLayout(item)),
    layout: items.filter(isLayout),
    flow: items.map((item) => ({ type: isLayout(item) ? ('layout' as const) : ('question' as const), id: item.id })),
  } as Worksheet;
}

/** The flow item ids that open a sheet, in order. */
const openersOf = (worksheet: Worksheet): string[] => {
  const flow = resolveFlow(worksheet);
  return [...sheetOpeners(flow)].sort((a, b) => a - b).map((index) => flow[index].id);
};

// ── what is kept whole without asking ───────────────────────────────────────

describe('what a paper keeps on one page without being asked', () => {
  it('keeps every question of a Paper 1 and every question of a kind that asks for it', () => {
    expect(isKeptWhole('paper1', { keepWhole: undefined })).toBe(true);
    expect(isKeptWhole('classroom', { keepWhole: true })).toBe(true);
    expect(isKeptWhole('lqMock', { keepWhole: true })).toBe(true);
  });

  it('leaves a structured question on a worksheet or a booklet free to split', () => {
    const definition = requireQuestionType(structured('s'));
    for (const shape of ['classroom', 'lqMock', 'lqWorksheet'] as const) {
      expect(isKeptWhole(shape, definition), shape).toBe(false);
    }
  });

  it('is the registry’s answer for an MC, on every shape', () => {
    const definition = requireQuestionType(mcq('m'));
    for (const shape of ['classroom', 'lqMock', 'lqWorksheet', 'paper1'] as const) {
      expect(isKeptWhole(shape, definition), shape).toBe(true);
    }
  });
});

// ── where a sheet opens ─────────────────────────────────────────────────────

describe('where a question that starts a page opens its sheet', () => {
  it('opens it at the question, between two questions', () => {
    const w = paper([structured('a'), structured('b', { startOnNewPage: true }), structured('c')]);
    expect(openersOf(w)).toEqual(['b']);
    expect(startsPageStatus(w, 'b')).toBe('applies');
  });

  it('opens one for each question that asks, and none for a question that does not', () => {
    const w = paper([
      structured('a'),
      structured('b', { startOnNewPage: true }),
      structured('c'),
      mcq('d', { startOnNewPage: true }),
      structured('e', { startOnNewPage: true }),
    ]);
    expect(openersOf(w)).toEqual(['b', 'd', 'e']);
  });

  it('reads only a stored true: false, a string or nothing is not a request', () => {
    const w = paper([
      structured('a'),
      structured('b', { startOnNewPage: false }),
      { ...structured('c'), startOnNewPage: 'yes' } as unknown as Question,
      structured('d'),
    ]);
    expect(openersOf(w)).toEqual([]);
  });

  it('takes the heading straight above along, so a page never starts under a stranded heading', () => {
    for (const above of [section(), heading(), partHeader()]) {
      const w = paper([structured('a'), above, structured('b', { startOnNewPage: true })]);
      expect(openersOf(w), above.kind).toEqual([above.id]);
      expect(startsPageStatus(w, 'b'), above.kind).toBe('applies');
    }
  });

  it('takes a stack of headings, and a shared source with its lead-in, along', () => {
    const w = paper([structured('a'), section(), partHeader(), structured('b', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual(['sec']);
    const shared = paper([structured('a'), stimulus(), structured('b', { startOnNewPage: true })]);
    expect(openersOf(shared)).toEqual(['stim']);
  });

  it('takes the rubric under a heading along: a note that sits between a heading and its question belongs to it', () => {
    const w = paper([structured('a'), section(), note('rubric'), structured('b', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual(['sec']);
    const two = paper([structured('a'), section(), note('r1'), { id: 'sp', kind: 'spacer', heightPt: 12 }, note('r2'), structured('b', { startOnNewPage: true })]);
    expect(openersOf(two)).toEqual(['sec']);
  });

  it('leaves behind the closing line of the section above, which stands above the next heading', () => {
    // A booklet's "END OF SECTION A" is a text element, as a rubric is; only the heading's own run travels.
    const w = paper([structured('a'), { id: 'room', kind: 'answerSpace', lines: 5, fill: true }, note('end'), section(), structured('b', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual(['sec']);
  });

  it('takes the exam paper’s lead-in along, so the first question never strands it', () => {
    const lead: LayoutElement = { id: 'lead', kind: 'questionCount' };
    const first = paper([lead, mcq('a', { startOnNewPage: true }), mcq('b')]);
    expect(openersOf(first)).toEqual([]);
    expect(startsPageStatus(first, 'a')).toBe('first');
    // A later question has the lead-in far above it, behind a question, so it opens alone.
    const later = paper([lead, mcq('a'), mcq('b', { startOnNewPage: true })]);
    expect(openersOf(later)).toEqual(['b']);
  });

  it('stops at a page break: what stands above one is on the page before it', () => {
    const w = paper([structured('a'), section('s1'), pageBreak(), note('n'), structured('b', { startOnNewPage: true })]);
    // The note is under a break and has no heading in its run, so the question opens a sheet alone.
    expect(openersOf(w)).toEqual(['b']);
  });

  it('leaves a note, a divider, a blank space and a writing room on the page above', () => {
    const others: LayoutElement[] = [
      note(),
      { id: 'div', kind: 'divider' },
      { id: 'sp', kind: 'spacer', heightPt: 24 },
      { id: 'al', kind: 'answerLines', lines: 3 },
      { id: 'as', kind: 'answerSpace', lines: 3 },
    ];
    for (const above of others) {
      const w = paper([structured('a'), above, structured('b', { startOnNewPage: true })]);
      expect(openersOf(w), above.kind).toEqual(['b']);
    }
  });

  it('does nothing for the first question, which already opens the paper', () => {
    const w = paper([structured('a', { startOnNewPage: true }), structured('b')]);
    expect(openersOf(w)).toEqual([]);
    expect(startsPageStatus(w, 'a')).toBe('first');
  });

  it('does nothing for a question whose heading opens the paper', () => {
    const w = paper([section(), structured('a', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual([]);
    expect(startsPageStatus(w, 'a')).toBe('first');
  });

  it('does not push the first question off the title page: a title page is a New page element', () => {
    const w = paper([structured('a', { startOnNewPage: true })], base(), { title: bi('A worksheet', ''), instructions: bi('Answer all.', '') });
    expect(openersOf(w)).toEqual([]);
    const rendered = renderWorksheet(w, EN);
    expect(rendered.items.some((item) => (item.type === 'question' ? item.question.startsPage : item.layout.startsPage))).toBe(false);
  });

  it('adds nothing under a New page break, which already starts a page', () => {
    const w = paper([structured('a'), pageBreak(), structured('b', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual([]);
    expect(startsPageStatus(w, 'b')).toBe('afterBreak');
  });

  it('adds nothing for a heading that sits under a New page break either', () => {
    const w = paper([structured('a'), pageBreak(), section(), structured('b', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual([]);
    expect(startsPageStatus(w, 'b')).toBe('afterBreak');
  });

  it('still opens one when the break is further up, with a question between', () => {
    const w = paper([structured('a'), pageBreak(), structured('b'), structured('c', { startOnNewPage: true })]);
    expect(openersOf(w)).toEqual(['c']);
  });

  it('follows a reorder: the request travels with the question, not with the place', () => {
    const w = paper([structured('a'), structured('b', { startOnNewPage: true }), structured('c')]);
    const moved: Worksheet = {
      ...w,
      questions: [w.questions[1], w.questions[0], w.questions[2]],
      flow: [w.flow[1], w.flow[0], w.flow[2]],
    };
    // b is first now, so it opens the paper; the request is dormant, not lost.
    expect(openersOf(moved)).toEqual([]);
    expect(moved.questions[0].startOnNewPage).toBe(true);
    const again: Worksheet = { ...moved, questions: [moved.questions[1], moved.questions[2], moved.questions[0]], flow: [moved.flow[1], moved.flow[2], moved.flow[0]] };
    expect(openersOf(again)).toEqual(['b']);
  });

  it('says nothing about a question it cannot find', () => {
    expect(startsPageStatus(paper([structured('a')]), 'gone')).toBe('applies');
  });

  it('agrees with the page: the flow the walker reads is the flow the panel reads', () => {
    const w = paper([structured('a'), note(), section(), structured('b', { startOnNewPage: true })]);
    const rendered = renderWorksheet(w, EN);
    const marked = rendered.items
      .filter((item) => (item.type === 'question' ? item.question.startsPage : item.layout.startsPage))
      .map((item) => (item.type === 'question' ? item.question.questionId : item.layout.elementId));
    expect(marked).toEqual(openersOf(w));
  });
});

describe('a layout element that keeps with the next one also travels with it', () => {
  // The paginator already holds a heading with what follows when a page fills up (the last node's
  // `keepNext`). A request for a new page must not strand one either, so every kind that keeps
  // with the next in the IR has to travel. (A shared source travels as well, though its last node
  // is free: it introduces the questions under it.)
  const kinds: LayoutElement[] = [
    section(), heading(), partHeader(), note(), pageBreak(), stimulus(),
    { id: 'div', kind: 'divider' },
    { id: 'sp', kind: 'spacer', heightPt: 24 },
    { id: 'al', kind: 'answerLines', lines: 3 },
    { id: 'as', kind: 'answerSpace', lines: 3 },
    { id: 'qc', kind: 'questionCount' },
  ];

  it.each(kinds)('$kind', (element) => {
    const w = paper([structured('a'), element, structured('b', { startOnNewPage: true })]);
    const rendered = renderWorksheet(w, EN);
    const item = rendered.items[1];
    expect(item.type).toBe('layout');
    const nodes: RenderNode[] = item.type === 'layout' ? item.layout.nodes : [];
    const last = nodes[nodes.length - 1];
    const keepsWithNext = Boolean(last && 'keepNext' in last && last.keepNext);
    const travels = openersOf(w).includes(element.id);
    if (keepsWithNext) expect(travels, `${element.kind} keeps with the next in the IR`).toBe(true);
    // And nothing else travels but the kinds named: a break is never hidden behind a divider.
    if (!['section', 'heading', 'partHeader', 'stimulus', 'questionCount'].includes(element.kind)) expect(travels).toBe(false);
  });
});

// ── what the walker derives ─────────────────────────────────────────────────

describe('the marks the walker puts on the IR', () => {
  const lineAbove = (nodes: RenderNode[]) => {
    const first = nodes[0];
    return first?.kind === 'text' ? (first.format?.spaceBefore ?? 0) / BLANK_LINE_PT : 0;
  };

  it('marks the question that opens a sheet, and no other item', () => {
    const w = paper([structured('a'), structured('b', { startOnNewPage: true }), structured('c')]);
    const rendered = renderWorksheet(w, EN);
    expect(rendered.questions.map((q) => q.startsPage)).toEqual([undefined, true, undefined]);
  });

  it('marks the heading rather than the question when a heading travels with it', () => {
    const w = paper([structured('a'), section(), structured('b', { startOnNewPage: true })]);
    const items = renderWorksheet(w, EN).items;
    expect(items[1].type === 'layout' && items[1].layout.startsPage).toBe(true);
    expect(items[2].type === 'question' && items[2].question.startsPage).toBeUndefined();
  });

  it('marks nothing on a paper nobody set it on: no key at all', () => {
    const w = paper([structured('a'), section(), structured('b'), mcq('c'), pageBreak(), structured('d')]);
    for (const item of renderWorksheet(w, EN).items) {
      const body = item.type === 'question' ? item.question : item.layout;
      expect('startsPage' in body).toBe(false);
      expect('keptTogether' in body).toBe(false);
    }
  });

  it('leaves no air above what opens a sheet: it would only die there', () => {
    const plain = paper([structured('a'), structured('b'), structured('c')], base(), { examGapLines: 3 });
    expect(lineAbove(renderWorksheet(plain, EN).questions[1].nodes)).toBe(3);
    const asked = paper([structured('a'), structured('b', { startOnNewPage: true }), structured('c')], base(), { examGapLines: 3 });
    const questions = renderWorksheet(asked, EN).questions;
    expect(lineAbove(questions[1].nodes)).toBe(0);
    const first = questions[1].nodes[0];
    expect(first.kind === 'text' && first.boundaryGap).toBeFalsy();
    // The question under it is still spaced from it, as ever.
    expect(lineAbove(questions[2].nodes)).toBe(3);
  });

  it('leaves no air above a heading that opens a sheet either', () => {
    const asked = paper([structured('a'), section(), structured('b', { startOnNewPage: true })]);
    const plain = paper([structured('a'), section(), structured('b')]);
    const heading = (w: Worksheet) => renderWorksheet(w, EN).items[1];
    const above = (w: Worksheet) => {
      const item = heading(w);
      return item.type === 'layout' ? lineAbove(item.layout.nodes) : -1;
    };
    expect(above(plain)).toBe(1);
    expect(above(asked)).toBe(0);
  });

  it('offers no drag handle on a gap that never prints', () => {
    const w = paper([structured('a'), structured('b', { startOnNewPage: true })], base(), { examGapLines: 2 });
    expect(renderWorksheet(w, EN).questions[1].adjustableGap).toBeUndefined();
    const plain = paper([structured('a'), structured('b')], base(), { examGapLines: 2 });
    expect(renderWorksheet(plain, EN).questions[1].adjustableGap).toBe(2);
  });

  it('changes nothing else about the questions: the nodes are those of the unmarked paper, less the air', () => {
    const asked = paper([structured('a'), structured('b', { startOnNewPage: true }), structured('c')]);
    const plain = paper([structured('a'), structured('b'), structured('c')]);
    const strip = (nodes: RenderNode[]) => nodes.map((node, i) => (i === 0 && node.kind === 'text' ? { ...node, format: { ...node.format, spaceBefore: undefined }, boundaryGap: undefined } : node));
    const a = renderWorksheet(asked, EN).questions;
    const p = renderWorksheet(plain, EN).questions;
    expect(a[0].nodes).toEqual(p[0].nodes);
    expect(strip(a[1].nodes)).toEqual(strip(p[1].nodes));
    expect(a[2].nodes).toEqual(p[2].nodes);
  });

  it('serves the same question, asked or not, in every language and both versions', () => {
    const w = paper([structured('a'), structured('b', { startOnNewPage: true })]);
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      for (const version of ['student', 'teacher'] as const) {
        const rendered = renderWorksheet(w, { language, version });
        expect(rendered.questions[1].startsPage, `${language} ${version}`).toBe(true);
      }
    }
  });
});

describe('keeping a question on one page', () => {
  it('marks a structured question that asked, on a worksheet and on a booklet', () => {
    for (const shape of ['classroom', 'lqWorksheet', 'lqMock'] as DocumentType[]) {
      const w = paper([structured('a'), structured('b', { keepOnOnePage: true })], base(shape));
      const marks = renderWorksheet(w, EN).questions.map((q) => q.keptTogether);
      expect(marks, shape).toEqual([undefined, true]);
    }
  });

  it('marks nothing on an MC, which is kept whole by its chain, ticked or not', () => {
    const w = paper([mcq('a'), mcq('b', { keepOnOnePage: true })]);
    expect(renderWorksheet(w, EN).questions.map((q) => q.keptTogether)).toEqual([undefined, undefined]);
  });

  it('marks nothing on a Paper 1, which keeps every question whole already', () => {
    const w = paper([structured('a', { keepOnOnePage: true })], base('paper1'));
    expect(documentShape(w)).toBe('paper1');
    expect(renderWorksheet(w, EN).questions[0].keptTogether).toBeUndefined();
  });

  it('does not touch the nodes: the choice is the paginator’s, not a keep chain in the IR', () => {
    const asked = paper([structured('a', { keepOnOnePage: true })]);
    const plain = paper([structured('a')]);
    expect(renderWorksheet(asked, EN).questions[0].nodes).toEqual(renderWorksheet(plain, EN).questions[0].nodes);
  });

  it('reads only a stored true', () => {
    const w = paper([structured('a', { keepOnOnePage: false })]);
    expect(renderWorksheet(w, EN).questions[0].keptTogether).toBeUndefined();
  });
});
