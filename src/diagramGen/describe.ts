import type { Diagram, DiagramCurve } from '@/model/diagram';
import { plainOf } from './text';

/**
 * An editor diagram in words, for the model: a reference question's figure ("make a
 * similar but new one") reaches every provider this way, picture support or not. English
 * names (the symbols are the same in both languages); the shapes are what matter.
 */

function slopeWords(c: DiagramCurve): string {
  if (c.derive?.kind === 'vertical') return 'vertical';
  if (c.derive?.kind === 'level') return 'horizontal';
  const pts = c.points;
  if (pts.length < 2) return 'a point';
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.02) return 'vertical';
  if (Math.abs(dy) < 0.02) return 'horizontal';
  const steep = Math.abs(dy / dx);
  const shape = c.shape === 'curved' ? 'curved, ' : pts.length > 2 ? 'kinked, ' : '';
  const dir = dy / dx < 0 ? 'downward-sloping' : 'upward-sloping';
  const how = steep > 2.2 ? 'steep ' : steep < 0.45 ? 'flat ' : '';
  return `${shape}${how}${dir}`;
}

const name = (c: DiagramCurve | undefined) => (c ? plainOf(c.label).trim() || 'an unnamed curve' : 'a curve');
const q = (s: string) => `"${s.replace(/\s+/g, ' ').trim()}"`;

export function describeDiagram(diagram: Diagram): string {
  const lines: string[] = [];
  const title = plainOf(diagram.title).trim();
  if (title) lines.push(`Title: ${q(title)}.`);
  if (diagram.chart) {
    const c = diagram.chart;
    lines.push(`A ${c.kind === 'line' ? 'line graph' : 'bar chart'} of figures.`);
    lines.push(`Categories: ${c.categories.map((x) => plainOf(x)).join(', ')}.`);
    for (const s of c.series) lines.push(`Series ${q(plainOf(s.label))}: ${s.values.map((v) => (v === null ? '-' : v)).join(', ')}.`);
    if (c.yTitle) lines.push(`y-axis unit: ${q(plainOf(c.yTitle))}.`);
    return lines.join('\n');
  }
  if (diagram.pie) {
    lines.push(`A pie chart: ${diagram.pie.slices.map((s) => `${plainOf(s.label)} ${s.value}`).join(', ')}.`);
    return lines.join('\n');
  }
  if (diagram.flow) {
    // Boxes by place and every arrow with its words (k-0588), so a reference chain can be
    // read back into kind "flow" with this question's own stages and amounts.
    const flow = diagram.flow;
    const name = (id: string | undefined) => {
      const node = id ? flow.nodes.find((n) => n.id === id) : undefined;
      return node ? q(plainOf(node.label).replace(/\n/g, ' ')) : '(open end)';
    };
    lines.push(`A flow chart${flow.layout === 'grid' ? ' (grid layout)' : ''} of ${flow.nodes.length} boxes: ${flow.nodes.map((n) => `${q(plainOf(n.label).replace(/\n/g, ' '))} at column ${n.col}, row ${n.row}${n.boxed === false ? ' (no box)' : ''}`).join('; ')}.`);
    for (const a of flow.arrows) {
      const words = [a.label, a.labelBelow].map((t) => plainOf(t).replace(/\n/g, ' ').trim()).filter(Boolean);
      lines.push(`Arrow ${name(a.from)} → ${name(a.to)}${words.length ? `: ${words.map(q).join(' / ')}` : ''}${a.dashed ? ', dashed' : ''}${a.route ? `, looping ${a.route}` : ''}.`);
    }
    if (flow.key) lines.push(`Key: dashed = ${q(plainOf(flow.key.dashed))}, solid = ${q(plainOf(flow.key.solid))}.`);
    return lines.join('\n');
  }
  if (diagram.stakeholder) {
    lines.push(`A stakeholder diagram: ${q(plainOf(diagram.stakeholder.issue))} with ${diagram.stakeholder.stakeholders.map((s) => plainOf(s.label)).join(', ')}.`);
    return lines.join('\n');
  }
  if (diagram.forum) {
    lines.push(`A forum figure with ${diagram.forum.bubbles.length} speech bubbles.`);
    return lines.join('\n');
  }
  const x = plainOf(diagram.x.title).replace(/\n/g, ' ').trim();
  const y = plainOf(diagram.y.title).replace(/\n/g, ' ').trim();
  lines.push(`Axes: x = ${x ? q(x) : '(untitled)'}, y = ${y ? q(y) : '(untitled)'}.`);
  const byId = new Map(diagram.curves.map((c) => [c.id, c]));
  const curveLines = diagram.curves.map((c) => {
    const d = c.derive;
    if (d?.kind === 'shift') {
      const of = byId.get(d.of);
      const way = Math.abs(d.by.x) > Math.abs(d.by.y) ? (d.by.x > 0 ? 'right' : 'left') : d.by.y > 0 ? 'up' : 'down';
      return `${name(c)} = ${name(of)} shifted ${way}`;
    }
    if (d?.kind === 'level') return `${name(c)}: a horizontal price line`;
    if (d?.kind === 'marginalRevenue') return `${name(c)}: the MR of ${name(byId.get(d.of))}`;
    return `${name(c)} (${slopeWords(c)})`;
  });
  if (curveLines.length) lines.push(`Curves: ${curveLines.join('; ')}.`);
  const pointLines = diagram.points.map((p) => {
    const parts: string[] = [];
    const label = plainOf(p.label).trim();
    if (p.anchor && 'cross' in p.anchor) parts.push(`where ${name(byId.get(p.anchor.cross[0]))} meets ${name(byId.get(p.anchor.cross[1]))}`);
    const ticks = [plainOf(p.yTickLabel).trim(), plainOf(p.xTickLabel).trim()].filter(Boolean);
    if (ticks.length) parts.push(`ticks ${ticks.join(', ')}`);
    return `${label || 'a point'}${parts.length ? ` (${parts.join('; ')})` : ''}`;
  });
  if (pointLines.length) lines.push(`Marked points: ${pointLines.join('; ')}.`);
  const spans = (diagram.spans ?? []).map((s) => plainOf(s.label).trim()).filter(Boolean);
  if (spans.length) lines.push(`Brackets / arrows labelled: ${spans.map(q).join(', ')}.`);
  const areas = (diagram.areas ?? []).map((a) => plainOf(a.label).trim() || (a.revenue ? `revenue ${a.revenue.change}` : 'unlabelled'));
  if (areas.length) lines.push(`Shaded areas: ${areas.map(q).join(', ')}.`);
  const notes = diagram.labels.map((l) => plainOf(l.text).trim()).filter(Boolean);
  if (notes.length) lines.push(`Text on the plot: ${notes.map(q).join(', ')}.`);
  if (diagram.arrows.length) lines.push(`${diagram.arrows.length} shift arrow(s).`);
  return lines.join('\n');
}
