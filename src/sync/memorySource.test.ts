import { describe, expect, it } from 'vitest';
import { derivedId, sha256 } from './hash';
import { classifyKey, documentKey } from './keys';
import { MemoryCloud } from './memorySource';

describe('sha256', () => {
  it('matches the standard vectors, multi-block and non-ASCII included', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256('經濟')).toBe(sha256('經濟'));
    expect(sha256('經濟')).not.toBe(sha256('经济'));
  });

  it('derives the same ten-character id from the same parts', () => {
    expect(derivedId('a', 'b')).toBe(derivedId('a', 'b'));
    expect(derivedId('a', 'b')).not.toBe(derivedId('ab', ''));
    expect(derivedId('x')).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });
});

describe('keys', () => {
  it('names documents and Trash, and reads names back', () => {
    expect(documentKey('abc', 'live')).toBe('abc.worksheet.json');
    expect(documentKey('abc', 'trash')).toBe('trash/abc.worksheet.json');
    expect(classifyKey('abc.worksheet.json')).toEqual({ place: 'live', stem: 'abc' });
    expect(classifyKey('trash/abc.worksheet.json')).toEqual({ place: 'trash', stem: 'abc' });
  });

  it('keeps provider conflict copies as candidates and ignores everything else', () => {
    expect(classifyKey('abc (conflict copy).worksheet.json')).toEqual({ place: 'live', stem: 'abc (conflict copy)' });
    expect(classifyKey('abc.worksheet (1).json')).toEqual({ place: 'live' });
    expect(classifyKey('trash/abc.worksheet-PC.json')).toEqual({ place: 'trash' });
    for (const key of ['folders.json', 'patterns.json', 'graphs/g.graph.json', 'graphs/x.worksheet.json', '.abc.worksheet.json', 'notes.txt', '.worksheet.json']) {
      expect(classifyKey(key), key).toBeUndefined();
    }
  });
});

describe('MemoryCloud', () => {
  it('compare-and-swaps writes and removes', async () => {
    const source = new MemoryCloud().client('A');
    const first = await source.write('k', 'one', { expectRevision: null });
    expect(first.status).toBe('ok');
    expect(await source.write('k', 'two', { expectRevision: null })).toEqual({ status: 'conflict' });
    const rev = first.status === 'ok' ? first.revision : '';
    const second = await source.write('k', 'two', { expectRevision: rev });
    expect(second.status).toBe('ok');
    expect(await source.remove('k', { expectRevision: rev })).toEqual({ status: 'conflict' });
    expect(await source.remove('k', { expectRevision: second.status === 'ok' ? second.revision : '' })).toEqual({ status: 'ok' });
    expect(await source.read('k')).toEqual({ status: 'missing' });
    expect(await source.remove('k', { expectRevision: 'r1' })).toEqual({ status: 'missing' });
  });

  it('sends removed entries to its own trash', async () => {
    const cloud = new MemoryCloud();
    const source = cloud.client('A');
    const written = await source.write('k', 'kept', { expectRevision: null });
    await source.remove('k', { expectRevision: written.status === 'ok' ? written.revision : '' });
    expect(cloud.recycled).toEqual([{ key: 'k', text: 'kept' }]);
  });

  it('delays visibility: the writer sees its write, the other computer only after delivery', async () => {
    const cloud = new MemoryCloud();
    cloud.delayed = true;
    const [a, b] = [cloud.client('A'), cloud.client('B')];
    await a.write('k', 'from A', { expectRevision: null });
    expect(await a.read('k')).toMatchObject({ status: 'ok', text: 'from A' });
    expect(await b.read('k')).toEqual({ status: 'missing' });
    cloud.deliver();
    expect(await b.read('k')).toMatchObject({ status: 'ok', text: 'from A' });
  });

  it('turns crossing writes into a provider conflict copy, and drops a delete that met an edit', async () => {
    const cloud = new MemoryCloud();
    const base = cloud.put('x.worksheet.json', 'base');
    cloud.delayed = true;
    const [a, b] = [cloud.client('A'), cloud.client('B')];
    await a.write('x.worksheet.json', 'A', { expectRevision: base });
    await b.write('x.worksheet.json', 'B', { expectRevision: base });
    cloud.deliver();
    expect(cloud.files.get('x.worksheet.json')?.text).toBe('A');
    expect(cloud.files.get('x (conflict copy).worksheet.json')?.text).toBe('B');

    const rev = cloud.files.get('x.worksheet.json')!.revision;
    await a.write('x.worksheet.json', 'A2', { expectRevision: rev });
    await b.remove('x.worksheet.json', { expectRevision: rev });
    cloud.deliver();
    expect(cloud.files.get('x.worksheet.json')?.text).toBe('A2');
  });

  it('identical crossing writes land once', async () => {
    const cloud = new MemoryCloud();
    cloud.delayed = true;
    await cloud.client('A').write('k.worksheet.json', 'same', { expectRevision: null });
    await cloud.client('B').write('k.worksheet.json', 'same', { expectRevision: null });
    cloud.deliver();
    expect([...cloud.files.keys()]).toEqual(['k.worksheet.json']);
  });

  it('goes unavailable now, or after a number of calls', async () => {
    const cloud = new MemoryCloud();
    const source = cloud.client('A');
    cloud.setUnavailable('A', true);
    expect(await source.list()).toEqual({ status: 'unavailable' });
    cloud.setUnavailable('A', false);
    cloud.failAfter('A', 2);
    expect((await source.list()).status).toBe('ok');
    expect((await source.read('k')).status).toBe('missing');
    expect(await source.read('k')).toEqual({ status: 'unavailable' });
    expect(await cloud.client('B').read('k')).toEqual({ status: 'missing' });
  });

  it('reports changed keys since a cursor, and reset for an unknown or forgotten one', async () => {
    const cloud = new MemoryCloud();
    const source = cloud.client('A');
    const first = await source.changes(null);
    expect(first.status).toBe('reset');
    const cursor = first.status === 'reset' ? first.cursor : '';
    cloud.put('a', '1');
    cloud.put('b', '2');
    cloud.put('a', '3');
    const next = await source.changes(cursor);
    expect(next).toMatchObject({ status: 'ok', keys: ['a', 'b'] });
    cloud.compactLog();
    expect((await source.changes(next.status === 'ok' ? next.cursor : '')).status).toBe('reset');
  });
});
