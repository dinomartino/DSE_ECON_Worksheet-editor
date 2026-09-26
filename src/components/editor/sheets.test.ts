import { describe, expect, it } from 'vitest';
import { createCoverPage } from '@/model/cover';
import { hasCoverSheet, showsPageRail } from './sheets';

describe('page rail visibility', () => {
  it('counts the cover as a sheet: cover + one page shows the rail', () => {
    expect(showsPageRail(1, true)).toBe(true);
    expect(showsPageRail(0, true)).toBe(false);
  });

  it('needs two body pages without a cover', () => {
    expect(showsPageRail(1, false)).toBe(false);
    expect(showsPageRail(2, false)).toBe(true);
  });

  it('a cover left out of the output is not a sheet', () => {
    const cover = createCoverPage({ paperStyle: 'mcq', now: new Date(2026, 8, 1) });
    expect(hasCoverSheet({ cover }, {})).toBe(true);
    expect(hasCoverSheet({ cover }, { omitCover: true })).toBe(false);
    expect(hasCoverSheet({}, {})).toBe(false);
  });
});
