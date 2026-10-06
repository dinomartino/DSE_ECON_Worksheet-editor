import { beforeEach, describe, expect, it } from 'vitest';
import { bi } from '@/model/text';
import { useNoticeStore } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { openEditorGuard } from './openEditor';
import type { SyncReport } from './run';
import { paper } from './testKit';

/** The open editor's side of sync: what it protects, what it takes in, what it says. */

const report = (conflicts: SyncReport['conflicts'] = []): SyncReport => ({
  status: 'ok',
  remoteWasEmpty: false,
  counts: {} as SyncReport['counts'],
  conflicts,
  held: [],
  errors: [],
});

const shown = () => useWorksheetStore.getState().worksheet.title.en.map((run) => run.text).join('');

describe('openEditorGuard', () => {
  let open = true;
  const guard = () => openEditorGuard(() => open);
  const doc = paper('Mine');

  beforeEach(() => {
    open = true;
    useWorksheetStore.getState().replaceWorksheet(doc);
    useNoticeStore.setState({ notices: [] });
  });

  it('is busy only for the open document with unsaved edits', () => {
    const g = guard();
    expect(g.isBusy(doc.id)).toBe(false);
    useWorksheetStore.setState({ dirty: true });
    expect(g.isBusy(doc.id)).toBe(true);
    expect(g.isBusy('another')).toBe(false);
    open = false; // the start screen: the last document is no longer being edited
    expect(g.isBusy(doc.id)).toBe(false);
  });

  it('takes a download of the clean open document in, and says so once the run ends', () => {
    const g = guard();
    const theirs = { ...doc, title: bi('Theirs', '') };
    g.onStoreChange({ docId: doc.id, kind: 'saved', origin: 'sync' }, theirs);
    expect(shown()).toBe('Theirs');
    expect(useWorksheetStore.getState().dirty).toBe(false);
    expect(useNoticeStore.getState().notices).toEqual([]);
    g.onReport(report());
    expect(useNoticeStore.getState().notices).toMatchObject([{ tone: 'info', body: 'Updated from your other computer.' }]);
    g.onReport(report());
    expect(useNoticeStore.getState().notices).toHaveLength(1);
  });

  it('says where its own version went when the run kept both', () => {
    const g = guard();
    g.onStoreChange({ docId: doc.id, kind: 'saved', origin: 'sync' }, { ...doc, title: bi('Theirs', '') });
    g.onReport(report([{ id: doc.id, copyId: 'copy', name: 'Mine (Mac, 5 Oct 14:32)' }]));
    expect(useNoticeStore.getState().notices).toMatchObject([
      { tone: 'warning', body: expect.stringContaining('“Mine (Mac, 5 Oct 14:32)”') },
    ]);
  });

  it('never replaces unsaved edits, another document, a local save, or a closed editor', () => {
    const g = guard();
    const theirs = { ...doc, title: bi('Theirs', '') };
    g.onStoreChange({ docId: doc.id, kind: 'saved' }, theirs);
    useWorksheetStore.setState({ dirty: true });
    g.onStoreChange({ docId: doc.id, kind: 'saved', origin: 'sync' }, theirs);
    useWorksheetStore.setState({ dirty: false });
    const other = paper('Other');
    g.onStoreChange({ docId: other.id, kind: 'saved', origin: 'sync' }, other);
    open = false;
    g.onStoreChange({ docId: doc.id, kind: 'saved', origin: 'sync' }, theirs);
    expect(shown()).toBe('Mine');
    g.onReport(report());
    expect(useNoticeStore.getState().notices).toEqual([]);
  });
});
