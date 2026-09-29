import { describe, expect, it } from 'vitest';
import { groupRows } from '@/library/group';
import { row } from '@/library/testKit';
import {
  latestClassUsage,
  levelForSearch,
  levelUp,
  parseLevel,
  railOrder,
  railSections,
  serializeLevel,
  suggestionLabel,
  suggestTopics,
  TOPICS_LEVEL,
  type BankLevel,
} from './bankScreen';

describe('levels', () => {
  it('goes up one level at a time, and home from the topics', () => {
    expect(levelUp({ kind: 'review', topic: 'C' })).toEqual(TOPICS_LEVEL);
    expect(levelUp({ kind: 'untagged' })).toEqual(TOPICS_LEVEL);
    expect(levelUp(TOPICS_LEVEL)).toBe('home');
  });

  it('typing on the topics opens search results; emptying a search goes back', () => {
    const search = levelForSearch(TOPICS_LEVEL, 'elasticity');
    expect(search).toEqual({ kind: 'review', topic: 'all', search: true });
    expect(levelForSearch(search, '  ')).toEqual(TOPICS_LEVEL);
    expect(levelForSearch(TOPICS_LEVEL, ' ')).toEqual(TOPICS_LEVEL);
  });

  it('text inside a topic, or on All questions, narrows in place', () => {
    const topic: BankLevel = { kind: 'review', topic: 'C' };
    expect(levelForSearch(topic, 'tax')).toBe(topic);
    expect(levelForSearch(topic, '')).toBe(topic);
    const all: BankLevel = { kind: 'review', topic: 'all' };
    expect(levelForSearch(all, '')).toBe(all);
  });

  it('round-trips a stored level and refuses anything it does not know', () => {
    for (const level of [TOPICS_LEVEL, { kind: 'untagged' }, { kind: 'review', topic: 'C.ped' }, { kind: 'review', topic: 'all' }] as BankLevel[]) {
      expect(parseLevel(serializeLevel(level))).toEqual(level);
    }
    expect(parseLevel(serializeLevel({ kind: 'review', topic: 'all', search: true }))).toEqual(TOPICS_LEVEL);
    expect(parseLevel('{"kind":"review","topic":"Z.nope"}')).toEqual(TOPICS_LEVEL);
    expect(parseLevel('not json')).toEqual(TOPICS_LEVEL);
    expect(parseLevel(null)).toEqual(TOPICS_LEVEL);
  });
});

describe('railSections', () => {
  it('sections a coarse topic by sub-topic in guide order, with General for the coarse code alone', () => {
    const groups = groupRows([
      row({ rootId: 'ped', tags: ['C.ped'], docUpdatedAt: '2026-03-01T00:00:00.000Z' }),
      row({ rootId: 'eq', tags: ['C.equilibrium'], docUpdatedAt: '2026-02-01T00:00:00.000Z' }),
      row({ rootId: 'coarse', tags: ['C', 'free tag'], docUpdatedAt: '2026-01-01T00:00:00.000Z' }),
      row({ rootId: 'ped2', tags: ['C.ped', 'C.equilibrium'], docUpdatedAt: '2025-12-01T00:00:00.000Z' }),
    ]);
    const sections = railSections(groups, 'C');
    expect(sections.map((s) => [s.key, s.label, s.groups.map((g) => g.rootId)])).toEqual([
      ['C.equilibrium', 'Demand, supply and price', ['eq']],
      ['C.ped', 'Price elasticity of demand', ['ped', 'ped2']],
      ['general', 'General', ['coarse']],
    ]);
    expect(railOrder(sections).map((g) => g.rootId)).toEqual(['eq', 'ped', 'ped2', 'coarse']);
  });

  it('a question under two sub-topics sits once, under its first tag', () => {
    const groups = groupRows([row({ rootId: 'x', tags: ['C.pes', 'C.ped'] })]);
    expect(railSections(groups, 'C').map((s) => s.key)).toEqual(['C.pes']);
  });

  it('search results and All questions are sectioned by coarse topic, untagged last', () => {
    const groups = groupRows([
      row({ rootId: 'none', tags: ['my tag'] }),
      row({ rootId: 'd', tags: ['D.structure'] }),
      row({ rootId: 'a', tags: ['A'] }),
    ]);
    expect(railSections(groups, 'all').map((s) => [s.key, s.label])).toEqual([
      ['A', 'A · Basic Economic Concepts'],
      ['D', 'D · Competition and Market Structure'],
      ['none', 'No topic'],
    ]);
  });

  it('a fine topic is one section', () => {
    const groups = groupRows([row({ rootId: 'x', tags: ['C.ped'] })]);
    expect(railSections(groups, 'C.ped').map((s) => s.key)).toEqual(['C.ped']);
    expect(railSections([], 'C')).toEqual([]);
  });
});

