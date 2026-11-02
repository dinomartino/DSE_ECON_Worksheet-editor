import { describe, expect, it } from 'vitest';
import { migrate, serializeWorksheet } from './migrations';
import { createWorksheetFrom } from './newWorksheet';
import {
  looksLikeSameExam,
  paperSetOf,
  readPaperSet,
  setRoleOf,
  suggestedSetName,
  withoutPaperSet,
  withPaperSet,
  withSetName,
} from './paperSet';
import type { Worksheet } from './types';

const paper1 = () => createWorksheetFrom({ documentType: 'paper1', name: 'S6 Mock Paper 1' });
const paper2 = () => createWorksheetFrom({ documentType: 'lqMock', name: 'S6 Mock Paper 2' });

describe('paper sets: the field', () => {
  it('survives a save and reload (in KNOWN_KEYS), and an older build keeps it', () => {
    const member = withPaperSet(paper1(), { id: 'set-1', name: 'S6 Mock 2026-27' });
    const saved = JSON.parse(JSON.stringify(serializeWorksheet(member)));
    expect(saved.paperSet).toEqual({ id: 'set-1', name: 'S6 Mock 2026-27' });
    const reloaded = migrate(saved);
    expect(reloaded.paperSet).toEqual({ id: 'set-1', name: 'S6 Mock 2026-27' });
    expect(reloaded.__unknown).toBeUndefined();
  });

  it('is additive: a member is still written at schema 1, so every released build opens it', () => {
    const member = withPaperSet(paper2(), { id: 'set-1', name: 'Mock' });
    expect(serializeWorksheet(member).schemaVersion).toBe(serializeWorksheet(paper2()).schemaVersion);
  });

  it('reads a malformed value as no set, and never removes it', () => {
    for (const bad of [null, 'set-1', [], {}, { id: '' }, { id: 3, name: 'x' }]) {
      expect(readPaperSet(bad)).toBeUndefined();
      const doc = migrate(JSON.parse(JSON.stringify({ ...serializeWorksheet(paper1()), paperSet: bad })));
      expect(paperSetOf(doc)).toBeUndefined();
      expect(serializeWorksheet(doc).paperSet).toEqual(bad);
    }
    // A missing name is an empty name, not no set.
    expect(readPaperSet({ id: 'set-1' })).toEqual({ id: 'set-1', name: '' });
  });

  it('keeps keys a later build added to the set, when renamed or rejoined', () => {
    const later = { ...paper1(), paperSet: { id: 'set-1', name: 'Mock', role: 'paper1', order: 2 } } as unknown as Worksheet;
    expect(withSetName(later, 'set-1', 'Mock 2027').paperSet).toEqual({ id: 'set-1', name: 'Mock 2027', role: 'paper1', order: 2 });
    expect(withPaperSet(later, { id: 'set-1', name: 'Mock' }).paperSet).toMatchObject({ role: 'paper1', order: 2 });
    // Moving to another set starts clean.
    expect(withPaperSet(later, { id: 'set-2', name: 'Quiz' }).paperSet).toEqual({ id: 'set-2', name: 'Quiz' });
  });

  it('renames only a member of that set', () => {
    const other = withPaperSet(paper1(), { id: 'set-2', name: 'Quiz' });
    expect(withSetName(other, 'set-1', 'Mock')).toBe(other);
    expect(withSetName(paper1(), 'set-1', 'Mock').paperSet).toBeUndefined();
  });

  it('leaves a set by dropping the field', () => {
    const member = withPaperSet(paper1(), { id: 'set-1', name: 'Mock' });
    expect(withoutPaperSet(member)).not.toHaveProperty('paperSet');
    const free = paper1();
    expect(withoutPaperSet(free)).toBe(free);
  });
});

describe('paper sets: who may join (exam papers only)', () => {
  it('a Paper 1 and a Paper 2 booklet may; a classroom or LQ worksheet and a bank may not', () => {
    expect(setRoleOf(paper1())).toBe('paper1');
    expect(setRoleOf(paper2())).toBe('paper2');
    expect(setRoleOf(createWorksheetFrom({ documentType: 'classroom' }))).toBeUndefined();
    expect(setRoleOf(createWorksheetFrom({ documentType: 'lqWorksheet' }))).toBeUndefined();
    expect(setRoleOf({ ...paper1(), kind: 'bank' })).toBeUndefined();
  });
});

describe('paper sets: names', () => {
  it('proposes the paper name without its paper number', () => {
    expect(suggestedSetName('S6 Mock Paper 1 2026-27')).toBe('S6 Mock 2026-27');
    expect(suggestedSetName('S6 Mock – Paper 2')).toBe('S6 Mock');
    expect(suggestedSetName('中六模擬試 卷一')).toBe('中六模擬試');
    expect(suggestedSetName('Unit 3 quiz P.2')).toBe('Unit 3 quiz');
    // Nothing to take out, or only the number: the name as it is.
    expect(suggestedSetName('Term test')).toBe('Term test');
    expect(suggestedSetName('Paper 1')).toBe('Paper 1');
  });

  it('pairs Paper 1 with Paper 2 of the same name, never a paper with its own copy', () => {
    expect(looksLikeSameExam('S6 Mock Paper 1 2026-27', 'S6 Mock Paper 2 2026-27')).toBe(true);
    expect(looksLikeSameExam('S6 Mock Paper 1', 's6 mock paper 2')).toBe(true);
    expect(looksLikeSameExam('S6 Mock Paper 1', 'S6 Mock Paper 1')).toBe(false);
    expect(looksLikeSameExam('S6 Mock Paper 1', 'S6 Mock Paper 1 (copy)')).toBe(false);
    expect(looksLikeSameExam('S6 Mock Paper 1', 'S5 Final Paper 2')).toBe(false);
  });
});

describe('a new mock set’s blank partner', () => {
  it('swaps the paper number in the name, either way', async () => {
    const { partnerPaperName, partnerRole } = await import('./paperSet');
    expect(partnerPaperName('S6 Mock Paper 1 2026-27', 'paper1')).toBe('S6 Mock Paper 2 2026-27');
    expect(partnerPaperName('S6 Mock Paper 2 2026-27', 'paper2')).toBe('S6 Mock Paper 1 2026-27');
    expect(partnerPaperName('Mock P.1', 'paper1')).toBe('Mock P.2');
    expect(partnerPaperName('中六模擬試 卷一', 'paper1')).toBe('中六模擬試 卷二');
    expect(partnerPaperName('S6 Mock 2026-27', 'paper1')).toBe('S6 Mock 2026-27 – Paper 2');
    expect(partnerPaperName('S6 Mock 2026-27', 'paper2')).toBe('S6 Mock 2026-27 – Paper 1');
    expect(partnerRole('paper1')).toBe('paper2');
  });
});
