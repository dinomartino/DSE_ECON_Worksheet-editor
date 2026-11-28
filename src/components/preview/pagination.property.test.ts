import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { holds } from '@/test/property';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { ContentBlock, LanguageMode, LqKeyLayout, Worksheet } from '@/model/types';
import { answerKeyView } from '@/render/answerKey';
import type { RenderNode } from '@/render/ir';
import { withFlow } from '@/test/fixtures';
import { keyUnits } from './AnswerKeyPreview';
import { packPages, placementKey, type BreakPoint, type Fragment, type PackItem, type PackedPages } from './pagination';

/**
 * Property tests for the paginator (`packPages`, k-0607) and the answer key's packing.
 *
 * The rules, as `pagination.ts` states them: every item lands, once, in order, a split item
 * as consecutive pieces that cover it; no sheet runs over unless what is on it is one piece
 * no boundary can cut to fit; an item is kept whole while it can be; a manual break opens a
 * sheet, and two in a row leave the blank page between; a "start on a new page" item leads
 * its sheet; a heading (keep with next) never strands at a sheet's foot when it and the next
 * item's first chain fit a fresh sheet together; adding content never shortens the paper.
 * In the answer key, a marking point's line keeps with its own figure (k-0595).
 *
 * Heights are an independent model here: an item is `gap + Σ node heights`; a break point's
 * height is the nodes up to it (below the gap), as `usePagination` measures them; the gap is
 * dropped where the item leads a sheet.
 */

// ---------------------------------------------------------------- the model

interface Spec {
  key: string;
  /** Node heights; absent for a manual break. */
  nodes?: number[];
  gap: number;
  /** Legal boundaries (`breakPoints`), node indices. */
  legal: number[];
  /** Whether every node boundary is measured too (`looseBreakPoints`). */
  loose: boolean;
  keepsWithNext?: boolean;
  startsSheet?: boolean;
  structural?: boolean;
  breakId?: string;
}

