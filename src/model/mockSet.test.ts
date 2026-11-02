import { describe, expect, it } from 'vitest';
import { createMockSet } from './mockSet';
import { migrate, serializeWorksheet } from './migrations';
import { paperSetOf, setRoleOf } from './paperSet';

describe('a new mock set (k-0311)', () => {
  it('makes the chosen Paper 1 and a blank Paper 2, linked as one set', () => {
    const { chosen, blank } = createMockSet(
      { documentType: 'paper1', name: 'S6 Mock Paper 1 2026-27', coverDetails: { school: 'St Mary College', examName: 'S.6 MOCK EXAMINATION' } },
      'set-1',
    );
    expect(setRoleOf(chosen)).toBe('paper1');
    expect(setRoleOf(blank)).toBe('paper2');
    expect(paperSetOf(chosen)).toEqual({ id: 'set-1', name: 'S6 Mock 2026-27' });
    expect(paperSetOf(blank)).toEqual({ id: 'set-1', name: 'S6 Mock 2026-27' });
    expect(chosen.name).toBe('S6 Mock Paper 1 2026-27');
    expect(blank.name).toBe('S6 Mock Paper 2 2026-27');
    expect(blank.id).not.toBe(chosen.id);
    // The chosen paper keeps its sample question; the placeholder has none.
    expect(chosen.questions.length).toBeGreaterThan(0);
    expect(blank.questions).toHaveLength(0);
    // Both covers carry the school typed once.
    expect(JSON.stringify(blank.cover)).toContain('St Mary College');
    expect(JSON.stringify(chosen.cover)).toContain('St Mary College');
  });

  it('works from Paper 2 too, and both papers save and reopen in the set', () => {
    const { chosen, blank } = createMockSet({ documentType: 'lqMock', name: 'Term 1 Mock P.2' });
    expect(setRoleOf(chosen)).toBe('paper2');
    expect(setRoleOf(blank)).toBe('paper1');
    expect(blank.name).toBe('Term 1 Mock P.1');
    expect(blank.questions).toHaveLength(0);
    for (const doc of [chosen, blank]) {
      expect(paperSetOf(migrate(JSON.parse(JSON.stringify(serializeWorksheet(doc))))))!.toEqual(paperSetOf(chosen));
    }
  });
});
