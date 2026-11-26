import { describe, expect, it } from 'vitest';
import {
  addViewCode,
  GAP_HOMES,
  hasViewTopic,
  matchesView,
  mcqCandidates,
  removeViewCode,
  VIEW_SECTIONS,
  viewCodesOf,
  viewDisplay,
  viewHeading,
  viewSections,
  viewTopicOf,
  withViewCodes,
} from './mcqView';
import { MCQ_SCHEME, mcqTopic } from './topicSchemes';
import { TOPICS } from './topics';

const FINE = TOPICS.flatMap((topic) => topic.children.map((child) => child.code));

describe('the MCQ view of EDB codes (k-0569 § 3)', () => {
  it('sorts the 53 fine codes into 19 one-topic, 17 several-topic and 17 gap codes', () => {
    const kinds = { one: 0, several: 0, gap: 0 };
    for (const code of FINE) {
      const own = MCQ_SCHEME.topics.filter((topic) => topic.edb.includes(code)).length;
      kinds[own === 1 ? 'one' : own > 1 ? 'several' : 'gap'] += 1;
    }
    expect(kinds).toEqual({ one: 19, several: 17, gap: 17 });
  });

  it('places a one-topic code, and a gap code with a home, under that topic', () => {
    expect(viewCodesOf(['C.ped'])).toEqual(['@mcq:elasticity']);
    expect(viewCodesOf(['C.ped', 'C.pes'])).toEqual(['@mcq:elasticity']);
    expect(viewCodesOf(['A.circular-flow'])).toEqual(['@mcq:circular-flow']);
    expect(viewSections(['A.circular-flow'])).toEqual(['F']);
    for (const [code, key] of Object.entries(GAP_HOMES)) expect(viewCodesOf([code])).toEqual([`@mcq:${key}`]);
  });

  it('leaves a several-topic code to be picked, unless one of its topics is placed already', () => {
    expect(viewCodesOf(['C.intervention'])).toEqual(['C.intervention']);
    expect(viewTopicOf('C.intervention')).toMatchObject({ kind: 'pick', parent: 'C' });
    expect(viewTopicOf('C.intervention')!.candidates).toEqual(['price-ceiling', 'price-floor', 'quota', 'per-unit-tax', 'per-unit-subsidy']);
    // F.price-level says Real/Nominal GDP, one of F.national-income's three.
    expect(viewCodesOf(['F.national-income', 'F.price-level'])).toEqual(['@mcq:real-nominal-gdp']);
    expect(viewCodesOf(['I.fiscal', 'I.monetary'])).toEqual(['@mcq:fiscal-monetary-policies']);
  });

  it('keeps a code no MCQ topic names as its own EDB node', () => {
    expect(viewCodesOf(['E.policy'])).toEqual(['E.policy']);
    expect(viewTopicOf('E.policy')).toMatchObject({ kind: 'edb', parent: 'E', en: 'Policy concerns' });
    expect(viewCodesOf(['EL1.pricing'])).toEqual(['EL1.pricing']);
    expect(viewSections(['EL1.pricing'])).toEqual(['EL1']);
  });

  it('reads a section letter as General, or as the section’s only topic (D, G)', () => {
    expect(viewCodesOf(['A'])).toEqual(['A']);
    expect(viewCodesOf(['B'])).toEqual(['B']);
    expect(viewCodesOf(['G'])).toEqual(['@mcq:adas']);
    expect(viewCodesOf(['D'])).toEqual(['@mcq:types-of-market-structures']);
    expect(viewCodesOf(['C', 'C.ped'])).toEqual(['@mcq:elasticity']);
  });

  it('lets an agreeing @mcq: tag decide, and ignores a stale one', () => {
    expect(viewCodesOf(['C.intervention', '@mcq:per-unit-tax'])).toEqual(['@mcq:per-unit-tax']);
    expect(viewCodesOf(['@mcq:quota'])).toEqual(['@mcq:quota']);
    expect(viewCodesOf(['C', '@mcq:quota'])).toEqual(['@mcq:quota']);
    // An older build re-tagged it C.ped: the MCQ topic no longer wins.
    expect(viewCodesOf(['C.ped', '@mcq:per-unit-tax'])).toEqual(['@mcq:elasticity']);
    // A key a later list adds is kept, never read.
    expect(viewCodesOf(['C.intervention', '@mcq:a-later-key'])).toEqual(['C.intervention']);
  });

  it('reads a later build’s code under its section, and never counts free tags or 題型', () => {
    expect(viewCodesOf(['C.new'])).toEqual(['C']);
    expect(viewCodesOf(['E.monopoly'])).toEqual(['E']);
    expect(viewCodesOf(['mock 2026', 'C.ped::Calculate PED', '@star'])).toEqual([]);
    expect(hasViewTopic(['mock 2026'])).toBe(false);
    expect(hasViewTopic(['K'])).toBe(false);
  });

  it('orders codes as the list does', () => {
    expect(viewCodesOf(['J.bop', 'E.policy', 'C.intervention', 'C.ped', 'A'])).toEqual([
      'A',
      '@mcq:elasticity',
      'C.intervention',
      'E.policy',
      '@mcq:balance-of-payment',
    ]);
  });

  it('matches a section by anything in it', () => {
    expect(matchesView(['C.intervention'], 'C')).toBe(true);
    expect(matchesView(['A.circular-flow'], 'F')).toBe(true);
    expect(matchesView(['A.circular-flow'], 'A')).toBe(false);
    expect(matchesView(['C.ped'], '@mcq:elasticity')).toBe(true);
    expect(matchesView(['C.ped'], 'C.ped')).toBe(false);
  });

  it('names nodes in the paper’s language', () => {
    expect(viewDisplay('@mcq:per-unit-tax', 'zh')).toBe('從量稅');
    expect(viewDisplay('@mcq:per-unit-tax', 'both')).toBe('Per-unit Tax 從量稅');
    expect(viewHeading('@mcq:per-unit-tax')).toBe('C · Per-unit Tax');
    expect(viewDisplay('E', 'en')).toBe('Efficiency, Equity & Role of Government');
    expect(viewDisplay('mock 2026')).toBe('mock 2026');
    expect(VIEW_SECTIONS.map((section) => section.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'EL1', 'EL2']);
    expect(mcqCandidates('E.policy')).toEqual([]);
  });
});

