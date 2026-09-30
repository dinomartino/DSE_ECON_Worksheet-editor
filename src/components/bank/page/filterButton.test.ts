import { describe, expect, it } from 'vitest';
import { filterButtonLabel } from './FilterPopover';

describe('filterButtonLabel: the Filter button never truncates', () => {
  it('says Filter, or names one short filter', () => {
    expect(filterButtonLabel([])).toEqual({ text: 'Filter' });
    expect(filterButtonLabel(['MCQ'])).toEqual({ text: 'Filter · MCQ' });
  });

  it('counts a long filter, or several', () => {
    expect(filterButtonLabel(['not used with 5A, 5B, 5C (DSE 2027) since Sep 2025'])).toEqual({ text: 'Filter', count: 1 });
    expect(filterButtonLabel(['MCQ', '2–4 marks', 'from banks'])).toEqual({ text: 'Filters', count: 3 });
  });
});
