import { beforeEach, describe, expect, it } from 'vitest';
import { coverageRecord } from '@/coverage/result';
import { createWorksheet } from '@/model/factories';
import { savedCoverageReports } from '@/model/coverageReports';
import type { SavedCoverageReport, Worksheet } from '@/model/types';
import { deleteCoverageReport, keepCoverageReport, useCoverageSaves } from './coverageReports';
import { useWorksheetStore } from './worksheetStore';

function memoryStore(docs: Worksheet[], fail: string[] = []) {
  const map = new Map(docs.map((doc) => [doc.id, doc]));
  return {
    map,
    load: async (id: string) => map.get(id),
    save: async (doc: Worksheet) => {
      if (fail.includes(doc.id)) throw new Error('quota');
      map.set(doc.id, doc);
    },
  };
}

const paper = (id: string): Worksheet => ({ ...createWorksheet(), id });
const check = (ids: string[], scope: SavedCoverageReport['scope'] = ids.length > 1 ? 'set' : 'paper'): SavedCoverageReport =>
  coverageRecord(
    { id: `r-${ids.join('-')}`, language: 'en', title: 'Mock', scope, at: '2026-11-22T10:00:00.000Z', pageSize: 'A4' },
    ids.map((worksheetId, i) => ({ worksheetId, ...(scope === 'set' ? { paper: i + 1 } : {}), title: worksheetId, sent: 0, fingerprint: 'fp', results: [] })),
  );

describe('keeping a check with its papers (k-0489 v2)', () => {
  beforeEach(() => useWorksheetStore.getState().replaceWorksheet(paper('P1')));

  it('writes the stored copy, not the unsaved edits, and the open paper holds it outside undo', async () => {
    const stored = paper('P1');
    const store = memoryStore([stored]);
    // An unsaved edit in the editor.
    useWorksheetStore.getState().updateWorksheet({ name: 'Edited, not saved' });
    const record = check(['P1']);
    await expect(keepCoverageReport(record, store)).resolves.toBe(true);
    expect(useCoverageSaves.getState().byId[record.id]).toBe('saved');
    const saved = store.map.get('P1')!;
    expect(savedCoverageReports(saved).map((r) => r.id)).toEqual([record.id]);
    expect(saved.name).toBe(stored.name);
    const editor = useWorksheetStore.getState();
    expect(savedCoverageReports(editor.worksheet).map((r) => r.id)).toEqual([record.id]);
    expect(editor.worksheet.name).toBe('Edited, not saved');
    // ⌘Z takes back the edit, never the report.
    editor.undo();
    expect(savedCoverageReports(useWorksheetStore.getState().worksheet)).toHaveLength(1);
  });

  it('a whole set’s check goes to every paper; deleting it removes it from every paper', async () => {
    const store = memoryStore([paper('P1'), paper('P2')]);
    const record = check(['P1', 'P2']);
    await keepCoverageReport(record, store);
    expect(savedCoverageReports(store.map.get('P2')!).map((r) => r.id)).toEqual([record.id]);
    await expect(deleteCoverageReport(record, store)).resolves.toBe(true);
    expect(store.map.get('P1')).not.toHaveProperty('coverageReports');
    expect(store.map.get('P2')).not.toHaveProperty('coverageReports');
    expect(useWorksheetStore.getState().worksheet).not.toHaveProperty('coverageReports');
  });

  it('a new check replaces the last one on each paper it read, and only there (u-vouw)', async () => {
    const store = memoryStore([paper('P1'), paper('P2')]);
    const set = check(['P1', 'P2']);
    await keepCoverageReport(set, store);
    const later = { ...check(['P1']), id: 'r-later', at: '2026-11-22T11:00:00.000Z' };
    await keepCoverageReport(later, store);
    expect(store.map.get('P1')!.coverageReports).toHaveLength(1);
    expect(savedCoverageReports(store.map.get('P1')!).map((r) => r.id)).toEqual(['r-later']);
    expect(savedCoverageReports(useWorksheetStore.getState().worksheet).map((r) => r.id)).toEqual(['r-later']);
    expect(savedCoverageReports(store.map.get('P2')!).map((r) => r.id)).toEqual([set.id]);
  });

  it('a failed save is reported; the open paper still holds the check', async () => {
    const store = memoryStore([paper('P1')], ['P1']);
    const record = check(['P1']);
    await expect(keepCoverageReport(record, store)).resolves.toBe(false);
    expect(useCoverageSaves.getState().byId[record.id]).toBe('failed');
    expect(savedCoverageReports(useWorksheetStore.getState().worksheet)).toHaveLength(1);
  });
});
