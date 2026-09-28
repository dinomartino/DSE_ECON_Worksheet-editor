import { describe, expect, it } from 'vitest';
import { collectTexts, slotsForTarget } from '@/model/textWalk';
import { buildTranslateFixture } from '@/test/translateFixture';
import { layoutIdsWithText, outlineTranslateItem, pageTranslateItems } from './translateMenu';

// The entry points over the real walker (the unit tests stand one in).
describe('translate entry points over the real walker', () => {
  const ws = buildTranslateFixture();
  const withText = layoutIdsWithText(collectTexts(ws));

  it('Outline layout rows offer Translate… exactly where text prints', () => {
    for (const id of ['L-sec', 'L-part', 'L-head', 'L-count', 'L-note', 'L-stim', 'L-list']) {
      expect(withText.has(id), id).toBe(true);
      const item = outlineTranslateItem(ws.id, { kind: 'layout', id, holdsText: withText.has(id) }, false);
      expect(item?.request?.scope).toEqual({ kind: 'flowItems', ids: [id] });
    }
    expect(withText.has('L-rule')).toBe(false);
    expect(outlineTranslateItem(ws.id, { kind: 'layout', id: 'L-rule', holdsText: false }, false)).toBeNull();
  });

  it('the page menu finds a slot for every slot target the walker reports', () => {
    const slots = collectTexts(ws);
    const sources = {
      slotsForTarget: (t: Parameters<typeof slotsForTarget>[1]) => slotsForTarget(ws, t),
      slots: () => slots,
      blockKind: () => undefined,
    };
    const targeted = slots.filter((s) => s.target && !s.unprinted);
    expect(targeted.length).toBeGreaterThan(10);
    for (const slot of targeted) {
      const items = pageTranslateItems(ws.id, { kind: 'text', target: slot.target! }, sources, false);
      // Both sides are filled in the kitchen sink, so a slot offers Re-translate.
      expect(items.length, slot.path).toBeGreaterThan(0);
    }
  });
});
