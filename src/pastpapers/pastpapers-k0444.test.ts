import { beforeEach, describe, expect, it } from 'vitest';
import { insertFromBank, useBankSession } from '@/components/bank/bankSession';
import { saveStatusView } from '@/components/editor/SaveStatus';
import { buildDocxParts } from '@/export/docx';
import { planStimulusCopies, stimuliServing } from '@/library/stimuli';
import { choiceQuestion, docWith, row } from '@/library/testKit';
import { createParagraphBlock, createWorksheet } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { bi } from '@/model/text';
import type { ImageBlock, LayoutElement, McqQuestion, Question, TableBlock, Worksheet } from '@/model/types';
import { renderWorksheet, withChinesePictures } from '@/render/worksheet';
import type { RenderNode } from '@/render/ir';
import { useWorksheetStore } from '@/store/worksheetStore';
import { storageUsed, webStorageUse, WEB_STORAGE_LIMIT } from '@/storage/webQuota';
// The reference generator of the index (scripts/), read by the editor's own parser here.
import { searchRows } from '../../scripts/pastpaper-index.mjs';
import { matchItem, paperKey, papersOf, parseManifest, parseSearch, parseTopic, sourceLabel, sourceOf, withPictureGrid, type TopicEntry } from './pack';

/**
 * The Past paper bank's second round (k-0444) on synthetic data: the search index, the
 * paper filter, questions whose options are pictures, passages that travel, and the web
 * build's storage warning. The real bank is never in this repo.
 */

type Stimulus = Extract<LayoutElement, { kind: 'stimulus' }>;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';
const PNG_ZH = PNG.replace('ggg==', 'ggo=');

const image = (id: string, widthPx = 200, heightPx = 150): ImageBlock => ({ kind: 'image', id, src: PNG, srcZh: PNG_ZH, widthPx, heightPx, altText: bi('', '') });

function pictureQuestion(tag: string, widthPx = 200): McqQuestion {
  const q = choiceQuestion('Which diagram is right?', '哪幅圖正確？', [tag]) as McqQuestion;
  return {
    ...q,
    id: `kp-${tag.replaceAll('/', '_')}`,
    options: q.options.map((option, i) => ({ ...option, text: bi('', ''), blocks: [image(`img-${i}`, widthPx)] })),
    lineage: { rootId: `kp:${tag}` },
  };
}

const TOPICS: TopicEntry[] = [
  { id: 'a', title: { en: 'A', zh: '甲' }, order: 1, file: 'topics/a.json' },
  { id: 'b', title: { en: 'B', zh: '乙' }, order: 2, file: 'topics/b.json' },
];

describe('the search index in the list', () => {
  it('reads rows tolerantly: unknown topics, bad tags and second rows of a tag are dropped; a later version is ignored', () => {
    const rows = parseSearch(
      {
        version: 1,
        questions: [
          { topic: 'b', source: 'DSE2016/P1/Q34', en: 'Money  supply', zh: '貨幣供應', pictures: 4 },
          { topic: 'a', source: 'CE1997/P2/Q2', en: 'Scarce', zh: '稀少' },
          { topic: 'nowhere', source: 'CE1997/P2/Q3', en: 'x' },
          { topic: 'a', source: 'not a tag', en: 'x' },
          { topic: 'a', source: 'CE1997/P2/Q2', en: 'again' },
          'junk',
        ],
      },
      TOPICS,
    )!;
    expect(rows.map((r) => r.source.tag)).toEqual(['CE1997/P2/Q2', 'DSE2016/P1/Q34']);
    expect(rows[1]).toMatchObject({ topicId: 'b', en: 'Money supply', pictures: 4 });
    expect(rows[1].searchText).toContain('hkdse 2016 paper 1 q34');
    expect(rows[1].searchText).toContain('香港中學文憑考試 2016 卷一 第 34 題');
    expect(parseSearch({ version: 2, questions: [] }, TOPICS)).toBeUndefined();
    expect(parseSearch(undefined, TOPICS)).toBeUndefined();
  });

  it('rides on the manifest; an old list without it still reads', () => {
    const base = { format: 'kp-editor-pack', topics: [{ id: 'a', file: 'topics/a.json' }] };
    const old = parseManifest(base);
    expect('error' in old || old.search).toBeFalsy();
    const withIndex = parseManifest({ ...base, search: { version: 1, questions: [{ topic: 'a', source: 'AL2002/P1/Q17', en: 'x', zh: 'y' }] } });
    expect(!('error' in withIndex) && withIndex.search?.[0].source.exam).toBe('HKALE');
  });

  it('the reference generator writes what the parser reads, passage words first', () => {
    const q2 = choiceQuestion('Which good is scarce?', '哪種物品稀少？', ['C.x', 'CE1997/P2/Q2']);
    const stim = { ...createStimulusElement(), id: 's1', blocks: [createParagraphBlock(bi('A table of prices.', '價格表。'))] } as Stimulus;
    const doc: Worksheet = { ...createWorksheet(), questions: [pictureQuestion('DSE2016/P1/Q34'), q2], layout: [stim], flow: [] };
    doc.flow = [{ type: 'question', id: doc.questions[0].id }, { type: 'layout', id: 's1' }, { type: 'question', id: q2.id }];
    const rows = searchRows('a', doc) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ topic: 'a', source: 'DSE2016/P1/Q34', pictures: 4 });
    expect(String(rows[1].en)).toMatch(/^A table of prices\. Which good is scarce\?/);
    const parsed = parseSearch({ version: 1, questions: rows }, TOPICS)!;
    expect(parsed).toHaveLength(2);
    expect(matchItem(parsed[1], { words: '價格表' })).toBe(true);
  });
});

