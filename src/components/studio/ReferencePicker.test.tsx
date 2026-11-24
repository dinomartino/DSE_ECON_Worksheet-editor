import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { choiceQuestion } from '@/library/testKit';
import { UiLanguageOverride } from '@/i18n/language';
import { createImageBlock, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Question } from '@/model/types';
import { parseTopic, type TopicEntry } from '@/pastpapers/pack';
import { keepEntries, referenceOf, ReferencePicker } from './ReferencePicker';

const ENTRY: TopicEntry = { id: 'demand', title: { en: 'Demand', zh: '需求' }, order: 1, file: 'topics/demand.json' };

function past(tag: string, en: string): Question {
  const q = choiceQuestion(en, `${en}（中）`, ['C.individual-demand', tag]);
  return { ...q, id: `pp-${tag.replaceAll('/', '_')}`, answerIndex: 1, provenance: bi(`Source ${tag}`, `出處 ${tag}`), lineage: { rootId: `pp:${tag}` } } as Question;
}

const plain = past('DSE2019/P1/Q15', 'Which good is scarce?');
const base = past('DSE2020/P1/Q3', 'Refer to the diagram.');
const figured = { ...base, blocks: [...(base as { blocks: unknown[] }).blocks, createImageBlock('data:image/png;base64,AAAA', 100, 80)] } as Question;
const doc = { ...createWorksheet(), id: 'pp-bank-demand', kind: 'bank' as const, questions: [plain, figured], flow: [{ type: 'question' as const, id: plain.id }, { type: 'question' as const, id: figured.id }] };
const items = parseTopic(JSON.parse(JSON.stringify(doc)), ENTRY)!.items;

const fake = vi.hoisted(() => ({ status: 'ready', items: [] as unknown[], docs: new Map<string, unknown>() }));
fake.items = items;
fake.docs = new Map([[ENTRY.id, doc]]);

vi.mock('@/components/pastpapers/usePastPaperBrowse', async (original) => {
  const real = await original<typeof import('@/components/pastpapers/usePastPaperBrowse')>();
  return {
    ...real,
    usePastPaperBrowse: () => ({
      base: fake.status === 'off' ? '' : 'x',
      bank: { status: fake.status, open: () => {} },
      topics: [ENTRY],
      topic: ENTRY,
      view: 'topic',
      setView: () => {},
      setTopic: () => {},
      setSitting: () => {},
      yearGroups: [],
      sitting: undefined,
      searchingAll: false,
      acrossBank: false,
      filters: real.NO_FILTERS,
      setFilters: () => {},
      poolSize: fake.items.length,
      entries: (fake.items as { topicId: string; question: { id: string }; source: { tag: string } }[]).map((item) => ({
        key: `${item.topicId}|${item.question.id}`,
        topicId: item.topicId,
        tag: item.source.tag,
        item,
      })),
      docOf: fake.docs,
    }),
  };
});
vi.mock('@/components/pastpapers/PastPaperSheet', () => ({ PastPaperSheet: () => <div data-sheet /> }));

const html = (open = true, ui: 'en' | 'zh-HK' = 'en') =>
  renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <ReferencePicker open={open} onClose={() => {}} onPick={() => {}} language="en" />
    </UiLanguageOverride.Provider>,
  );

describe('ReferencePicker', () => {
  it('draws nothing while closed', () => {
    expect(html(false)).toBe('');
  });

  it('is a labelled modal with a card per question, the sheet drawn, and a diagram pill only on the figure', () => {
    const out = html();
    expect(out).toContain('role="dialog"');
    expect(out).toContain('Pick a question to write like');
    expect(out).toContain('data-picker-source="mine"');
    expect(out).toContain('aria-checked="true" data-picker-source="past"');
    expect(out).toContain('data-reference-card="DSE2019/P1/Q15"');
    expect(out).toContain('data-reference-card="DSE2020/P1/Q3"');
    expect(out.match(/data-sheet/g)).toHaveLength(2);
    expect(out.match(/data-reference-figure/g)).toHaveLength(1);
    expect(out).toContain('disabled=""');
    expect(out).toContain('Use as reference');
    expect(out).toContain('data-print-hide');
  });

  it('speaks 中文 in a 中文 interface', () => {
    const out = html(true, 'zh-HK');
    expect(out).toContain('選一條題目作參考');
    expect(out).toContain('我的題目');
    expect(out).toContain('只顯示有圖表的題目');
    expect(out).toContain('用作參考');
  });

  it('referenceOf gives the studio source and key point as Write like this does', () => {
    const made = referenceOf(items[0], 'DSE2019 Paper 1 Q15')!;
    expect(made.source.id).toBe('DSE2019/P1/Q15');
    expect(made.source.label).toBe('DSE2019 Paper 1 Q15');
    expect(made.source.stem.en).toContain('Which good is scarce?');
    expect(made.source.hasFigure).toBe(false);
    expect(made.keyPoint).toBe('C.individual-demand');
    expect(referenceOf(items[1], 'x')!.source.hasFigure).toBe(true);
  });

  it('the diagram filter hides text-only questions', () => {
    const entries = items.map((item) => ({ key: item.question.id, topicId: item.topicId, tag: item.source.tag, item }));
    const built = new Map(entries.map((e) => [e.key, referenceOf(e.item, e.tag)!]));
    expect(keepEntries(entries, built, false)).toHaveLength(2);
    expect(keepEntries(entries, built, true).map((e) => e.tag)).toEqual(['DSE2020/P1/Q3']);
  });

  it('opens on My questions when the bank is off here (k-0529), instead of crashing', () => {
    fake.status = 'off';
    try {
      const out = html();
      expect(out).toContain('aria-checked="true" data-picker-source="mine"');
      expect(out).toContain('data-my-questions');
    } finally {
      fake.status = 'ready';
    }
  });
});
