import { describe, expect, it } from 'vitest';
import { EXAMPLE, studioDraft } from '@/questionStudio/fixtures';
import { whatChanged } from './whatChanged';

describe('what changed from the reference (k-0516, engine notes k-0520)', () => {
  it('the engine’s notes go first, in the paper’s language; the computer fills in the rest', () => {
    const draft = { ...studioDraft('d1'), changes: [{ aspect: 'numbers' as const, note: { en: 'Prices 12→20', zh: '價格 12→20' } }] };
    const en = whatChanged(EXAMPLE, draft, ['en']);
    expect(en[0]).toEqual({ kind: 'note', aspect: 'numbers', text: 'Prices 12→20' });
    expect(en.some((c) => c.kind === 'numbers')).toBe(false);
    expect(en.some((c) => c.kind === 'format')).toBe(true);
    expect(whatChanged(EXAMPLE, draft, ['zh'])[0]).toMatchObject({ text: '價格 12→20' });
  });

  it('a draft without notes (saved before k-0520) is told by the computer alone', () => {
    const kinds = whatChanged(EXAMPLE, studioDraft('d1'), ['en']).map((c) => c.kind);
    expect(kinds).not.toContain('note');
    expect(kinds).toContain('format');
  });
});
