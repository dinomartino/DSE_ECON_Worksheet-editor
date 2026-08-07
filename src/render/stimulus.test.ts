import { describe, expect, it } from 'vitest';
import { createMcqQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { plain } from '@/model/text';
import type { LayoutElement, OutputMode, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { BLANK_LINE_PT } from './ir';
import { renderWorksheet, type RenderedItem } from './worksheet';

/**
 * The shared stimulus: content two or more consecutive questions refer to, introduced
 * by a lead-in whose question range is **derived** — "Questions 8 and 9" comes from
 * the numbering plan, never from stored text, so reordering or inserting questions
 * renumbers the sentence. That is the whole reason this is an element rather than a
 * note a teacher types.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

type Stimulus = Extract<LayoutElement, { kind: 'stimulus' }>;

function stimulus(patch: Partial<Stimulus> = {}): Stimulus {
  return { ...createStimulusElement(), ...patch };
}

/** The rendered item for `elementId`, which must exist. */
function layoutItem(worksheet: Worksheet, elementId: string, mode = MODE) {
  const rendered = renderWorksheet(worksheet, mode);
  const item = rendered.items.find(
    (entry): entry is Extract<RenderedItem, { type: 'layout' }> =>
      entry.type === 'layout' && entry.layout.elementId === elementId,
  );
  if (!item) throw new Error(`layout element ${elementId} did not render`);
  return item.layout;
}

/** The lead-in sentence — the element's first text node. */
function leadIn(worksheet: Worksheet, elementId: string, side: 'en' | 'zh' = 'en'): string {
  const nodes = layoutItem(worksheet, elementId, {
    ...MODE,
    language: side === 'zh' ? 'zh' : 'en',
  }).nodes;
  const text = nodes.find((node) => node.kind === 'text');
  if (!text || text.kind !== 'text') throw new Error('no lead-in rendered');
  return plain(text.text[side]);
}

describe('the lead-in names the questions by their derived numbers', () => {
  it('covers the two questions that follow by default', () => {
    const element = stimulus();
    const worksheet = withFlow(createWorksheet(), [
      element,
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    expect(leadIn(worksheet, element.id)).toBe(
      'Study the following information and answer Questions 1 and 2.',
    );
  });

  it('renumbers itself when a question is inserted above', () => {
    const element = stimulus();
    const worksheet = withFlow(createWorksheet(), [
      createMcqQuestion(),
      element,
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    expect(leadIn(worksheet, element.id)).toContain('Questions 2 and 3');
  });

  it('speaks a single question and a run of three differently', () => {
    const one = stimulus({ span: 1 });
    const three = stimulus({ span: 3 });
    const single = withFlow(createWorksheet(), [one, createMcqQuestion()]);
    expect(leadIn(single, one.id)).toContain('answer Question 1.');

    const run = withFlow(createWorksheet(), [
      three,
      createMcqQuestion(),
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    expect(leadIn(run, three.id)).toContain('Questions 1 to 3');
  });

  it('stays honest while no questions follow yet', () => {
    const element = stimulus();
    const worksheet = withFlow(createWorksheet(), [createMcqQuestion(), element]);
    expect(leadIn(worksheet, element.id)).toContain('answer the questions below.');
  });

  it('stops counting at the next stimulus, whose questions are its own', () => {
    const first = stimulus({ span: 3 });
    const second = stimulus();
    const worksheet = withFlow(createWorksheet(), [
      first,
      createMcqQuestion(),
      second,
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    expect(leadIn(worksheet, first.id)).toContain('answer Question 1.');
    expect(leadIn(worksheet, second.id)).toContain('Questions 2 and 3');
  });

  it('derives the Chinese side on its own numbering vocabulary', () => {
    const element = stimulus();
    const worksheet = withFlow(createWorksheet(), [
      element,
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    expect(leadIn(worksheet, element.id, 'zh')).toBe('細閱以下資料，然後回答第1及第2題。');
  });

  it('honours retyped wording while keeping the numbers derived', () => {
    const element = stimulus({
      prefix: { en: [{ text: 'Study the diagram and answer ' }], zh: [] },
    });
    const worksheet = withFlow(createWorksheet(), [
      element,
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    expect(leadIn(worksheet, element.id)).toBe(
      'Study the diagram and answer Questions 1 and 2.',
    );
  });
});

describe('the stimulus body renders through the block pipeline', () => {
  it('prints its blocks after the lead-in, separated by a blank line', () => {
    const element = stimulus({ blocks: [createTableBlock(2, 2)] });
    const worksheet = withFlow(createWorksheet(), [element, createMcqQuestion()]);
    const nodes = layoutItem(worksheet, element.id).nodes;

    const kinds = nodes.map((node) => node.kind);
    expect(kinds[0]).toBe('text');
    expect(kinds).toContain('spacer');
    expect(kinds).toContain('table');
    // The sentence introduces the content: it must not strand at a page bottom.
    expect(nodes[0].kind === 'text' && nodes[0].keepNext).toBe(true);
  });
});

describe('on the exam paper a stimulus opens a question group', () => {
  const paper1 = () => createWorksheetFrom({ documentType: 'paper1' });

  it('stands off from the previous question by the wide boundary', () => {
    const base = paper1();
    const element = stimulus();
    const worksheet = withFlow(base, [
      createMcqQuestion(),
      element,
      createMcqQuestion(),
      createMcqQuestion(),
    ]);
    const first = layoutItem(worksheet, element.id).nodes[0];
    // The MCQ paper's measured three-line boundary (§ examGapLines), as `w:before`.
    expect(first.kind === 'text' && first.format?.spaceBefore).toBe(3 * BLANK_LINE_PT);
    expect(first.kind === 'text' && first.boundaryGap).toBe(true);
  });

  it('holds the questions it introduces at the lead-in distance', () => {
    const base = paper1();
    const element = stimulus();
    const worksheet = withFlow(base, [element, createMcqQuestion(), createMcqQuestion()]);
    const rendered = renderWorksheet(worksheet, MODE);
    const question = rendered.items.find((item) => item.type === 'question');
    const first = question?.type === 'question' ? question.question.nodes[0] : undefined;
    expect(first?.kind === 'text' && first.format?.spaceBefore).toBe(2 * BLANK_LINE_PT);
  });

  it('chains its nodes with keep-next so Word cannot split what the screen keeps whole', () => {
    const base = paper1();
    const element = stimulus({ blocks: [createTableBlock(2, 2)] });
    const worksheet = withFlow(base, [element, createMcqQuestion(), createMcqQuestion()]);
    const nodes = layoutItem(worksheet, element.id).nodes;
    for (const node of nodes.slice(0, -1)) {
      expect('keepNext' in node && node.keepNext).toBe(true);
    }
  });
});
