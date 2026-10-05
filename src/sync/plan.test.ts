import { describe, expect, it } from 'vitest';
import { createWorksheet } from '@/model/factories';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { contentOf, type Content } from './content';
import { derivedId } from './hash';
import { documentKey } from './keys';
import { plainNamer } from './names';
import { planDocument, planStray, planSync, type PlanContext, type SyncAction } from './plan';
import type { LocalDoc, RemoteDoc, RemoteFile } from './snapshot';
import type { BaseEntry, Place } from './types';

/** The planner as a truth table over (local, remote, base) for one document. */

const ctx: PlanContext = { namer: plainNamer('Home Mac'), now: new Date(2026, 9, 5, 14, 32) };
const NEWER = CURRENT_SCHEMA_VERSION + 97;
const ID = 'x';

function version(title: string, extra: Partial<Worksheet> = {}): Content {
  return contentOf({ ...createWorksheet(), id: ID, title: bi(title, ''), updatedAt: '2026-10-05T06:32:00.000Z', ...extra });
}

const v0 = version('base');
const v1 = version('edited here');
const v2 = version('edited there');

const local = (place: Place, content: Content | 'unreadable'): LocalDoc => ({ id: ID, place, content });
const file = (place: Place, revision: string, content?: Content | 'unreadable'): RemoteFile => ({
  key: documentKey(ID, place),
  revision,
  place,
  ...(content ? { content } : {}),
});
const remote = (f: RemoteFile | undefined, extra: RemoteDoc = {}): RemoteDoc | undefined =>
  f ? { ...extra, [f.place]: f } : undefined;
const base = (place: Place, schemaVersion = CURRENT_SCHEMA_VERSION): BaseEntry => ({
  id: ID,
  kind: 'worksheet',
  place,
  hash: v0.hash,
  revision: 'r0',
  schemaVersion,
});

const plan = (l: LocalDoc | undefined, r: RemoteDoc | undefined, b: BaseEntry | undefined) => planDocument(ID, l, r, b, ctx);
const shape = (action: SyncAction) => {
  switch (action.kind) {
    case 'upload':
      return `upload ${action.place}${action.cleanup ? ' +cleanup' : ''}`;
    case 'download':
      return `download ${action.place}`;
    case 'moveRemote':
      return `moveRemote ${action.to}`;
    case 'moveLocal':
      return `moveLocal ${action.to}`;
    case 'link':
      return `link ${action.entry.place}`;
    case 'conflict':
      return `conflict copy:${action.copy.place} id:${action.place}`;
    case 'hold':
      return `hold ${action.reason}`;
    default:
      return action.kind;
  }
};

describe('with a base: the document was live at the last sync', () => {
  const L = { same: local('live', v0), edited: local('live', v1), moved: local('trash', v0), gone: undefined };
  const R = {
    same: remote(file('live', 'r0')),
    edited: remote(file('live', 'r1', v2)),
    moved: remote(file('trash', 'r1', v0)),
    gone: undefined,
  };
  const table: [keyof typeof L, keyof typeof R, string][] = [
    ['same', 'same', 'nothing'],
    ['same', 'edited', 'download live'],
    ['same', 'moved', 'moveLocal trash'],
    ['same', 'gone', 'moveLocal trash'],
    ['edited', 'same', 'upload live'],
    ['edited', 'edited', 'conflict copy:live id:live'],
    ['edited', 'moved', 'upload live +cleanup'],
    ['edited', 'gone', 'upload live'],
    ['moved', 'same', 'moveRemote trash'],
    ['moved', 'edited', 'download live'],
    ['moved', 'moved', 'link trash'],
    ['moved', 'gone', 'nothing'],
    ['gone', 'same', 'download live'],
    ['gone', 'edited', 'download live'],
    ['gone', 'moved', 'download trash'],
    ['gone', 'gone', 'forget'],
  ];
  it.each(table)('local %s, remote %s → %s', (l, r, expected) => {
    expect(shape(plan(L[l], R[r], base('live')))).toBe(expected);
  });

  it('uploads against the revision it saw, and a new key against none', () => {
    expect(plan(L.edited, R.same, base('live'))).toMatchObject({ kind: 'upload', expect: 'r0' });
    expect(plan(L.edited, R.gone, base('live'))).toMatchObject({ kind: 'upload', expect: null });
    expect(plan(L.edited, R.moved, base('live'))).toMatchObject({ expect: null, cleanup: { key: 'trash/x.worksheet.json', revision: 'r1' } });
  });

  it('an edit and a trash here: the edited version goes to the remote Trash, the live file leaves', () => {
    expect(plan(local('trash', v1), R.same, base('live'))).toMatchObject({
      kind: 'upload',
      place: 'trash',
      expect: null,
      cleanup: { key: 'x.worksheet.json', revision: 'r0' },
    });
  });

  it('the same edit on both sides links; a rewrite with the same content only relinks', () => {
    expect(shape(plan(L.edited, remote(file('live', 'r1', v1)), base('live')))).toBe('link live');
    expect(shape(plan(L.same, remote(file('live', 'r5', v0)), base('live')))).toBe('link live');
  });

  it('a stray extra key beside the live file is never cleaned up on a blind upload', () => {
    const both = remote(file('live', 'r0'), { trash: file('trash', 'r9') });
    expect(plan(L.edited, both, base('live'))).toMatchObject({ kind: 'upload', place: 'live', expect: 'r0' });
    expect(plan(L.edited, both, base('live'))).not.toHaveProperty('cleanup');
  });
});

