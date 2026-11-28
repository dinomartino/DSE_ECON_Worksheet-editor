import { describe, expect, it } from 'vitest';
import { summarize } from '@/storage/document';
import { rowsOf } from '@/library/indexer';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith, partedQuestion, partsQuestion, row } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import type { Question, StructuredQuestion, Worksheet } from '@/model/types';
import type { PatternRegistry } from '@/storage/patterns';
import {
  everyTag,
  listPatterns,
  patternEdits,
  patternMix,
  patternNames,
  patternWrites,
  removePatternEdit,
  renamePatternEdit,
  resolvePatternName,
  rowHasPattern,
  rowPattern,
  rowPatterns,
  setPatternsEdit,
  thenEdit,
  likelyType,
  rowHasPatternName,
  startingSubTopics,
  subTopicList,
  subTopicTallies,
  sortBuckets,
  sortIntoEdit,
  sortProgress,
  sortSections,
  topicsToSort,
  unsortEdit,
} from './patterns';
import { addTopics, bulkTopicEdit, removeTopics, replaceTopics, writeTags } from './tagWrites';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import {
  NO_FILTERS,
  activeFilters,
  blockingFilter,
  clearFilter,
  tabPatternChoices,
  visibleGroups,
  type TabFilters,
} from './tabFilters';

const MCQ = choiceQuestion('x').type;
const LQ = partsQuestion('x').type;

function withTags<Q extends Question>(question: Q, tags: string[]): Q {
  return { ...question, tags };
}

function memoryStore(docs: Worksheet[]) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  return {
    saved,
    list: async () => [...saved.values()].map(summarize), load: async (id: string) => saved.get(id),
    save: async (worksheet: Worksheet) => void saved.set(worksheet.id, worksheet),
  };
}

const indexOf = (docs: Worksheet[]) => withSharedTags(docs.flatMap((doc) => rowsOf(doc)));

describe('listing 題型', () => {
  it('joins the registry with the names on questions, MCQ and LQ apart, counting distinct questions', () => {
    const registry: PatternRegistry = {
      patterns: [
        { topic: 'C.ped', typeId: MCQ, name: 'Calculate PED from TR' },
        { topic: 'C.ped', typeId: MCQ, name: 'Unused one' },
        { topic: 'C.pes', typeId: LQ, name: 'Elsewhere' },
      ],
    };
    const rows = [
      row({ typeId: MCQ, rootId: 'r1', tags: ['C.ped', 'C.ped::calculate ped from tr'] }),
      row({ typeId: MCQ, rootId: 'r1', tags: ['C.ped', 'C.ped::Calculate PED from TR'] }), // a copy: counted once
      row({ typeId: MCQ, rootId: 'r2', tags: ['C.ped', 'C.ped::Factors'] }),
      row({ typeId: LQ, rootId: 'r3', tags: ['C.ped', 'C.ped::Factors'] }), // same name, LQ: another 題型
    ];
    const all = listPatterns(rows, registry, { topic: 'C.ped' });
    expect(all.map((p) => [p.typeId, p.name, p.count, p.registered])).toEqual([
      [MCQ, 'Calculate PED from TR', 1, true],
      [MCQ, 'Factors', 1, false],
      [MCQ, 'Unused one', 0, true],
      [LQ, 'Factors', 1, false],
    ]);
    // A coarse scope takes its sub-topics.
    expect(listPatterns(rows, registry, { topic: 'C' }).map((p) => p.name)).toContain('Elsewhere');
    expect(patternNames(rows, registry, 'C.ped', LQ)).toEqual(['Factors']);
    expect(patternNames(rows, registry, 'C.ped', MCQ)).toEqual(['Calculate PED from TR', 'Factors', 'Unused one']);
    expect(resolvePatternName(' factors ', patternNames(rows, registry, 'C.ped', MCQ))).toBe('Factors');
    expect(resolvePatternName('New  one', [])).toBe('New one');
  });

  it('a row carries a 題型 only for its own type', () => {
    const r = row({ typeId: LQ, tags: ['C.ped::Factors'] });
    expect(rowHasPattern(r, { topic: 'C.ped', typeId: LQ, name: 'factors' })).toBe(true);
    expect(rowHasPattern(r, { topic: 'C.ped', typeId: MCQ, name: 'Factors' })).toBe(false);
  });
});

