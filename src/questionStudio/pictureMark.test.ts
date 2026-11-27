import { describe, expect, it } from 'vitest';
import type { McqDraft } from '@/generate/types';
import { cleanMcq, shownDraft, stripPictureMarks } from './validate';
import type { StudioDraft } from './types';

/**
 * "[picture]" copied from a reference's words (u-fbsp): the user's Q22 draft printed it on its
 * own line above the drawn figure. A reference marks its figures with it; a question never does.
 */

const STEM = 'The following diagram shows the demand and supply curves of Good Y.\n[picture]\nSuppose the government increases the unit tax on Good Y from t1 to t2. Which of the following statements is correct?';

describe('picture markers', () => {
  it('a line that is only a marker goes; the words around it close up', () => {
    expect(stripPictureMarks(STEM)).toBe('The following diagram shows the demand and supply curves of Good Y.\nSuppose the government increases the unit tax on Good Y from t1 to t2. Which of the following statements is correct?');
    expect(stripPictureMarks('下圖顯示 Y 物品的供求曲線。\n[圖]\n哪項正確？')).toBe('下圖顯示 Y 物品的供求曲線。\n哪項正確？');
    expect(stripPictureMarks('(1) [picture] | (2) [picture]\nWhich of the above?')).toBe('Which of the above?');
    expect(stripPictureMarks('Refer to the diagram [picture] below.')).toBe('Refer to the diagram below.');
    expect(stripPictureMarks('No marker [here].')).toBe('No marker [here].');
  });

  it('the write step strips it from every part of a draft', () => {
    const raw: McqDraft = {
      kind: 'mcq',
      stem: { en: STEM, zh: '下圖顯示 Y 物品的供求曲線。\n[picture]\n哪項正確？' },
      statements: [],
      options: ['A', 'B', 'C', 'D'].map((l) => ({ en: `area ${l}`, zh: `面積 ${l}` })),
      answerIndex: 2,
      explanation: { en: 'See [picture].', zh: '' },
    };
    const out = cleanMcq(raw, ['en', 'zh']);
    expect(out.stem.en).not.toMatch(/\[picture\]/);
    expect(out.stem.zh).toBe('下圖顯示Y物品的供求曲線。\n哪項正確？');
    expect(out.explanation.en).toBe('See.');
  });

  it('a draft saved with a marker reads without it', () => {
    const saved = {
      id: 'd1',
      draft: { kind: 'mcq', stem: { en: STEM, zh: '' }, statements: [], options: [{ en: 'a', zh: '' }, { en: 'b', zh: '' }, { en: 'c', zh: '' }, { en: 'd', zh: '' }], answerIndex: 0, explanation: { en: '', zh: '' } },
      angle: '',
      status: 'ok',
      checks: [],
      attempt: 1,
    } as unknown as StudioDraft;
    expect(shownDraft(saved).draft.stem.en).not.toMatch(/\[picture\]/);
    const clean = { ...saved, draft: { ...saved.draft, stem: { en: 'No figure here.', zh: '' } } };
    expect(shownDraft(clean)).toBe(clean);
  });
});
