import { describe, expect, it } from 'vitest';
import {
  cleanPatternName,
  holdsPatterns,
  isFreeTag,
  isPatternTag,
  parsePatternTag,
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

  it('is held by a sub-topic only: a coarse topic, a free prefix or an empty name is a free tag', () => {
    expect(holdsPatterns('C.ped')).toBe(true);
    expect(holdsPatterns('C')).toBe(false);
    expect(holdsPatterns('mock 2025')).toBe(false);
    for (const tag of ['C::Anything', 'mock::2025', 'C.ped::   ', '::C.ped', 'C.ped']) {
      expect(parsePatternTag(tag), tag).toBeUndefined();
    }
    expect(isFreeTag('C::Anything')).toBe(true);
    expect(isFreeTag('C.ped')).toBe(false);
    expect(isFreeTag('C.ped::X')).toBe(false);
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
