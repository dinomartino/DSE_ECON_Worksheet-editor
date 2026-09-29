import { describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partsQuestion, row } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import type { Worksheet } from '@/model/types';
import { addTopics, bulkTopicEdit, copyWrites, removeTopics, replaceTopics, withQuestionTags, writeTags } from './writeBack';

const NOW = '2026-09-29T00:00:00.000Z';

describe('withQuestionTags', () => {
  const target = choiceQuestion('Along a straight-line demand curve…', '', ['C', 'mock 2025']);
  const other = partsQuestion('Explain a bumper harvest.');
  const doc = docWith([target, other], { classTag: '5A', updatedAt: '2026-01-01T00:00:00.000Z' });

  it('changes only the target question’s tags and preserves everything else', () => {
    const next = withQuestionTags(doc, [target.id], replaceTopics(['C.ped', 'C.equilibrium']), NOW);
    const { questions: before, updatedAt: _b, ...restBefore } = doc;
    const { questions: after, updatedAt, ...restAfter } = next;
    void _b;
    expect(updatedAt).toBe(NOW);
    expect(restAfter).toEqual(restBefore);
    expect(after[1]).toBe(before[1]); // the other question is the same object
    expect(after[0]).toEqual({ ...target, tags: ['C.ped', 'C.equilibrium', 'mock 2025'] });
    expect(doc.questions[0].tags).toEqual(['C', 'mock 2025']); // the input is untouched
  });

  it('adds without removing, drops an emptied key, and is a no-op when nothing changes', () => {
    const added = withQuestionTags(doc, [target.id, other.id], addTopics(['D']), NOW);
    expect(added.questions[0].tags).toEqual(['C', 'mock 2025', 'D']);
    expect(added.questions[1].tags).toEqual(['D']);

    const cleared = withQuestionTags(doc, [target.id], () => [], NOW);
    expect('tags' in cleared.questions[0]).toBe(false);

    expect(withQuestionTags(doc, [target.id], addTopics(['C']), NOW)).toBe(doc);
    expect(withQuestionTags(doc, ['missing'], addTopics(['C']), NOW)).toBe(doc);
  });
});

describe('writeTags', () => {
  function memoryStore(docs: Worksheet[]) {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    const writes: string[] = [];
    return {
      saved,
      writes,
      load: async (id: string) => saved.get(id),
      save: async (worksheet: Worksheet) => {
        writes.push(worksheet.id);
        saved.set(worksheet.id, worksheet);
      },
    };
  }

  it('loads and saves each owning document once, whatever the number of questions', async () => {
    const a1 = choiceQuestion('one');
    const a2 = choiceQuestion('two');
    const b1 = choiceQuestion('three');
    const docA = docWith([a1, a2]);
    const docB = docWith([b1]);
    const store = memoryStore([docA, docB]);
    const report = await writeTags(
      store,
      [
        { docId: docA.id, questionId: a1.id },
        { docId: docB.id, questionId: b1.id },
        { docId: docA.id, questionId: a2.id },
      ],
      addTopics(['H']),
    );
    expect(store.writes).toEqual([docA.id, docB.id]);
    expect(report).toEqual({ saved: [docA.id, docB.id], failed: [] });
    expect(store.saved.get(docA.id)!.questions.map((q) => q.tags)).toEqual([['H'], ['H']]);
  });

  it('reports a missing document and never rewrites one from a newer build', async () => {
    const q = choiceQuestion('newer');
    const newer = { ...docWith([q]), schemaVersion: 999 };
    const store = memoryStore([newer]);
    const report = await writeTags(
      store,
      [
        { docId: newer.id, questionId: q.id },
        { docId: 'gone', questionId: 'x' },
      ],
      addTopics(['A']),
    );
    expect(store.writes).toEqual([]);
    expect(report.failed.map((f) => f.docId)).toEqual([newer.id, 'gone']);
  });
});

describe('bulk topic edits', () => {
  it('removes only the named codes, and replaces codes while keeping free tags', () => {
    const tags = ['C', 'C.ped', 'mock 2025'];
    expect(bulkTopicEdit('remove', ['C', 'J'])(tags)).toEqual(['C.ped', 'mock 2025']);
    expect(removeTopics(['C.ped'])(tags)).toEqual(['C', 'mock 2025']);
    expect(bulkTopicEdit('replace', ['A'])(tags)).toEqual(['A', 'mock 2025']);
    expect(bulkTopicEdit('replace', [])(tags)).toEqual(['mock 2025']);
    expect(bulkTopicEdit('add', ['A', 'C'])(tags)).toEqual(['C', 'C.ped', 'mock 2025', 'A']);
  });
});

describe('copyWrites', () => {
  it('lists every copy of each named question once, and nothing else', () => {
    const rows = [
      row({ rootId: 'r', docId: 'd1', questionId: 'a' }),
      row({ rootId: 'x', docId: 'd1', questionId: 'b' }),
      row({ rootId: 'r', docId: 'd2', questionId: 'c' }),
      row({ rootId: 'r', docId: 'd2', questionId: 'c' }),
    ];
    expect(copyWrites(rows, ['r'])).toEqual([
      { docId: 'd1', questionId: 'a' },
      { docId: 'd2', questionId: 'c' },
    ]);
    expect(copyWrites(rows, new Set(['r', 'x']))).toHaveLength(3);
    expect(copyWrites(rows, [])).toEqual([]);
  });
});

describe('an edit from the bank reaches every copy', () => {
  function memoryStore(docs: Worksheet[]) {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    return { saved, load: async (id: string) => saved.get(id), save: async (w: Worksheet) => void saved.set(w.id, w) };
  }

  it('gives every writable copy the same topics and reports a copy from a newer build', async () => {
    const original = choiceQuestion('A price ceiling below equilibrium', '', ['C', 'mock']);
    const copy = { ...copyQuestion(original, 'bank'), tags: ['J'] };
    const third = copyQuestion(original, 'bank');
    const docA = docWith([original]);
    const docB = docWith([copy, choiceQuestion('Unrelated', '', ['A'])]);
    const newer = { ...docWith([third]), schemaVersion: 999 };
    const store = memoryStore([docA, docB, newer]);
    const rows = [docA, docB, newer].flatMap((doc) => rowsOf(doc));

    const report = await writeTags(store, copyWrites(rows, [original.id]), replaceTopics(['C.intervention']));

    expect(report.saved).toEqual([docA.id, docB.id]);
    expect(report.failed).toEqual([{ docId: newer.id, reason: 'it was saved by a newer version of the app' }]);
    expect(store.saved.get(docA.id)!.questions[0].tags).toEqual(['C.intervention', 'mock']);
    expect(store.saved.get(docB.id)!.questions.map((q) => q.tags)).toEqual([['C.intervention'], ['A']]);
    expect(store.saved.get(newer.id)).toBe(newer);
  });

  it('bulk remove takes a topic off every copy of every picked question', async () => {
    const q = choiceQuestion('Explain a bumper harvest', '', ['C', 'C.ped']);
    const copy = { ...copyQuestion(q, 'bank'), tags: ['C.ped', 'G'] };
    const docA = docWith([q]);
    const docB = docWith([copy]);
    const store = memoryStore([docA, docB]);
    const rows = [docA, docB].flatMap((doc) => rowsOf(doc));
    await writeTags(store, copyWrites(rows, [q.id]), bulkTopicEdit('remove', ['C.ped']));
    expect(store.saved.get(docA.id)!.questions[0].tags).toEqual(['C']);
    expect(store.saved.get(docB.id)!.questions[0].tags).toEqual(['G']);
  });
});
