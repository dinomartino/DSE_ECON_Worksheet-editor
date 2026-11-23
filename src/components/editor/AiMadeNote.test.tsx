import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { rt } from '@/model/text';
import type { McqQuestion } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

const store = { readOnly: false };
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { AiMadeNote, CHECKED_PATCH } = await import('./AiMadeNote');
const { AiMadeChip } = await import('@/components/preview/AiMadeChip');

const mcq = (extra: Partial<McqQuestion> = {}): McqQuestion => ({
  id: 'q1',
  type: 'mcq',
  blocks: [{ id: 'b1', kind: 'paragraph', text: { en: rt('Stem'), zh: [] } }],
  options: [1, 2, 3, 4].map((n) => ({ id: `o${n}`, text: { en: rt(`o${n}`), zh: [] } })),
  answerIndex: 0,
  marks: 1,
  ...extra,
});

const note = (question: McqQuestion, ui: UiLanguage = 'en', readOnly = false) => {
  store.readOnly = readOnly;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <AiMadeNote question={question} onChange={() => {}} />
    </UiLanguageOverride.Provider>,
  );
};

describe('the AI-made note in the Edit panel', () => {
  it('says nothing about a question nobody asked the AI to write', () => {
    expect(note(mcq())).toBe('');
  });

  it('labels a question the studio wrote, with the one button that clears it', () => {
    const html = note(mcq({ aiMade: true }));
    expect(html).toContain('data-testid="ai-made-note"');
    expect(html).toContain('AI-made, not checked yet');
    expect(html).toContain('>Checked</button>');
  });

  it('is in Hong Kong Chinese for a Chinese interface', () => {
    const html = note(mcq({ aiMade: true }), 'zh-HK');
    expect(html).toContain('AI 擬題，尚未核對');
    expect(html).toContain('>已核對</button>');
  });

  it('tells a read-only file’s reader but offers no button there', () => {
    const html = note(mcq({ aiMade: true }), 'en', true);
    expect(html).toContain('AI-made, not checked yet');
    expect(html).not.toContain('<button');
  });

  it('clears by absence, never by false: the checked question is the question it would have been', () => {
    const checked = { ...mcq({ aiMade: true }), ...CHECKED_PATCH };
    expect(JSON.stringify(checked)).toBe(JSON.stringify(mcq()));
    expect(JSON.stringify(checked)).not.toContain('aiMade');
  });
});

describe('the AI-made chip on the page', () => {
  const chip = (ui: UiLanguage = 'en') =>
    renderToStaticMarkup(
      <UiLanguageOverride.Provider value={ui}>
        <AiMadeChip />
      </UiLanguageOverride.Provider>,
    );

  it('never prints, takes no room and lets clicks through to the question', () => {
    const html = chip();
    expect(html).toContain('data-print-hide=""');
    expect(html).toContain('absolute');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('AI-made · not checked');
  });

  it('is in Hong Kong Chinese for a Chinese interface', () => {
    expect(chip('zh-HK')).toContain('AI 擬題 · 未核對');
  });
});
