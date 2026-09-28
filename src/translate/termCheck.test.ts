import { describe, expect, it } from 'vitest';
import { migrate } from '@/model/migrations';
import { collectTexts } from '@/model/textWalk';
import type { SlotGroup, TextSlot } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import { loadGlossary } from '@/glossary/load';
import { fakeGlossary } from './fakeGlossary';
import { buildTermCheck, termFixWrites, termRowsFromSlots, termSummaryFromSlots } from './termCheck';
import { allBiTexts, readCorpus } from './testKit';
import type { TermRow } from './types';

const glossary = fakeGlossary();
const Q = (id: string): SlotGroup => ({ kind: 'question', id, label: `Question ${id}` });
const COVER: SlotGroup = { kind: 'cover', label: 'Cover' };
let seq = 0;
function slot(en: RichText | string, zh: RichText | string, group: SlotGroup = Q('q1'), extra: Partial<TextSlot> = {}): TextSlot {
  seq += 1;
  const runs = (v: RichText | string) => (typeof v === 'string' ? (v ? [{ text: v }] : []) : v);
  return {
    path: `p${seq}`, text: { en: runs(en), zh: runs(zh) }, kind: 'part', role: 'print', group,
    questionId: group.kind === 'question' ? group.id : undefined, flowId: group.id, blockIds: [], ...extra,
  };
}
const paper = { kind: 'paper' } as const;
const corpus = migrate(structuredClone(readCorpus()));

describe('termRowsFromSlots', () => {
  it('keeps actionable findings on printed two-sided slots only', () => {
    const rows = termRowsFromSlots([
      slot('Supply falls, so the price rises.', '供給下降，價格上升。'),
      slot('Explain the deadweight loss.', '解釋效率損失。'),
      slot('Supply falls.', ''),
      slot('Supply falls.', '供給下降。', Q('q1'), { unprinted: true }),
      slot('Supply falls.', '供給下降。', Q('q1'), { role: 'meta', kind: 'altText' }),
      slot('Explain elastic demand.', '解釋低彈性需求。', Q('q2')),
    ], glossary, paper);
    expect(rows.map((r) => r.checks.map((c) => [c.en, c.fix?.to ?? c.conflict?.meansEn]))).toEqual([
      [['supply', '供應']],
      [['elastic demand', 'inelastic demand']],
    ]);
    expect(rows[0]).toMatchObject({ en: [{ text: 'Supply falls, so the price rises.' }], zh: [{ text: '供給下降，價格上升。' }] });
  });

  it('respects the scope', () => {
    const slots = [slot('Supply falls.', '供給下降。', Q('q1')), slot('Supply falls.', '供給下降。', Q('q2'))];
    expect(termRowsFromSlots(slots, glossary, { kind: 'questions', ids: ['q2'] }).map((r) => r.slot.questionId)).toEqual(['q2']);
  });

  it('offers the corpus’s textbook form as a variant fix, and never rewrites the corpus', () => {
    const before = JSON.stringify(readCorpus());
    const pair = allBiTexts(readCorpus()).find((t) => t.zh.some((r) => r.text.includes('稅項歸宿')))!;
    const [row] = termRowsFromSlots([slot(pair.en, pair.zh)], glossary, paper);
    expect(row.checks[0].fix).toMatchObject({ to: '稅收承擔', kind: 'deny', denyKind: 'variant' });
    expect(JSON.stringify(readCorpus())).toBe(before);
  });
});

