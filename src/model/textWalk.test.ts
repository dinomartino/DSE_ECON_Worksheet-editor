import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { buildTranslateFixture } from '@/test/translateFixture';
import { migrate } from './migrations';
import { createWorksheetFrom } from './newWorksheet';
import { bi, rt } from './text';
import type { TextSlot } from './textSlots';
import { collectTexts, fieldNeedsFill, mapWorksheetTexts, slotsForTarget } from './textWalk';
import type { BandField, McqQuestion, Question, StructuredQuestion, Worksheet } from './types';

const identity = (slot: TextSlot) => slot.text;
/** Writes a fresh copy of every slot: the most a visitor can touch. */
const touchAll = (slot: TextSlot) => ({ en: [...slot.text.en], zh: [...slot.text.zh] });
const slotAt = (ws: Worksheet, path: string) => collectTexts(ws).find((slot) => slot.path === path);
const fillZh = (path: string, zh: string) => (slot: TextSlot) =>
  slot.path === path ? { ...slot.text, zh: rt(zh) } : slot.text;

describe('mapWorksheetTexts: identity', () => {
  const documents: Array<[string, () => Worksheet]> = [
    ['v1 corpus', () => migrate(structuredClone(v1Corpus))],
    ['acceptance fixture', buildAcceptanceWorksheet],
    ['mark scheme fixture', buildMarkSchemeWorksheet],
    ['kitchen sink', buildTranslateFixture],
    ...(['classroom', 'paper1', 'lqWorksheet', 'lqMock'] as const).map(
      (type): [string, () => Worksheet] => [`preset ${type}`, () => createWorksheetFrom({ documentType: type })],
    ),
  ];

  it.each(documents)('an identity visit returns the %s as the same object', (_, build) => {
    const ws = build();
    const before = JSON.stringify(ws);
    expect(mapWorksheetTexts(ws, identity)).toBe(ws);
    expect(JSON.stringify(ws)).toBe(before);
  });

  it('leaves the imported corpus itself untouched', () => {
    const before = JSON.stringify(v1Corpus);
    collectTexts(migrate(structuredClone(v1Corpus)));
    expect(JSON.stringify(v1Corpus)).toBe(before);
  });
});

describe('mapWorksheetTexts: locality', () => {
  it('one write rebuilds only the objects on its path', () => {
    const ws = buildTranslateFixture();
    const next = mapWorksheetTexts(ws, fillZh('q:sq1/part:sq1-a/blocks/b:sq1-a-p', '新'));
    expect(next).not.toBe(ws);
    expect(next.questions[0]).toBe(ws.questions[0]);
    expect(next.questions[2]).toBe(ws.questions[2]);
    expect(next.layout).toBe(ws.layout);
    expect(next.bands).toBe(ws.bands);
    expect(next.header).toBe(ws.header);
    expect(next.footer).toBe(ws.footer);
    expect(next.cover).toBe(ws.cover);
    const [before, after] = [ws.questions[1], next.questions[1]] as StructuredQuestion[];
    expect(after.blocks).toBe(before.blocks);
    expect(after.parts[0].subParts).toBe(before.parts[0].subParts);
    expect(after.parts[0].scheme).toBe(before.parts[0].scheme);
    expect(after.parts[0].blocks[0]).not.toBe(before.parts[0].blocks[0]);
  });

  it('a write outside the questions keeps every question', () => {
    const ws = buildTranslateFixture();
    const next = mapWorksheetTexts(ws, fillZh('cover/headLines/line:cv-head', '經濟學'));
    expect(next.questions).toBe(ws.questions);
    expect(next.layout).toBe(ws.layout);
    expect(next.cover!.cornerLines).toBe(ws.cover!.cornerLines);
    expect(next.cover!.headLines![0].text.zh).toEqual(rt('經濟學'));
  });
});

