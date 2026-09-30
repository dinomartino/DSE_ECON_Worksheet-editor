import { describe, expect, it } from 'vitest';
import { searchRows } from './search';
import { row } from './testKit';

describe('searchRows', () => {
  const elastic = row({ searchText: 'price elasticity of demand\n需求價格彈性', tags: ['C.ped'], marks: 1, docId: 'p1' });
  const gdp = row({ searchText: 'gdp deflator\n本地生產總值', tags: ['F'], typeId: 'parts', marks: 6, docId: 'p2' });
  const free = row({ searchText: 'a free good', tags: ['past paper'], marks: 2, docId: 'p1' });
  const rows = [elastic, gdp, free];

  it('matches every word, case-insensitively, in either language', () => {
    expect(searchRows(rows, { text: 'Price  DEMAND' })).toEqual([elastic]);
    expect(searchRows(rows, { text: '價格' })).toEqual([elastic]);
    expect(searchRows(rows, { text: 'price gdp' })).toEqual([]);
    expect(searchRows(rows, { text: '  ' })).toEqual(rows);
    expect(searchRows(rows, {})).toEqual(rows);
  });

  it('finds questions by the title of the paper they live in, word by word', () => {
    const mock = row({ searchText: 'a tax on petrol', docId: 'm', docTitle: 'Mock 2026 Paper 1' });
    const quiz = row({ searchText: 'the mock market', docId: 'q', docTitle: 'Quiz 2025' });
    const all = [mock, quiz];
    expect(searchRows(all, { text: 'Mock 2026' })).toEqual([mock]);
    expect(searchRows(all, { text: 'mock' })).toEqual([mock, quiz]);
    // A word may come from the title and another from the question.
    expect(searchRows(all, { text: 'mock petrol' })).toEqual([mock]);
    expect(searchRows(all, { text: 'paper 2' })).toEqual([mock]);
    expect(searchRows(all, { text: 'Mock 2027' })).toEqual([]);
  });

  it('filters by topic (coarse covers fine), type, marks and document', () => {
    expect(searchRows(rows, { topic: 'C' })).toEqual([elastic]);
    expect(searchRows(rows, { topic: 'C.pes' })).toEqual([]);
    expect(searchRows(rows, { topic: 'past paper' })).toEqual([]);
    expect(searchRows(rows, { typeId: 'parts' })).toEqual([gdp]);
    expect(searchRows(rows, { marks: { min: 2 } })).toEqual([gdp, free]);
    expect(searchRows(rows, { marks: { min: 2, max: 4 } })).toEqual([free]);
    expect(searchRows(rows, { fromDocId: 'p1' })).toEqual([elastic, free]);
    expect(searchRows(rows, { excludeDocId: 'p1' })).toEqual([gdp]);
  });

  it('drops every version of a question used in a paper with the class', () => {
    const inBank = row({ rootId: 'r1', docId: 'bank', docKind: 'bank' });
    const usedWith5A = row({ rootId: 'r1', docId: 'old', classes: ['5A'], contentKey: 'edited' });
    const bankOnly5A = row({ rootId: 'r2', docId: 'bank2', docKind: 'bank', classes: ['5A'] });
    const other = row({ rootId: 'r3', docId: 'x', classes: ['Econ X'] });
    const draft = row({ rootId: 'r4', docId: 'draft' });
    const all = [inBank, usedWith5A, bankOnly5A, other, draft];
    expect(searchRows(all, { notUsedWith: [{ key: '5a' }] })).toEqual([bankOnly5A, other, draft]);
    expect(searchRows(all, { notUsedWith: [{ key: 'econx' }] })).toEqual([inBank, usedWith5A, bankOnly5A, draft]);
    expect(searchRows(all, { notUsedWith: [] })).toEqual(all);
  });
});
