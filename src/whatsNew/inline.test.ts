import { describe, expect, it } from 'vitest';
import { inlineTokens, isOpenableLink } from './inline';

describe('inlineTokens', () => {
  it('reads bold, code and links, keeping the rest as text', () => {
    expect(inlineTokens('**Export dialog**: a separate `.docx` — see [notes](https://x.test/a).')).toEqual([
      { kind: 'bold', children: [{ kind: 'text', text: 'Export dialog' }] },
      { kind: 'text', text: ': a separate ' },
      { kind: 'code', text: '.docx' },
      { kind: 'text', text: ' — see ' },
      { kind: 'link', href: 'https://x.test/a', children: [{ kind: 'text', text: 'notes' }] },
      { kind: 'text', text: '.' },
    ]);
  });

  it('nests code inside bold', () => {
    expect(inlineTokens('**a `b`**')).toEqual([
      {
        kind: 'bold',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'code', text: 'b' },
        ],
      },
    ]);
  });

  it('leaves unmatched markers literal, and never produces markup', () => {
    expect(inlineTokens('2 * 3 ** 4 `x [y](')).toEqual([{ kind: 'text', text: '2 * 3 ** 4 `x [y](' }]);
    expect(inlineTokens('<b>hi</b>')).toEqual([{ kind: 'text', text: '<b>hi</b>' }]);
    expect(inlineTokens('')).toEqual([]);
  });

  it('opens only https links', () => {
    expect(isOpenableLink('https://github.com')).toBe(true);
    expect(isOpenableLink('RELEASING.md')).toBe(false);
    expect(isOpenableLink('javascript:alert(1)')).toBe(false);
  });
});
