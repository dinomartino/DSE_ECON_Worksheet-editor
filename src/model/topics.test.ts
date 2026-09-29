import { describe, expect, it } from 'vitest';
import { TOPICS, matchesTopic, parentCode, topicLabel, topicOf } from './topics';

describe('topics', () => {
  it('lists the twelve coarse topics A–J, EL1, EL2 in guide order', () => {
    expect(TOPICS.map((t) => t.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'EL1', 'EL2']);
    expect(TOPICS.flatMap((t) => t.children).length).toBe(53);
  });

  it('gives every code a unique slug under its parent', () => {
    const codes = TOPICS.flatMap((t) => [t.code, ...t.children.map((c) => c.code)]);
    expect(new Set(codes).size).toBe(codes.length);
    for (const topic of TOPICS) {
      for (const child of topic.children) {
        expect(child.code.startsWith(`${topic.code}.`)).toBe(true);
        expect(child.parent).toBe(topic.code);
      }
    }
  });

  it('looks up coarse and fine codes, and nothing else', () => {
    expect(topicOf('C')?.en).toBe('Market and Price');
    expect(topicOf('C.ped')?.zh).toBe('需求價格彈性');
    expect(topicOf('past paper')).toBeUndefined();
    expect(topicOf('c')).toBeUndefined();
  });

  it('names a fine code’s parent', () => {
    expect(parentCode('C.ped')).toBe('C');
    expect(parentCode('EL2.growth')).toBe('EL2');
    expect(parentCode('C')).toBeUndefined();
    expect(parentCode('C.nonsense')).toBeUndefined();
  });

  it('matches a coarse code against its fine codes, never the other way', () => {
    expect(matchesTopic(['C.ped'], 'C')).toBe(true);
    expect(matchesTopic(['C'], 'C')).toBe(true);
    expect(matchesTopic(['C'], 'C.ped')).toBe(false);
    expect(matchesTopic(['C.pes'], 'C.ped')).toBe(false);
    expect(matchesTopic(['G.equilibrium'], 'C')).toBe(false);
    expect(matchesTopic(undefined, 'C')).toBe(false);
  });

  it('never matches a free-text tag, even one spelled like a code', () => {
    expect(matchesTopic(['C.made-up'], 'C')).toBe(false);
    expect(matchesTopic(['past paper'], 'past paper')).toBe(false);
  });

  it('labels a code in either language; a free tag is itself', () => {
    expect(topicLabel('I.monetary', 'en')).toBe('Monetary policy');
    expect(topicLabel('I.monetary', 'zh')).toBe('貨幣政策');
    expect(topicLabel('past paper', 'zh')).toBe('past paper');
  });
});
