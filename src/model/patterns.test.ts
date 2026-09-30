import { describe, expect, it } from 'vitest';
import {
  cleanPatternName,
  holdsPatterns,
  freeTagIssue,
  isFreeTag,
  isReservedTag,
  isPatternTag,
  matchPatternName,
  parsePatternTag,
  patternKey,
  patternsIn,
  patternTag,
  samePatternName,
  tagSearchWords,
  tagText,
  withoutOrphanPatterns,
  withPattern,
} from './patterns';

describe('題型 tags', () => {
  it('round-trips a sub-topic and a name through the reserved form', () => {
    const tag = patternTag('C.ped', '  Calculate   PED from TR ');
    expect(tag).toBe('C.ped::Calculate PED from TR');
    expect(parsePatternTag(tag)).toEqual({ topic: 'C.ped', name: 'Calculate PED from TR' });
    expect(isPatternTag(tag)).toBe(true);
    expect(tagText(tag)).toBe('Calculate PED from TR');
  });

  it('is held by a sub-topic only: a coarse topic, a free prefix or an empty name is no 題型', () => {
    expect(holdsPatterns('C.ped')).toBe(true);
    expect(holdsPatterns('C')).toBe(false);
    expect(holdsPatterns('mock 2025')).toBe(false);
    for (const tag of ['C::Anything', 'mock::2025', 'C.ped::   ', '::C.ped', 'C.ped']) {
      expect(parsePatternTag(tag), tag).toBeUndefined();
    }
    // Anything holding `::` is reserved, 題型 or not: never a free tag.
    expect(isFreeTag('C::Anything')).toBe(false);
    expect(isFreeTag('C.ped')).toBe(false);
    expect(isFreeTag('C.ped::X')).toBe(false);
  });

  it('reserves the tag grammar: codes known or not, `::` and the system sigil', () => {
    for (const tag of ['K', 'EL3', 'C.new', 'C.market-failure', 'SBA::x', '@star', 'C.ped']) {
      expect(isReservedTag(tag), tag).toBe(true);
      expect(isFreeTag(tag), tag).toBe(false);
    }
    for (const tag of ['mock 2025', 'past paper', 'c.ped', 'K notes', 'hard', 'e-mail', 'Q1', 'MCQ', 'S5', 'DSE2023', 'a@b']) {
      expect(isFreeTag(tag), tag).toBe(true);
    }
    expect(isFreeTag(7 as unknown as string)).toBe(false);
  });

  it('names why a typed tag is refused, and lets a known code or a plain word through', () => {
    expect(freeTagIssue('K')).toBe('code');
    expect(freeTagIssue(' EL3 ')).toBe('code');
    expect(freeTagIssue('C.new')).toBe('code');
    expect(freeTagIssue('SBA::x')).toBe('separator');
    expect(freeTagIssue('C.ped::Calculate')).toBe('separator');
    expect(freeTagIssue('@star')).toBe('system');
    expect(freeTagIssue('C.ped')).toBeUndefined();
    expect(freeTagIssue('EL1')).toBeUndefined();
    expect(freeTagIssue('mock 2025')).toBeUndefined();
    expect(freeTagIssue('   ')).toBeUndefined();
  });

  it('matches names ignoring case and spacing', () => {
    expect(samePatternName('Calculate PED', ' calculate  ped ')).toBe(true);
    expect(samePatternName('Calculate PED', 'Calculate PES')).toBe(false);
    expect(cleanPatternName('x'.repeat(200))).toHaveLength(80);
  });

  it('sets one 題型 per sub-topic, after its code, and clears it', () => {
    const tags = ['C.ped', 'C.pes', 'mock'];
    const one = withPattern(tags, 'C.ped', 'Calculate PED');
    expect(one).toEqual(['C.ped', 'C.ped::Calculate PED', 'C.pes', 'mock']);
    const swapped = withPattern(one, 'C.ped', 'Factors');
    expect(swapped).toEqual(['C.ped', 'C.ped::Factors', 'C.pes', 'mock']);
    const two = withPattern(swapped, 'C.pes', 'Identify');
    expect(patternsIn(two, 'C.ped')).toEqual(['Factors']);
    expect(patternsIn(two, 'C.pes')).toEqual(['Identify']);
    expect(withPattern(two, 'C.ped', undefined)).toEqual(['C.ped', 'C.pes', 'C.pes::Identify', 'mock']);
    // Nothing to change: the same array.
    expect(withPattern(tags, 'C.ped', undefined)).toBe(tags);
    expect(withPattern(one, 'C.ped', 'Calculate PED')).toBe(one);
  });

  it('drops orphaned 題型 and searches by name', () => {
    expect(withoutOrphanPatterns(['C.ped::A', 'C.pes::B', 'free'], (topic) => topic === 'C.pes')).toEqual(['C.pes::B', 'free']);
    expect(tagSearchWords('C.ped::Calculate PED')).toEqual(['Calculate PED']);
    expect(tagSearchWords('C.ped')).toContain('Price elasticity of demand');
  });
});

describe('matching a typed 題型 name', () => {
  it('reads case, spacing and punctuation alike', () => {
    expect(patternKey('Calculate PED (TR)')).toBe('calculatepedtr');
    expect(patternKey(' calculate  ped tr ')).toBe('calculatepedtr');
    expect(patternKey('計算需求價格彈性：總收入')).toBe('計算需求價格彈性總收入');
    expect(patternKey('???')).toBe('???');
  });

  it('ranks the same name, a prefix, a part, then a close one', () => {
    const name = 'Calculate PED from a change in TR';
    expect(matchPatternName('calculate ped from a change in tr.', name)).toBe('same');
    expect(matchPatternName('Calc', name)).toBe('prefix');
    expect(matchPatternName('change in', name)).toBe('contains');
    expect(matchPatternName('Calculate PED from a change in TR and TE', name)).toBe('close');
    expect(matchPatternName('Calculate PED from a chnage in TR', name)).toBe('close');
    expect(matchPatternName('Identify elastic demand', name)).toBeUndefined();
    expect(matchPatternName('', name)).toBeUndefined();
  });

  it('does not call a short name close to everything', () => {
    expect(matchPatternName('PES', 'PED')).toBeUndefined();
    expect(matchPatternName('Graphs of PED', 'Graph')).toBe('close');
  });
});
