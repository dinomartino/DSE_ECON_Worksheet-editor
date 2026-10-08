import type { Glossary } from '@/glossary';
import { describe, expect, it } from 'vitest';
import { groupRows } from '@/library/group';
import { rowsOf } from '@/library/indexer';
import type { SlotQuery } from '@/library/slotMatch';
import { docWith, partedQuestion, row } from '@/library/testKit';
import { cartTopicLabel } from './bankCart';
import {
  alsoInText,
  entryIndex,
  partsTesting,
  testsThisText,
  testsWhatText,
  topicsByPart,
  latestClassUsage,
  levelForSearch,
  levelUp,
  parseLevel,
  railOrder,
  railSections,
  serializeLevel,
  suggestionLabel,
  suggestTopics,
  termsByTopic,
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
    expect(sections.map((s) => [s.key, s.label, s.entries.map((e) => e.group.rootId)])).toEqual([
      ['C.equilibrium', 'Demand, supply and price', ['eq', 'ped2']],
      ['C.ped', 'Price elasticity of demand', ['ped', 'ped2']],
      ['general', 'General', ['coarse']],
    ]);
    expect(railOrder(sections).map((e) => e.group.rootId)).toEqual(['eq', 'ped2', 'ped', 'ped2', 'coarse']);
  });

  it('a question under two sub-topics is listed under each, saying where else', () => {
    const groups = groupRows([row({ rootId: 'x', tags: ['C.pes', 'C.ped'] })]);
    const sections = railSections(groups, 'C');
    // Guide order: PED before PES, whatever order the tags were given in.
    expect(sections.map((s) => [s.key, s.entries.map((e) => e.alsoIn)])).toEqual([
      ['C.ped', [['Price elasticity of supply']]],
      ['C.pes', [['Price elasticity of demand']]],
    ]);
    const order = railOrder(sections);
    expect(new Set(order.map((e) => e.key)).size).toBe(2);
    expect(order.map((e) => e.query)).toEqual([{ topic: 'C.ped' }, { topic: 'C.pes' }]);
  });

  it('All questions lists a question under every coarse topic it touches', () => {
    const groups = groupRows([row({ rootId: 'x', tags: ['C.ped', 'I.fiscal'] })]);
    const sections = railSections(groups, 'all');
    expect(sections.map((s) => [s.key, s.entries.map((e) => [e.query, e.alsoIn])])).toEqual([
      ['C', [[{ topic: 'C' }, ['I · Macroeconomic Problems and Policies']]]],
      ['I', [[{ topic: 'I' }, ['C · Market and Price']]]],
    ]);
  });

  it('General asks after the coarse topic, No topic after nothing', () => {
    const general = railSections(groupRows([row({ rootId: 'g', tags: ['C'] })]), 'C');
    expect(general[0].entries[0].query).toEqual({ topic: 'C' });
    const none = railSections(groupRows([row({ rootId: 'n', tags: ['mine'] })]), 'all');
    expect(none[0].entries[0].query).toBeUndefined();
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

  it('puts the topics the question\'s own words point to first, three at most, then the neighbours', () => {
    const rows = [
      row({ docId: 'w', rootId: 't', number: 2, tags: [] }),
      row({ docId: 'w', rootId: 'a', number: 1, tags: ['H.money'] }),
      row({ docId: 'x', rootId: 'b', tags: ['C.ped'] }),
    ];
    const text = [{ code: 'C.intervention' }, { code: 'H.money' }, { code: 'C.equilibrium' }, { code: 'C.surplus' }];
    expect(suggestTopics(rows[0], rows, 5, text)).toEqual(['C.intervention', 'H.money', 'C.equilibrium', 'C.ped']);
    // A code this build does not know is never offered.
    expect(suggestTopics(rows[0], rows, 5, [{ code: 'C.later' }])).toEqual(['H.money', 'C.ped']);
    // Nothing tagged anywhere: the text alone still suggests.
    expect(suggestTopics(rows[0], [rows[0]], 5, [{ code: 'J.trade' }])).toEqual(['J.trade']);
  });

  it('names the terms behind each suggestion from the text, in both languages', () => {
    const glossary = { entries: [{ en: 'price ceiling', preferred: '價格上限' }, { en: 'shortage', preferred: '短缺' }] as unknown as Glossary['entries'] };
    const hits = [
      { code: 'C.intervention', hits: 1, terms: ['price ceiling'] },
      { code: 'C.equilibrium', hits: 1, terms: ['shortage'] },
    ];
    expect([...termsByTopic(hits, ['C.intervention', 'H.money'], glossary)]).toEqual([['C.intervention', ['price ceiling 價格上限']]]);
    expect(termsByTopic(hits, ['C.intervention'], null).size).toBe(0);
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

  it('labels a key by its coarse code and own name, in the view language', () => {
    expect(suggestionLabel('H.money-supply', 'en')).toEqual({ code: 'H', name: 'Money supply' });
    expect(suggestionLabel('H.money-supply', 'zh')).toEqual({ code: 'H', name: '貨幣供應' });
    expect(suggestionLabel('C', 'bilingual')).toEqual({ code: 'C', name: 'Market and Price', zh: '市場與價格' });
    expect(suggestionLabel('C.new')).toEqual({ code: 'C.new', name: 'C.new' });
  });
});

describe('a question tagged by part on the review page', () => {
  // (a) Law of demand, its (ii) on PED of its own; (b) Fiscal policy.
  const question = partedQuestion([{ tags: ['C.law-of-demand'], subs: [undefined, ['C.ped']] }, { tags: ['I.fiscal'] }]);
  const [lq] = rowsOf(docWith([question]));
  const labels = (query: SlotQuery) => partsTesting(lq, query).map((slot) => slot.label);

  it('is listed under each sub-topic of the topic, each entry naming the other', () => {
    const sections = railSections(groupRows([lq]), 'C');
    expect(sections.map((s) => [s.key, s.entries.map((e) => [e.query, e.alsoIn])])).toEqual([
      ['C.law-of-demand', [[{ topic: 'C.law-of-demand' }, ['Price elasticity of demand']]]],
      ['C.ped', [[{ topic: 'C.ped' }, ['Law of demand']]]],
    ]);
    expect(alsoInText(sections[0].entries[0].alsoIn)).toBe('Also in Price elasticity of demand');
    expect(alsoInText([])).toBeUndefined();
  });

  it('says which part tests the heading, a part standing for its sub-parts when all match', () => {
    expect(labels({ topic: 'C.law-of-demand' })).toEqual(['(a)(i)']);
    expect(labels({ topic: 'C.ped' })).toEqual(['(a)(ii)']);
    expect(labels({ topic: 'C' })).toEqual(['(a)']);
    expect(labels({ topic: 'I' })).toEqual(['(b)']);
    // Every part, or none: nothing to say.
    expect(labels({ topic: 'J' })).toEqual([]);
    expect(partsTesting(lq, undefined)).toEqual([]);
    const [whole] = rowsOf(docWith([partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.ped'] }])]));
    expect(partsTesting(whole, { topic: 'C.ped' })).toEqual([]);
  });

  it('reads in plain words', () => {
    expect(testsThisText(['(a)'])).toBe('Part (a) tests this');
    expect(testsThisText(['(a)(ii)', '(c)'])).toBe('Parts (a)(ii) and (c) test this');
    expect(testsThisText(['(a)', '(b)', '(d)'])).toBe('Parts (a), (b) and (d) test this');
    expect(testsThisText([])).toBeUndefined();
    expect(testsWhatText(['(a)(ii)'], { topic: 'C.ped' })).toBe('Part (a)(ii) tests Price elasticity of demand');
    expect(testsWhatText(['(a)', '(b)'], { pattern: { topic: 'C.ped', typeId: lq.typeId, name: 'Calculate PED' } })).toBe(
      'Parts (a) and (b) test Calculate PED',
    );
    expect(testsWhatText([], { topic: 'C' })).toBeUndefined();
  });

  it('lists a question once per 題型 it carries for the sub-topic, parts apart', () => {
    const two = partedQuestion([{ tags: ['C.ped', 'C.ped::Calculate PED'] }, { tags: ['C.ped', 'C.ped::Factors'] }]);
    const [row2] = rowsOf(docWith([two]));
    const [ped] = railSections(groupRows([row2]), 'C.ped');
    expect(ped.parts!.map((p) => [p.label, p.entries.map((e) => e.alsoIn)])).toEqual([
      ['Calculate PED', [['Factors']]],
      ['Factors', [['Calculate PED']]],
    ]);
    expect(ped.parts!.map((p) => partsTesting(row2, p.entries[0].query).map((slot) => slot.label))).toEqual([['(a)'], ['(b)']]);
    // Keys are unique and safe in a DOM attribute and a selector.
    const keys = ped.entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys.some((key) => key.includes('\u0000'))).toBe(false);
    // The sub-topic itself: every part tests it, so nothing is said.
    expect(partsTesting(row2, { topic: 'C.ped' })).toEqual([]);
  });

  it('steps through entries, and the stage keeps the heading it was reached under', () => {
    const order = railOrder(railSections(groupRows([lq, row({ rootId: 'other', tags: ['C.ped'] })]), 'C'));
    expect(order.map((e) => e.group.rootId)).toEqual([lq.rootId, lq.rootId, 'other']);
    expect(entryIndex(order, lq.rootId, order[1].key)).toBe(1);
    expect(entryIndex(order, lq.rootId, undefined)).toBe(0);
    expect(entryIndex(order, lq.rootId, order[2].key)).toBe(0);
    expect(entryIndex(order, 'gone', undefined)).toBe(-1);
    expect(entryIndex(order, undefined, order[0].key)).toBe(-1);
  });

  it('shows its topics by part, and as one list when every part tests the same', () => {
    expect(topicsByPart(lq)).toEqual([
      { label: '(a)(i)', tags: ['C.law-of-demand'] },
      { label: '(a)(ii)', tags: ['C.ped'] },
      { label: '(b)', tags: ['I.fiscal'] },
    ]);
    const [same] = rowsOf(docWith([partedQuestion([{ tags: ['C.ped'], subs: [undefined, ['C.ped']] }, { tags: ['I.fiscal'] }])]));
    expect(topicsByPart(same)).toEqual([
      { label: '(a)', tags: ['C.ped'] },
      { label: '(b)', tags: ['I.fiscal'] },
    ]);
    const [whole] = rowsOf(docWith([partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.ped'] }])]));
    expect(topicsByPart(whole)).toBeUndefined();
    expect(topicsByPart(row({ tags: ['C.ped'] }))).toBeUndefined();
  });

  it('reads in the cart by its first part’s topic', () => {
    expect(cartTopicLabel(lq.tags)).toBe('C · Law of demand +2');
  });
});
