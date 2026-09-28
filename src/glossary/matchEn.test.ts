import { describe, expect, it } from 'vitest';
import raw from './data/edb-economics-2020.json';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';

const g = createGlossary(raw as RawGlossary);
const key = (id: number) => g.entries[id].en;
/** `[matched text, glossary key]` per leftmost-longest hit. */
const hits = (text: string) => g.matchEn(text).map((h) => [text.slice(h.start, h.end), key(h.entryId)]);
const keys = (text: string) => g.matchEn(text).map((h) => key(h.entryId));
const tier = (k: string) => g.entries.find((e) => e.en === k)!.tier;

describe('matchEn', () => {
  it('matches whole tokens only', () => {
    expect(keys('It separates the two.')).toEqual([]);
    expect(keys('Goods are traded.')).not.toContain('good');
    expect(keys('a good')).toContain('good');
    expect(keys('Rates are paid on property.')).toContain('rates');
    expect(keys('the rate')).not.toContain('rates');
  });

  it('is leftmost-longest', () => {
    expect(hits('Find the price elasticity of demand.')).toEqual([['price elasticity of demand', 'price elasticity of demand']]);
    expect(hits('real GDP grew')).toEqual([['real GDP', 'real Gross Domestic Product (GDP)']]);
  });

  it('matches abbreviations case-sensitively, with a plural', () => {
    expect(keys('Compare the GDPs.')).toEqual(['Gross Domestic Product (GDP)']);
    expect(keys('VAT is charged')).toContain('value added tax (VAT)');
    expect(keys('a vat of oil')).toEqual([]);
    expect(keys('the GDP deflator')).toEqual(['Gross Domestic Product (GDP) deflator']);
    expect(g.matchEn('real GDP')[0].viaAbbreviation).toBe(true);
    expect(g.matchEn('real Gross Domestic Product')[0].viaAbbreviation).toBe(false);
  });

  it('folds hyphens, plurals, possessives and British/American spelling', () => {
    expect(keys('a per-unit tax')).toEqual(['per unit tax']);
    expect(keys('price elasticities of demand')).toEqual(['price elasticity of demand']);
    expect(keys("consumers' surplus")).toEqual(['consumer surplus']);
    expect(keys('a stabilisation policy')).toEqual(['stabilization policy']);
    expect(keys('financial crises')).toEqual(['financial crisis']);
    expect(hits('cost-benefit analyses')).toEqual([['cost-benefit analyses', 'cost benefit analysis']]);
    expect(keys('a cooperative society')).toEqual(['co-operative society']);
    expect(keys('a co-operative society')).toEqual(['co-operative society']);
    expect(keys('the production possibility curve')).toEqual(['production-possibility curve']);
    expect(keys('tie-in sales')).toEqual(['tie-in-sales']);
  });

  it('needs a capital for a one-word proper name', () => {
    expect(keys('Keynes argued')).toEqual(['Keynes, J.M.']);
    expect(keys('Keynesian economics')).not.toContain('Keynes, J.M.');
    expect(keys('an octopus')).toEqual([]);
  });

  it('finds every nested term with matchEnAll', () => {
    const all = new Set(g.matchEnAll('price elasticity of demand').map((h) => key(h.entryId)));
    for (const k of ['price elasticity of demand', 'price', 'demand', 'elasticity of demand']) expect(all.has(k)).toBe(true);
  });

  it('puts known everyday false positives in the generic tier', () => {
    // Glossary research §2: "technology advance", "promote and market", "a good example", "share its technology".
    for (const text of ['technology advance', 'promote and market', 'a good example', 'share its technology']) {
      for (const k of keys(text)) expect(tier(k), `${text}: ${k}`).toBe('generic');
    }
  });

  it('matches HKDSE-style sentences', () => {
    expect(keys('The government imposes a price ceiling on rice, and a shortage arises.')).toEqual(
      expect.arrayContaining(['price ceiling', 'shortage']),
    );
    expect(keys('Firms in a perfectly competitive market are price takers.')).toEqual(
      expect.arrayContaining(['price taker']),
    );
  });
});