describe('with a base: the document was in Trash at the last sync', () => {
  const L = { same: local('trash', v0), restored: local('live', v0) };
  const R = { same: remote(file('trash', 'r0')), restored: remote(file('live', 'r1', v0)), edited: remote(file('live', 'r1', v2)) };
  it.each([
    ['in Trash both sides, remote purged', L.same, undefined, 'nothing'],
    ['purged here', undefined, R.same, 'purgeRemote'],
    ['restored here, purged there', L.restored, undefined, 'upload live'],
    ['restored there', L.same, R.restored, 'moveLocal live'],
    ['restored here', L.restored, R.same, 'moveRemote live'],
    ['restored and edited there', L.same, R.edited, 'download live'],
    ['purged here, restored and edited there', undefined, R.edited, 'download live'],
  ] as const)('%s → %s', (_name, l, r, expected) => {
    expect(shape(plan(l, r, base('trash')))).toBe(expected);
  });
});

describe('no base: first sync, or a second computer joining', () => {
  it.each([
    ['only here, live', local('live', v1), undefined, 'upload live'],
    ['only here, in Trash', local('trash', v1), undefined, 'upload trash'],
    ['only there, live', undefined, remote(file('live', 'r1', v2)), 'download live'],
    ['only there, in Trash', undefined, remote(file('trash', 'r1', v2)), 'download trash'],
    ['same content', local('live', v1), remote(file('live', 'r1', v1)), 'link live'],
    ['same content, trashed there: live wins', local('live', v1), remote(file('trash', 'r1', v1)), 'moveRemote live'],
    ['same content, trashed here: live wins', local('trash', v1), remote(file('live', 'r1', v1)), 'moveLocal live'],
    ['different content', local('live', v1), remote(file('live', 'r1', v2)), 'conflict copy:live id:live'],
    ['different, trashed here', local('trash', v1), remote(file('live', 'r1', v2)), 'conflict copy:trash id:live'],
  ] as const)('%s → %s', (_name, l, r, expected) => {
    expect(shape(plan(l, r, undefined))).toBe(expected);
  });

  it('links bytes that differ only in how they were written (same after the round trip)', () => {
    const reformatted = contentOf(v1.worksheet); // the same document, compared after stringify
    expect(shape(plan(local('live', v1), remote(file('live', 'r1', reformatted)), undefined))).toBe('link live');
  });
});

describe('keep both', () => {
  const action = plan(local('live', v1), remote(file('live', 'r1', v2)), base('live'));

  it('names this computer’s version from the injected namer and its own last edit', () => {
    if (action.kind !== 'conflict') throw new Error(action.kind);
    const at = new Date('2026-10-05T06:32:00.000Z');
    expect(action.copy.worksheet.name).toBe(ctx.namer.conflictCopy('edited here', at));
    expect(action.copy.worksheet.name).toMatch(/^edited here \(from Home Mac, \d+ Oct \d\d:\d\d\)$/);
    expect(action.copy.worksheet.title).toEqual(v1.worksheet.title);
    expect(action.copy.worksheet.questions).toEqual(v1.worksheet.questions);
  });

  it('derives the copy id from this version, so a resumed run makes the same copy', () => {
    if (action.kind !== 'conflict') throw new Error(action.kind);
    expect(action.copy.id).toBe(derivedId('conflict', ID, v1.hash));
    expect(plan(local('live', v1), remote(file('live', 'r1', v2)), base('live'))).toEqual(action);
  });

  it('never compares clocks: a remote edit stamped earlier than the base still wins the id', () => {
    const earlier = version('edited there, clock behind', { updatedAt: '2001-01-01T00:00:00.000Z' });
    expect(shape(plan(local('live', v0), remote(file('live', 'r1', earlier)), base('live')))).toBe('download live');
  });
});