describe('suggestTopics', () => {
  it('ranks the same worksheet first: most questions, then nearest, then the whole bank', () => {
    const rows = [
      row({ docId: 'w', rootId: 't', number: 5, tags: [] }),
      row({ docId: 'w', rootId: 'a', number: 1, tags: ['H.money'] }),
      row({ docId: 'w', rootId: 'b', number: 2, tags: ['H.money', 'I.monetary'] }),
      row({ docId: 'w', rootId: 'c', number: 6, tags: ['H.banks', 'my free tag'] }),
      row({ docId: 'w', rootId: 'd', number: 9, tags: ['F.price-level'] }),
      // Elsewhere: C.ped is the most used overall, then A.
      row({ docId: 'x', rootId: 'e', tags: ['C.ped'] }),
      row({ docId: 'x', rootId: 'f', tags: ['C.ped'] }),
      row({ docId: 'y', rootId: 'g', tags: ['A'] }),
    ];
    const target = rows[0];
    expect(suggestTopics(target, rows)).toEqual(['H.money', 'H.banks', 'I.monetary', 'F.price-level', 'C.ped']);
    expect(suggestTopics(target, rows, 7)).toEqual(['H.money', 'H.banks', 'I.monetary', 'F.price-level', 'C.ped', 'A']);
  });

  it('with nothing tagged nearby, offers the most-used topics; with nothing tagged at all, none', () => {
    const rows = [
      row({ docId: 'w', rootId: 't', tags: [] }),
      row({ docId: 'x', rootId: 'a', tags: ['E.equity'] }),
      row({ docId: 'x', rootId: 'b', tags: ['J.trade'] }),
      row({ docId: 'y', rootId: 'c', tags: ['J.trade'] }),
    ];
    expect(suggestTopics(rows[0], rows)).toEqual(['J.trade', 'E.equity']);
    expect(suggestTopics(rows[0], [rows[0]])).toEqual([]);
  });

  it('never counts the question itself, or a copy of it', () => {
    const rows = [row({ docId: 'w', rootId: 't', tags: [] }), row({ docId: 'w', rootId: 't', tags: ['G.ad'] })];
    // The copy's tag still counts overall (it is a real use), but not as a neighbour.
    expect(suggestTopics(rows[0], rows)).toEqual(['G.ad']);
  });

  it('reads the class on the most recently sat paper and counts the questions its cohort has seen', () => {
    const rows = [
      // 4B in 2024-25 and 5A in 2025-26 are both DSE 2027.
      row({ docId: 'old', rootId: 'e', classes: ['4B'], usedOn: '2025-01-01' }),
      row({ docId: 'new', rootId: 'b', classes: [' 5A '], usedOn: '2026-03-01' }),
      row({ docId: 'mock', rootId: 'a', classes: ['5a'], usedOn: '2026-01-01' }),
      // Edited this month but sat long ago, a bank, and a draft: none is the latest use.
      row({ docId: 'tagged', rootId: 'f', classes: ['6C'], usedOn: '2024-03-01', docUpdatedAt: '2026-09-28T00:00:00.000Z' }),
      row({ docId: 'bank', rootId: 'c', classes: ['5A'], docKind: 'bank', usedOn: '2026-09-01' }),
      row({ docId: 'x', rootId: 'd', usedOn: '2026-09-02' }),
    ];
    const usage = latestClassUsage(rows)!;
    expect(usage).toMatchObject({ label: '5A · DSE 2027', used: 3, total: 6 });
    expect(usage.choice).toMatchObject({ id: 'dse:2027', target: { cohort: 2027 } });
    expect(latestClassUsage([row({ classes: ['Econ X'] })])).toMatchObject({ label: 'Class Econ X', used: 1, total: 1 });
    expect(latestClassUsage([row({})])).toBeUndefined();
  });

  it('labels a key by its coarse code and own name', () => {
    expect(suggestionLabel('H.money-supply')).toEqual({ code: 'H', name: 'Money supply' });
    expect(suggestionLabel('C')).toEqual({ code: 'C', name: 'Market and Price' });
  });
});
