import { describe, expect, it } from 'vitest';
import raw from '@/glossary/data/edb-economics-2020.json';
import { createGlossary } from '@/glossary/glossary';
import type { RawGlossary } from '@/glossary/parse';
import { topicOf } from '@/model/topics';
import { rowsOf } from './indexer';
import { choiceQuestion, docWith } from './testKit';
import { rowText, TERM_TOPICS, textTopics } from './termTopics';

const glossary = createGlossary(raw as RawGlossary);
const codes = (text: string) => textTopics(text, glossary).map((topic) => topic.code);

describe('the term → topic table', () => {
  it('names only EDB glossary keys, as the data spells them, and only topics this build knows', () => {
    const keys = new Set(Object.keys((raw as RawGlossary).entries));
    const notInGlossary = [...TERM_TOPICS.keys()].filter((term) => !keys.has(term));
    expect(notInGlossary).toEqual([]);
    const unknown = [...TERM_TOPICS.values()].flat().filter((code) => !topicOf(code));
    expect(unknown).toEqual([]);
  });

  it('points at every topic of the guide but Hong Kong trends', () => {
    const covered = new Set([...TERM_TOPICS.values()].flat());
    const missing = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'EL1', 'EL2']
      .flatMap((code) => topicOf(code)!.children.map((child) => child.code))
      .filter((code) => !covered.has(code));
    expect(missing).toEqual(['F.hk-trends']);
  });
});

describe('textTopics', () => {
  it('reads English, taking the longest term (no "demand" inside "price elasticity of demand")', () => {
    expect(codes('If the price elasticity of demand for rice is 0.5, a rise in price will raise total revenue.')).toEqual(['C.ped']);
    const found = textTopics('The government sets a price ceiling on flats. Explain the shortage.', glossary);
    expect(found.map((topic) => topic.code)).toEqual(['C.equilibrium', 'C.intervention']);
    expect(found.find((topic) => topic.code === 'C.intervention')?.terms).toEqual(['price ceiling']);
  });

  it('reads 中文 through the glossary\'s own renderings', () => {
    expect(codes('政府設定價格上限。')).toEqual(['C.intervention']);
    expect(codes('在聯繫匯率制度下，貨幣基礎會')).toEqual(['H.money-supply', 'J.exchange-rate']);
  });

  it('ranks the most mentioned topic first, then guide order; a term in two places gives both', () => {
    expect(codes('Frictional unemployment and structural unemployment. The unemployment rate rose.')).toEqual(['I.unemployment', 'F.unemployment']);
    expect(codes('Explain comparative advantage.')).toEqual(['A.specialization', 'EL2.trade-theory']);
  });

  it('finds nothing in words that say nothing about a topic', () => {
    expect(codes('Which of the following is correct?')).toEqual([]);
    expect(codes('The price of bread and the demand for it.')).toEqual([]);
  });
});

describe('rowText', () => {
  it('leaves out the tag words the index appends, and gives abbreviations back their capitals', () => {
    const question = choiceQuestion('Hong Kong GDP grew while CPI inflation fell.', '', ['E.equity', 'my tag']);
    const [row] = rowsOf(docWith([question]));
    const text = rowText(row, glossary);
    expect(text).toContain('GDP');
    expect(text).toContain('CPI');
    expect(text).not.toMatch(/equity|my tag/);
    const found = codes(text);
    expect(found).toContain('F.national-income');
    expect(found).toContain('F.price-level');
    expect(found).not.toContain('E.equity');
  });
});