describe('tag edits keep 題型 with their sub-topic', () => {
  const tags = ['C.ped', 'C.ped::Factors', 'C.pes', 'C.pes::Identify', 'mock'];

  it('removing or replacing a sub-topic takes its 題型; adding leaves them', () => {
    expect(removeTopics(['C.ped'])(tags)).toEqual(['C.pes', 'C.pes::Identify', 'mock']);
    expect(replaceTopics(['C.pes'])(tags)).toEqual(['C.pes', 'C.pes::Identify', 'mock']);
    expect(addTopics(['D'])(tags)).toEqual([...tags, 'D']);
  });

  it('sets, swaps and clears one 題型 per sub-topic', () => {
    const edit = thenEdit(replaceTopics(['C.ped', 'C.pes']), setPatternsEdit({ 'C.ped': 'Calculate', 'C.pes': undefined }));
    expect(edit(tags)).toEqual(['C.ped', 'C.ped::Calculate', 'C.pes', 'mock']);
  });

  it('a picker’s choices become edits: a name sets, null clears, none chosen is left (or cleared when exact)', () => {
    const chosen = { 'C.ped': 'Calculate', 'C.pes': null, 'C.pd': undefined };
    expect(patternEdits(chosen)).toEqual({ 'C.ped': 'Calculate', 'C.pes': undefined });
    expect(patternEdits(chosen, true)).toEqual({ 'C.ped': 'Calculate', 'C.pes': undefined, 'C.pd': undefined });
    expect(patternEdits(undefined)).toEqual({});
  });

  it('bulk clears a 題型 without the sub-topic (Remove, "only its 題型"), or with Add and Replace', () => {
    const clearPed = setPatternsEdit(patternEdits({ 'C.ped': null }));
    expect(thenEdit(bulkTopicEdit('remove', []), clearPed)(tags)).toEqual(['C.ped', 'C.pes', 'C.pes::Identify', 'mock']);
    expect(thenEdit(bulkTopicEdit('add', ['C.ped']), clearPed)(tags)).toEqual(['C.ped', 'C.pes', 'C.pes::Identify', 'mock']);
    expect(thenEdit(bulkTopicEdit('replace', ['C.ped']), clearPed)(tags)).toEqual(['C.ped', 'mock']);
    // A sub-topic left alone keeps its 題型 in bulk.
    expect(thenEdit(bulkTopicEdit('add', ['C.ped']), setPatternsEdit(patternEdits({ 'C.ped': undefined })))(tags)).toEqual(tags);
  });

  it('counts the questions carrying a 題型 under each sub-topic, once per question', () => {
    const mix = patternMix([
      { tags: ['C.ped', 'C.ped::A', 'C.ped::B'] },
      { tags: ['C.ped', 'C.ped::A', 'C.pes', 'C.pes::X'] },
      { tags: ['C.ped', 'C.ped'] },
    ]);
    expect([...mix]).toEqual([
      ['C.ped', 2],
      ['C.pes', 1],
    ]);
  });

  it('rename, merge and delete touch only the named 題型', () => {
    expect(renamePatternEdit('C.ped', 'factors', 'Determinants')(tags)).toEqual([
      'C.ped',
      'C.ped::Determinants',
      'C.pes',
      'C.pes::Identify',
      'mock',
    ]);
    // Merging onto a name the question already holds leaves one.
    expect(renamePatternEdit('C.ped', 'A', 'B')(['C.ped::A', 'C.ped::B'])).toEqual(['C.ped::B']);
    expect(removePatternEdit('C.pes', 'Identify')(tags)).toEqual(['C.ped', 'C.ped::Factors', 'C.pes', 'mock']);
  });
});