interface Case {
  specs: Spec[];
  content: number;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const upTo = (nodes: number[], index: number) => sum(nodes.slice(0, index + 1));

function toItems(specs: Spec[]): { items: PackItem[]; heights: Map<string, number>; gaps: Map<string, number> } {
  const heights = new Map<string, number>();
  const gaps = new Map<string, number>();
  const items = specs.map((spec): PackItem => {
    if (!spec.nodes) return { key: spec.key, forceBreak: true, breakId: spec.breakId };
    heights.set(spec.key, spec.gap + sum(spec.nodes));
    if (spec.gap > 0) gaps.set(spec.key, spec.gap);
    const at = (index: number): BreakPoint => ({ index, height: upTo(spec.nodes!, index) });
    const interior = spec.nodes.slice(0, -1).map((_, index) => index);
    return {
      key: spec.key,
      ...(spec.legal.length > 0 ? { breakPoints: spec.legal.map(at) } : {}),
      ...(spec.loose && interior.length > 0 ? { looseBreakPoints: interior.map(at) } : {}),
      ...(spec.keepsWithNext ? { keepsWithNext: true } : {}),
      ...(spec.startsSheet ? { startsSheet: true } : {}),
      ...(spec.structural ? { structural: true } : {}),
    };
  });
  return { items, heights, gaps };
}

function pack(c: Case): { packed: PackedPages<PackItem>; specs: Map<string, Spec> } {
  const { items, heights, gaps } = toItems(c.specs);
  return {
    packed: packPages(items, heights, c.content, gaps),
    specs: new Map(c.specs.map((spec) => [spec.key, spec])),
  };
}

interface Placement {
  page: number;
  position: number;
  spec: Spec;
  fragment?: Fragment;
  /** The nodes this placement draws, inclusive. */
  from: number;
  to: number;
}

function placements(packed: PackedPages<PackItem>, specs: Map<string, Spec>): Placement[] {
  return packed.pages.flatMap((page, pageIndex) =>
    page.map((item, position) => {
      const spec = specs.get(item.key)!;
      const fragment = packed.fragments.get(placementKey(pageIndex, position));
      const last = spec.nodes!.length - 1;
      return {
        page: pageIndex,
        position,
        spec,
        fragment,
        from: fragment?.from ?? 0,
        to: Math.min(fragment?.to ?? last, last),
      };
    }),
  );
}

/** How tall a placement prints: its nodes, plus the item's gap unless it leads the sheet. */
const printed = (p: Placement) =>
  sum(p.spec.nodes!.slice(p.from, p.to + 1)) + (p.from === 0 && p.position > 0 ? p.spec.gap : 0);

// ---------------------------------------------------------------- generators

const contentSpec = fc
  .record({
    nodes: fc.array(fc.integer({ min: 4, max: 420 }), { minLength: 1, maxLength: 6 }),
    gap: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 24 })),
    shape: fc.constantFrom('atomic', 'chain', 'breakable'),
    legalPick: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
    keepsWithNext: fc.boolean(),
    startsSheet: fc.oneof({ weight: 6, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    structural: fc.oneof({ weight: 6, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  })
  .map(({ nodes, gap, shape, legalPick, keepsWithNext, startsSheet, structural }) => {
    const interior = nodes.slice(0, -1).map((_, index) => index);
    // A Paper 1 question is one chain (only loose boundaries); an LQ breaks where its keep
    // chain allows (legal ones); an MC or a heading is atomic (neither).
    const legal = shape === 'breakable' ? interior.filter((index) => legalPick[index]) : [];
    return {
      nodes,
      gap,
      legal,
      loose: shape !== 'atomic',
      // Only an atomic item keeps with the next here: that is a heading, or a part line.
      keepsWithNext: shape === 'atomic' && keepsWithNext,
      startsSheet,
      structural,
    };
  });

const spec = fc.oneof({ weight: 7, arbitrary: contentSpec }, { weight: 1, arbitrary: fc.constant({ isBreak: true as const }) });

const caseOf = (maxItems: number): fc.Arbitrary<Case> =>
  fc
    .record({ raw: fc.array(spec, { maxLength: maxItems }), content: fc.integer({ min: 200, max: 1000 }) })
    .map(({ raw, content }) => ({
      content,
      specs: raw.map((entry, index): Spec =>
        'isBreak' in entry
          ? { key: `b${index}`, gap: 0, legal: [], loose: false, breakId: `break-${index}` }
          : { key: `i${index}`, ...entry },
      ),
    }))
    // `packPages` puts everything on one page before the first measurement (no heights).
    .filter((c) => c.specs.some((s) => s.nodes));

const flowCase = caseOf(14);

// ---------------------------------------------------------------- properties

describe('packPages (property)', { timeout: 60_000 }, () => {
  it('every item lands once, in order; a split item is consecutive pieces that cover all its nodes', () => {
    holds(
      fc.property(flowCase, (c) => {
        const { packed, specs } = pack(c);
        const all = placements(packed, specs);
        // A manual break is a positioning instruction, never placed.
        expect(all.every((p) => p.spec.nodes)).toBe(true);
        const runs: Placement[][] = [];
        for (const p of all) {
          const last = runs[runs.length - 1];
          if (last && last[0].spec.key === p.spec.key) last.push(p);
          else runs.push([p]);
        }
        expect(runs.map((run) => run[0].spec.key)).toEqual(c.specs.filter((s) => s.nodes).map((s) => s.key));
        for (const run of runs) {
          const lastNode = run[0].spec.nodes!.length - 1;
          expect(run[0].from).toBe(0);
          expect(run[run.length - 1].to).toBe(lastNode);
          run.forEach((p, i) => {
            expect(p.from).toBeLessThanOrEqual(p.to);
            if (i > 0) {
              expect(p.from).toBe(run[i - 1].to + 1);
              expect(p.fragment?.continued).toBe(true);
              // Each piece starts a later sheet than the one before it.
              expect(p.page).toBeGreaterThan(run[i - 1].page);
            }
          });
          if (run.length > 1) expect(run[0].fragment?.continued).toBe(false);
        }
      }),
      200,
    );
  });

  it('no sheet runs over, unless it holds one piece that no boundary inside it can cut to fit', () => {
    holds(
      fc.property(flowCase, (c) => {
        const { packed, specs } = pack(c);
        const all = placements(packed, specs);
        packed.pages.forEach((_, page) => {
          const on = all.filter((p) => p.page === page);
          const used = sum(on.map(printed));
          if (used <= c.content) return;
          expect(on).toHaveLength(1);
          const [only] = on;
          const boundaries = only.spec.loose
            ? only.spec.nodes!.slice(0, -1).map((_, index) => index)
            : only.spec.legal;
          const fits = boundaries.filter(
            (b) => b >= only.from && b < only.to && sum(only.spec.nodes!.slice(only.from, b + 1)) <= c.content,
          );
          expect(fits).toEqual([]);
        });
      }),
      200,
    );
  });

  it('an item with no legal break that fits a sheet is never split', () => {
    holds(
      fc.property(flowCase, (c) => {
        const { packed, specs } = pack(c);
        for (const p of placements(packed, specs)) {
          if (p.spec.legal.length === 0 && sum(p.spec.nodes!) <= c.content) expect(p.fragment).toBeUndefined();
        }
      }),
      200,
    );
  });

  it('a manual break opens exactly one sheet, which the content after it leads', () => {
    holds(
      fc.property(flowCase, (c) => {
        const { packed, specs } = pack(c);
        const breaks = c.specs.filter((s) => s.breakId);
        const opened = packed.openedBy.filter((id): id is string => id !== undefined);
        expect([...opened].sort()).toEqual(breaks.map((s) => s.breakId!).sort());
        const all = placements(packed, specs);
        c.specs.forEach((s, index) => {
          const next = c.specs[index + 1];
          if (!s.breakId || !next?.nodes) return;
          const first = all.find((p) => p.spec.key === next.key)!;
          expect(first.page).toBe(packed.openedBy.indexOf(s.breakId));
          expect(first.position).toBe(0);
        });
        // A sheet with nothing on it is one a break asked for; packing slack never shows.
        packed.pages.forEach((page, i) => {
          if (page.length === 0) expect(packed.openedBy[i]).toBeDefined();
        });
      }),
      200,
    );
  });

  it('a "start on a new page" item leads its sheet', () => {
    holds(
      fc.property(flowCase, (c) => {
        const { packed, specs } = pack(c);
        const all = placements(packed, specs);
        for (const s of c.specs.filter((x) => x.startsSheet)) {
          expect(all.find((p) => p.spec.key === s.key)!.position).toBe(0);
        }
      }),
      200,
    );
  });

  it('a heading never strands at a sheet’s foot when it and the next item’s first chain fit a fresh sheet', () => {
    holds(
      fc.property(flowCase, (c) => {
        const { packed, specs } = pack(c);
        const all = placements(packed, specs);
        c.specs.forEach((x, index) => {
          const y = c.specs[index + 1];
          if (!x.keepsWithNext || x.structural || !y?.nodes || y.startsSheet) return;
          const xAt = all.find((p) => p.spec.key === x.key)!;
          const yAt = all.find((p) => p.spec.key === y.key)!;
          const page = packed.pages[xAt.page];
          if (xAt.position !== page.length - 1 || yAt.page !== xAt.page + 1) return;
          // The keep chain ending at x: Word moves it whole or not at all.
          const chain: Placement[] = [];
          for (let at = xAt.position; at >= 0; at -= 1) {
            const p = all.find((q) => q.page === xAt.page && q.position === at)!;
            if (!p.spec.keepsWithNext || p.spec.structural) break;
            chain.unshift(p);
          }
          const reachesTop = chain[0].position === 0;
          const firstChain = y.gap + (y.legal.length > 0 ? upTo(y.nodes, y.legal[0]) : sum(y.nodes));
          const chainHeight = sum(chain.map((p) => sum(p.spec.nodes!)));
          expect(reachesTop || chainHeight + firstChain > c.content).toBe(true);
        });
      }),
      200,
    );
  });

  it('adding an item at the end never reduces the page count', () => {
    holds(
      fc.property(flowCase, contentSpec, (c, extra) => {
        const before = pack(c).packed.pages.length;
        const after = pack({ ...c, specs: [...c.specs, { key: 'extra', ...extra }] }).packed.pages.length;
        expect(after).toBeGreaterThanOrEqual(before);
      }),
      200,
    );
  });
});

// ---------------------------------------------------------------- the answer key

const MARK = (n: number) => `PT${n}`;
const FIG = (n: number) => `FIG${n}`;

/** A point's own figure (k-0595), carrying a marker the packer test can find it by. */
const figureBlock = (n: number, kind: 'table' | 'paragraph'): ContentBlock =>
  kind === 'table'
    ? {
        kind: 'table',
        id: `fig-${n}`,
        rows: [0, 1].map((r) => ({
          id: `fig-${n}-r${r}`,
          cells: [{ id: `fig-${n}-c${r}`, text: { en: [{ text: `${FIG(n)} P${r}` }], zh: [{ text: `${FIG(n)} 價${r}` }] } }],
        })),
      }
    : { kind: 'paragraph', id: `fig-${n}`, text: { en: [{ text: FIG(n) }], zh: [{ text: FIG(n) }] } };

const keyCase = fc.record({
  // Per part: per group: per point, [marks, figure kind or none].
  parts: fc.array(
    fc.array(
      fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.constantFrom<'table' | 'paragraph' | undefined>('table', 'paragraph', undefined)), {
        minLength: 1,
        maxLength: 4,
      }),
      { minLength: 1, maxLength: 2 },
    ),
    { minLength: 1, maxLength: 3 },
  ),
  each: fc.constantFrom<number | undefined>(undefined, 1, 2),
  language: fc.constantFrom<LanguageMode>('en', 'zh', 'bilingual'),
  lqLayout: fc.constantFrom<LqKeyLayout>('compact', 'marksColumn', 'table', 'answers'),
  // Suggested answers (its own preset) print the points as bullets unless switched off.
  schemeAsPoints: fc.boolean(),
  heights: fc.array(fc.integer({ min: 8, max: 300 }), { minLength: 80, maxLength: 80 }),
  content: fc.integer({ min: 200, max: 900 }),
});

