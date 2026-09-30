import { describe, expect, it } from 'vitest';
import { sheetStackMargin } from './sheetStack';

describe('sheetStackMargin', () => {
  it('reclaims nothing at 100%', () => {
    expect(sheetStackMargin(1, 297, 3)).toBeUndefined();
  });

  it('takes back every sheet and every gap between them', () => {
    expect(sheetStackMargin(0.5, 297, 3)).toBe('calc(-0.5 * (891mm + 2 * 1.5rem))');
  });

  it('counts the cover as a sheet (the caller passes pages + 1)', () => {
    expect(sheetStackMargin(0.5, 297, 1)).toBe('calc(-0.5 * (297mm + 0 * 1.5rem))');
  });

  it('grows the box when zoomed in, so the last sheet scrolls into reach', () => {
    expect(sheetStackMargin(1.5, 297, 2)).toBe('calc(0.5 * (594mm + 1 * 1.5rem))');
  });
});
