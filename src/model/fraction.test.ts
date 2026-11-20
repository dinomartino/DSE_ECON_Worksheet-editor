import { describe, expect, it } from 'vitest';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { applyEmphasisWhole, applyInsertRuns, textOfTarget } from './edits';
import { FRACTION_SLASH, fractionAt, fractionRuns, hasFraction, linearFraction, textSegments } from './fraction';
import { plain, replaceRichTextRange } from './text';
import type { McqQuestion, RichText } from './types';

/** GitHub #8 (k-0479): stacked fractions as marked runs, read tolerantly. */
describe('stacked fractions in run text', () => {
  const qSub = (n: string): RichText => [{ text: 'Q' }, { text: n, vertAlign: 'subscript' }];

  it('stores numerator then denominator, the denominator starting with the slash', () => {
    const runs = fractionRuns([{ text: 'ΔQ' }], [{ text: 'Q' }]);
    expect(runs).toEqual([
      { text: 'ΔQ', fraction: 'num' },
      { text: `${FRACTION_SLASH}Q`, fraction: 'den' },
    ]);
    // Older builds print the runs inline: the words read "ΔQ⁄Q", never "ΔQQ".
    expect(plain(runs)).toBe('ΔQ⁄Q');
    expect(hasFraction(runs)).toBe(true);
  });

  it('keeps subscripts inside the parts', () => {
    const runs: RichText = [{ text: 'PED = ' }, ...fractionRuns([...qSub('2'), { text: ' − ' }, ...qSub('1')], qSub('1')), { text: ' × 100%' }];
    const segments = textSegments(runs);
    expect(segments.map((s) => s.kind)).toEqual(['runs', 'fraction', 'runs']);
    const fraction = segments[1] as Extract<(typeof segments)[number], { kind: 'fraction' }>;
    expect(fraction.num).toEqual([...qSub('2'), { text: ' − ' }, ...qSub('1')]);
    expect(fraction.den).toEqual(qSub('1'));
    expect([fraction.start, fraction.end]).toEqual([6, 6 + 'Q2 − Q1⁄Q1'.length]);
    expect(fractionAt(runs, 8)).toEqual(fraction);
    expect(fractionAt(runs, 2)).toBeUndefined();
  });

  it('tells two fractions side by side apart', () => {
    const runs = [...fractionRuns([{ text: 'a' }], [{ text: 'b' }]), ...fractionRuns([{ text: 'c' }], [{ text: 'd' }])];
    expect(textSegments(runs).filter((s) => s.kind === 'fraction')).toHaveLength(2);
  });

  it('prints damaged marks as plain text, never losing words', () => {
    const damaged: RichText[] = [
      [{ text: 'ΔQ', fraction: 'num' }, { text: 'Q', fraction: 'den' }], // no slash
      [{ text: '⁄Q', fraction: 'den' }], // no numerator
      [{ text: 'ΔQ', fraction: 'num' }, { text: ' then text' }], // no denominator
    ];
    for (const runs of damaged) {
      const segments = textSegments(runs);
      expect(segments.every((s) => s.kind === 'runs')).toBe(true);
      expect(segments.flatMap((s) => (s.kind === 'runs' ? s.runs : [])).map((r) => r.text).join('')).toBe(plain(runs));
      expect(segments.flatMap((s) => (s.kind === 'runs' ? s.runs : [])).some((r) => 'fraction' in r)).toBe(false);
    }
  });

  it('never lets typed text join a fraction', () => {
    const runs = fractionRuns([{ text: 'a' }], [{ text: 'b' }]);
    const typed = replaceRichTextRange(runs, 3, 3, ' more');
    expect(typed.at(-1)).toEqual({ text: ' more' });
  });

  it('writes one line where nothing can stack', () => {
    expect(linearFraction('ΔQ', 'Q')).toBe('ΔQ/Q');
    expect(linearFraction('Q2 − Q1', 'Q1')).toBe('(Q2 − Q1)/Q1');
  });
});

describe('the edits behind GitHub #8', () => {
  const mcqTarget = () => {
    const worksheet = buildAcceptanceWorksheet();
    const question = worksheet.questions.find((q): q is McqQuestion => q.type === 'mcq')!;
    return { worksheet, question };
  };

  it('B off with no selection clears pasted bold on both sides, in one step', () => {
    const { worksheet, question } = mcqTarget();
    const block = question.blocks.find((b) => b.kind === 'paragraph')!;
    const target = { kind: 'blockText' as const, blockId: block.id };
    const pasted = {
      ...worksheet,
      questions: worksheet.questions.map((q) =>
        q.id !== question.id
          ? q
          : { ...q, blocks: q.blocks.map((b) => (b.id === block.id ? { ...b, text: { en: [{ text: 'Pasted', bold: true }], zh: [{ text: '貼上', bold: true }] } } : b)) },
      ),
    } as typeof worksheet;
    const off = applyEmphasisWhole(pasted, target, 'bold', false);
    expect(textOfTarget(off, target)).toEqual({ en: [{ text: 'Pasted' }], zh: [{ text: '貼上' }] });
    // On stays the element's own override, as before.
    const on = applyEmphasisWhole(off, target, 'bold', true);
    expect(textOfTarget(on, target)).toEqual({ en: [{ text: 'Pasted' }], zh: [{ text: '貼上' }] });
  });

  it('puts a fraction into an MC option, keeping its marks', () => {
    const { worksheet, question } = mcqTarget();
    const target = { kind: 'mcqOption' as const, questionId: question.id, optionId: question.options[0].id };
    const before = textOfTarget(worksheet, target)!;
    const at = plain(before.en).length;
    const next = applyInsertRuns(worksheet, target, 'en', at, at, fractionRuns([{ text: 'ΔQ' }], [{ text: 'Q' }]));
    const after = textOfTarget(next, target)!;
    expect(after.zh).toEqual(before.zh);
    expect(after.en.slice(-2)).toEqual([
      { text: 'ΔQ', fraction: 'num' },
      { text: '⁄Q', fraction: 'den' },
    ]);
  });
});