describe('the paper filter', () => {
  const at = (tag: string) => ({ source: sourceOf({ tags: [tag] }) });
  it('names papers as the export does and lists them by exam, year, paper', () => {
    expect(sourceLabel(sourceOf({ tags: ['DSESP/P1/Q3'] }))).toEqual({ en: 'HKDSE Sample Paper Paper 1 Q3', zh: '香港中學文憑考試 樣本試卷 卷一 第 3 題' });
    expect(sourceLabel(sourceOf({ tags: ['CE2006/P2/Q32'] }), false)).toEqual({ en: 'HKCEE 2006 Paper 2', zh: '香港中學會考 2006 卷二' });
    const papers = papersOf([at('DSE2016/P1/Q2'), at('AL2002/P1/Q17'), at('DSE2016/P1/Q9'), at('CE1990/P2/Q1'), at('DSEPP/P1/Q4'), at('AL2002/P2/Q23')]);
    expect(papers.map((p) => `${p.key}:${p.questions}`)).toEqual(['CE1990/P2:1', 'AL2002/P1:1', 'AL2002/P2:1', 'DSEPP/P1:1', 'DSE2016/P1:2']);
  });
  it('filters to one paper', () => {
    const one = { ...at('DSE2016/P1/Q34'), searchText: '' };
    expect(paperKey(one.source)).toBe('DSE2016/P1');
    expect(matchItem(one, { paper: 'DSE2016/P1' })).toBe(true);
    expect(matchItem(one, { paper: 'DSE2017/P1' })).toBe(false);
  });
});

/** Every node, inside option grids and tables' cells included. */
function flatten(nodes: readonly RenderNode[]): RenderNode[] {
  return nodes.flatMap((node) => [node, ...(node.kind === 'optionRow' ? flatten(node.cells.flat()) : [])]);
}

