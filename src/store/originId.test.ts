import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withOrigins } from '@/components/editor/exportOrigin';
import { duplicateSetPapers } from '@/model/duplicateSet';
import { createWorksheet } from '@/model/factories';
import { CURRENT_SCHEMA_VERSION, migrate, serializeWorksheet } from '@/model/migrations';
import { isOriginId } from '@/model/origin';
import type { Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';
import { duplicateWorksheet, parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { useWorksheetStore } from './worksheetStore';

/** Origin ids (k-0558): minted once per document, stored, kept by every export and save. */

const s = () => useWorksheetStore.getState();
const ID = '0b6f3c1e-5d4a-4c2b-9e8f-7a6b5c4d3e2f';

beforeEach(() => {
  useWorksheetStore.setState({ worksheet: createWorksheet(), past: [], future: [], dirty: false, readOnly: false });
});

describe('the open document', () => {
  it('opening one without an id leaves it as it is: a load is not an edit', () => {
    const old = createWorksheet();
    s().replaceWorksheet(old);
    expect(s().worksheet).toBe(old);
    expect(s().dirty).toBe(false);
  });

  it('its first export gives it an id, marked for autosave; later exports carry the same', () => {
    s().replaceWorksheet(createWorksheet());
    const id = s().ensureOrigin().originId;
    expect(isOriginId(id)).toBe(true);
    expect(s().worksheet.originId).toBe(id);
    expect(s().dirty).toBe(true);
    expect(s().past).toEqual([]);
    s().markSaved();
    expect(s().ensureOrigin().originId).toBe(id);
    expect(s().dirty).toBe(false);
  });

  it('its first save writes an id, and the editor holds the value written', async () => {
    const write = vi.spyOn(worksheetStore, 'save').mockResolvedValue(undefined);
    s().replaceWorksheet(createWorksheet());
    s().updateWorksheet({ name: 'Edited' });
    await s().save();
    const written = write.mock.calls[0][0];
    expect(isOriginId(written.originId)).toBe(true);
    expect(s().worksheet).toBe(written);
    expect(s().dirty).toBe(false);
    // An undo keeps the id: it is not an edit.
    s().undo();
    expect(s().worksheet.originId).toBe(written.originId);
    write.mockRestore();
  });

  it('forSave leaves any value but the open one alone', () => {
    s().replaceWorksheet(createWorksheet());
    const other = createWorksheet();
    expect(s().forSave(other)).toBe(other);
  });

  it('opened with an id keeps it and owes no save', () => {
    s().replaceWorksheet({ ...createWorksheet(), originId: ID });
    expect(s().worksheet.originId).toBe(ID);
    expect(s().ensureOrigin().originId).toBe(ID);
    expect(s().dirty).toBe(false);
  });

  it('keeps its id through edits, undo, and a recipe that rebuilds the document', () => {
    s().replaceWorksheet({ ...createWorksheet(), originId: ID });
    s().updateWorksheet({ name: 'Edited' });
    s().commit(() => ({ ...createWorksheet(), id: s().worksheet.id }));
    expect(s().worksheet.originId).toBe(ID);
    s().undo();
    s().undo();
    expect(s().worksheet.originId).toBe(ID);
  });

  it('a newer build’s file is never given one; its exports carry one for this session', () => {
    const newer: Worksheet = { ...createWorksheet(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    s().replaceWorksheet(newer);
    expect(s().readOnly).toBe(true);
    expect(s().worksheet.originId).toBeUndefined();
    const first = s().ensureOrigin().originId;
    expect(isOriginId(first)).toBe(true);
    expect(s().ensureOrigin().originId).toBe(first);
    expect(s().worksheet.originId).toBeUndefined();
    expect(s().dirty).toBe(false);
  });

  it('taking in a saved copy without the id keeps the id this tab gave it', () => {
    const saved = createWorksheet();
    s().replaceWorksheet(saved);
    const id = s().ensureOrigin().originId;
    s().markSaved();
    expect(s().adoptSavedDocument({ ...saved, name: 'Renamed elsewhere' })).toBe(true);
    expect(s().worksheet.originId).toBe(id);
    expect(s().worksheet.name).toBe('Renamed elsewhere');
  });
});

describe('saved documents', () => {
  it('survive a save and reload with their id', () => {
    const doc = { ...createWorksheet(), originId: ID };
    expect(parseWorksheet(stringifyWorksheet(doc))?.originId).toBe(ID);
    expect(migrate(JSON.parse(JSON.stringify(serializeWorksheet(doc)))).originId).toBe(ID);
  });

  it('a duplicate, or a duplicated set, gets its own id later, not the original’s', () => {
    const doc = { ...createWorksheet(), originId: ID };
    expect(duplicateWorksheet(doc, 'copy').originId).toBeUndefined();
    const [copy] = duplicateSetPapers([doc], { set: { id: 'set', name: 'Mock' }, bumpYear: false, lang: 'en', newId: () => 'c1' });
    expect(copy.originId).toBeUndefined();
  });

  it('a set’s other paper without one is given one and saved; the open one goes through the editor', async () => {
    const open = createWorksheet();
    s().replaceWorksheet(open);
    const other = createWorksheet();
    const withId = { ...createWorksheet(), originId: ID };
    const newer: Worksheet = { ...createWorksheet(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const saves: Worksheet[] = [];
    const out = await withOrigins([open, other, withId, newer], async (w) => void saves.push(w));
    expect(out[0].originId).toBe(s().worksheet.originId);
    expect(s().dirty).toBe(true);
    expect(isOriginId(out[1].originId)).toBe(true);
    expect(out[2]).toBe(withId);
    expect(isOriginId(out[3].originId)).toBe(true);
    // Only the other paper is written: the open one autosaves, a newer build's is never written.
    expect(saves).toEqual([out[1]]);
    expect(saves[0].updatedAt).toBe(other.updatedAt);
  });
});
