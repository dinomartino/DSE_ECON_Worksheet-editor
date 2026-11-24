import { describe, expect, it } from 'vitest';
import { fakeGlossary } from '@/translate/fakeGlossary';
import { corpusOf, INVENTED, REQUEST, studioDraft } from './fixtures';
import { applyEdit, editContext, richOf, sameQuestion, wordsOfEdit, type DraftEdit } from './edit';
import { localChecks } from './validate';
import type { CheckRow, StudioDraft } from './types';

/** k-0530 (u-xjpd): the teacher edits a draft by hand; no AI; the local checks run again. */

const A = INVENTED[0];
const B = INVENTED[1];
const keyPass: CheckRow = { id: 'key', state: 'pass', findings: [] };
const base = (): StudioDraft => ({ ...studioDraft('v1', { from: A, rows: [keyPass] }), solve: { answer: A.answer, working: 'w', ambiguous: false } });
const found = { glossary: null, corpus: corpusOf([{ en: 'An unrelated question about the money supply and banks in an economy.' }]) };
const editOf = (draft: StudioDraft, change: (e: DraftEdit) => DraftEdit = (e) => e): DraftEdit => change({ rich: richOf(draft), answerIndex: draft.draft.answerIndex });
const sub = (text: string) => [{ text: 'Q' }, { text, sub: true }];

describe('applyEdit', () => {
  it('keeps the teacher’s words and formatting; the checks and the AI read the plain words', () => {
    const prev = base();
    const edit = editOf(prev, (e) => ({ ...e, rich: { ...e.rich, options: e.rich.options.map((o, i) => (i === 0 ? { en: [{ text: 'quantity rises to ' }, ...sub('1')], zh: o.zh } : o)) } }));
    const next = applyEdit(prev, edit, REQUEST, [], found, 'v2');
    expect(next.id).toBe('v2');
    expect(next.edited).toBe(true);
    expect(next.rich?.options[0].en).toEqual([{ text: 'quantity rises to ' }, { text: 'Q' }, { text: '1', sub: true }]);
    expect(next.draft.options[0].en).toBe('quantity rises to Q1');
    expect(wordsOfEdit(edit).options[0].en).toBe('quantity rises to Q1');
  });

  it('changing the question makes the key check out of date ("edited: check again") and drops the old solve', () => {
    const prev = base();
    const next = applyEdit(prev, editOf(prev, (e) => ({ ...e, answerIndex: (e.answerIndex + 1) % 4 })), REQUEST, [], found, 'v2');
    expect(next.checks.find((c) => c.id === 'key')).toEqual({ id: 'key', state: 'skipped', findings: [{ id: 'key.edited' }] });
    expect(next.solve).toBeUndefined();
    expect(next.status).toBe('look');
  });

  it('changing only the explanation keeps the key check and its solve', () => {
    const prev = base();
    const next = applyEdit(prev, editOf(prev, (e) => ({ ...e, rich: { ...e.rich, explanation: { en: [{ text: 'Both change by 25%.' }], zh: [{ text: '兩者都變動 25%。' }] } } })), REQUEST, [], found, 'v2');
    expect(next.checks.find((c) => c.id === 'key')).toEqual(keyPass);
    expect(next.solve).toEqual(prev.solve);
  });

  it('the local checks run again: an edit that copies another draft is warned at once', () => {
    const prev = base();
    const other = studioDraft('o1', { from: B });
    const copy = editOf(prev, (e) => ({ ...e, rich: richOf(other) }));
    const next = applyEdit(prev, copy, REQUEST, [other], found, 'v2');
    expect(next.checks.find((c) => c.id === 'copy')?.state).toBe('fail');
    const shape = applyEdit(prev, editOf(prev, (e) => ({ ...e, rich: { ...e.rich, options: e.rich.options.map((o, i) => (i === 1 ? { en: [], zh: [] } : o)) } })), REQUEST, [], found, 'v3');
    expect(shape.checks.find((c) => c.id === 'shape')).toMatchObject({ state: 'fail', findings: [{ id: 'shape.optionEmpty' }, { id: 'shape.optionEmpty' }] });
  });

  it('a check whose glossary or corpus could not be read says "check again", never a stale pass', () => {
    const prev = base();
    const next = applyEdit(prev, editOf(prev), REQUEST, [], { glossary: null, corpus: null }, 'v2');
    expect(next.checks.find((c) => c.id === 'terms')).toMatchObject({ state: 'skipped', findings: [{ id: 'check.edited' }] });
    expect(next.checks.find((c) => c.id === 'copy')).toMatchObject({ state: 'skipped', findings: [{ id: 'check.edited' }] });
  });

  it('the term check never rewrites the teacher’s 中文 (it would fix an AI draft’s in place)', () => {
    const prev = base();
    const odd = '若供給增加，消費者剩餘會怎樣？';
    const words = { en: [{ text: 'If supply rises, what happens to consumer surplus?' }], zh: [{ text: odd }] };
    const edit = editOf(prev, (e) => ({ ...e, rich: { ...e.rich, stem: words } }));
    const ctx = { glossary: fakeGlossary(), corpus: found.corpus };
    const next = applyEdit(prev, edit, REQUEST, [], ctx, 'v2');
    expect(next.draft.stem.zh).toBe(odd);
    // Without the copy, the check would have changed the words it was given.
    const unprotected = wordsOfEdit(edit);
    localChecks(unprotected, editContext(REQUEST, [], ctx));
    expect(unprotected.stem.zh).not.toBe(odd);
  });

  it('a figure changed in the diagram editor replaces the AI’s and is marked edited', () => {
    const block = { kind: 'diagram', id: 'fig', widthPx: 300, heightPx: 200, diagram: { curves: [], points: [], labels: [], arrows: [] } } as never;
    const prev: StudioDraft = { ...base(), diagram: { status: 'look', block, placement: 'question', issues: [{ code: 'x', text: 'an issue' }] as never } };
    const drawn = { ...(block as object), widthPx: 320 } as never;
    const next = applyEdit(prev, { ...editOf(prev), diagram: drawn }, REQUEST, [], found, 'v2');
    expect(next.diagram?.block).toBe(drawn);
    expect(next.diagram?.edited).toBe(true);
    expect(sameQuestion(prev.draft, next.draft)).toBe(true);
  });
});
