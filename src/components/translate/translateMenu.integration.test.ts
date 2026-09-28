import { describe, expect, it } from 'vitest';
import { collectTexts, slotsForTarget } from '@/model/textWalk';
import { buildTranslateFixture } from '@/test/translateFixture';
import { pageAiScope } from './translateMenu';

// The page's AI entry over the real walker (the unit tests stand one in).
describe('page AI entry over the real walker', () => {
  const ws = buildTranslateFixture();

  it('narrows to the one text for every slot target the walker reports', () => {
    const slots = collectTexts(ws);
    const sources = { slotsForTarget: (t: Parameters<typeof slotsForTarget>[1]) => slotsForTarget(ws, t), slots: () => slots };
    const targeted = slots.filter((s) => s.target && !s.unprinted);
    expect(targeted.length).toBeGreaterThan(10);
    for (const slot of targeted) {
      const scope = pageAiScope({ kind: 'text', target: slot.target!, questionId: slot.questionId }, sources);
      expect(scope.kind === 'paths' || scope.kind === 'questions', slot.path).toBe(true);
      if (scope.kind === 'paths') expect(scope.paths, slot.path).toEqual([slot.path]);
    }
  });
});
