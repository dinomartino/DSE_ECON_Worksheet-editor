import { describe, expect, it } from 'vitest';
import raw from './data/edb-economics-2020.json';
import { parseGlossary, type RawGlossary } from './parse';
import {
  DISPLAY_OVERRIDES,
  EN_ALIASES,
  EN_OVERRIDES,
  EXACT_KEYS,
  GENERIC_TIER,
  PIN_SENSES,
  PREFERRED_OVERRIDES,
  ZH_OVERRIDES,
} from './overrides';

const entries = parseGlossary(raw as RawGlossary);
const keys = new Set(Object.keys((raw as RawGlossary).entries));

describe('PREFERRED_OVERRIDES', () => {
  it('is exactly the import family: every entry with a 進口 rank below rank 1', () => {
    const scanned: Record<string, string> = {};
    for (const e of entries) {
      for (const sense of e.senses) {
        if (sense.ranks[0].some((v) => v.includes('進口'))) continue;
        const lower = sense.ranks.slice(1).flat().find((v) => v.includes('進口'));
        if (lower) scanned[e.en] = lower;
      }
    }
    expect(PREFERRED_OVERRIDES).toEqual(scanned);
  });

  it('names a listed rendering, so the preferred form still passes the check', () => {
    for (const [key, preferred] of Object.entries(PREFERRED_OVERRIDES)) {
      const entry = entries.find((e) => e.en === key)!;
      expect(entry.senses.flatMap((s) => s.ranks.flat())).toContain(preferred);
    }
  });
});

describe('every override names a real glossary key', () => {
  const tables: Record<string, Iterable<string>> = {
    ZH_OVERRIDES: Object.keys(ZH_OVERRIDES),
    EN_OVERRIDES: Object.keys(EN_OVERRIDES),
    EN_ALIASES: Object.keys(EN_ALIASES),
    PIN_SENSES: Object.keys(PIN_SENSES),
    GENERIC_TIER,
    EXACT_KEYS,
  };
  for (const [name, table] of Object.entries(tables)) {
    it(name, () => {
      expect([...table].filter((key) => !keys.has(key))).toEqual([]);
    });
  }

  it('pins only senses that exist', () => {
    for (const [key, senses] of Object.entries(PIN_SENSES)) {
      const entry = entries.find((e) => e.en === key)!;
      for (const s of senses) expect(entry.senses[s]).toBeDefined();
    }
  });

  it('display overrides differ only in a variant character', () => {
    for (const [from, to] of Object.entries(DISPLAY_OVERRIDES)) expect(from.length).toBe(to.length);
  });
});