describe('a newer build’s document', () => {
  const newer = version('from the newer build', { schemaVersion: NEWER });

  it('is downloaded (it opens read-only, as today)', () => {
    expect(shape(plan(local('live', v0), remote(file('live', 'r1', newer)), base('live')))).toBe('download live');
    expect(shape(plan(undefined, remote(file('live', 'r1', newer)), undefined))).toBe('download live');
  });

  it('is never uploaded over: a local edit becomes a copy instead', () => {
    expect(shape(plan(local('live', v1), remote(file('live', 'r0')), base('live', NEWER)))).toBe('conflict copy:live id:live');
    expect(shape(plan(local('live', v1), remote(file('live', 'r1', newer)), base('live')))).toBe('conflict copy:live id:live');
  });

  it('held here: written only where nothing is, and never given an older schema', () => {
    const mine = local('live', newer);
    expect(shape(plan(mine, undefined, undefined))).toBe('upload live');
    expect(shape(plan(mine, remote(file('live', 'r1', v2)), undefined))).toBe('hold newer-build');
    expect(shape(plan(local('live', version('newer, edited', { schemaVersion: NEWER })), remote(file('live', 'r0')), base('live')))).toBe(
      'hold newer-build',
    );
    expect(shape(plan(local('live', { ...newer, hash: v0.hash }), remote(file('live', 'r1', v2)), base('live')))).toBe('hold newer-build');
  });
});

describe('unreadable files are never read as deleted or overwritten', () => {
  it.each([
    ['local will not load, remote gone', local('live', 'unreadable'), undefined, 'hold unreadable-local'],
    ['local will not load, remote edited', local('live', 'unreadable'), remote(file('live', 'r1', v2)), 'hold unreadable-local'],
    ['remote torn, local edited', local('live', v1), remote(file('live', 'r1', 'unreadable')), 'hold unreadable'],
  ] as const)('%s → %s', (_name, l, r, expected) => {
    expect(shape(plan(l, r, base('live')))).toBe(expected);
  });
});

describe('provider conflict copies: the id inside decides', () => {
  const stray = (key: string, content: Content | 'unreadable'): RemoteFile => ({
    key,
    revision: 'r7',
    place: key.startsWith('trash/') ? 'trash' : 'live',
    content,
  });
  const snapshot = (own: RemoteFile) => ({ docs: new Map([[ID, { live: own }]]), strays: [] });

  it('one holding its document’s own content is dropped as a duplicate', () => {
    expect(planStray(stray('x (conflict copy).worksheet.json', v2), snapshot(file('live', 'r1', v2)), new Map(), ctx).kind).toBe('dropDuplicate');
    expect(planStray(stray('x.worksheet (1).json', v0), snapshot(file('live', 'r0')), new Map([[ID, base('live')]]), ctx).kind).toBe(
      'dropDuplicate',
    );
  });

  it('a different one becomes its own document under a content-derived id, the same on every computer', () => {
    const one = planStray(stray('x (conflict copy).worksheet.json', v1), snapshot(file('live', 'r1', v2)), new Map(), ctx);
    const two = planStray(stray('x.worksheet-PC.json', v1), snapshot(file('live', 'r1', v2)), new Map(), ctx);
    if (one.kind !== 'providerCopy' || two.kind !== 'providerCopy') throw new Error('expected copies');
    expect(one.copy.id).toBe(derivedId('provider', ID, v1.hash));
    expect(two.copy.id).toBe(one.copy.id);
    expect(one.copy.worksheet).toMatchObject({ id: one.copy.id, name: 'edited here (from another computer)' });
    expect(planStray(stray('trash/x (1).worksheet.json', v1), snapshot(file('live', 'r1', v2)), new Map(), ctx)).toMatchObject({
      copy: { place: 'trash' },
    });
  });

  it('a newer build’s copy is never re-id’d, and a torn one is reported', () => {
    expect(planStray(stray('x (2).worksheet.json', version('n', { schemaVersion: NEWER })), snapshot(file('live', 'r1', v2)), new Map(), ctx)).toEqual({
      kind: 'hold',
      key: 'x (2).worksheet.json',
      reason: 'newer-build',
    });
    expect(planStray(stray('x (2).worksheet.json', 'unreadable'), snapshot(file('live', 'r1', v2)), new Map(), ctx).kind).toBe('hold');
  });
});

describe('planSync', () => {
  it('plans every id on either side or in the base, then the strays, and leaves out nothing-to-do', () => {
    const a = { ...v0, worksheet: { ...v0.worksheet, id: 'a' } };
    const actions = planSync(
      new Map([['a', { id: 'a', place: 'live' as const, content: a }]]),
      { docs: new Map([[ID, { live: file('live', 'r0') }]]), strays: [] },
      new Map([[ID, base('live')]]),
      ctx,
    );
    expect(actions.map(shape)).toEqual(['upload live', 'download live']);
  });
});
