import { describe, expect, it } from 'vitest';
import { lookupCode } from '@/syllabus';
import { LIMITED_TERMS, scanLimited } from './guard';

const scan = (en: string, keyPoint = 'C.ped', zh = '') => scanLimited({ en, zh }, zh ? ['en', 'zh'] : ['en'], keyPoint).map((f) => f.params?.term);

describe('LIMITED_TERMS stays in step with the syllabus data', () => {
  it('every term names a key point that exists and states a NOT-required limit', () => {
    for (const term of LIMITED_TERMS) {
      const hit = lookupCode(term.code);
      expect(hit?.keyPoint.code, term.name).toBe(term.code);
      expect(hit?.keyPoint.notRequired.length, `${term.name}: ${term.code} has no limit`).toBeGreaterThan(0);
    }
  });
});

describe('scanLimited', () => {
  it('finds terms the guide says are not required', () => {
    expect(scan('Which of the following is a Giffen good?')).toEqual(['Giffen goods']);
    expect(scan('Income elasticity of demand is negative for an inferior good.')).toEqual(['income elasticity']);
    expect(scan('At the point elasticity of the curve and the Lorenz curve...')).toEqual(['point elasticity', 'the Lorenz curve']);
  });
  it('is quiet about the key point itself', () => {
    expect(scan('Price elasticity of demand falls along a straight-line demand curve.')).toEqual([]);
  });
  it('finds the Chinese forms on a 中文 side', () => {
    expect(scan('', 'C.ped', '收入彈性大於一的物品').length).toBe(1);
    expect(scanLimited({ en: '', zh: '堅尼系數越大，收入越不平均。' }, ['zh'], 'E.equity').map((f) => f.params?.term)).toEqual(['the Gini coefficient']);
  });
  it('reads a topic-scoped term only inside its own topic', () => {
    expect(scan('The Quantity Theory of Money says...', 'G.ad')).toEqual(['the Quantity Theory of Money']);
    expect(scan('The Quantity Theory of Money says...', 'I.inflation')).toEqual([]);
  });
  it('names the key point whose limit it comes from', () => {
    expect(scanLimited({ en: 'a Giffen good', zh: '' }, ['en'], 'C.ped')[0]).toEqual({ id: 'syllabus.limited', params: { term: 'Giffen goods', code: 'C.individual-demand' } });
  });
});