describe('rename, merge and delete write every copy of every question using the 題型', () => {
  function setup() {
    const mcq = withTags(choiceQuestion('PED from TR'), ['C.ped', 'C.ped::Calculate']);
    const lq = withTags(partsQuestion('Explain PED'), ['C.ped', 'C.ped::Calculate']); // same name, LQ
    const other = withTags(choiceQuestion('Factors'), ['C.ped', 'C.ped::Factors']);
    const paper = docWith([mcq, lq, other], { classes: ['5A'] });
    const copy = copyQuestion(mcq, paper.id); // in a second worksheet
    const second = docWith([copy]);
    const newer = docWith([copyQuestion(mcq, paper.id)], { schemaVersion: CURRENT_SCHEMA_VERSION + 1 } as Partial<Worksheet>);
    return { mcq, lq, other, paper, copy, second, newer };
  }

  it('renames across worksheets, MCQ only, and reports a newer-build document instead of writing it', async () => {
    const { mcq, lq, paper, copy, second, newer } = setup();
    const store = memoryStore([paper, second, newer]);
    const rows = indexOf([paper, second, newer]);
    const pattern = { topic: 'C.ped', typeId: MCQ, name: 'Calculate' };
    const writes = patternWrites(rows, pattern);
    expect(writes.map((w) => w.docId).sort()).toEqual([paper.id, second.id, newer.id].sort());

    const report = await writeTags(store, writes, renamePatternEdit('C.ped', 'Calculate', 'Calculate PED from TR'));
    expect(report.saved.sort()).toEqual([paper.id, second.id].sort());
    expect(report.failed).toEqual([{ docId: newer.id, reason: 'it was saved by a newer version of the app' }]);

    const saved = (docId: string, questionId: string) => store.saved.get(docId)!.questions.find((q) => q.id === questionId)!.tags;
    expect(saved(paper.id, mcq.id)).toEqual(['C.ped', 'C.ped::Calculate PED from TR']);
    expect(saved(second.id, copy.id)).toEqual(['C.ped', 'C.ped::Calculate PED from TR']);
    expect(saved(paper.id, lq.id)).toEqual(['C.ped', 'C.ped::Calculate']); // the LQ 題型 is another list
    expect(store.saved.get(newer.id)).toBe(newer);
  });

  it('merges into another 題型 and deletes one, leaving the questions and topics', async () => {
    const { mcq, other, paper, copy, second } = setup();
    const store = memoryStore([paper, second]);
    let rows = indexOf([paper, second]);
    await writeTags(store, patternWrites(rows, { topic: 'C.ped', typeId: MCQ, name: 'Factors' }), renamePatternEdit('C.ped', 'Factors', 'Calculate'));
    const tagsOf = (docId: string, id: string) => store.saved.get(docId)!.questions.find((q) => q.id === id)!.tags;
    expect(tagsOf(paper.id, other.id)).toEqual(['C.ped', 'C.ped::Calculate']);

    rows = indexOf([...store.saved.values()]);
    const merged = listPatterns(rows, { patterns: [] }, { topic: 'C.ped', typeId: MCQ });
    expect(merged.map((p) => [p.name, p.count])).toEqual([['Calculate', 2]]);

    await writeTags(store, patternWrites(rows, merged[0]), removePatternEdit('C.ped', 'Calculate'));
    expect(tagsOf(paper.id, mcq.id)).toEqual(['C.ped']);
    expect(tagsOf(paper.id, other.id)).toEqual(['C.ped']);
    expect(tagsOf(second.id, copy.id)).toEqual(['C.ped']);
  });
});

