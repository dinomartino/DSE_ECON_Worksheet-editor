import { describe, expect, it } from 'vitest';
import { bi } from './text';
import {
  commentParagraphs,
  formatPercent,
  hasExamResults,
  mcPercentOf,
  normalizeExamResults,
  parsePercent,
  withExamResults,
} from './examResults';

describe('normalizeExamResults: read tolerantly, store nothing empty', () => {
  it('keeps valid %s and comments', () => {
    const raw = { mcPercent: { q1: 65, q2: 0, q3: 100, q4: 42.5 }, mcComments: bi('Good.', '好。') };
    expect(normalizeExamResults(raw)).toEqual(raw);
  });

  it('drops a % that is not a number from 0 to 100, and keeps the rest', () => {
    const read = normalizeExamResults({ mcPercent: { a: 50, b: -1, c: 101, d: '60', e: null, f: Number.NaN } });
    expect(read).toEqual({ mcPercent: { a: 50 } });
  });

  it('drops a comment that is not text, or is empty', () => {
    expect(normalizeExamResults({ mcComments: 'plain string', sqComments: bi('', ' ') })).toBeUndefined();
    expect(normalizeExamResults({ sqComments: { en: [{ text: 'x' }] } })).toBeUndefined();
  });

  it('keeps a newer build’s unknown keys', () => {
    expect(normalizeExamResults({ perVersion: { A: 1 } })).toEqual({ perVersion: { A: 1 } });
  });

  it('reads anything that is not an object as nothing', () => {
    for (const raw of [undefined, null, 3, 'x', [], [{ q: 1 }]]) expect(normalizeExamResults(raw)).toBeUndefined();
    expect(normalizeExamResults({})).toBeUndefined();
    expect(normalizeExamResults({ mcPercent: {} })).toBeUndefined();
  });
});

describe('withExamResults', () => {
  const doc = { id: 'w', examResults: { mcPercent: { q: 10 } } };

  it('removes the field when nothing is left', () => {
    expect(withExamResults(doc, {})).toEqual({ id: 'w' });
    expect('examResults' in withExamResults(doc, undefined)).toBe(false);
  });

  it('stores what is given, normalised', () => {
    expect(withExamResults<{ id: string; examResults?: object }>({ id: 'w' }, { mcPercent: { q: 70, bad: 200 } })).toEqual({
      id: 'w',
      examResults: { mcPercent: { q: 70 } },
    });
  });
});

describe('percent helpers', () => {
  it('parses what a teacher types', () => {
    expect(parsePercent('')).toBeUndefined();
    expect(parsePercent('  ')).toBeUndefined();
    expect(parsePercent('65')).toBe(65);
    expect(parsePercent(' 65% ')).toBe(65);
    expect(parsePercent('65％')).toBe(65);
    expect(parsePercent('42.46')).toBe(42.5);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('100')).toBe(100);
    expect(parsePercent('101')).toBe('invalid');
    expect(parsePercent('-3')).toBe('invalid');
    expect(parsePercent('abc')).toBe('invalid');
    expect(parsePercent('6 5')).toBe('invalid');
  });

  it('formats to at most one decimal', () => {
    expect(formatPercent(65)).toBe('65');
    expect(formatPercent(42.5)).toBe('42.5');
    expect(formatPercent(33.333)).toBe('33.3');
  });

  it('reads one question’s %, ignoring a bad stored value', () => {
    const results = { mcPercent: { a: 50, b: 'x' as unknown as number } };
    expect(mcPercentOf(results, 'a')).toBe(50);
    expect(mcPercentOf(results, 'b')).toBeUndefined();
    expect(mcPercentOf(undefined, 'a')).toBeUndefined();
  });

  it('says whether anything is entered', () => {
    expect(hasExamResults(undefined)).toBe(false);
    expect(hasExamResults({ mcPercent: { a: 0 } })).toBe(true);
    expect(hasExamResults({ sqComments: bi('', '好') })).toBe(true);
    expect(hasExamResults({ mcComments: bi('', '') })).toBe(false);
  });
});

describe('commentParagraphs', () => {
  const comment = bi('First line.\n\n  Second line. \r\nThird.', '第一段。\n第二段。');
  const text = (paragraphs: ReturnType<typeof commentParagraphs>, side: 'en' | 'zh') =>
    paragraphs.map((paragraph) => paragraph[side].map((run) => run.text).join(''));

  it('prints a paragraph per non-empty line in one language', () => {
    expect(text(commentParagraphs(comment, 'en'), 'en')).toEqual(['First line.', 'Second line.', 'Third.']);
    expect(text(commentParagraphs(comment, 'zh'), 'zh')).toEqual(['第一段。', '第二段。']);
  });

  it('borrows the other side when one is empty', () => {
    expect(text(commentParagraphs(bi('', '只有中文'), 'en'), 'en')).toEqual(['只有中文']);
    expect(text(commentParagraphs(bi('Only English', ''), 'zh'), 'zh')).toEqual(['Only English']);
  });

  it('prints English then 中文, each on its own side, in a bilingual key', () => {
    const paragraphs = commentParagraphs(comment, 'bilingual');
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[0]).toEqual({ en: [{ text: 'First line.' }], zh: [] });
    expect(paragraphs[3]).toEqual({ en: [], zh: [{ text: '第一段。' }] });
  });

  it('prints nothing for nothing', () => {
    expect(commentParagraphs(undefined, 'en')).toEqual([]);
    expect(commentParagraphs(bi('', ''), 'bilingual')).toEqual([]);
  });
});
