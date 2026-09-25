import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChangelog } from './changelog';
import { decideWhatsNew, LAST_SEEN_VERSION_KEY, readLastSeen, writeLastSeen } from './seen';

const LOG = parseChangelog(`## Unreleased
### Added
- next

## 0.4.0 — 2026-10-01
### Added
- new thing

## 0.3.1 — 2026-09-28

## 0.3.0 — 2026-09-24
### Fixed
- old fix
`);

describe('decideWhatsNew', () => {
  it('a first-ever run shows nothing and records the version', () => {
    expect(decideWhatsNew('0.4.0', null, LOG, false)).toEqual({ kind: 'record', version: '0.4.0' });
  });

  it('after an update, shows the new version once', () => {
    expect(decideWhatsNew('0.4.0', '0.3.0', LOG, true)).toEqual({ kind: 'show', version: '0.4.0' });
    expect(decideWhatsNew('0.4.0', '0.3.0', LOG, false)).toEqual({ kind: 'show', version: '0.4.0' });
    expect(decideWhatsNew('0.4.0', '0.4.0', LOG, true)).toEqual({ kind: 'none' });
    expect(decideWhatsNew('v0.4.0', '0.4.0', LOG, true)).toEqual({ kind: 'none' });
  });

  it('saved work but no record means a build from before the key: an update', () => {
    expect(decideWhatsNew('0.4.0', null, LOG, true)).toEqual({ kind: 'show', version: '0.4.0' });
  });

  it('records silently on a downgrade, or when the version has no notes', () => {
    expect(decideWhatsNew('0.3.0', '0.4.0', LOG, true)).toEqual({ kind: 'record', version: '0.3.0' });
    expect(decideWhatsNew('0.3.1', '0.3.0', LOG, true)).toEqual({ kind: 'record', version: '0.3.1' });
    expect(decideWhatsNew('0.9.0', '0.3.0', LOG, true)).toEqual({ kind: 'record', version: '0.9.0' });
  });

  it('does nothing without a running version', () => {
    expect(decideWhatsNew(null, '0.3.0', LOG, true)).toEqual({ kind: 'none' });
  });
});

describe('the last-seen key', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lives outside the document prefix and the index', () => {
    expect(LAST_SEEN_VERSION_KEY.startsWith('econ-worksheet:')).toBe(false);
    expect(LAST_SEEN_VERSION_KEY).not.toBe('econ-worksheet-index');
  });

  it('round-trips, normalised', () => {
    expect(readLastSeen()).toBeNull();
    writeLastSeen('v0.4.0');
    expect(store.get(LAST_SEEN_VERSION_KEY)).toBe('0.4.0');
    expect(readLastSeen()).toBe('0.4.0');
  });

  it('blocked storage never throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(readLastSeen()).toBeNull();
    expect(() => writeLastSeen('0.4.0')).not.toThrow();
  });
});