describe('a later build’s sub-topic in the registry', () => {
  it('is kept but not shown', () => {
    const registry: PatternRegistry = {
      patterns: [
        { topic: 'C.ped', typeId: MCQ, name: 'Shown' },
        { topic: 'C.new-sub', typeId: MCQ, name: 'Kept, unshown' },
      ],
    };
    expect(listPatterns([], registry).map((p) => p.name)).toEqual(['Shown']);
    expect(listPatterns([], registry, { topic: 'C' }).map((p) => p.name)).toEqual(['Shown']);
  });
});

describe('題型 on a question tagged per part', () => {
  it('lists every 題型 a question carries under a sub-topic, once each', () => {
    const [lq] = rowsOf(docWith([partedQuestion([{ tags: ['C.ped', 'C.ped::Calculate PED'] }, { tags: ['C.ped', 'C.ped::Explain PED', 'C.ped::calculate  ped'] }])]));
    expect(rowPatterns(lq, 'C.ped')).toEqual(['Calculate PED', 'Explain PED']);
    expect(rowPattern(lq, 'C.ped')).toBe('Calculate PED');
    expect(rowHasPattern(lq, { topic: 'C.ped', typeId: lq.typeId, name: 'Explain PED' })).toBe(true);
  });

  it('a rename or delete reaches a part list no leaf inherits', async () => {
    // (a)'s own list is shadowed: both its sub-parts have their own.
    const question = partedQuestion([{ tags: ['C.ped', 'C.ped::Old'], subs: [['D'], ['E.equity']] }]);
    const doc = docWith([question]);
    const rows = withSharedTags(rowsOf(doc));
    const pattern = { topic: 'C.ped', typeId: rows[0].typeId, name: 'Old' };
    expect(rowHasPattern(rows[0], pattern)).toBe(false); // not in the derived tags
    expect(everyTag(rows[0])).toContain('C.ped::Old');
    const writes = patternWrites(rows, pattern);
    expect(writes).toHaveLength(1);
    const saved = new Map([[doc.id, doc]]);
    await writeTags({ list: async () => [...saved.values()].map(summarize), load: async (id) => saved.get(id), save: async (w: Worksheet) => void saved.set(w.id, w) }, writes, removePatternEdit('C.ped', 'Old'));
    expect((saved.get(doc.id)!.questions[0] as StructuredQuestion).parts[0].tags).toEqual(['C.ped']);
  });
});

const MCQPm = createMcqQuestion().type;
const LQPm = createStructuredQuestion().type;
const f = (patch: Partial<TabFilters>): TabFilters => ({ ...NO_FILTERS, ...patch });
const ctx = { openDocId: 'open' };

