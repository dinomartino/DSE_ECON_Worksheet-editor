import { describe, expect, it } from 'vitest';
import { checkNearCopy } from './nearCopy';
import { ownDocs, pastPaperDocs, studioCorpus, type OwnRow, type PastRow } from './corpus';

const past = (tag: string, en: string, zh = ''): PastRow => ({ topicId: 'C', source: { exam: 'HKDSE', tag }, en, zh });
const own = (docId: string, questionId: string, contentKey: string, searchText: string): OwnRow => ({ docId, questionId, contentKey, searchText });

const STEM = 'a cafe raises the price of its milk tea from 20 to 25 dollars and the cups sold each day fall from 400 to 300 so demand for milk tea is';

describe('the near-copy corpus', () => {
  it('names a past paper question by its source tag, else by its topic', () => {
    const docs = pastPaperDocs([past('CE2011/P2/Q8', 'one'), past('', 'two')]);
    expect(docs.map((d) => d.id)).toEqual(['CE2011/P2/Q8', 'C#1']);
    expect(docs.every((d) => d.kind === 'bank')).toBe(true);
  });

  it("takes the teacher's own questions once each by content, both languages from one search text", () => {
    const docs = ownDocs([own('d1', 'q1', 'k1', `${STEM}\n價格彈性`), own('d2', 'q9', 'k1', 'copy'), own('d3', 'q2', 'k2', 'other')]);
    expect(docs.map((d) => d.id)).toEqual(['d1/q1', 'd3/q2']);
    expect(docs[0]).toMatchObject({ kind: 'mine', en: `${STEM}\n價格彈性`, zh: `${STEM}\n價格彈性` });
  });

  it('finds a draft that copies a past paper question, and one that copies the teacher’s own', () => {
    const a = studioCorpus([past('CE2011/P2/Q8', STEM)], [own('d1', 'q1', 'k1', 'the minister of finance announces a levy on sugary drinks next year which of the following will happen to the market')]);
    expect(a.past).toBe(1);
    expect(a.mine).toBe(1);
    const copy = checkNearCopy({ en: STEM, zh: '' }, a.index);
    expect(copy.tooClose).toBe(true);
    expect(copy.closest).toMatchObject({ id: 'CE2011/P2/Q8', kind: 'bank' });
    const mine = checkNearCopy({ en: 'The Minister of Finance announces a levy on sugary drinks next year. Which of the following will happen to the market', zh: '' }, a.index);
    expect(mine.closest?.kind).toBe('mine');
  });

  it('records that the Past paper bank was not available', () => {
    const none = studioCorpus(undefined, [own('d1', 'q1', 'k1', STEM)]);
    expect(none.past).toBeNull();
    expect(none.mine).toBe(1);
  });

  it('keeps the index for the same inputs, and rebuilds for new ones', () => {
    const rows = [past('CE2011/P2/Q8', STEM)];
    const mine: OwnRow[] = [];
    expect(studioCorpus(rows, mine)).toBe(studioCorpus(rows, mine));
    expect(studioCorpus([...rows], mine)).not.toBe(studioCorpus(rows, mine));
  });
});
