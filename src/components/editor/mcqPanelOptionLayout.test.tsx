import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheet } from '@/model/factories';
import type { McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { OPTION_LAYOUT_CHOICES, withOptionLayouts, type OptionLayoutChoice } from '@/registry/mcqLayouts';
import { buildOptionLayoutPaper } from '@/test/optionLayoutFixture';

const store: { worksheet: Worksheet; mode: OutputMode; selectedTargetKey?: string } = {
  worksheet: createWorksheet(),
  mode: { language: 'en', version: 'teacher' },
};
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { McqEditorPanel } = await import('./McqEditorPanel');

/**
 * Setup → Option layout for all MC questions writes each question's own `optionLayout`, so the
 * question's panel (the Segmented control, its Fit to content button, its "prints as" note)
 * shows the result with no code of its own, and a single question can be changed there next.
 */

function panel(worksheet: Worksheet, question: McqQuestion): string {
  store.worksheet = worksheet;
  return renderToStaticMarkup(<McqEditorPanel question={question} onChange={() => {}} />).replace(/ class="[^"]*"/g, '');
}

/** The label of the option the Segmented shows as chosen. */
function chosen(markup: string): string | undefined {
  const group = /aria-label="Option layout">(.*?)<\/div>/.exec(markup)?.[1] ?? '';
  return /aria-checked="true"[^>]*>([^<]*)</.exec(group)?.[1];
}

const WORDS = { stacked: 'Stacked', inline: 'Inline', columns2: '2 columns' } as const;
const mcqs = (worksheet: Worksheet) => worksheet.questions.filter((q): q is McqQuestion => q.type === 'mcq');
const shown = (worksheet: Worksheet) => mcqs(worksheet).map((question) => chosen(panel(worksheet, question)));

describe('each question’s panel after the bulk action', () => {
  const base = buildOptionLayoutPaper().worksheet;
  const after = (choice: OptionLayoutChoice) => withOptionLayouts(base, choice, 'en');

  it('starts as the paper was authored', () => {
    expect(shown(base)).toEqual([WORDS.stacked, WORDS.stacked, WORDS.stacked, WORDS.stacked]);
  });

  it('shows All stacked', () => {
    expect(shown(after('stacked'))).toEqual([WORDS.stacked, WORDS.stacked, WORDS.stacked, WORDS.stacked]);
  });

  it('shows All in a row, except for the figure question, which cannot', () => {
    expect(shown(after('inline'))).toEqual([WORDS.inline, WORDS.inline, WORDS.inline, WORDS.stacked]);
  });

  it('shows All 2 columns', () => {
    expect(shown(after('columns2'))).toEqual([WORDS.columns2, WORDS.columns2, WORDS.columns2, WORDS.columns2]);
  });

  it('shows Fit each question, and then has nothing left for its own Fit to content', () => {
    const fitted = after('fit');
    expect(shown(fitted)).toEqual([WORDS.inline, WORDS.columns2, WORDS.stacked, WORDS.columns2]);
    for (const question of mcqs(fitted)) expect(panel(fitted, question)).not.toContain('>Fit to content<');
    // Before it, three of the four questions had a better layout to offer.
    expect(mcqs(base).filter((question) => panel(base, question).includes('>Fit to content<'))).toHaveLength(3);
  });

  it('explains, on a question set in a row that cannot hold it, how it prints instead', () => {
    const rowed = after('inline');
    const long = mcqs(rowed)[2];
    expect(panel(rowed, long)).toContain('Too long for their columns, so each option wraps in its own cell.');
    // And says nothing of the kind where the row fits.
    expect(panel(rowed, mcqs(rowed)[0])).not.toContain('Too long');
  });

  it.each(OPTION_LAYOUT_CHOICES.map((choice) => [choice] as const))('%s: leaves every panel with a choice that is on offer', (choice) => {
    const next = after(choice);
    for (const question of mcqs(next)) expect(chosen(panel(next, question))).toBeDefined();
  });
});