// Three PED questions (one LQ), one market-intervention one, a coarse-only one; one PED MCQ has two copies.
const rows = [
  row({ docId: 'a', rootId: 'q1', typeId: MCQPm, tags: ['C', 'C.ped', 'C.ped::PED and total revenue'] }),
  row({ docId: 'b', rootId: 'q1', typeId: MCQPm, tags: ['C', 'C.ped', 'C.ped::PED and total revenue'] }),
  row({ docId: 'a', rootId: 'q2', typeId: MCQPm, tags: ['C.ped'] }),
  row({ docId: 'a', rootId: 'q3', typeId: LQPm, tags: ['C.ped', 'C.ped::PED and total revenue'] }),
  row({ docId: 'a', rootId: 'q4', typeId: MCQPm, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q5', typeId: LQPm, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q6', typeId: LQPm, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q7', typeId: MCQPm, tags: ['D'] }),
  row({ docId: 'open', rootId: 'q8', typeId: MCQPm, tags: ['C.ped', 'C.ped::Calculate PED'] }),
];

describe('the 題型 map’s tallies', () => {
  it('counts each sub-topic’s questions once per question, and those without a 題型 there, by type', () => {
    const tallies = subTopicTallies(rows);
    expect(tallies.get('C.ped')).toEqual({ topic: 'C.ped', questions: 4, without: 1, withoutByType: { [MCQPm]: 1 } });
    expect(tallies.get('C.intervention')).toEqual({ topic: 'C.intervention', questions: 3, without: 3, withoutByType: { [MCQPm]: 1, [LQPm]: 2 } });
    // A coarse topic holds no 題型: it is never a tally.
    expect(tallies.has('C')).toBe(false);
    expect(tallies.has('D')).toBe(false);
  });

  it('starts where the most questions lack a 題型, and a new 題型 there takes their usual type', () => {
    const tallies = subTopicTallies(rows);
    expect(startingSubTopics(tallies).map((tally) => tally.topic)).toEqual(['C.intervention', 'C.ped']);
    expect(startingSubTopics(tallies, 1).map((tally) => tally.topic)).toEqual(['C.intervention']);
    expect(likelyType(tallies.get('C.intervention'), [MCQPm, LQPm])).toBe(LQPm);
    expect(likelyType(tallies.get('C.ped'), [MCQPm, LQPm])).toBe(MCQPm);
    expect(likelyType(undefined, [MCQPm, LQPm])).toBe(MCQPm);
  });

  it('lists a sub-topic’s 題型 as one list: by name, MCQ before LQ for a shared name', () => {
    const items = listPatterns(rows, { patterns: [{ topic: 'C.ped', typeId: LQPm, name: 'Explain TR with a diagram' }] });
    expect(subTopicList(items, 'C.ped').map((item) => [item.name, item.typeId, item.count])).toEqual([
      ['Calculate PED', MCQPm, 1],
      ['Explain TR with a diagram', LQPm, 0],
      ['PED and total revenue', MCQPm, 1],
      ['PED and total revenue', LQPm, 1],
    ]);
  });
});

describe('the editor 題庫 tab’s 題型 filter', () => {
  it('matches a row by name under the sub-topic, whatever its type, ignoring case', () => {
    expect(rowHasPatternName(rows[0], 'C.ped', 'ped AND total revenue')).toBe(true);
    expect(rowHasPatternName(rows[0], 'C.pes', 'PED and total revenue')).toBe(false);
    expect(rowHasPatternName(rows[2], 'C.ped', 'PED and total revenue')).toBe(false);
  });

  it('offers the names questions outside the open paper carry, with their types', () => {
    expect(tabPatternChoices(rows, 'C.ped', '', 'open')).toEqual([{ name: 'PED and total revenue', typeIds: [MCQPm, LQPm], count: 2 }]);
    expect(tabPatternChoices(rows, 'C.ped', LQPm, 'open')).toEqual([{ name: 'PED and total revenue', typeIds: [LQPm], count: 1 }]);
    // Under a coarse topic, or one with no 題型 in use: nothing to offer.
    expect(tabPatternChoices(rows, 'C', '', 'open')).toEqual([]);
    expect(tabPatternChoices(rows, 'C.intervention', '', 'open')).toEqual([]);
  });

  it('narrows the list, by type too when one is set', () => {
    const roots = (filters: TabFilters) => visibleGroups(rows, filters, ctx).map((entry) => entry.group.rootId);
    expect(roots(f({ topic: 'C.ped', pattern: 'PED and total revenue' }))).toEqual(['q1', 'q3']);
    expect(roots(f({ topic: 'C.ped', typeId: LQPm, pattern: 'PED and total revenue' }))).toEqual(['q3']);
    // A 題型 left over under a coarse topic narrows nothing.
    expect(roots(f({ topic: 'C', pattern: 'PED and total revenue' }))).toHaveLength(6);
  });

  it('is a filter of its own: listed, cleared alone, and cleared with its topic', () => {
    const filters = f({ topic: 'C.ped', pattern: 'PED and total revenue' });
    expect(activeFilters(filters, ctx)).toEqual(['pattern', 'topic']);
    expect(activeFilters(f({ topic: 'C', pattern: 'x' }), ctx)).toEqual(['topic']);
    expect(clearFilter(filters, 'pattern')).toEqual(f({ topic: 'C.ped' }));
    expect(clearFilter(filters, 'topic')).toEqual(NO_FILTERS);
    expect(blockingFilter(rows, f({ topic: 'C.ped', typeId: LQPm, pattern: 'Nothing like it' }), ctx)).toBe('pattern');
  });
});

const MCQPs = createMcqQuestion().type;
const LQPs = createStructuredQuestion().type;

// C: four PED questions (one sorted, one with two copies), two intervention; D: one; a coarse-only one.
const rowsPs = [
  row({ docId: 'a', rootId: 'q1', typeId: MCQPs, marks: 1, tags: ['C.ped', 'C.ped::Calculate PED'] }),
  row({ docId: 'a', rootId: 'q2', typeId: LQPs, marks: 6, tags: ['C.ped'], excerpt: { en: 'Explain', zh: '' } }),
  row({ docId: 'b', rootId: 'q2', typeId: LQPs, marks: 6, tags: ['C.ped'], excerpt: { en: 'Explain', zh: '' } }),
  row({ docId: 'a', rootId: 'q3', typeId: MCQPs, marks: 1, tags: ['C.ped'], excerpt: { en: 'B stem', zh: '' } }),
  row({ docId: 'a', rootId: 'q4', typeId: MCQPs, marks: 1, tags: ['C.ped', 'C.intervention'], excerpt: { en: 'A stem', zh: '' } }),
  row({ docId: 'a', rootId: 'q5', typeId: MCQPs, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q6', typeId: MCQPs, tags: ['D.structure', 'D.structure::Features'] }),
  row({ docId: 'a', rootId: 'q7', typeId: MCQPs, tags: ['E'] }),
];

describe('sorting questions into 題型', () => {
  it('counts each question once: sorted when every sub-topic it carries has a 題型', () => {
    const progress = sortProgress(rowsPs);
    expect(progress.questions).toBe(6);
    expect(progress.sorted).toBe(2);
    expect(progress.topics).toEqual([
      { topic: 'C', questions: 5, notSorted: 4 },
      { topic: 'D', questions: 1, notSorted: 0 },
    ]);
    expect(topicsToSort(progress).map((entry) => entry.topic)).toEqual(['C']);
  });

  it('lays a topic out per sub-topic, one card per question, MCQ first, then marks and text', () => {
    const sections = sortSections(rowsPs, 'C');
    expect(sections.map((section) => [section.topic, section.sorted, section.notSorted.map((r) => r.rootId)])).toEqual([
      ['C.ped', 1, ['q4', 'q3', 'q2']],
      ['C.intervention', 0, ['q5', 'q4']],
    ]);
    expect(sortSections(rowsPs, 'Z')).toEqual([]);
  });

  it('a name listed under MCQ and LQ is one bucket', () => {
    const items = listPatterns(rowsPs, {
      patterns: [
        { topic: 'C.ped', typeId: LQPs, name: 'calculate ped' },
        { topic: 'C.ped', typeId: LQPs, name: 'Explain TR' },
      ],
    });
    expect(sortBuckets(items, 'C.ped')).toEqual([
      { name: 'Calculate PED', typeIds: [MCQPs, LQPs], count: 1 },
      { name: 'Explain TR', typeIds: [LQPs], count: 0 },
    ]);
  });

  it('sets the 題型 only on lists that hold the sub-topic, and takes it back', () => {
    expect(sortIntoEdit('C.ped', 'Calculate PED')(['C', 'C.ped'])).toEqual(['C', 'C.ped', 'C.ped::Calculate PED']);
    expect(sortIntoEdit('C.ped', 'Calculate PED')(['D.structure'])).toEqual(['D.structure']);
    expect(unsortEdit('C.ped')(['C.ped', 'C.ped::Calculate PED', 'x'])).toEqual(['C.ped', 'x']);
  });
});