describe('questions whose options are pictures', () => {
  it('print two by two (the export may say so; an older export gets it in memory), a set layout kept', () => {
    expect(withPictureGrid(pictureQuestion('DSE2016/P1/Q34'))).toMatchObject({ optionLayout: 'columns2' });
    const stacked = { ...pictureQuestion('DSE2016/P1/Q34'), optionLayout: 'stacked' as const };
    expect(withPictureGrid(stacked)).toBe(stacked);
    const mixed = pictureQuestion('DSE2016/P1/Q34');
    mixed.options[2] = { ...mixed.options[2], blocks: undefined, text: bi('None', '沒有') };
    expect(withPictureGrid(mixed)).toBe(mixed);
    const doc = { ...createWorksheet(), kind: 'bank' as const, id: 'kp-bank-a', questions: [pictureQuestion('DSE2016/P1/Q34')] };
    doc.flow = [{ type: 'question', id: doc.questions[0].id }];
    const topic = parseTopic(doc, TOPICS[0])!;
    expect((topic.items[0].question as McqQuestion).optionLayout).toBe('columns2');
  });

  it('each letter above its own picture, A B then C D, a picture wider than its cell drawn at the cell width', () => {
    const wide = { ...withPictureGrid(pictureQuestion('DSE2024/P1/Q29', 314)) } as Question;
    const ws = { ...createWorksheet(), questions: [wide], flow: [{ type: 'question' as const, id: wide.id }] };
    const rendered = renderWorksheet(ws, { language: 'en', version: 'student' } as never);
    const nodes = flatten(rendered.items.flatMap((item) => (item.type === 'question' ? item.question.nodes : [])));
    const rows = nodes.filter((n) => n.kind === 'optionRow');
    expect(rows).toHaveLength(2);
    const first = rows[0].kind === 'optionRow' ? rows[0].cells : [];
    expect(first.map((cell) => (cell[0].kind === 'columns' ? cell[0].cells[0].marker : ''))).toEqual(['A.', 'B.']);
    expect(first[0][1]).toMatchObject({ kind: 'image' });
    const widths = nodes.filter((n) => n.kind === 'image').map((n) => (n.kind === 'image' ? n.widthPx : 0));
    expect(Math.max(...widths)).toBeLessThan(314);
    expect(Math.max(...widths)).toBeGreaterThan(280);
  });

  it('the Chinese picture prints in Chinese, in an option and in a table cell', () => {
    const q = withPictureGrid(pictureQuestion('DSE2016/P1/Q34')) as McqQuestion;
    const table: TableBlock = {
      kind: 'table',
      id: 't',
      borders: 'none',
      rows: [{ id: 'r', cells: [{ id: 'c', text: bi('(1)', '(1)'), image: { src: PNG, srcZh: PNG_ZH, widthPx: 100, heightPx: 80, altText: bi('', '') } }] }],
    };
    const ws = { ...createWorksheet(), questions: [{ ...q, blocks: [...q.blocks, table] }] };
    const zh = withChinesePictures(ws, 'zh');
    const mcq = zh.questions[0] as McqQuestion;
    expect((mcq.options[0].blocks![0] as ImageBlock).src).toBe(PNG_ZH);
    expect((mcq.blocks.at(-1) as TableBlock).rows[0].cells[0].image?.src).toBe(PNG_ZH);
    expect(withChinesePictures(ws, 'en')).toBe(ws);
  });

  it('a table with no lines writes none on all six borders in the .docx', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't',
      borders: 'none',
      rows: [{ id: 'r', cells: [{ id: 'c1', text: bi('(1)', '(1)') }, { id: 'c2', text: bi('(2)', '(2)') }] }],
    };
    const q = choiceQuestion('Which?', '哪項？');
    const ws = { ...createWorksheet(), questions: [{ ...q, blocks: [...q.blocks, table] }], flow: [{ type: 'question' as const, id: q.id }] };
    const xml = buildDocxParts(ws, { language: 'en', version: 'student' } as never).documentXml;
    const borders = xml.match(/<w:tblBorders>.*?<\/w:tblBorders>/g) ?? [];
    expect(borders.length).toBeGreaterThan(0);
    expect(borders.some((b) => !b.includes('w:val="single"'))).toBe(true);
  });
});

