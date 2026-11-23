import { describe, expect, it } from 'vitest';
import type { BiDraft, McqDraft } from '@/generate/types';
import { cleanMcq, parseChanges, parseWriteReply, shapeFindings, statusOf } from './validate';
import { INVENTED, replyEntry } from './fixtures';
import type { CheckRow } from './types';

const t = (en: string, zh = en): BiDraft => ({ en, zh });
const base = (over: Partial<McqDraft> = {}): McqDraft => ({
  kind: 'mcq',
  stem: t('A stem.'),
  statements: [],
  options: [t('One.'), t('Two.'), t('Three.'), t('Four.')],
  answerIndex: 1,
  explanation: t('Why.'),
  ...over,
});
const ids = (d: McqDraft, sides: ReadonlyArray<'en' | 'zh'> = ['en']) => shapeFindings(d, sides).map((f) => f.id);

describe('parseChanges (k-0520)', () => {
  it('keeps known aspects once each in the screen order, a string note as English, drops empty and unknown ones', () => {
    const out = parseChanges([
      { aspect: 'key', note: { en: 'key moves to C', zh: '答案移到 C' } },
      { aspect: 'Varies', note: { en: 'a different firm', zh: '另一家公司' } },
      { aspect: 'numbers', note: 'new prices' },
      { aspect: 'numbers', note: 'again' },
      { aspect: 'format', note: { en: '', zh: '' } },
      { aspect: 'tone', note: { en: 'x', zh: 'x' } },
      'junk',
    ]);
    expect(out).toEqual([
      { aspect: 'varies', note: { en: 'a different firm', zh: '另一家公司' } },
      { aspect: 'numbers', note: { en: 'new prices', zh: '' } },
      { aspect: 'key', note: { en: 'key moves to C', zh: '答案移到 C' } },
    ]);
    expect(parseChanges(undefined)).toEqual([]);
  });
  it('a reply without "changes" still parses, with none', () => {
    expect(parseWriteReply(JSON.stringify({ questions: [replyEntry(INVENTED[0])] }))![0].changes).toEqual([]);
    const withChanges = { ...replyEntry(INVENTED[0]), changes: [{ aspect: 'format', note: { en: 'now a combination item', zh: '改為組合題' } }] };
    expect(parseWriteReply(JSON.stringify({ questions: [withChanges] }))![0].changes).toEqual([{ aspect: 'format', note: { en: 'now a combination item', zh: '改為組合題' } }]);
  });
});

describe('parseWriteReply', () => {
  it('reads the questions out of a fenced reply and keeps the model\'s angle', () => {
    const text = '```json\n' + JSON.stringify({ questions: [replyEntry(INVENTED[0])] }) + '\n```';
    const out = parseWriteReply(text)!;
    expect(out).toHaveLength(1);
    expect(out[0].angle).toBe(INVENTED[0].angle);
    expect(out[0].draft).toMatchObject({ kind: 'mcq', answerIndex: 2 });
    expect(out[0].draft.options).toHaveLength(4);
  });
  it('drops entries that are not objects, and is null for anything else', () => {
    expect(parseWriteReply(JSON.stringify({ questions: ['x', null, [], replyEntry(INVENTED[1])] }))).toHaveLength(1);
    expect(parseWriteReply('no json here')).toBeNull();
    expect(parseWriteReply('{"questions":"x"}')).toBeNull();
  });
  it('reads a key sent as a letter or a digit string, and leaves other keys to fail the shape check', () => {
    const key = (answer: unknown) => parseWriteReply(JSON.stringify({ questions: [{ ...replyEntry(INVENTED[0]), answer }] }))![0].draft.answerIndex;
    expect(key('C')).toBe(2);
    expect(key(' b ')).toBe(1);
    expect(key('3')).toBe(3);
    expect(key(1)).toBe(1);
    expect(key('E')).toBeNaN();
    expect(key(1.5)).toBeNaN();
  });
  it('an angle that is not text, or is very long, is kept short or empty', () => {
    const out = parseWriteReply(JSON.stringify({ questions: [{ ...replyEntry(INVENTED[0]), angle: 7 }, { ...replyEntry(INVENTED[1]), angle: 'x'.repeat(500) }] }))!;
    expect(out[0].angle).toBe('');
    expect(out[1].angle).toHaveLength(200);
  });
});