describe('mapWorksheetTexts: absent stays absent', () => {
  it('writing every slot creates no optional field', () => {
    const ws = buildTranslateFixture();
    const mcq = ws.questions[0] as McqQuestion;
    delete mcq.options[0].rationale;
    delete (ws.questions[1] as StructuredQuestion).parts[0].answer;
    const count = ws.layout.find((e) => e.kind === 'questionCount')!;
    if (count.kind === 'questionCount') delete count.prefix;
    const table = mcq.blocks[1];
    if (table.kind === 'table') delete table.caption;
    const total = ws.bands![0].zones.center[0];
    if (total.kind === 'totalMarks') delete total.prefix;
    delete ws.pageFurniture!.marginNote;

    const next = mapWorksheetTexts(ws, touchAll);
    const nextMcq = next.questions[0] as McqQuestion;
    expect('rationale' in nextMcq.options[0]).toBe(false);
    expect('answer' in (next.questions[1] as StructuredQuestion).parts[0]).toBe(false);
    expect('prefix' in next.layout.find((e) => e.kind === 'questionCount')!).toBe(false);
    expect('caption' in nextMcq.blocks[1]).toBe(false);
    expect('prefix' in next.bands![0].zones.center[0]).toBe(false);
    expect('marginNote' in next.pageFurniture!).toBe(false);
    // …and no slot stands for them.
    const paths = collectTexts(ws).map((slot) => slot.path);
    expect(paths).not.toContain('q:mcq1/option:o1/rationale');
    expect(paths).not.toContain('l:L-count/prefix');
    expect(paths).not.toContain('furniture/marginNote');
  });

  it('visits a legacy band label as the prefix, and writes it back as prefix without label', () => {
    const ws = buildTranslateFixture();
    const slot = slotAt(ws, 'bands/band:mast/center/f:f-fill/prefix')!;
    expect(slot.text).toBe((ws.bands![0].zones.center[1] as { label?: unknown }).label);
    expect(slot).toMatchObject({
      kind: 'wording', aroundValue: 'before', target: { kind: 'bandField', fieldId: 'f-fill', side: 'prefix' },
    });

    const next = mapWorksheetTexts(ws, fillZh(slot.path, '名字：'));
    const field = next.bands![0].zones.center[1] as BandField & { label?: unknown };
    expect(field.kind === 'fillIn' && field.prefix).toEqual(bi('Name:', '名字：'));
    expect('label' in field).toBe(false);
  });
});