describe('a shared passage travels with its questions', () => {
  const q8 = choiceQuestion('Q8 reads the passage', '', ['C.x']);
  const q9 = choiceQuestion('Q9 reads it too', '', ['C.x']);
  const q10 = choiceQuestion('Q10 stands alone', '', ['C.x']);
  const passage = { ...createStimulusElement(), id: 'passage', span: 2, blocks: [createParagraphBlock(bi('The passage.', '資料。'))] } as Stimulus;
  const bank: Worksheet = {
    ...docWith([q8, q9, q10]),
    id: 'my-bank',
    kind: 'bank',
    layout: [passage],
    flow: [{ type: 'layout', id: 'passage' }, { type: 'question', id: q8.id }, { type: 'question', id: q9.id }, { type: 'question', id: q10.id }],
  };

  it('reads which questions a passage serves as the page does', () => {
    const served = stimuliServing(bank);
    expect(served.get(q8.id)?.id).toBe('passage');
    expect(served.get(q9.id)?.id).toBe('passage');
    expect(served.has(q10.id)).toBe(false);
  });

  it('plans one passage per group, in source order, repeats kept only when asked', () => {
    const entries = [
      { question: q10, docId: 'my-bank' },
      { question: q9, docId: 'my-bank', stimulus: passage, order: 2 },
      { question: q8, docId: 'my-bank', stimulus: passage, order: 1 },
    ];
    const plan = planStimulusCopies(entries);
    expect(plan.entries.map((e) => e.question.id)).toEqual([q10.id, q8.id, q9.id]);
    expect(plan.leads[0]).toBeUndefined();
    expect(plan.leads[1]).toMatchObject({ kind: 'stimulus', span: 2 });
    expect(plan.leads[1]?.id).not.toBe('passage');
    expect(planStimulusCopies([...entries, { ...entries[0] }]).repeats).toBe(1);
    expect(planStimulusCopies([...entries, { ...entries[0] }], new Set(), { keepRepeats: true }).entries).toHaveLength(4);
  });

  describe('Insert from the 題庫', () => {
    beforeEach(() => {
      const open = docWith([choiceQuestion('Already here')]);
      useWorksheetStore.getState().replaceWorksheet(open);
      useWorksheetStore.setState({ insertAnchorId: open.questions[0].id });
      useBankSession.setState({ review: null });
    });
    const source = { load: async (id: string) => (id === bank.id ? structuredClone(bank) : undefined) };
    const rowOf = (questionId: string) => row({ docId: bank.id, questionId, rootId: questionId });

    it('brings the passage in front of the question, with the span it fills; one ⌘Z takes both out', async () => {
      const before = useWorksheetStore.getState().worksheet;
      const { inserted } = await insertFromBank([rowOf(q9.id)], undefined, source);
      const after = useWorksheetStore.getState().worksheet;
      const lead = after.layout.find((e) => e.kind === 'stimulus') as Stimulus;
      expect(lead).toMatchObject({ span: 1 });
      const flow = after.flow.map((f) => f.id);
      expect(flow.indexOf(lead.id)).toBe(flow.indexOf(inserted[0]) - 1);
      useWorksheetStore.getState().undo();
      expect(useWorksheetStore.getState().worksheet.layout).toEqual(before.layout);
    });

    it('a question with no passage goes in alone, as before', async () => {
      await insertFromBank([rowOf(q10.id)], undefined, source);
      expect(useWorksheetStore.getState().worksheet.layout.some((e) => e.kind === 'stimulus')).toBe(false);
    });
  });
});

describe("the web build's ~5 MB", () => {
  const storage = (entries: Record<string, string>): Storage => {
    const keys = Object.keys(entries);
    return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null } as unknown as Storage;
  };

  it('counts keys and values, adds what would come, and says nothing on desktop', () => {
    const s = storage({ ab: 'xyz', c: '' });
    expect(storageUsed(s)).toBe(6);
    expect(webStorageUse(10, s, false)).toEqual({ used: 16, limit: WEB_STORAGE_LIMIT, ratio: 16 / WEB_STORAGE_LIMIT });
    expect(webStorageUse(10, s, true)).toBeUndefined();
  });

  it('the toolbar says so once a save leaves it 80% full, and only then', () => {
    const near = { used: 4.3 * 1024 * 1024, limit: WEB_STORAGE_LIMIT, ratio: 0.86 };
    expect(saveStatusView({ readOnly: false, dirty: false, stalled: false, storage: near, lang: 'en' })).toMatchObject({ state: 'nearlyFull', visible: true });
    expect(saveStatusView({ readOnly: false, dirty: false, stalled: false, storage: near, lang: 'zh-HK' }).detail).toContain('4.3 MB');
    expect(saveStatusView({ readOnly: false, dirty: false, stalled: false, storage: { ...near, ratio: 0.5 }, lang: 'en' }).state).toBe('saved');
    expect(saveStatusView({ readOnly: false, dirty: true, stalled: true, storage: near, lang: 'en' }).state).toBe('stalled');
  });
});
