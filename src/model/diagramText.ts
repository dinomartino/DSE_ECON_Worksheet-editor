import type { Diagram, DiagramAxis } from './diagram';
import { mapSame, patch, type SlotKind } from './textSlots';
import type { BiText } from './types';

type TextFn = (segment: string, text: BiText, kind: SlotKind) => BiText;

/** A list that may be absent (or malformed in an old file) maps to itself. */
const each = <T>(items: T[] | undefined, fn: (item: T) => T): T[] | undefined =>
  Array.isArray(items) ? mapSame(items, fn) : items;

function mapAxis(axis: DiagramAxis, name: 'x' | 'y', fn: TextFn): DiagramAxis {
  if (!axis) return axis;
  return patch(axis, {
    title: axis.title && fn(`${name}/title`, axis.title, 'axisTitle'),
    ticks: each(axis.ticks, (tick) => patch(tick, { label: fn(`${name}/tick:${tick.id}`, tick.label, 'tickLabel') })),
  });
}

/** A shaded area's label or a free text label: where a worded symbol (DWL) is a name,
 *  not a curve's letters. Matches the segments `mapDiagramTexts` gives them. */
export const isAreaOrFreeLabelPath = (path: string): boolean => /\/(?:area|label):[^/]+$/.test(path);

/**
 * Structural, identity-preserving map over every BiText in a Diagram, in drawing order.
 * Optional fields stay optional. `diagramText.test.ts` holds it to `handleText` parity.
 */
export function mapDiagramTexts(d: Diagram, fn: TextFn): Diagram {
  const opt = (segment: string, text: BiText | undefined): BiText | undefined =>
    text && fn(segment, text, 'diagramLabel');
  return patch(d, {
    title: d.title && fn('title', d.title, 'diagramTitle'),
    x: mapAxis(d.x, 'x', fn),
    y: mapAxis(d.y, 'y', fn),
    curves: each(d.curves, (c) => patch(c, { label: opt(`curve:${c.id}`, c.label) })),
    points: each(d.points, (p) =>
      patch(p, {
        label: opt(`point:${p.id}/label`, p.label),
        xTickLabel: opt(`point:${p.id}/xTick`, p.xTickLabel),
        yTickLabel: opt(`point:${p.id}/yTick`, p.yTickLabel),
      }),
    ),
    labels: each(d.labels, (l) => patch(l, { text: fn(`label:${l.id}`, l.text, 'diagramLabel') })),
    arrows: each(d.arrows, (a) => patch(a, { label: opt(`arrow:${a.id}`, a.label) })),
    spans: each(d.spans, (s) => patch(s, { label: opt(`span:${s.id}`, s.label) })),
    areas: each(d.areas, (a) => patch(a, { label: opt(`area:${a.id}`, a.label) })),
    pie: d.pie && patch(d.pie, {
      slices: each(d.pie.slices, (s) => patch(s, { label: fn(`pie/slice:${s.id}`, s.label, 'diagramLabel') })),
    }),
    flow: d.flow && patch(d.flow, {
      nodes: each(d.flow.nodes, (n) => patch(n, { label: fn(`flow/node:${n.id}`, n.label, 'flowNode') })),
      arrows: each(d.flow.arrows, (a) =>
        patch(a, {
          label: opt(`flow/arrow:${a.id}/label`, a.label),
          labelBelow: opt(`flow/arrow:${a.id}/below`, a.labelBelow),
        }),
      ),
    }),
    forum: d.forum && patch(d.forum, {
      bubbles: each(d.forum.bubbles, (b) =>
        patch(b, {
          speaker: fn(`forum/bubble:${b.id}/speaker`, b.speaker, 'speaker'),
          text: fn(`forum/bubble:${b.id}/text`, b.text, 'bubble'),
        }),
      ),
    }),
  });
}
