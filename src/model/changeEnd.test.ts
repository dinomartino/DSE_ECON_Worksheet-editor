import { describe, expect, it } from 'vitest';
import { changeEnd, rt } from './text';

describe('changeEnd — where an undo leaves the caret', () => {
  it('lands after restored text, and where removed text was', () => {
    expect(changeEnd(rt('Answer'), rt('Answer one'))).toBe(10);
    expect(changeEnd(rt('Answer one'), rt('Answer'))).toBe(6);
    expect(changeEnd(rt('ab c'), rt('abXY c'))).toBe(4);
    expect(changeEnd(rt('aaa'), rt('aaaa'))).toBe(4);
    expect(changeEnd(undefined, rt('new'))).toBe(3);
  });

  it('is undefined when only formatting changed', () => {
    expect(changeEnd(rt('same'), [{ text: 'sa', bold: true }, { text: 'me' }])).toBeUndefined();
  });
});