describe('mapWorksheetTexts: paths', () => {
  it('gives duplicated ids distinct paths, and a write hits only the addressed copy', () => {
    const ws = buildTranslateFixture();
    ws.questions.push(structuredClone(ws.questions[0]));
    const paths = collectTexts(ws).map((slot) => slot.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('q:mcq1/blocks/b:mcq1-stem');
    expect(paths).toContain('q:mcq1#2/blocks/b:mcq1-stem');

    const next = mapWorksheetTexts(ws, fillZh('q:mcq1#2/blocks/b:mcq1-stem', '改'));
    expect(next.questions[0]).toBe(ws.questions[0]);
    expect((next.questions[3].blocks[0] as { text: unknown }).text).toEqual(bi('Which is correct?', '改'));
  });

  it('marks a repeated segment inside one parent with #2', () => {
    const ws = buildTranslateFixture();
    const mcq = ws.questions[0] as McqQuestion;
    mcq.blocks.push(structuredClone(mcq.blocks[0]));
    expect(collectTexts(ws).map((slot) => slot.path)).toContain('q:mcq1/blocks/b:mcq1-stem#2');
  });

  it('returns both copies of a duplicated question for one page target', () => {
    const ws = buildTranslateFixture();
    ws.questions.push({ ...structuredClone(ws.questions[1]), id: 'sq1-copy' });
    const slots = slotsForTarget(ws, { kind: 'blockText', blockId: 'sq1-a-p' });
    expect(slots.map((slot) => slot.questionId)).toEqual(['sq1', 'sq1-copy']);
    expect(slotsForTarget(ws, { kind: 'mcqOption', questionId: 'mcq1', optionId: 'o3' })).toHaveLength(1);
    expect(slotsForTarget(ws, { kind: 'bandField', fieldId: 'f-total', side: 'suffix' })).toHaveLength(1);
  });

  it('walks in print order: the flow interleaves layout and questions', () => {
    const groups = collectTexts(buildTranslateFixture()).map((slot) => slot.group.id ?? slot.group.label);
    expect([...new Set(groups)]).toEqual([
      'Title & instructions', 'Cover', 'Header & footer',
      'L-sec', 'L-part', 'L-count', 'mcq1', 'L-head', 'L-stim', 'sq1', 'L-note', 'L-list', 'sq2',
      'Page furniture',
    ]);
  });

  it('labels a question by its printed number, and a sub-part by its letters', () => {
    const slot = slotAt(buildTranslateFixture(), 'q:sq1/part:sq1-a/sub:sq1-a-i/answer')!;
    expect(slot.group).toEqual({ kind: 'question', id: 'sq1', label: 'Question 2' });
    expect(slot.label).toBe('(a)(i)');
    expect(slot).toMatchObject({ kind: 'answer', role: 'teacher', questionId: 'sq1', flowId: 'sq1' });
  });
});

describe('mapWorksheetTexts: what it never touches', () => {
  it('skips a question of an unknown type, and leaves __unknown alone', () => {
    const ws = buildTranslateFixture();
    const future = { id: 'qx', type: 'essay', blocks: [], prompt: bi('Newer', '較新') } as unknown as Question;
    ws.questions.push(future);
    ws.__unknown = { glossary: bi('kept', '保留') };
    const next = mapWorksheetTexts(ws, touchAll);
    expect(next.questions[3]).toBe(future);
    expect(next.__unknown).toBe(ws.__unknown);
    expect(collectTexts(ws).some((slot) => slot.path.startsWith('q:qx'))).toBe(false);
  });
});

describe('mapWorksheetTexts: unprinted text', () => {
  const unprinted = (ws: Worksheet) =>
    collectTexts(ws).filter((slot) => slot.unprinted).map((slot) => slot.path);

  it('marks a disabled footer, and flips back when it is enabled', () => {
    const ws = buildTranslateFixture();
    expect(unprinted(ws)).toEqual(expect.arrayContaining([
      'footer/band:ft/right/f:f-ft/text',
      'footer1/band:ft1/left/f:f-ft1/text',
    ]));
    expect(unprinted(ws).some((path) => path.startsWith('header'))).toBe(false);
    ws.footer!.enabled = true;
    expect(unprinted(ws).some((path) => path.startsWith('footer'))).toBe(false);
  });

  it('marks question-level answer figures while the question has parts', () => {
    const ws = buildTranslateFixture();
    const graph = 'q:sq1/answerGraph/x/title';
    const figure = 'q:sq1/answerDiagram/d/title';
    expect(unprinted(ws)).toEqual(expect.arrayContaining([graph, figure]));
    // The essay (no parts) prints its own.
    expect(unprinted(ws).some((path) => path.startsWith('q:sq2'))).toBe(false);
    (ws.questions[1] as StructuredQuestion).parts = [];
    expect(unprinted(ws)).not.toContain(graph);
    expect(unprinted(ws)).not.toContain(figure);
  });

  it('marks a table cell covered by a merge', () => {
    expect(unprinted(buildTranslateFixture())).toContain('q:mcq1/blocks/b:mcq1-table/row:mcq1-table-r2/cell:mcq1-table-c4');
  });
});

describe('mapWorksheetTexts: slot facts', () => {
  it('lists enclosing blocks outermost first, for a figure row and a source panel', () => {
    const ws = buildTranslateFixture();
    const inRow = slotAt(ws, 'q:sq1/blocks/b:sq1-row/figure/d/title')!;
    expect(inRow.blockIds).toEqual(['sq1-row', 'sq1-row-fig']);
    expect(inRow.diagramPath).toBe('q:sq1/blocks/b:sq1-row/figure');
    const inSource = slotAt(ws, 'q:sq1/blocks/b:sq1-src/blocks/b:sq1-src-table/row:sq1-src-table-r1/cell:sq1-src-table-c1')!;
    expect(inSource.blockIds).toEqual(['sq1-src', 'sq1-src-table']);
  });

  it('marks diagram and answer-graph text as falling back', () => {
    const ws = buildTranslateFixture();
    expect(slotAt(ws, 'q:sq1/part:sq1-a/answerGraph/y/title')).toMatchObject({ kind: 'axisTitle', fallsBack: true, role: 'print' });
    expect(slotAt(ws, 'q:sq1/blocks/b:sq1-row/figure/d/curve:c1')).toMatchObject({ kind: 'diagramLabel', fallsBack: true });
    expect(slotAt(ws, 'q:sq1/part:sq1-a/answerDiagram/d/x/title')).toMatchObject({ role: 'teacher', fallsBack: true });
    expect(slotAt(ws, 'q:mcq1/blocks/b:mcq1-img/alt')).toMatchObject({ kind: 'altText', role: 'meta' });
    expect(slotAt(ws, 'q:mcq1/blocks/b:mcq1-stem')).toMatchObject({ kind: 'stem', target: { kind: 'blockText', blockId: 'mcq1-stem' } });
  });

  it('the questionCount wording is a slot with no page target', () => {
    const slot = slotAt(buildTranslateFixture(), 'l:L-count/suffix')!;
    expect(slot).toMatchObject({ kind: 'wording', aroundValue: 'after', group: { kind: 'layout', id: 'L-count' } });
    expect(slot.target).toBeUndefined();
  });
});

describe('fieldNeedsFill', () => {
  it('names the missing side, and nothing for symbol-only or complete text', () => {
    expect(fieldNeedsFill(bi('Demand', ''))).toBe('zh');
    expect(fieldNeedsFill(bi('', '需求'))).toBe('en');
    expect(fieldNeedsFill({ en: rt('Demand'), zh: rt(' \n') })).toBe('zh');
    expect(fieldNeedsFill(bi('E₀', ''))).toBeNull();
    expect(fieldNeedsFill(bi('Demand', '需求'))).toBeNull();
    expect(fieldNeedsFill(bi('', ''))).toBeNull();
  });
});
