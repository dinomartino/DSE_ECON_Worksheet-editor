import { describe, expect, it, vi } from 'vitest';
import type { SlotGroup, TextSlot } from '@/model/textSlots';
import { CHUNK_CHARS, defaultTranslateOptions, planFromSlots, slotInScope } from './plan';
import type { TranslateOptions } from './types';

// P-TEXT owns isSymbolOnly; until it lands, a faithful-enough stand-in for the plan rules.
vi.mock('@/model/symbols', () => ({
  isSymbolOnly: (runs: Array<{ text: string }>) => {
    const text = runs.map((r) => r.text).join('');
    return !/[㐀-鿿]/.test(text) && (text.match(/[A-Za-z]+/g) ?? []).every((t) => t.length <= 2 || /^[A-Z]{1,6}$/.test(t));
  },
}));

const Q = (id: string, n: number): SlotGroup => ({ kind: 'question', id, label: `Question ${n}` });
let seq = 0;
function slot(en: string, zh: string, extra: Partial<TextSlot> = {}): TextSlot {
  seq += 1;
  const group = extra.group ?? Q('q1', 1);
  return {
    path: `p${seq}`,
    text: { en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] },
    kind: 'part',
    role: 'print',
    group,
    questionId: group.kind === 'question' ? group.id : undefined,
    flowId: group.id,
    blockIds: [],
    ...extra,
  };
}

const options = (over: Partial<TranslateOptions> = {}): TranslateOptions => ({
  ...defaultTranslateOptions({ language: 'bilingual', version: 'student' }, true),
  ...over,
});
const paper = { kind: 'paper' } as const;

