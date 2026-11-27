/**
 * The flow figures a column chart could not draw (k-0588, audit k-0583 task D2): the
 * circular flow and the production-stage charts, checked against the HKDSE papers that
 * print them. Pictures of each: `Outbox/k-0588/`.
 */
import { describe, expect, it } from 'vitest';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { bi } from '@/model/text';
import { chart, dse2014q10, dse2024q6, dse2026q5, node } from '@/test/flowFixtures';
import type { LanguageMode } from '@/model/types';
import { diagramSize, diagramSvg, flowChartLayout, type FlowLayout } from '@/render/diagram';

const LANGUAGES: LanguageMode[] = ['en', 'zh'];
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

const legs = (layout: FlowLayout, id: string): Array<[Point, Point]> => {
  const seg = layout.arrows.find((a) => a.arrow.id === id)!;
  const points = seg.points ?? [
    { x: seg.x1, y: seg.y1 },
    { x: seg.x2, y: seg.y2 },
  ];
  return points.slice(1).map((p, i) => [points[i], p]);
};

/** Does the segment pass through the inside of the rectangle (shrunk by `inset`)? */
function crossesInside(a: Point, b: Point, r: Rect, inset = 1.5): boolean {
  const x0 = r.x + inset;
  const x1 = r.x + r.w - inset;
  const y0 = r.y + inset;
  const y1 = r.y + r.h - inset;
  for (let i = 0; i <= 200; i += 1) {
    const t = i / 200;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x > x0 && x < x1 && y > y0 && y < y1) return true;
  }
  return false;
}

/** Every shaft leg stays out of every box (it may end on a wall). */
function expectNoShaftThroughABox(layout: FlowLayout) {
  for (const seg of layout.arrows) {
    for (const [a, b] of legs(layout, seg.arrow.id)) {
      for (const box of layout.boxes) {
        expect(crossesInside(a, b, box), `${seg.arrow.id} through ${box.node.id}`).toBe(false);
      }
    }
  }
}

