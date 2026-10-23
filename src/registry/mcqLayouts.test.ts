import { describe, expect, it } from 'vitest';
// The registry loads first: the model modules below reach back into it (`textWalk`) and need it whole.
import '@/registry';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import { migrate, serializeWorksheet } from '@/model/migrations';
import type { LanguageMode, McqOptionLayout, McqQuestion, Question, Worksheet } from '@/model/types';
import { contentKey } from '@/library/contentKey';
import { withFlow } from '@/test/fixtures';
import { buildOptionLayoutPaper, optionLayoutMcq } from '@/test/optionLayoutFixture';
import { resolveOptionLayout, suggestOptionLayout } from './mcq';
import {
  OPTION_LAYOUT_CHOICES,
  optionLayoutTally,
  planOptionLayouts,
  withOptionLayouts,
  type OptionLayoutChoice,
} from './mcqLayouts';

/**
 * Setup → Option layout for all MC questions (`docs/design/format-settings.md` § 4.1).
 *
 * Nothing new is stored: each question keeps the `optionLayout` its own panel writes, so
 * these pin the rule for what each choice means for each question. That every surface
 * (page, thumbnails, `.docx`, Copy for Word) then agrees is `mcqLayoutsSurfaces.test.tsx`.
 *
 * The sample paper (`src/test/optionLayoutFixture.ts`) has, in order: short options, mid-length
 * options, full-sentence options, figure options, and a structured question.
 */

const mcqs = (worksheet: Worksheet) => worksheet.questions.filter((q): q is McqQuestion => q.type === 'mcq');
const layoutsOf = (worksheet: Worksheet) => mcqs(worksheet).map((q) => q.optionLayout);
const paper = () => buildOptionLayoutPaper();