describe('planFromSlots', () => {
  it('takes the direction from the missing side, never the mode', () => {
    const plan = planFromSlots('ws', [slot('Explain.', ''), slot('', '解釋。'), slot('Both', '兩者'), slot('', '')], paper, options());
    expect([...plan.jobs.values()].map((j) => [j.direction, j.slots[0].side])).toEqual([['toZh', 'zh'], ['toEn', 'en']]);
    expect(plan.counts).toMatchObject({ toZh: 1, toEn: 1, requests: 2 });
  });

  it('snapshots the target exactly as read, whitespace included', () => {
    const s = slot('Explain.', ' ');
    const job = [...planFromSlots('ws', [s], paper, options()).jobs.values()][0];
    expect(job.slots[0]).toEqual({ path: s.path, side: 'zh', sourceSnapshot: s.text.en, targetSnapshot: [{ text: ' ' }] });
  });

  it('re-translates only for scopes other than the paper', () => {
    const s = slot('Explain.', '解釋。');
    expect(planFromSlots('ws', [s], paper, options({ retranslate: 'zh' })).jobs.size).toBe(0);
    const plan = planFromSlots('ws', [s], { kind: 'paths', paths: [s.path] }, options({ retranslate: 'zh' }));
    expect([...plan.jobs.values()][0]).toMatchObject({ direction: 'toZh', replacing: true });
    expect(plan.counts.replaceable).toBe(1);
  });

  it('never copies a symbol over an existing target when re-translating', () => {
    const s = slot('2024', '2024年', { kind: 'tableCell' });
    const copySymbols = { toZh: true, toEn: true };
    const plan = planFromSlots('ws', [s], { kind: 'paths', paths: [s.path] }, options({ retranslate: 'zh', copySymbols }));
    expect(plan.copies).toEqual([]);
    expect(plan.jobs.size).toBe(0);
    expect(plan.counts.copied).toBe(0);
  });

  it('filters by scope, role, unprinted and diagram labels', () => {
    const other = slot('Other.', '', { group: Q('q2', 2) });
    const teacher = slot('Model answer.', '', { role: 'teacher' });
    const hidden = slot('Footer.', '', { unprinted: true });
    const label = slot('Price', '', { kind: 'diagramLabel', fallsBack: true, blockIds: ['fig', 'd1'] });
    const all = [slot('Stem.', ''), other, teacher, hidden, label];
    expect(planFromSlots('ws', all, { kind: 'questions', ids: ['q2'] }, options()).jobs.size).toBe(1);
    expect(planFromSlots('ws', all, paper, options({ includeTeacher: false })).counts).toMatchObject({ toZh: 3, teacher: 0 });
    expect(planFromSlots('ws', all, paper, options({ includeDiagramLabels: false })).counts.diagramLabels).toBe(0);
    expect(planFromSlots('ws', all, paper, options()).counts).toMatchObject({ toZh: 4, teacher: 1, diagramLabels: 1 });
    expect(planFromSlots('ws', all, { kind: 'block', blockId: 'd1' }, options()).jobs.size).toBe(1);
    expect(planFromSlots('ws', all, { kind: 'block', blockId: 'd1', questionId: 'q2' }, options()).jobs.size).toBe(0);
  });

  it('copies symbol-only text per direction, never diagram text', () => {
    const cell = slot('2024', '', { kind: 'tableCell' });
    const tick = slot('Q0', '', { kind: 'tickLabel', fallsBack: true });
    const on = planFromSlots('ws', [cell, tick], paper, options({ copySymbols: { toZh: true, toEn: false } }));
    expect(on.jobs.size).toBe(0);
    expect(on.copies).toEqual([{ path: cell.path, side: 'zh', sourceSnapshot: cell.text.en, targetSnapshot: [], next: [{ text: '2024' }] }]);
    expect(on.counts).toMatchObject({ symbols: { toZh: 2, toEn: 0 }, copied: 1 });
    const off = planFromSlots('ws', [cell, tick], paper, options({ copySymbols: { toZh: false, toEn: true } }));
    expect(off.copies).toEqual([]);
  });

  it('defaults symbol copies to the side this edition prints alone', () => {
    expect(defaultTranslateOptions({ language: 'zh', version: 'student' }, true).copySymbols).toEqual({ toZh: true, toEn: false });
    expect(defaultTranslateOptions({ language: 'bilingual', version: 'student' }, false).copySymbols).toEqual({ toZh: false, toEn: false });
  });

  it('dedupes by kind class, keeping every slot', () => {
    const a = slot('Price ($)', '', { kind: 'axisTitle' });
    const b = slot('Price ($)', '', { kind: 'tableCell', group: Q('q2', 2) });
    const c = slot('Price ($)', '', { kind: 'paragraph' });
    const plan = planFromSlots('ws', [a, b, c], paper, options());
    expect(plan.jobs.size).toBe(2);
    expect(plan.jobs.get('t1')!.slots.map((s) => s.path)).toEqual([a.path, b.path]);
    expect(plan.counts.toZh).toBe(3);
  });

  it('gives context from the same group only, capped, teacher context only when included', () => {
    const slots = [
      slot('Refer to Figure 1.', '參考圖1。'),
      slot('Model answer.', '參考答案。', { role: 'teacher' }),
      slot('Elsewhere.', '其他。', { group: Q('q2', 2) }),
      slot('Explain.', ''),
    ];
    const plan = planFromSlots('ws', slots, paper, options({ includeTeacher: false }));
    expect(plan.chunks[0].groups[0].context).toEqual([{ en: 'Refer to Figure 1.', zh: '參考圖1。' }]);
    expect(planFromSlots('ws', slots, paper, options()).counts.contextLines).toBe(2);
    const long = Array.from({ length: 30 }, (_, i) => slot(`Sentence number ${i} is long enough.`, `第${i}句句子。`));
    expect(planFromSlots('ws', [...long, slot('Explain.', '')], paper, options()).counts.contextLines).toBeLessThan(30);
  });

  it('packs single-direction chunks at group boundaries, within the caps', () => {
    const long = (n: number) => 'x'.repeat(n);
    const slots = [
      ...Array.from({ length: 3 }, (_, i) => slot(`${long(1500)} ${i}`, '', { group: Q(`g${i}`, i) })),
      slot('', '解釋。'),
    ];
    const plan = planFromSlots('ws', slots, paper, options());
    expect(plan.chunks.map((c) => [c.direction, c.groups.length])).toEqual([['toZh', 2], ['toZh', 1], ['toEn', 1]]);
    expect(plan.chunks.every((c) => c.sourceChars <= CHUNK_CHARS)).toBe(true);
    const many = Array.from({ length: 70 }, (_, i) => slot(`Line ${i} here.`, ''));
    const split = planFromSlots('ws', many, paper, options());
    expect(split.chunks.map((c) => c.groups[0].jobKeys.length)).toEqual([60, 10]);
    expect(split.chunks.every((c) => c.groups[0].groupKey === 'q:q1')).toBe(true);
  });

  it('notes wording around a derived value', () => {
    const s = slot('There are ', '', { kind: 'wording', aroundValue: 'before', group: { kind: 'document', label: 'Title & instructions' } });
    const job = [...planFromSlots('ws', [s], paper, options()).jobs.values()][0];
    expect(job).toMatchObject({ groupKey: 'document', aroundValue: 'before', note: 'printed before a value the app fills in' });
  });
});

describe('slotInScope', () => {
  it('matches flow items and paths', () => {
    const s = slot('a', '', { flowId: 'L1', path: 'l:L1/text' });
    expect(slotInScope(s, { kind: 'flowItems', ids: ['L1'] })).toBe(true);
    expect(slotInScope(s, { kind: 'paths', paths: ['l:L1/text'] })).toBe(true);
    expect(slotInScope(s, { kind: 'paths', paths: ['x'] })).toBe(false);
  });
});
