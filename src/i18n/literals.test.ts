import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compare, growthMessage, isUiText, literalsIn, readBaseline, ROOT, scan, scannedFiles } from '../../scripts/i18n-literals.mjs';

/**
 * The ratchet on English-only interface text: no file may gain UI literals over
 * `literals.baseline.json`. Counts going down pass; `node scripts/i18n-literals.mjs --write`
 * then shrinks the baseline.
 */

const found = scan();
const baseline = (readBaseline() ?? {}) as Record<string, number>;

const { grown, shrunk } = compare(found, baseline);
const ignored = Object.entries(found).flatMap(([file, list]) =>
  list.filter((l) => l.ignored).map((l) => `${file}:${l.line} (${l.ignored}) ${JSON.stringify(l.text)}`),
);

describe('English-only interface text', () => {
  it('no file gains UI literals over its baseline', () => {
    if (grown.length) expect.fail(growthMessage(grown));
  });

  // Shows in the summary as a todo: the counts dropped, so record them.
  if (shrunk.length) it.todo(`baseline can shrink in ${shrunk.length} files: node scripts/i18n-literals.mjs --write`);

  it('every i18n-ignore gives a reason', () => {
    const bare = scannedFiles().flatMap((file) =>
      readFileSync(`${ROOT}/${file}`, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/i18n-ignore:?\s*(\*\/\s*\}?)?\s*$/.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(bare, 'write the reason: // i18n-ignore: <reason>').toEqual([]);
  });

  // One line per exemption in the verbose report, so each reason stays visible.
  for (const entry of ignored) it(`i18n-ignore ${entry}`, () => {});
});

describe('the literal scanner', () => {
  it('counts words, not symbols', () => {
    for (const t of ['Copy', 'MCQ only', 'Question 題目', 'Drag to reorder']) expect(isUiText(t), t).toBe(true);
    for (const t of ['⌘K', '×', '· Q', 'PDF', '✦ AI', 'A4', '(a)', '12 pt', '&nbsp;', '  ', '中文']) {
      expect(isUiText(t), t).toBe(false);
    }
  });

  it('finds JSX text, text props, object labels and both branches', () => {
    const src = [
      'export const OPTIONS = [{ label: "Bold", value: "b" }];',
      'export function A({ busy }: { busy: boolean }) {',
      '  return (',
      '    <div title="Close panel" className="flex items-center" data-testid="close-btn">',
      '      <span>Hello teacher</span>',
      "      {busy ? 'Saving…' : 'Saved'}",
      '      <input placeholder={`Search ${busy}`} aria-label={m.search} />',
      '      <kbd>⌘K</kbd>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(literalsIn(src).map((l) => `${l.line} ${l.kind} ${l.text}`)).toEqual([
      '1 label Bold',
      '4 title Close panel',
      '5 jsx text Hello teacher',
      '6 jsx text Saving…',
      '6 jsx text Saved',
      '7 placeholder Search',
    ]);
  });

  it('exempts a literal marked i18n-ignore with a reason, on its line or the line above', () => {
    const src = [
      '<div>',
      '  {/* i18n-ignore: brand */}',
      '  <b>Econ Studio</b>',
      '  <i title="Made in Hong Kong" /> {/* i18n-ignore: printed footer */}',
      '  {/* i18n-ignore: */}',
      '  <u>No reason given</u>',
      '</div>',
    ].join('\n');
    expect(literalsIn(src).map((l) => [l.text, l.ignored ?? null])).toEqual([
      ['Econ Studio', 'brand'],
      ['Made in Hong Kong', 'printed footer'],
      ['No reason given', null],
    ]);
  });

  it('fails a file that grows, naming the line and the fix', () => {
    const list = literalsIn('<p>\n  <span>Hello teacher</span>\n</p>');
    const { grown } = compare({ 'src/components/x/A.tsx': list }, { 'src/components/x/A.tsx': 0 });
    expect(grown).toHaveLength(1);
    const message = growthMessage(grown);
    expect(message).toContain('src/components/x/A.tsx:2');
    expect(message).toContain('messages.ts with en + zh');
    expect(compare({ 'a.tsx': list }, { 'a.tsx': 3 }).shrunk).toEqual(['a.tsx']);
  });
});