function keyWorksheet(c: KeyCase): { worksheet: Worksheet; figured: number[] } {
  let n = 0;
  const figured: number[] = [];
  const question = createStructuredQuestion();
  question.id = 'q';
  question.parts = c.parts.map((groups, partIndex) => {
    const scheme: MarkScheme = {
      routes: [
        {
          id: `route-${partIndex}`,
          groups: groups.map((points, groupIndex) => ({
            id: `group-${partIndex}-${groupIndex}`,
            ...(c.each !== undefined ? { each: c.each } : {}),
            points: points.map(([marks, kind]) => {
              n += 1;
              if (kind) figured.push(n);
              return {
                id: `point-${n}`,
                text: { en: [{ text: MARK(n) }], zh: [{ text: MARK(n) }] },
                marks,
                ...(kind ? { blocks: [figureBlock(n, kind)] } : {}),
              };
            }),
          })),
        },
      ],
    };
    return { id: `part-${partIndex}`, blocks: [], marks: 4, scheme };
  });
  const worksheet = withFlow(createWorksheet(), [question]);
  worksheet.answerKeyLayout =
    c.lqLayout === 'answers' ? { preset: 'suggested', schemeAsPoints: c.schemeAsPoints } : { lqLayout: c.lqLayout };
  return { worksheet, figured };
}