/** Label blocks, roughly: width by characters, one line height per line. */
function labelRects(layout: FlowLayout): Array<Rect & { id: string }> {
  return layout.arrows.flatMap((seg) =>
    [seg.label, seg.labelBelow]
      .filter((label) => !!label)
      .map((label) => {
        const text = label!.lines.map((line) => line.map((run) => run.text).join('')).join('');
        const w = text.length * 5;
        const left = label!.anchor === 'middle' ? label!.x - w / 2 : label!.anchor === 'end' ? label!.x - w : label!.x;
        return { id: seg.arrow.id, x: left, y: label!.y - 8, w, h: 10 * label!.lines.length };
      }),
  );
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the circular flow (HKDSE 2026 P1 Q5)', () => {
  it.each(LANGUAGES)('draws two nested loops over the top and two underneath (%s)', (language) => {
    const layout = flowChartLayout(dse2026q5(), dse2026q5().flow!, language);
    const [h, f] = ['h', 'f'].map((id) => layout.boxes.find((b) => b.node.id === id)!);
    const lane = (id: string) => legs(layout, id)[1][0].y;
    const span = (id: string) => {
      const [first, , last] = legs(layout, id);
      return [Math.min(first[0].x, last[1].x), Math.max(first[0].x, last[1].x)];
    };
    // Over the top: Flow X (the outer, dashed) above Flow Y; both above both boxes.
    expect(lane('y')).toBeLessThan(Math.min(h.y, f.y));
    expect(lane('x')).toBeLessThan(lane('y'));
    // Underneath, mirrored: the stored-first loop inside.
    expect(lane('real2')).toBeGreaterThan(Math.max(h.y + h.h, f.y + f.h));
    expect(lane('money2')).toBeGreaterThan(lane('real2'));
    // Nested: the outer loop's span holds the inner's, so they never cross.
    for (const [outer, inner] of [['x', 'y'], ['money2', 'real2']]) {
      expect(span(outer)[0]).toBeLessThan(span(inner)[0]);
      expect(span(outer)[1]).toBeGreaterThan(span(inner)[1]);
    }
    // Each loop leaves the top (or bottom) of its source and lands on its target's.
    const x = legs(layout, 'x');
    expect(x[0][0].y).toBeCloseTo(h.y);
    expect(x[2][1].y).toBeCloseTo(f.y);
    const money2 = legs(layout, 'money2');
    expect(money2[0][0].y).toBeCloseTo(f.y + f.h);
    expect(money2[2][1].y).toBeCloseTo(h.y + h.h);
    expectNoShaftThroughABox(layout);
  });

  it.each(LANGUAGES)('keeps "Flow X" and "Flow Y" off the lines and boxes (%s)', (language) => {
    const layout = flowChartLayout(dse2026q5(), dse2026q5().flow!, language);
    const rects = labelRects(layout);
    const x = rects.find((r) => r.id === 'x')!;
    const y = rects.find((r) => r.id === 'y')!;
    expect(overlaps(x, y)).toBe(false);
    for (const label of [x, y]) {
      for (const box of layout.boxes) expect(overlaps(label, box)).toBe(false);
    }
    // Flow X above its lane, Flow Y under its own, between the two lanes.
    expect(x.y + x.h).toBeLessThan(legs(layout, 'x')[1][0].y);
    expect(y.y).toBeGreaterThan(legs(layout, 'y')[1][0].y);
    expect(y.y + y.h).toBeLessThan(Math.min(...layout.boxes.map((b) => b.y)));
  });

  it('draws the money flows dashed, with the key in the top-right corner', () => {
    const diagram = dse2026q5();
    for (const language of LANGUAGES) {
      const svg = diagramSvg(diagram, { ...diagramSize(diagram, 480, language), language });
      // Two money flows and the key's dashed sample.
      expect(svg.match(/stroke-dasharray=/g)).toHaveLength(3);
      // Every shaft keeps a solid head: four loops and two key samples.
      expect(svg.match(/data-arrowhead/g)).toHaveLength(6);
      expect(svg).toContain(language === 'en' ? 'Money flow' : '貨幣流程');
      expect(svg).toContain(language === 'en' ? 'Real flow' : '實質流程');
    }
    const layout = flowChartLayout(diagram, diagram.flow!, 'en');
    const top = Math.min(...layout.arrows.flatMap((a) => (a.points ?? []).map((p) => p.y)));
    expect(layout.key).toHaveLength(2);
    for (const row of layout.key!) {
      expect(row.y).toBeLessThan(top);
      expect(row.textX).toBeGreaterThan(layout.width / 2);
    }
  });

  it('the template is the same figure, in English and Chinese', () => {
    const diagram = buildFromTemplate('circular-flow');
    expect(diagram.flow!.arrows.map((a) => [a.route, a.dashed ?? false])).toEqual([
      ['above', false],
      ['above', true],
      ['below', false],
      ['below', true],
    ]);
    for (const language of LANGUAGES) expectNoShaftThroughABox(flowChartLayout(diagram, diagram.flow!, language));
  });
});

