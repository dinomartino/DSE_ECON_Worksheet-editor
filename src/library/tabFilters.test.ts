import { describe, expect, it } from 'vitest';
import { createSectionElement } from '@/model/flow';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { choiceQuestion, docWith, row } from './testKit';
import {
  NO_FILTERS,
  anchorLabel,
  blockingFilter,
  fromDocuments,
  paperRoots,
  tabQuery,
  versionRows,
  visibleGroups,
  type TabFilters,
} from './tabFilters';

const choice = createMcqQuestion().type;
const parts = createStructuredQuestion().type;
const ctx = { openDocId: 'open', classTag: '5A' };
const f = (patch: Partial<TabFilters>): TabFilters => ({ ...NO_FILTERS, ...patch });

describe('tabQuery — the filters as one BankQuery', () => {
  it('passes only what is set, and always leaves the open paper out', () => {
    expect(tabQuery(NO_FILTERS, ctx)).toEqual({ excludeDocId: 'open' });
    expect(
      tabQuery(f({ text: ' elastic ', topic: 'C', typeId: choice, marks: '2-4', notUsedWithClass: true, from: { docId: 'd1' } }), ctx),
    ).toEqual({
      text: ' elastic ',
      topic: 'C',
      typeId: choice,
      marks: { min: 2, max: 4 },
      notUsedWithClass: '5A',
      fromDocId: 'd1',
      excludeDocId: 'open',
    });
  });

  it('drops "not used with" when the paper has no class', () => {
    expect(tabQuery(f({ notUsedWithClass: true }), { openDocId: 'open' })).toEqual({ excludeDocId: 'open' });
  });
});

describe('visibleGroups', () => {
  const older = row({ docId: 'a', rootId: 'r1', docUpdatedAt: '2026-01-01', contentKey: 'k1', typeId: choice, tags: ['C.ped'], searchText: 'elastic demand' });
  const newer = row({ docId: 'b', rootId: 'r1', docUpdatedAt: '2026-03-01', contentKey: 'k2', typeId: choice, tags: ['C.pes'], searchText: 'supply' });
  const openCopy = row({ docId: 'open', rootId: 'r1', docUpdatedAt: '2026-09-01', contentKey: 'k3' });
  const banked = row({ docId: 'bank', docKind: 'bank', rootId: 'r2', docUpdatedAt: '2026-02-01', typeId: parts, marks: 6, searchText: 'harvest' });
  const rows = [older, newer, openCopy, banked];

  it('never shows the open paper\'s own saved rows, and shows the newest admitted copy', () => {
    const all = visibleGroups(rows, NO_FILTERS, ctx);
    expect(all.map((g) => g.row)).toEqual([newer, banked]);
    expect(all[0].group.rows).not.toContain(openCopy);
    // A filter only the older version passes shows that version, but the group keeps both.
    const [hit] = visibleGroups(rows, f({ text: 'elastic' }), ctx);
    expect(hit.row).toBe(older);
    expect(hit.group.versions).toBe(2);
  });

  it('composes topic (coarse matches fine), type, marks and From', () => {
    expect(visibleGroups(rows, f({ topic: 'C' }), ctx).map((g) => g.row)).toEqual([newer]);
    expect(visibleGroups(rows, f({ typeId: parts }), ctx).map((g) => g.row)).toEqual([banked]);
    expect(visibleGroups(rows, f({ marks: '5-8' }), ctx).map((g) => g.row)).toEqual([banked]);
    expect(visibleGroups(rows, f({ from: 'banks' }), ctx).map((g) => g.row)).toEqual([banked]);
    expect(visibleGroups(rows, f({ from: { docId: 'a' } }), ctx).map((g) => g.row)).toEqual([older]);
  });

  it('"not used with" counts every version, but not the open paper\'s saved copy', () => {
    const used = row({ docId: 'c', rootId: 'r2', classTag: '5a', docUpdatedAt: '2025-01-01' });
    expect(visibleGroups([...rows, used], f({ notUsedWithClass: true }), ctx).map((g) => g.group.rootId)).toEqual(['r1']);
    const openUsed = { ...openCopy, classTag: '5A' };
    expect(visibleGroups([older, newer, openUsed], f({ notUsedWithClass: true }), ctx)).toHaveLength(1);
  });

  it('names the one filter whose clearing brings rows back', () => {
    expect(blockingFilter(rows, f({ topic: 'C', typeId: parts }), ctx)).toBe('typeId');
    expect(blockingFilter(rows, f({ text: 'nothing-matches' }), ctx)).toBe('text');
    expect(blockingFilter(rows, f({ text: 'nothing', topic: 'J' }), ctx)).toBeUndefined();
  });
});

describe('versionRows / fromDocuments', () => {
  it('one row per distinct content, newest first', () => {
    const [group] = visibleGroups(
      [
        row({ docId: 'x', rootId: 'r', contentKey: 'same', docUpdatedAt: '2026-01-01' }),
        row({ docId: 'y', rootId: 'r', contentKey: 'same', docUpdatedAt: '2026-02-01' }),
        row({ docId: 'z', rootId: 'r', contentKey: 'edited', docUpdatedAt: '2026-03-01' }),
      ],
      NO_FILTERS,
      ctx,
    );
    expect(versionRows(group.group).map((r) => r.docId)).toEqual(['z', 'y']);
  });

  it('lists the other documents, newest first, once each', () => {
    const docs = fromDocuments(
      [row({ docId: 'a', docTitle: 'A', docUpdatedAt: '1' }), row({ docId: 'a', docTitle: 'A', docUpdatedAt: '1' }), row({ docId: 'b', docTitle: 'B', docUpdatedAt: '2' }), row({ docId: 'open' })],
      'open',
    );
    expect(docs.map((d) => d.title)).toEqual(['B', 'A']);
  });
});

describe('paperRoots — "In this paper · Qn"', () => {
  it('keys the open paper by lineage.rootId, else the question\'s own id, with its printed number', () => {
    const original = choiceQuestion('Original');
    const copy = { ...choiceQuestion('A copy'), lineage: { rootId: 'root-elsewhere' } };
    const roots = paperRoots(docWith([original, copy]));
    expect(roots.get(original.id)).toEqual({ questionId: original.id, number: 1 });
    expect(roots.get('root-elsewhere')).toEqual({ questionId: copy.id, number: 2 });
    expect(roots.has(copy.id)).toBe(false);
  });
});

describe('anchorLabel — "Inserts after …"', () => {
  it('names the anchor by its printed number, a layout element by its kind, none as the end', () => {
    const q1 = choiceQuestion('One');
    const q2 = choiceQuestion('Two');
    const q3 = choiceQuestion('Three');
    const section = createSectionElement();
    const doc = {
      ...docWith([q1, q2, q3]),
      layout: [section],
      flow: [
        { type: 'question' as const, id: q1.id },
        { type: 'question' as const, id: q2.id },
        { type: 'layout' as const, id: section.id },
        { type: 'question' as const, id: q3.id },
      ],
    };
    expect(anchorLabel(doc, q2.id)).toBe('Q2');
    expect(anchorLabel(doc, undefined)).toBeUndefined();
    expect(anchorLabel(doc, 'gone')).toBeUndefined();
    expect(anchorLabel(doc, section.id)).toMatch(/section/i);
    // A section restarts numbering: the label follows the printed number, not the index.
    expect(anchorLabel(doc, q3.id)).toBe('Q1');
  });
});
