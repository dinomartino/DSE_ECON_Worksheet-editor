import { describe, it, expect } from 'vitest';
import { diagramSvg, diagramSize } from './diagram';
import type { Diagram } from '@/model/diagram';

/**
 * A hard break inside diagram text prints as a second line.
 *
 * The reference paper (DSE 2021 P1 Q33, Q39) stacks a y-axis title as "Nominal /
 * interest rate" and a curve label as "average / growth rate". A newline is ordinary run
 * text, so a renderer that does not split it collapses the break to a space — and the
 * symptom is only visible on a rendered page, which is why this is pinned here.
 */

function blank(): Diagram {
  return { x: {}, y: {}, curves: [], points: [], labels: [], arrows: [] };
}

const opts = { widthPx: 400, heightPx: 300, language: 'en' as const };

describe('a hard break in diagram text', () => {
  it('draws a two-line y-axis title as two <text> elements', () => {
    const one = diagramSvg({ ...blank(), y: { title: { en: [{ text: 'Nominal interest rate' }], zh: [] } } }, opts);
    const two = diagramSvg({ ...blank(), y: { title: { en: [{ text: 'Nominal\ninterest rate' }], zh: [] } } }, opts);

    expect(one).toContain('Nominal interest rate');
    // Split across two <text> runs, so the words no longer appear as one string.
    expect(two).not.toContain('Nominal interest rate');
    expect(two).toContain('Nominal');
    expect(two).toContain('interest rate');
    expect((two.match(/<text /g) ?? []).length).toBeGreaterThan(
      (one.match(/<text /g) ?? []).length,
    );
  });

  it('keeps run formatting across the break', () => {
    const svg = diagramSvg(
      {
        ...blank(),
        curves: [
          {
            id: 'c',
            points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }],
            shape: 'straight',
            label: {
              en: [{ text: 'M' }, { text: 'd1\nsecond', vertAlign: 'subscript' }],
              zh: [],
            },
          },
        ],
      },
      opts,
    );
    // The subscript survives onto the second line rather than being dropped by a
    // flatten-and-reparse.
    expect((svg.match(/baseline-shift="sub"/g) ?? []).length).toBe(2);
    expect(svg).toContain('second');
  });

  it('a two-line title reserves the room it needs, and no more', () => {
    const short = diagramSize({ ...blank(), title: { en: [{ text: 'A' }], zh: [] } }, 400, 'en');
    const twoLine = diagramSize(
      { ...blank(), title: { en: [{ text: 'A\nB' }], zh: [] } },
      400,
      'en',
    );
    // A second line costs height...
    expect(twoLine.heightPx).toBeGreaterThan(short.heightPx);
    // ...and the width is the teacher's number either way.
    expect(twoLine.widthPx).toBe(400);
  });

  it('a break in the x-axis title narrows the reserved side margin', () => {
    const title = (text: string) =>
      diagramSvg({ ...blank(), x: { title: { en: [{ text }], zh: [] } } }, opts);

    // The room reserved beside the plot is measured from the *widest* line, so breaking
    // a long title in two lets the plot run further right. Read from where the title
    // itself is anchored, which is placed past the axis arrowhead.
    const titleX = (svg: string) => {
      const matches = [...svg.matchAll(/<text x="([\d.]+)"/g)].map((m) => Number(m[1]));
      return Math.max(...matches);
    };
    expect(titleX(title('Quantity of\nGood X'))).toBeGreaterThan(
      titleX(title('Quantity of Good X')),
    );
  });
});