describe('the sample paper', () => {
  it('reads as the tests below assume', () => {
    const { short, mid, long, figures } = paper();
    expect(suggestOptionLayout(short, 'en')).toBe('inline');
    expect(suggestOptionLayout(mid, 'en')).toBe('columns2');
    expect(suggestOptionLayout(long, 'en')).toBe('stacked');
    expect(suggestOptionLayout(figures, 'en')).toBe('columns2');
  });

  it('is authored with no layout set, as an untouched paper is', () => {
    expect(layoutsOf(paper().worksheet)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('optionLayoutTally', () => {
  it('counts each MC question in the layout its panel shows', () => {
    const { short, mid, long, figures, structured } = paper();
    const worksheet = withFlow(createWorksheet(), [
      short,
      { ...mid, optionLayout: 'inline' as const },
      { ...long, optionLayout: 'columns2' as const },
      // Stored `inline`, but figure options never sit in a row: the panel shows stacked.
      { ...figures, optionLayout: 'inline' as const },
      structured,
    ]);
    expect(optionLayoutTally(worksheet)).toEqual({ total: 4, stacked: 2, inline: 1, columns2: 1 });
  });

  it('is empty for a paper with no MC question', () => {
    const worksheet = withFlow(createWorksheet(), [createStructuredQuestion()]);
    expect(optionLayoutTally(worksheet)).toEqual({ total: 0, stacked: 0, inline: 0, columns2: 0 });
  });
});

describe('all in a row', () => {
  it('sets every text MC question, leaves figure options and other question types alone', () => {
    const { worksheet, figures, structured } = paper();
    const next = withOptionLayouts(worksheet, 'inline', 'en');
    expect(layoutsOf(next)).toEqual(['inline', 'inline', 'inline', undefined]);
    // Not even a stored `inline` that would reappear on the day the figures are removed.
    expect(next.questions.find((q) => q.id === figures.id)).toBe(figures);
    expect(next.questions.find((q) => q.id === structured.id)).toBe(structured);
  });

  it('says how many it had to leave', () => {
    expect(planOptionLayouts(paper().worksheet, 'inline', 'en')).toEqual({ total: 4, changes: 3, skipped: 1 });
  });
});

describe('all in 2 columns', () => {
  it('sets figure questions too: they sit two to a row in a grid', () => {
    const { worksheet } = paper();
    const next = withOptionLayouts(worksheet, 'columns2', 'en');
    expect(layoutsOf(next)).toEqual(['columns2', 'columns2', 'columns2', 'columns2']);
    expect(planOptionLayouts(worksheet, 'columns2', 'en')).toEqual({ total: 4, changes: 4, skipped: 0 });
  });
});

describe('all stacked', () => {
  it('stores nothing: stacked is the default, as 11 pt is for the text size', () => {
    const { worksheet } = paper();
    const back = withOptionLayouts(withOptionLayouts(worksheet, 'inline', 'en'), 'stacked', 'en');
    for (const question of mcqs(back)) expect('optionLayout' in question).toBe(false);
  });

  it('hands back questions identical to ones never touched, so their content keys match', () => {
    const { worksheet } = paper();
    const back = withOptionLayouts(withOptionLayouts(worksheet, 'columns2', 'en'), 'stacked', 'en');
    expect(back.questions.map(contentKey)).toEqual(worksheet.questions.map(contentKey));
    expect(JSON.stringify(back.questions)).toBe(JSON.stringify(worksheet.questions));
  });

  it('is a no-op on a paper that already is', () => {
    const { worksheet } = paper();
    expect(withOptionLayouts(worksheet, 'stacked', 'en')).toBe(worksheet);
    expect(planOptionLayouts(worksheet, 'stacked', 'en').changes).toBe(0);
  });
});

describe('fit each question', () => {
  it('gives each the layout its option lengths suit', () => {
    expect(layoutsOf(withOptionLayouts(paper().worksheet, 'fit', 'en'))).toEqual([
      'inline',
      'columns2',
      undefined,
      'columns2',
    ]);
  });

  it('is exactly what each question’s own Fit to content button would write', () => {
    const next = withOptionLayouts(paper().worksheet, 'fit', 'en');
    for (const question of mcqs(next)) {
      expect(resolveOptionLayout(question)).toBe(suggestOptionLayout(question, 'en'));
    }
  });

  it('measures the options in the language the page is showing', () => {
    const { worksheet } = paper();
    const layouts = (language: LanguageMode): McqOptionLayout[] =>
      mcqs(withOptionLayouts(worksheet, 'fit', language)).map(resolveOptionLayout);
    expect(layouts('en')).toEqual(['inline', 'columns2', 'stacked', 'columns2']);
    // The same questions in 中文 are a few wide characters: shorter lines, so more fit in a row.
    expect(layouts('zh')).toEqual(['inline', 'inline', 'columns2', 'columns2']);
    // Both languages stack inside a cell, so the wider one decides.
    expect(layouts('bilingual')).toEqual(['inline', 'columns2', 'stacked', 'columns2']);
  });

  it('puts a blank question stacked, not in a row', () => {
    const blank = optionLayoutMcq(['', ''], [['', ''], ['', ''], ['', ''], ['', '']], { optionLayout: 'inline' });
    const worksheet = withFlow(createWorksheet(), [blank]);
    expect(layoutsOf(withOptionLayouts(worksheet, 'fit', 'en'))).toEqual([undefined]);
  });

  it('is a no-op once every question already fits', () => {
    const fitted = withOptionLayouts(paper().worksheet, 'fit', 'en');
    expect(withOptionLayouts(fitted, 'fit', 'en')).toBe(fitted);
    expect(planOptionLayouts(fitted, 'fit', 'en')).toEqual({ total: 4, changes: 0, skipped: 0 });
  });
});

describe('every choice', () => {
  const choices = OPTION_LAYOUT_CHOICES as readonly OptionLayoutChoice[];

  it('offers fit first, then the three layouts', () => {
    expect(choices).toEqual(['fit', 'stacked', 'inline', 'columns2']);
  });

  it.each(choices.map((choice) => [choice] as const))('%s: never edits the paper it is given', (choice) => {
    const { worksheet } = paper();
    const before = JSON.stringify(worksheet);
    withOptionLayouts(worksheet, choice, 'en');
    expect(JSON.stringify(worksheet)).toBe(before);
  });

  it.each(choices.map((choice) => [choice] as const))('%s: the plan counts what the change changes', (choice) => {
    const { worksheet } = paper();
    const next = withOptionLayouts(worksheet, choice, 'en');
    const changed = worksheet.questions.filter((question, index) => question !== next.questions[index]);
    expect(planOptionLayouts(worksheet, choice, 'en').changes).toBe(changed.length);
  });

  it.each(choices.map((choice) => [choice] as const))('%s: touches nothing but the layout', (choice) => {
    const { worksheet } = paper();
    const next = withOptionLayouts(worksheet, choice, 'en');
    const strip = (question: Question) => {
      const copy: Record<string, unknown> = { ...question };
      delete copy.optionLayout;
      return copy;
    };
    expect(next.questions.map(strip)).toEqual(worksheet.questions.map(strip));
    expect(next.flow).toBe(worksheet.flow);
    expect(next.layout).toBe(worksheet.layout);
  });

  it.each(choices.map((choice) => [choice] as const))('%s: survives save and reload', (choice) => {
    const next = withOptionLayouts(paper().worksheet, choice, 'en');
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(next))));
    expect(layoutsOf(reloaded)).toEqual(layoutsOf(next));
    expect(reloaded.__unknown).toBeUndefined();
  });

  it.each(choices.map((choice) => [choice] as const))('%s: a paper with no MC question is left alone', (choice) => {
    const worksheet = withFlow(createWorksheet(), [createStructuredQuestion()]);
    expect(withOptionLayouts(worksheet, choice, 'en')).toBe(worksheet);
    expect(planOptionLayouts(worksheet, choice, 'en')).toEqual({ total: 0, changes: 0, skipped: 0 });
  });
});

describe('replacing layouts chosen one by one', () => {
  it('overwrites them, as the Setup text says', () => {
    const { short, mid, long } = paper();
    const worksheet = withFlow(createWorksheet(), [
      { ...short, optionLayout: 'columns2' as const },
      { ...mid, optionLayout: 'stacked' as const },
      { ...long, optionLayout: 'inline' as const },
    ]);
    expect(layoutsOf(withOptionLayouts(worksheet, 'columns2', 'en'))).toEqual(['columns2', 'columns2', 'columns2']);
    // Stacked is stored as nothing. A question already stacked is not "changed", so a
    // `stacked` its panel wrote stays as written, and the count does not include it.
    expect(layoutsOf(withOptionLayouts(worksheet, 'stacked', 'en'))).toEqual([undefined, 'stacked', undefined]);
    expect(planOptionLayouts(worksheet, 'stacked', 'en').changes).toBe(2);
  });

  it('lets a single question be changed afterwards, the way its panel does', () => {
    const rowed = withOptionLayouts(paper().worksheet, 'inline', 'en');
    const edited = rowed.questions.map((q, index) => (index === 0 ? { ...q, optionLayout: 'columns2' as const } : q));
    expect(layoutsOf({ ...rowed, questions: edited })).toEqual(['columns2', 'inline', 'inline', undefined]);
  });
});
