import type { DiagramAnchorRef, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { curve, placeLabel, point, span, type Pair } from '@/model/diagramTemplateKit';
import type { BiText } from '@/model/types';
import { phraseOf, at, type Draft } from './sceneKit';
import { phrase } from './text';
import { TRADE_WORDS, tradeNumbers, tradeParts, type CountryNumbers } from './trade';
import type { SpecScene } from './types';

/**
 * Draws the PPF / CPF trade scene (k-0589) from `trade.ts`'s numbers: each axis scaled so its
 * largest number sits near the top (the axes' `max` set, so the inspector reads the goods' units),
 * a straight PPF or a densely sampled quarter ellipse (curved, so the spline is the ellipse and the
 * CPF touches it at the worked-out point), the CPF, the lettered points with dashed drops to their
 * numbers, and the brackets anchored to the points so they follow a drag.
 */

const SCALE = 0.86;

export function draftTrade(scene: SpecScene, name: (part: string) => BiText | undefined, tick: (part: string) => BiText | null | undefined): Draft {
  const trade = scene.trade!;
  const nums = tradeNumbers(trade);
  const { parts, drops } = tradeParts(scene, nums);
  const has = (id: string) => parts.some((p) => p.id === id);
  /** A tick's label: its own (or null = a drop with no number, when the value is printed by another part); undefined = none. */
  const tickOf = (id: string): BiText | null | undefined => (has(id) ? tick(id) : drops.has(id) ? null : undefined);
  const all: CountryNumbers[] = [...nums.countries, ...(nums.grown ? [nums.grown] : [])];
  const mx = Math.max(...all.flatMap((n) => [n.X, n.cpf?.x ?? 0, n.c?.x ?? 0]));
  const my = Math.max(...all.flatMap((n) => [n.Y, n.cpf?.y ?? 0, n.c?.y ?? 0]));
  const ux = (v: number) => (v / mx) * SCALE;
  const uy = (v: number) => (v / my) * SCALE;

  const curves: DiagramCurve[] = [];
  const points: DiagramPointMark[] = [];
  const spans: DiagramSpan[] = [];
  const roles: Draft['curveRoles'] = {};
  const marks: Record<string, DiagramPointMark> = {};
  const named: string[] = [];
  const ppfOf = new Map<string, DiagramCurve>();
  const cpfOf = new Map<string, DiagramCurve>();

  // Frontiers and CPFs.
  for (const n of all) {
    const s = n.suffix;
    const ppfPoints: Pair[] =
      n.spec.shape === 'concave'
        ? Array.from({ length: 19 }, (_, i): Pair => {
            const t = (Math.PI / 2) * (1 - i / 18);
            return [ux(n.X * Math.cos(t)), uy(n.Y * Math.sin(t))];
          })
        : [
            [0, uy(n.Y)],
            [ux(n.X), 0],
          ];
    // Its name inside the frontier, just under it (at its end it would sit under the axis): a straight one 70% of the way
    // across, a concave one where it is still flat (40%), clear of the tangency the CPF touches further down.
    const along = (n.spec.shape === 'concave' ? 0.4 : 0.7) * n.X;
    const ppf = placeLabel(curve(ppfPoints, name(`PPF${s}`), n.spec.shape === 'concave' ? { shape: 'curved' } : {}), ux(along) - 0.03, uy(n.ppfY(along)) - 0.065);
    curves.push(ppf);
    ppfOf.set(s, ppf);
    roles[`PPF${s}`] = { curve: ppf, role: 'frontier' };
    if (n.cpf) {
      // Two countries trading at one price on one line (DSEPP Q16: both CPFs from 100 Y to 100 X): one line, both names.
      const same = [...cpfOf.entries()].find(([k]) => {
        const o = all.find((m) => m.suffix === k)!;
        return Math.abs(o.cpf!.x - n.cpf!.x) < 1e-6 && Math.abs(o.cpf!.y - n.cpf!.y) < 1e-6;
      });
      if (same) {
        const first = same[1];
        const a = first.label;
        const b = name(`CPF${s}`);
        if (a && b) first.label = { en: [...a.en, { text: ' = ' }, ...b.en], zh: [...a.zh, { text: ' = ' }, ...b.zh] };
        cpfOf.set(s, first);
        roles[`CPF${s}`] = { curve: first, role: 'graph' };
        continue;
      }
      const cpf = curve(
        [
          [0, uy(n.cpf.y)],
          [ux(n.cpf.x), 0],
        ],
        name(`CPF${s}`),
        // Its name at the top, clear of the PPF's; when production sits there (specialised in Y), by its foot instead.
        { labelAt: n.p && n.p.x < 1e-9 ? 'end' : 'start' },
      );
      if (n.p && n.p.x < 1e-9) Object.assign(cpf, placeLabel(cpf, ux(n.cpf.x) + 0.035, 0.07));
      curves.push(cpf);
      cpfOf.set(s, cpf);
      roles[`CPF${s}`] = { curve: cpf, role: 'graph' };
    }
  }

  // A dotted world price line apart from the CPF: parallel, beyond it (or inside it when beyond leaves no room).
  if (has('TOT') && nums.countries[0]?.cpf) {
    const c = nums.countries[0].cpf;
    const [a, b] = [uy(c.y), ux(c.x)];
    const len = Math.hypot(a, b);
    const dir: Pair = [b / len, -a / len];
    const normal: Pair = [a / len, b / len];
    const segment = (off: number): Pair[] | null => {
      const mid: Pair = [b / 2 + normal[0] * off, a / 2 + normal[1] * off];
      const half = 0.2;
      const ends: Pair[] = [
        [mid[0] - dir[0] * half, mid[1] - dir[1] * half],
        [mid[0] + dir[0] * half, mid[1] + dir[1] * half],
      ];
      return ends.every(([x, y]) => x >= 0.02 && x <= 0.95 && y >= 0.02 && y <= 0.95) ? ends : null;
    };
    const ends = segment(0.1) ?? segment(0.06) ?? segment(-0.14);
    if (ends) {
      const tot = curve(ends, name('TOT'), { stroke: 'dashed', weight: 0.8 });
      curves.push(tot);
      roles.TOT = { curve: tot, role: 'graph' };
    }
  } else if (has('TOT') && nums.countries[0]) {
    // No trade drawn (the question asks what trade will do: DSE2017's TT'): the world price's slope just outside the
    // first frontier, clear of it, so the line gives no production point away.
    const n0 = nums.countries[0];
    const [A, B] = [ux(n0.X), uy(n0.Y)];
    const slope = (trade.tot * uy(1)) / ux(1);
    const len = Math.hypot(1, slope);
    const normal: Pair = [slope / len, 1 / len];
    const dir: Pair = [1 / len, -slope / len];
    const support = n0.spec.shape === 'concave' ? Math.hypot(A * normal[0], B * normal[1]) : Math.max(A * normal[0], B * normal[1]);
    const mid: Pair = [normal[0] * (support + 0.07), normal[1] * (support + 0.07)];
    const inPlot = (half: number): Pair[] | null => {
      const e: Pair[] = [
        [mid[0] - dir[0] * half, mid[1] - dir[1] * half],
        [mid[0] + dir[0] * half, mid[1] + dir[1] * half],
      ];
      return e.every(([x, y]) => x >= 0.02 && x <= 0.95 && y >= 0.02 && y <= 0.95) ? e : null;
    };
    const ends = inPlot(0.2) ?? inPlot(0.12);
    if (ends) {
      const tot = curve(ends, name('TOT'), { stroke: 'dashed', weight: 0.8 });
      curves.push(tot);
      roles.TOT = { curve: tot, role: 'graph' };
    }
  }

  // Numbers on the axes: each intercept a tick of its own (no drop line), so a figure the student completes can hide the CPF's.
  const axisTick = (id: string, axis: 'x' | 'y', v: number) => {
    const label = has(id) ? tick(id) : undefined;
    if (!label) return;
    const p = point(axis === 'x' ? ux(v) : 0, axis === 'x' ? 0 : uy(v), undefined, { dot: false, dropTo: [axis], ...(axis === 'x' ? { xTickLabel: label } : { yTickLabel: label }) });
    points.push(p);
    marks[id] = p;
  };
  for (const n of all) {
    const s = n.suffix;
    axisTick(`PPF${s}x`, 'x', n.X);
    axisTick(`PPF${s}y`, 'y', n.Y);
    if (n.cpf) {
      axisTick(`CPF${s}x`, 'x', n.cpf.x);
      axisTick(`CPF${s}y`, 'y', n.cpf.y);
    }
  }

  // Lettered points with dashed drops to their numbers.
  const letter = (id: string, where: { x: number; y: number }, anchor: DiagramAnchorRef, ticks: { x?: BiText | null; y?: BiText | null }) => {
    const drops: Array<'x' | 'y'> = [];
    if (ticks.x !== undefined && where.y > 1e-6) drops.push('x');
    if (ticks.y !== undefined && where.x > 1e-6) drops.push('y');
    const p = point(where.x, where.y, name(id), { anchor, dot: true, dropTo: drops, ...(ticks.x ? { xTickLabel: ticks.x } : {}), ...(ticks.y ? { yTickLabel: ticks.y } : {}) });
    points.push(p);
    marks[id] = p;
    named.push(p.id);
    return p;
  };
  const xAt = (v: number): DiagramAnchorRef => ({ x: v, y: 0 });
  for (const n of all) {
    const s = n.suffix;
    const ppf = ppfOf.get(s)!;
    if (n.e) {
      const where = { x: ux(n.e.x), y: uy(n.e.y) };
      const e = letter(`E${s}`, where, { on: ppf.id, x: xAt(where.x) }, { x: tickOf(`E${s}x`), y: tickOf(`E${s}y`) });
      marks[`E${s}x`] = e;
      marks[`E${s}y`] = e;
    }
    if (n.p) {
      const where = { x: ux(n.p.x), y: uy(n.p.y) };
      letter(`P${s}`, where, { on: ppf.id, x: xAt(where.x) }, {});
    }
    if (n.c && n.cpf) {
      const where = { x: ux(n.c.x), y: uy(n.c.y) };
      const c = letter(`C${s}`, where, { on: cpfOf.get(s)!.id, x: xAt(where.x) }, { x: tickOf(`C${s}x`), y: tickOf(`C${s}y`) });
      marks[`C${s}x`] = c;
      marks[`C${s}y`] = c;
    }
  }

  // Brackets: exports and imports between the production and consumption points, along each axis; the gain from C down to the PPF.
  const used: Array<{ along: 'x' | 'y'; lo: number; hi: number; offset: number }> = [];
  const along = (from: DiagramPointMark, to: DiagramPointMark, axis: 'x' | 'y', label: BiText) => {
    const [lo, hi] = [from.at[axis], to.at[axis]].sort((p, q) => p - q);
    let offset = 0;
    while (used.some((u) => u.along === axis && u.offset === offset && u.lo < hi - 1e-6 && lo < u.hi - 1e-6)) offset += 0.07;
    used.push({ along: axis, lo, hi, offset });
    spans.push(span(at(from), at(to), 'bracket', { along: axis, ...(offset ? { offset } : {}), label }));
  };
  const wordsOf = (id: string, fallback: BiText) => name(id) ?? fallback;
  const two = nums.countries.length > 1;
  for (const n of nums.countries) {
    const s = n.suffix;
    const p = marks[`P${s}`];
    const c = marks[`C${s}`];
    if (!p || !c || !n.exportsGood) continue;
    const who = two ? n.spec.name || (s ? 'B' : 'A') : '';
    const named2 = (w: { en: string; zh: string }) => phraseOf(who ? { en: `${who}'s ${w.en.toLowerCase()}`, zh: `${who} 的${w.zh}` } : w);
    if (has(`X${s}`)) along(c, p, n.exportsGood === 'x' ? 'x' : 'y', wordsOf(`X${s}`, named2(TRADE_WORDS.exports)));
    if (has(`M${s}`)) along(p, c, n.exportsGood === 'x' ? 'y' : 'x', wordsOf(`M${s}`, named2(TRADE_WORDS.imports)));
    if (has(`G${s}`)) spans.push(span(at(c), { on: ppfOf.get(s)!.id, x: at(c) }, 'doubleArrow', { offset: 0.03, label: wordsOf(`G${s}`, phraseOf(TRADE_WORDS.gain)), labelOffset: { x: 0.08, y: 0.04 } }));
  }

  const title = (t: { en: string; zh: string }, fallback: { en: string; zh: string }) => phrase(t) ?? phraseOf(fallback);
  return {
    curves,
    points,
    arrows: [],
    spans,
    x: title(trade.xGood, TRADE_WORDS.x),
    y: title(trade.yGood, TRADE_WORDS.y),
    regions: {},
    curveRoles: roles,
    levels: {},
    marks,
    named,
    axisMax: { x: mx / SCALE, y: my / SCALE },
    trade: nums,
  };
}
