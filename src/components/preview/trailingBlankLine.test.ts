import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RichText } from '@/model/types';
import { withoutPlaceholderBreak } from './richTextDom';

/**
 * GitHub issue #7, point 1 (k-0468): "答案位置有時自己多咗行空白，但刪唔走" — the
 * answer area sometimes gains a blank line that cannot be deleted.
 *
 * Reproduced in Chrome on a marking point: Shift+Enter at the end of "Demand curve shift
 * to the left" and click away stored "…left\n", which prints as a blank line under the
 * point (its "(1)" lifted onto the words). Clicking that line opened no field, and
 * clicking the words put the caret before the break, so Backspace deleted a letter. The
 * same blank line arrived unasked when a line's last word was deleted and retyped, or
 * Enter typed twice and taken back twice: Chrome writes a placeholder break at the end of
 * a field whose last line empties, and the placeholder was read as text.
 *
 * Hit-testing and the caret are the browser's, and this suite has no DOM, so the rule the
 * reader applies is tested here as a pure function, the wiring on the source (as
 * `caretPlacement.test.ts` does), and the whole path in Chrome by
 * `scripts/blank-line-verify.mjs` (mutation-checked there).
 */

const rt = (...texts: string[]): RichText => texts.map((text) => ({ text }));

describe('the browser placeholder break is not text', () => {
  it('drops one final break with nothing after it', () => {
    // Shift+Enter at the end writes "words\n\n": one blank line shows, one break is kept.
    expect(withoutPlaceholderBreak(rt('Demand curve\n\n'))).toEqual(rt('Demand curve\n'));
    // A last line emptied, then retyped: the placeholder trails the new words.
    expect(withoutPlaceholderBreak(rt('line one\nsix\n'))).toEqual(rt('line one\nsix'));
  });

  it('keeps a run that held only the placeholder out, and its formatting elsewhere', () => {
    expect(withoutPlaceholderBreak([{ text: 'bold', bold: true }, { text: '\n' }])).toEqual([
      { text: 'bold', bold: true },
    ]);
    expect(withoutPlaceholderBreak([{ text: 'red\n', color: 'C00000' }])).toEqual([{ text: 'red', color: 'C00000' }]);
  });

  it('leaves text that does not end in a break alone', () => {
    const text = rt('one\ntwo');
    expect(withoutPlaceholderBreak(text)).toBe(text);
    expect(withoutPlaceholderBreak([])).toEqual([]);
  });
});

describe('a trailing blank line can be reached and deleted', () => {
  const dom = readFileSync('src/components/preview/richTextDom.ts', 'utf8');
  const editable = readFileSync('src/components/preview/RichTextEditable.tsx', 'utf8');
  const inline = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');
  const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');

  it('paints a caret line after a break the teacher typed at the end', () => {
    expect(editable).toContain('host.replaceChildren(...paintRuns(runs));');
    expect(dom).toMatch(/export function paintRuns[\s\S]*?endsWith\('\\n'\)\) nodes\.push\(caretLineNode\(\)\)/);
  });

  it('never reads the caret line as text or counts it in an offset', () => {
    // The zero-width space is the line's, not the teacher's: reading it would store it,
    // counting it would put every caret and split one character off.
    expect(dom).toMatch(/const text = textOf\(node\);/);
    expect(dom).toMatch(/total \+= textOf\(node\)\.length;/);
    expect(dom).toMatch(/const length = textOf\(node\)\.length;/);
    expect(dom).toMatch(/TEXT_NODE\) return textOf\(node\)\.length;/);
    // A field ending on its caret line keeps the break before it; otherwise that break is
    // the browser's placeholder.
    expect(dom).toContain('return endsOnCaretLine ? normalizeRuns(out) : withoutPlaceholderBreak(normalizeRuns(out));');
  });

  it('puts a caret asked for after a final break on the line it opens', () => {
    // Before, the end of "words\n" resolved to the end of "words": the caret could not
    // stand on the blank line, so Backspace there deleted a letter.
    expect(dom).toMatch(/if \(afterBreak\) return afterBreak;/);
    expect(dom).toContain('return afterBreak ?? last ?? { node: host, offset: 0 };');
  });

  it('opens the field at its end from a click on the paragraph’s blank line', () => {
    expect(preview).toContain('onClick={openAtBlankTail}');
    expect(preview).toMatch(/openAtBlankTail[\s\S]*?new CustomEvent\(OPEN_FIELD_EVENT, \{ detail: \{ at: "end" \} \}\)/);
  });

  it('does not measure the marks label against the caret line', () => {
    expect(preview).toContain("closest('[data-marks-trail], [data-floating-prompt], [data-caret-line]')");
  });

  it('no longer trims a break as the field closes', () => {
    // The reader drops the placeholder as it is typed; trimming again on close would
    // delete a break the teacher typed on purpose.
    expect(inline).not.toContain('breakAtEndRef');
  });
});