describe('production stages in a triangle (HKDSE 2014 P1 Q10)', () => {
  it.each(LANGUAGES)('puts primary production over the gap between the other two (%s)', (language) => {
    const layout = flowChartLayout(dse2014q10(), dse2014q10().flow!, language);
    const [p, s, t] = ['p', 's', 't'].map((id) => layout.boxes.find((b) => b.node.id === id)!);
    const cx = (b: Rect) => b.x + b.w / 2;
    expect(p.y + p.h).toBeLessThan(s.y);
    expect(s.y).toBeCloseTo(t.y);
    expect(cx(p)).toBeGreaterThan(s.x + s.w);
    expect(cx(p)).toBeLessThan(t.x);
    // The audit's failure (picture 5): one row, an arrow through the middle box.
    expectNoShaftThroughABox(layout);
  });

  it.each(LANGUAGES)('draws each link as two arrows side by side, not one on the other (%s)', (language) => {
    const layout = flowChartLayout(dse2014q10(), dse2014q10().flow!, language);
    for (const [a, b] of [['e1', 'e2'], ['f1', 'f2'], ['st', 'ts']]) {
      const [[a1, a2]] = legs(layout, a);
      const [[b1, b2]] = legs(layout, b);
      // Parallel, opposite, 12 px apart.
      const ux = a2.x - a1.x;
      const uy = a2.y - a1.y;
      const length = Math.hypot(ux, uy);
      expect((ux * (b2.x - b1.x) + uy * (b2.y - b1.y)) / (length * Math.hypot(b2.x - b1.x, b2.y - b1.y))).toBeCloseTo(-1, 5);
      const distance = Math.abs(((b1.x - a1.x) * uy - (b1.y - a1.y) * ux) / length);
      expect(distance).toBeCloseTo(12, 5);
    }
  });

  it.each(LANGUAGES)('keeps E and F outside their pairs and off the boxes (%s)', (language) => {
    const layout = flowChartLayout(dse2014q10(), dse2014q10().flow!, language);
    for (const label of labelRects(layout)) {
      for (const box of layout.boxes) expect(overlaps(label, box), `${label.id} on ${box.node.id}`).toBe(false);
      // Not crossed by either shaft of its pair.
      const pair = label.id === 'e1' ? ['e1', 'e2'] : ['f1', 'f2'];
      for (const id of pair) {
        for (const [a, b] of legs(layout, id)) expect(crossesInside(a, b, label, 0)).toBe(false);
      }
    }
  });

  it('the template is the same triangle', () => {
    const diagram = buildFromTemplate('production-stages');
    expect(diagram.flow!.layout).toBe('grid');
    for (const language of LANGUAGES) expectNoShaftThroughABox(flowChartLayout(diagram, diagram.flow!, language));
  });
});

describe('households over the stages (HKDSE 2024 P1 Q6)', () => {
  it.each(LANGUAGES)('stacks households over primary production, the other two below, with no shaft through a box (%s)', (language) => {
    const layout = flowChartLayout(dse2024q6(), dse2024q6().flow!, language);
    const [h, p, s, t] = ['h', 'p', 's', 't'].map((id) => layout.boxes.find((b) => b.node.id === id)!);
    expect(h.y + h.h).toBeLessThan(p.y);
    expect(p.y + p.h).toBeLessThan(s.y);
    expect(s.y).toBeCloseTo(t.y);
    expect(h.x + h.w / 2).toBeCloseTo(p.x + p.w / 2);
    // P (secondary → households) runs past primary production, not through it.
    expectNoShaftThroughABox(layout);
    for (const label of labelRects(layout)) {
      for (const box of layout.boxes) expect(overlaps(label, box), `${label.id} on ${box.node.id}`).toBe(false);
    }
  });
});

describe('what stays as it was', () => {
  it('a chart without the new fields draws no dash and no routed corner', () => {
    const diagram = buildFromTemplate('flow');
    const svg = diagramSvg(diagram, { ...diagramSize(diagram, 460, 'en'), language: 'en' });
    expect(svg).not.toContain('stroke-dasharray');
    expect(flowChartLayout(diagram, diagram.flow!, 'en').arrows.every((a) => !a.points)).toBe(true);
    expect(flowChartLayout(diagram, diagram.flow!, 'en').key).toBeUndefined();
  });

  it('a route on a stub is ignored: it stays a straight stub', () => {
    const diagram = chart({
      nodes: [node('a', 'Factory', '工廠', 0, 0)],
      arrows: [{ id: 'in', to: 'a', route: 'above', label: bi('$200', '$200') }],
    });
    const [seg] = flowChartLayout(diagram, diagram.flow!, 'en').arrows;
    expect(seg.points).toBeUndefined();
    expect(seg.y1).toBeCloseTo(seg.y2);
  });

  it('a key with no words prints nothing', () => {
    const diagram = chart({ nodes: [node('a', 'A', 'A', 0, 0)], arrows: [], key: {} });
    expect(flowChartLayout(diagram, diagram.flow!, 'en').key).toBeUndefined();
  });

  it('two boxes given one grid cell stack, never overlap', () => {
    const diagram = chart({ layout: 'grid', nodes: [node('a', 'A', 'A', 0, 0), node('b', 'B', 'B', 0, 0)], arrows: [] });
    const [a, b] = flowChartLayout(diagram, diagram.flow!, 'en').boxes;
    expect(overlaps(a, b)).toBe(false);
  });
});