describe('termFixWrites', () => {
  it('writes the zh side of accepted rows only, with the snapshots as checked', () => {
    const rows = termRowsFromSlots([slot('Supply falls.', '供給下降。'), slot('Explain market failure.', '解釋市場失靈。')], glossary, paper);
    const writes = termFixWrites(rows, new Map([[rows[1].path, new Set([0])]]));
    expect(writes).toEqual([{
      path: rows[1].path, side: 'zh', sourceSnapshot: rows[1].en, targetSnapshot: rows[1].zh, next: [{ text: '解釋市場失效。' }],
    }]);
    expect(termFixWrites(rows, new Map([[rows[0].path, new Set<number>()]]))).toEqual([]);
  });

  it('merges several fixes right to left and keeps a replaced span’s bold', () => {
    const zh: RichText = [{ text: '因為' }, { text: '市場失靈', bold: true }, { text: '，總供給下降。' }];
    const [row] = termRowsFromSlots([slot('Because of market failure, supply falls.', zh)], glossary, paper);
    const writes = termFixWrites([row], new Map([[row.path, new Set(row.checks.map((_, i) => i))]]));
    expect(writes[0].next).toEqual([{ text: '因為' }, { text: '市場失效', bold: true }, { text: '，總供應下降。' }]);
  });

  it('ignores checks without a fix', () => {
    const [row] = termRowsFromSlots([slot('Explain elastic demand.', '解釋低彈性需求。')], glossary, paper);
    expect(termFixWrites([row], new Map([[row.path, new Set([0])]]))).toEqual([]);
  });
});

describe('termFixWrites with the real glossary', () => {
  const tickAll = (rows: TermRow[]) => new Map(rows.map((r) => [r.path, new Set(r.checks.map((_, i) => i))]));

  it('applies one fix per offending occurrence, right to left', async () => {
    const real = await loadGlossary();
    const rows = termRowsFromSlots([
      slot('The price level rises and the price level falls.', [{ text: '價格水平', bold: true }, { text: '上升，價格水平下降。' }]),
      slot('Total revenue and the price level.', '總收益與價格水平。'),
    ], real, paper);
    expect(rows.map((r) => r.checks.length)).toEqual([2, 2]);
    expect(termFixWrites(rows, tickAll(rows)).map((w) => w.next)).toEqual([
      [{ text: '物價水平', bold: true }, { text: '上升，物價水平下降。' }],
      [{ text: '總收入與物價水平。' }],
    ]);
  });

  it('tolerates a deny check with no fix (a break or space inside the wrong form)', async () => {
    const real = await loadGlossary();
    const rows = termRowsFromSlots([
      slot('The price level rises.', '價格\n水平上升。'),
      slot('The price level rises; total revenue falls.', '價格 水平上升；總收益下降。'),
    ], real, paper);
    expect(rows[0].checks.map((c) => [c.severity, c.fix])).toEqual([['warn', undefined]]);
    const writes = termFixWrites(rows, tickAll(rows));
    expect(writes.map((w) => [w.path, w.next])).toEqual([[rows[1].path, [{ text: '價格 水平上升；總收入下降。' }]]]);
  });

  it('gives every corpus fix a snapshot of the text it was checked against', async () => {
    const rows = buildTermCheck(corpus, await loadGlossary(), paper);
    const writes = termFixWrites(rows, tickAll(rows));
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      const row = rows.find((r) => r.path === write.path)!;
      expect(write).toMatchObject({ side: 'zh', sourceSnapshot: row.en, targetSnapshot: row.zh });
      expect(write.next).not.toEqual(row.zh);
    }
  });
});

describe('termSummaryFromSlots', () => {
  it('counts warns by question, and those outside questions', () => {
    const summary = termSummaryFromSlots([
      slot('Supply falls.', '供給下降。', Q('q2')),
      slot('Explain market failure and supply.', '解釋市場失靈及供給。', Q('q1')),
      slot('Supply', '供給', COVER),
      slot('Explain the deadweight loss.', '解釋無謂損失。', Q('q3')),
    ], glossary);
    expect(summary).toEqual({ warn: 4, questionIds: ['q2', 'q1'], outsideQuestions: 1 });
  });
});

describe('buildTermCheck on the corpus copy', () => {
  it('walks the corpus', () => expect(collectTexts(corpus).length).toBeGreaterThan(0));
  it('finds 稅收承擔 as a variant fix', () => {
    const rows = buildTermCheck(corpus, glossary, paper);
    const fix = rows.flatMap((r) => r.checks).find((c) => c.en === 'tax incidence')?.fix;
    expect(fix).toMatchObject({ to: '稅收承擔', denyKind: 'variant' });
  });
});
