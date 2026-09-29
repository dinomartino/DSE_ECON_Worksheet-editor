import { describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith, partsQuestion, row } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import type { Question, Worksheet } from '@/model/types';
import type { PatternRegistry } from '@/storage/patterns';
import {
  listPatterns,
  patternNames,
  patternWrites,
  removePatternEdit,
  renamePatternEdit,
  resolvePatternName,
  rowHasPattern,
  setPatternsEdit,
  thenEdit,
} from './patterns';
import { addTopics, removeTopics, replaceTopics, writeTags } from './tagWrites';

const MCQ = choiceQuestion('x').type;
const LQ = partsQuestion('x').type;

function withTags<Q extends Question>(question: Q, tags: string[]): Q {
  return { ...question, tags };
}

function memoryStore(docs: Worksheet[]) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  return {
    saved,
    load: async (id: string) => saved.get(id),
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
