import { describe, it, expect } from 'vitest';
import { insertBlank, plain, richTextLength } from './text';
import type { RichText } from './types';

/**
 * A fill-in blank is underlined spaces.
 *
 * DSE 2021 P1 runs "…is an example of using ______ to solve the problem of ______."
 * through a third of its 45 questions. It is deliberately not a new run kind or a
 * storage marker: an underlined space already exports (`xml:space="preserve"` on every
 * `w:t`), pastes and prints through all three backends, so what was missing was a way to
 * reach it rather than a way to represent it.
 */

const text = (value: string): RichText => [{ text: value }];

describe('insertBlank', () => {
  it('inserts underlined spaces at the caret', () => {
    const runs = insertBlank(text('using  to solve'), 6, 6);
    const blank = runs.find((run) => run.underline);
    expect(blank).toBeTruthy();
    expect(blank!.text.trim()).toBe('');
    expect(blank!.text.length).toBeGreaterThan(1);
    // The surrounding words are untouched and still in order.
    expect(plain(runs)).toContain('using');
    expect(plain(runs)).toContain('to solve');
  });

  it('is underlined even when the run to its left is not', () => {
    // `replaceRichTextRange` continues the run to the caret's left, which for a blank is
    // exactly the wrong answer — it would insert invisible spaces into ordinary prose.
    const runs = insertBlank(text('plain text'), 10, 10);
    expect(runs[runs.length - 1].underline).toBe(true);
  });

  it('replaces a selection rather than pushing it aside', () => {
    const before = text('using XXXX to solve');
    const after = insertBlank(before, 6, 10);
    expect(plain(after)).not.toContain('XXXX');
    expect(plain(after)).toContain('using');
    expect(plain(after)).toContain('to solve');
  });

  it('inherits size and colour from its neighbour, but never a subscript', () => {
    const runs = insertBlank(
      [{ text: 'Q', fontSize: 14, color: 'FF0000', vertAlign: 'subscript' }],
      1,
      1,
    );
    const blank = runs.find((run) => run.underline)!;
    // A blank inside a 14pt line must rule at 14pt, or it prints thinner than the text.
    expect(blank.fontSize).toBe(14);
    expect(blank.color).toBe('FF0000');
    // ...but a blank is never raised or lowered: it is a rule on the baseline.
    expect(blank.vertAlign).toBeUndefined();
  });

  it('adds exactly its own characters', () => {
    const before = text('ab');
    const after = insertBlank(before, 1, 1);
    expect(richTextLength(after)).toBe(richTextLength(before) + 12);
  });

  it('works on empty text', () => {
    const runs = insertBlank(undefined, 0, 0);
    expect(runs).toHaveLength(1);
    expect(runs[0].underline).toBe(true);
  });
});
