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
    const usedWith5A = row({ rootId: 'r1', docId: 'old', classTag: '5A 2025-26', contentKey: 'edited' });
    const bankOnly5A = row({ rootId: 'r2', docId: 'bank2', docKind: 'bank', classTag: '5A 2025-26' });
    const other = row({ rootId: 'r3', docId: 'x', classTag: '5B' });
    const all = [inBank, usedWith5A, bankOnly5A, other];
    expect(searchRows(all, { notUsedWithClass: '5a 2025-26 ' })).toEqual([bankOnly5A, other]);
    expect(searchRows(all, { notUsedWithClass: '' })).toEqual(all);
  });
});