describe('cleanMcq', () => {
  it('strips the labels the paper derives and drops a side the paper does not print', () => {
    const d = cleanMcq(base({ stem: t('1. Which is right?', '1. 何者正確？'), options: [t('A. One', '甲'), t('(B) Two'), t('C) Three'), t('D. Four')], statements: [t('(1) First'), t('(2) Second')] }), ['en']);
    expect(d.stem).toEqual({ en: 'Which is right?', zh: '' });
    expect(d.options.map((o) => o.en)).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(d.options[0].zh).toBe('');
    expect(d.statements.map((s) => s.en)).toEqual(['First', 'Second']);
  });
});

describe('shapeFindings', () => {
  it('passes a plain draft and a combination draft', () => {
    expect(ids(base())).toEqual([]);
    expect(ids(base({ statements: [t('A'), t('B')], options: [t('(1) only'), t('(2) only'), t('(1) and (2)'), t('neither (1) nor (2)')] }))).toEqual([]);
  });
  it('names each hard failure', () => {
    expect(ids(base({ stem: t('') }))).toEqual(['shape.stemEmpty']);
    expect(ids(base({ options: [t('a'), t('b'), t('c')] }))).toEqual(['shape.optionCount']);
    expect(ids(base({ answerIndex: 4 }))).toEqual(['shape.keyRange']);
    expect(ids(base({ answerIndex: Number.NaN }))).toEqual(['shape.keyRange']);
    expect(ids(base({ options: [t('a'), t(''), t('c'), t('d')] }))).toEqual(['shape.optionEmpty']);
    expect(ids(base({ options: [t('Same.'), t('same'), t('c'), t('d')] }))).toEqual(['shape.optionsSame']);
    expect(ids(base({ statements: [t('Only one')] }))).toEqual(['shape.statementCount']);
    expect(ids(base({ statements: [t('1'), t('2'), t('3'), t('4'), t('5')] }))).toContain('shape.statementCount');
    expect(ids(base({ statements: [t('A'), t(' ')], options: [t('(1)'), t('(2)'), t('(1) (2)'), t('(1) (2)')] }))).toContain('shape.statementEmpty');
    expect(ids(base({ statements: [t('A'), t('B')] }))).toEqual(['shape.notCombination']);
    expect(ids(base({ statements: [t('A'), t('B')], options: [t('(1)'), t('(2)'), t('(3) only'), t('(1) (2)')] }))).toEqual(['shape.notCombination']);
  });
  it('checks every side the paper prints', () => {
    const d = base({ stem: { en: 'English', zh: '' } });
    expect(shapeFindings(d, ['en', 'zh']).map((f) => [f.id, f.params])).toContainEqual(['shape.stemEmpty', { side: 'zh' }]);
  });
});

describe('statusOf', () => {
  const row = (id: CheckRow['id'], state: CheckRow['state']): CheckRow => ({ id, state, findings: [] });
  it('is failed when a check failed, look when one has notes or the key was never solved, else ok', () => {
    expect(statusOf([row('shape', 'fail'), row('key', 'pass')])).toBe('failed');
    expect(statusOf([row('numbers', 'look'), row('key', 'pass')])).toBe('look');
    expect(statusOf([row('shape', 'pass'), row('key', 'skipped')])).toBe('look');
    expect(statusOf([row('shape', 'pass'), row('key', 'pass'), row('copy', 'pass')])).toBe('ok');
    expect(statusOf([row('shape', 'fail'), row('numbers', 'look')])).toBe('failed');
  });
});