type KeyCase = typeof keyCase extends fc.Arbitrary<infer T> ? T : never;

/** A marker, not the start of a longer one (PT1 is not PT12). */
const marked = (marker: string) => new RegExp(`${marker}(?!\\d)`);

/** The text a unit draws: the whole node, or its one table row. */
function unitText(nodes: RenderNode[], unit: { index: number; row?: number }): string {
  const node = nodes[unit.index];
  return JSON.stringify(unit.row !== undefined && node.kind === 'table' ? node.rows[unit.row] : node);
}

describe('answer key packing (property)', { timeout: 60_000 }, () => {
  it('a marking point’s line keeps with its own figure, on one sheet, in every layout and language (k-0595)', () => {
    holds(
      fc.property(keyCase, (c) => {
        const { worksheet, figured } = keyWorksheet(c);
        const { nodes } = answerKeyView(worksheet, c.language);
        const units = keyUnits(nodes);
        // Runs as the key packs them: each ends at a unit that does not keep with the next.
        const runOf: number[] = [];
        units.forEach((unit, i) => {
          runOf.push(i === 0 ? 0 : runOf[i - 1] + (units[i - 1].keepNext ? 0 : 1));
        });
        const runCount = units.length === 0 ? 0 : runOf[runOf.length - 1] + 1;
        const items: PackItem[] = Array.from({ length: runCount }, (_, i) => ({ key: `run-${i}` }));
        const heights = new Map(items.map((item, i) => [item.key, c.heights[i % c.heights.length]]));
        const packed = packPages(items, heights, c.content);
        const pageOf = new Map<string, number>();
        packed.pages.forEach((page, p) => page.forEach((item) => pageOf.set(item.key, p)));
        // Every run of the key lands once, in order.
        expect(packed.pages.flat().map((item) => item.key)).toEqual(items.map((item) => item.key));

        for (const n of figured) {
          const figureAt = units.findIndex((unit) => marked(FIG(n)).test(unitText(nodes, unit)));
          if (figureAt === -1) continue; // A layout that prints no scheme figures.
          // The point's line: the last unit before its figure that prints its words.
          let lineAt = -1;
          for (let i = figureAt - 1; i >= 0; i -= 1) {
            if (marked(MARK(n)).test(unitText(nodes, units[i]))) {
              lineAt = i;
              break;
            }
          }
          expect(lineAt, `${MARK(n)} prints above its figure`).toBeGreaterThanOrEqual(0);
          expect(runOf[lineAt], `${MARK(n)} and ${FIG(n)} share a run`).toBe(runOf[figureAt]);
          expect(pageOf.get(`run-${runOf[lineAt]}`)).toBe(pageOf.get(`run-${runOf[figureAt]}`));
        }
      }),
      60,
    );
  });
});
