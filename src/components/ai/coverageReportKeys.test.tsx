import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { lookupCode, SYLLABUS } from '@/syllabus';
import { setResult } from '@/coverage/result';
import type { QuestionResult } from '@/coverage/types';
import { packBlocks, reportBlocks, sheetKeys, tableHeads, uniqueKeys } from './CoverageReportSheets';

/**
 * k-0509 (u-4biw): "two children with the same key, `head-keyPoints`" downloading a report.
 * The key-point table's header opens again after every topic heading, so a sheet can hold
 * it several times. Server rendering does not warn about keys, so these tests check the keys
 * the sheets are rendered with, for both report languages and on one tall sheet (every
 * repeat on the same sheet) as well as on many short ones.
 */
const codes = SYLLABUS.topics.map((topic) => topic.keyPoints[0].code).filter((code) => lookupCode(code));
const pick = (code: string, w: 1 | 2 = 2) => ({ code, w, band: 'apply' as const, conf: 'high' as const, why: '因為。' });
const result = (paper: number, number: string, units: QuestionResult['units']): QuestionResult => ({ questionId: `P${paper}Q${number}`, number, paper, ok: true, units });
const unit = (key: string, label: string, ...picks: ReturnType<typeof pick>[]) => ({ key, label, marks: 2, outside: '', picks });

const coverageIn = (language: 'en' | 'zh') =>
  setResult({ language, title: 'Mock', scope: 'set', at: '2026-11-23T00:00:00Z', pageSize: 'A4' }, [
    {
      paper: 1,
      title: 'P1',
      results: codes.slice(0, 6).map((code, i) => result(1, String(i + 1), [unit(`u${i}`, '', pick(code))])),
      sent: 6,
    },
    {
      paper: 2,
      title: 'P2',
      results: [
        // Two parts under one label and a pick named twice: edge cases for the row keys.
        result(2, '1', [unit('a1', '(a)', pick(codes[0]), pick(codes[0], 1)), unit('a2', '(a)', pick(codes[1]))]),
        result(2, '2', [unit('b', '(b)', pick(codes[2]), pick(codes[3], 1))]),
      ],
      sent: 2,
    },
  ]);

const dupes = (keys: string[]) => keys.filter((key, i) => keys.indexOf(key) !== i);

/** Repeated keys among siblings anywhere in an element tree; the report's pieces are plain functions without hooks, so they are expanded by calling them. */
function childKeyDupes(node: ReactNode): string[] {
  const found: string[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) {
      found.push(...dupes(n.filter(isValidElement).flatMap((el) => (el.key === null ? [] : [el.key]))));
      n.forEach(walk);
    } else if (isValidElement<{ children?: ReactNode }>(n)) {
      if (typeof n.type === 'function') walk((n.type as (props: unknown) => ReactNode)(n.props));
      else walk(n.props.children);
    }
  };
  walk(node);
  return found;
}

describe.each(['en', 'zh'] as const)('report keys, %s words (k-0509)', (text) => {
  for (const paperLanguage of ['en', 'zh'] as const) {
    const blocks = reportBlocks(coverageIn(paperLanguage), { text, names: paperLanguage });
    const heads = tableHeads(text);
    const headHeights = Object.fromEntries(Object.keys(heads).map((table) => [table, 10]));

    it(`${paperLanguage} paper: every block has its own key`, () => {
      expect(dupes(blocks.map((b) => b.key))).toEqual([]);
      expect(blocks.filter((b) => b.table === 'keyPoints').length).toBeGreaterThan(SYLLABUS.topics.length);
    });

    for (const [name, room] of [
      ['one tall sheet', 1e9],
      ['short sheets', 120],
    ] as const) {
      it(`${paperLanguage} paper, ${name}: no key twice on a sheet, every block once, a header before each table run`, () => {
        const pages = packBlocks(
          blocks,
          blocks.map(() => 20),
          headHeights,
          room,
        );
        if (room > 1e8) {
          expect(pages).toHaveLength(1);
          expect(pages[0].filter((item) => 'head' in item && item.head === 'keyPoints').length).toBeGreaterThan(1);
        } else {
          expect(pages.length).toBeGreaterThan(1);
        }
        for (const items of pages) expect(dupes(sheetKeys(items, blocks))).toEqual([]);

        const placed = pages.flat().flatMap((item) => ('block' in item ? [item.block] : []));
        expect(placed).toEqual(blocks.map((_, i) => i));

        for (const items of pages) {
          items.forEach((item, i) => {
            if (!('block' in item) || !blocks[item.block].table) return;
            const before = items[i - 1];
            const sameRun = before && 'block' in before && blocks[before.block].table === blocks[item.block].table;
            const ownHead = before && 'head' in before && before.head === blocks[item.block].table;
            expect(sameRun || ownHead).toBe(true);
          });
          items.forEach((item, i) => {
            if ('head' in item) expect(items[i + 1] && 'block' in items[i + 1]).toBe(true);
          });
        }
      });
    }

    it(`${paperLanguage} paper: no repeated key inside a block's or header's own lists`, () => {
      for (const b of blocks) expect(childKeyDupes(b.node)).toEqual([]);
      for (const head of Object.values(heads)) expect(childKeyDupes(head)).toEqual([]);
    });
  }
});

describe('key helpers (k-0509)', () => {
  it('uniqueKeys numbers repeats and leaves the first alone', () => {
    expect(uniqueKeys([{ key: 'a' }, { key: 'b' }, { key: 'a' }, { key: 'a' }]).map((b) => b.key)).toEqual(['a', 'b', 'a#2', 'a#3']);
  });

  it('sheetKeys keys a header by the row it opens', () => {
    const blocks = [{ key: 'topic-A' }, { key: 'kp-A1' }, { key: 'topic-B' }, { key: 'kp-B1' }];
    const items = [{ block: 0 }, { head: 'keyPoints' }, { block: 1 }, { block: 2 }, { head: 'keyPoints' }, { block: 3 }];
    expect(sheetKeys(items, blocks)).toEqual(['topic-A', 'head-keyPoints-kp-A1', 'kp-A1', 'topic-B', 'head-keyPoints-kp-B1', 'kp-B1']);
  });
});
