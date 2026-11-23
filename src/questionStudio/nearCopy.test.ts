import { describe, expect, it } from 'vitest';
import {
  NEAR_COPY_LIMIT,
  boilerplateLimit,
  buildCorpusIndex,
  checkNearCopy,
  enTokens,
  zhChars,
  type CorpusDoc,
} from './nearCopy';

const doc = (id: string, en: string, zh = '', kind: CorpusDoc['kind'] = 'bank'): CorpusDoc => ({ id, kind, en, zh });

const ORIGINAL =
  'A cafe raises the price of a milk tea from $20 to $25 and the cups sold each day fall from 400 to 300. Over this range demand for the milk tea is price elastic. price inelastic. unit elastic. perfectly inelastic.';

describe('words', () => {
  it('reads English as lower-case words with every number as #', () => {
    expect(enTokens('Price rises from $20 to 25.5% in 2024, up 1,200 units.')).toEqual(['price', 'rises', 'from', '#', 'to', '#', 'in', '#', 'up', '#', 'units']);
  });
  it('reads 中文 as its characters only', () => {
    expect(zhChars('價格由 $20 升至 25%，需求 (D) 下降。')).toBe('價格由升至需求下降');
  });
});

describe('checkNearCopy', () => {
  it('flags a text equal to a corpus question', () => {
    const r = checkNearCopy({ en: ORIGINAL, zh: '' }, buildCorpusIndex([doc('q1', ORIGINAL)]));
    expect(r).toMatchObject({ tooClose: true, percent: 100, side: 'en' });
    expect(r.closest?.id).toBe('q1');
  });

  it('flags "the same question with new numbers": every number reads the same', () => {
    const changed = ORIGINAL.replace('$20', '$12').replace('$25', '$15').replace('400', '900').replace('300', '650');
    expect(checkNearCopy({ en: changed, zh: '' }, buildCorpusIndex([doc('q1', ORIGINAL)])).tooClose).toBe(true);
  });

  it('passes a question on the same idea in other words', () => {
    const other =
      'A ferry operator lowers its fares by 10% and finds that its total revenue falls. Which of the following must be true? Demand is price elastic. Demand is price inelastic. Demand is unit elastic. Passengers did not change.';
    const r = checkNearCopy({ en: other, zh: '' }, buildCorpusIndex([doc('q1', ORIGINAL)]));
    expect(r.tooClose).toBe(false);
    expect(r.percent).toBeLessThan(NEAR_COPY_LIMIT * 100);
  });

  it('flags a long run copied word for word even when the rest is new', () => {
    const run = 'when the government places a binding price ceiling below the equilibrium price a shortage appears in the market and black markets may emerge over time';
    const draft = `Last winter the council studied rents in several districts. ${run}. Which of the following statements about rent control is most likely to be correct for a city like this one?`;
    const r = checkNearCopy({ en: draft, zh: '' }, buildCorpusIndex([doc('q1', `Introduction to markets. ${run}. Which is correct?`)]));
    expect(r.verbatim).toBe(true);
    expect(r.tooClose).toBe(true);
  });

  it('ignores stock phrasing found in many questions', () => {
    const stock = 'which of the following statements about the market is most likely to be correct';
    const names = ['apple', 'banana', 'cherry', 'damson', 'elder', 'fig', 'grape', 'hazel', 'iris', 'juniper', 'kiwi', 'lemon'];
    const docs = names.map((name, i) => doc(`q${i}`, `Topic about ${name} and something else entirely, with unique words ${name} ${name}s. ${stock}?`));
    const draft = `A brand new scenario with wholly different words appears here today. ${stock}?`;
    const r = checkNearCopy({ en: draft, zh: '' }, buildCorpusIndex(docs));
    expect(r.tooClose).toBe(false);
  });

  it('works on 中文: 8-character runs', () => {
    const zh = '一間茶餐廳把奶茶的價格由提高至每日售出的杯數由減至在這個範圍內奶茶的需求富有價格彈性缺乏價格彈性屬單一價格彈性';
    const r = checkNearCopy({ en: '', zh }, buildCorpusIndex([doc('q1', '', zh)]));
    expect(r).toMatchObject({ tooClose: true, side: 'zh' });
  });

  it('compares with the extra docs (examples, other drafts) as well', () => {
    const r = checkNearCopy({ en: ORIGINAL, zh: '' }, buildCorpusIndex([]), [doc('d1', ORIGINAL, '', 'draft')]);
    expect(r.tooClose).toBe(true);
    expect(r.closest?.kind).toBe('draft');
  });

  it('says nothing about an empty corpus or a short text', () => {
    expect(checkNearCopy({ en: ORIGINAL, zh: '' }, buildCorpusIndex([])).tooClose).toBe(false);
    expect(checkNearCopy({ en: 'Price elastic.', zh: '' }, buildCorpusIndex([doc('q', 'Price elastic.')])).tooClose).toBe(false);
  });

  it('counts a repeated copy of one question once, so it does not look like stock phrasing', () => {
    const copies = Array.from({ length: 10 }, (_, i) => doc(`v${i}`, ORIGINAL));
    expect(buildCorpusIndex(copies).docs).toHaveLength(1);
    expect(checkNearCopy({ en: ORIGINAL, zh: '' }, buildCorpusIndex(copies)).tooClose).toBe(true);
  });

  it('the boilerplate limit grows with the corpus', () => {
    expect(boilerplateLimit(10)).toBe(6);
    expect(boilerplateLimit(1759)).toBe(8);
    expect(boilerplateLimit(10000)).toBe(40);
  });
});