describe('writing MCQ topics (k-0569 § 3)', () => {
  it('picks a topic for a several-topic code: the code stays, the @mcq: tag says which', () => {
    const next = addViewCode(['C.intervention', 'mock 2026'], '@mcq:quota');
    expect(next).toEqual(['C.intervention', 'mock 2026', '@mcq:quota']);
    expect(viewCodesOf(next)).toEqual(['@mcq:quota']);
  });

  it('writes no @mcq: tag where the EDB codes already say the topic', () => {
    expect(addViewCode([], '@mcq:elasticity')).toEqual(['C.ped', 'C.pes']);
    expect(addViewCode(['C.ped'], '@mcq:elasticity')).toEqual(['C.ped']);
    expect(addViewCode([], '@mcq:adas')).toEqual(['G']);
    expect(addViewCode([], '@mcq:per-unit-tax')).toEqual(['C.intervention', '@mcq:per-unit-tax']);
    expect(addViewCode([], '@mcq:interest')).toEqual(['A', '@mcq:interest']);
  });

  it('gives a topic its fine codes when only its section letter is there', () => {
    const next = addViewCode(['C'], '@mcq:quota');
    expect(viewCodesOf(next)).toEqual(['@mcq:quota']);
    expect(next).toContain('C.intervention');
  });

  it('keeps a gap code the topic is home to', () => {
    expect(addViewCode(['A.specialization'], '@mcq:division-of-labour')).toEqual(['A.specialization']);
  });

  it('removes a topic with the codes only it needed, and keeps the rest', () => {
    const tags = ['C.intervention', '@mcq:quota', '@mcq:per-unit-tax', 'C.ped', 'C.intervention::Tax incidence', 'mock'];
    expect(viewCodesOf(tags)).toEqual(['@mcq:elasticity', '@mcq:quota', '@mcq:per-unit-tax']);
    const one = removeViewCode(tags, '@mcq:quota');
    expect(viewCodesOf(one)).toEqual(['@mcq:elasticity', '@mcq:per-unit-tax']);
    expect(one).toContain('C.intervention::Tax incidence');
    const none = removeViewCode(removeViewCode(one, '@mcq:per-unit-tax'), '@mcq:elasticity');
    expect(none).toEqual(['mock']);
  });

  it('replaces the whole set, keeping free and other system tags', () => {
    expect(withViewCodes(['C.ped', 'E.policy', '@star', 'mock'], ['@mcq:gdp', 'E.policy'])).toEqual([
      'F.national-income',
      'E.policy',
      '@mcq:gdp',
      '@star',
      'mock',
    ]);
  });

  it('keeps a later build’s code that reads as a wanted section', () => {
    expect(withViewCodes(['E.monopoly'], ['E'])).toEqual(['E.monopoly']);
  });

  it('round-trips: writing what a list reads changes nothing it means', () => {
    const lists = [['C.intervention'], ['A', 'C.ped'], ['F.national-income', 'F.price-level'], ['G.ad', 'EL2.growth'], ['@mcq:quota', 'C.intervention']];
    for (const tags of lists) expect(viewCodesOf(withViewCodes(tags, viewCodesOf(tags)))).toEqual(viewCodesOf(tags));
    for (const topic of MCQ_SCHEME.topics) {
      expect(viewCodesOf(addViewCode([], `@mcq:${topic.key}`)), topic.key).toEqual([`@mcq:${topic.key}`]);
      expect(mcqTopic(topic.key)).toBe(topic);
    }
  });
});
