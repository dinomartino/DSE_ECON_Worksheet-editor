import type { Diagram } from '@/model/diagram';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { diagramLabelBoxes, diagramPlot, diagramSize } from '@/render/diagram';
import type { DiagramIssue } from './types';

/**
 * The figure as it prints, at the width it prints (u-ewel): every label inside the picture,
 * and every curve's name beside its own curve. The draft whose option figures printed
 * "Aggregate outp" and an AD₁ down among the axis's words passed every check and showed
 * "No problems found"; these read the renderer's own label boxes (`diagramLabelBoxes`, after
 * its fitting pass), so they see what the teacher sees. They are `look`: the drawing is the
 * renderer's, not something a repair turn can move.
 */

/** A curve's name further than this from its curve (px) no longer reads as its name. */
const NAME_REACH = 28;

export function checkLayout(diagram: Diagram, widthPx: number, sides: readonly Side[]): DiagramIssue[] {
  if (diagram.pie || diagram.flow || diagram.forum || diagram.stakeholder || diagram.chart) return [];
  const language = sides.includes('en') && sides.includes('zh') ? 'bilingual' : sides.includes('zh') ? 'zh' : 'en';
  const size = diagramSize(diagram, widthPx, language);
  const options = { ...size, language } as const;
  const boxes = diagramLabelBoxes(diagram, options);
  const proj = diagramPlot(diagram, options);
  const issues: DiagramIssue[] = [];
  const textOf = (kind: string, id: string): string => {
    const pick = (t?: { en: Parameters<typeof plain>[0]; zh: Parameters<typeof plain>[0] }) => (t ? plain(t.en) || plain(t.zh) : '');
    if (kind === 'curve') return pick(diagram.curves.find((c) => c.id === id)?.label);
    if (kind === 'title') return pick(diagram[id as 'x' | 'y']?.title);
    if (kind === 'point' || kind === 'tick') {
      const p = diagram.points.find((q) => q.id === id || id.startsWith(q.id));
      return pick(p?.label ?? p?.xTickLabel ?? p?.yTickLabel);
    }
    return pick(diagram.labels.find((l) => l.id === id)?.text);
  };
  // The fitting pass pads every box's width by its slack (×1.15): ink overshoots the edge only past that padding.
  const slack = (b: (typeof boxes)[number]) => (b.box.x1 - b.box.x0) * (1 - 1 / 1.15) + 1;
  const clipped = boxes.filter((b) => b.box.x0 < -slack(b) || b.box.y0 < -1 || b.box.x1 > size.widthPx + slack(b) || b.box.y1 > size.heightPx + 1);
  if (clipped.length) {
    issues.push({
      level: 'look',
      code: 'layout.clipped',
      text: `${clipped.map((b) => `"${textOf(b.kind, b.id) || b.kind}"`).join(', ')} ${clipped.length === 1 ? 'runs' : 'run'} off the edge of the figure and would print cut off.`,
    });
  }
  const away: string[] = [];
  for (const b of boxes) {
    if (b.kind !== 'curve') continue;
    const c = diagram.curves.find((k) => k.id === b.id);
    if (!c || c.points.length < 2) continue;
    // Beside its curve: near some part of it (a frontier is named by its top, not its end).
    const pts = c.points.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));
    let near = Infinity;
    for (let i = 1; i < pts.length; i += 1) {
      for (let k = 0; k <= 20; k += 1) {
        const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 20;
        const y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 20;
        near = Math.min(near, Math.hypot(Math.max(b.box.x0 - x, 0, x - b.box.x1), Math.max(b.box.y0 - y, 0, y - b.box.y1)));
      }
    }
    // Under the x-axis is never beside a curve that stays above it.
    const lowest = Math.max(...pts.map((p) => p.y));
    const under = b.box.y0 > proj.plot.bottom && lowest < proj.plot.bottom - 1;
    if (near > NAME_REACH || under) away.push(textOf('curve', c.id));
  }
  if (away.length) {
    issues.push({
      level: 'look',
      code: 'layout.nameAway',
      text: `The name${away.length === 1 ? '' : 's'} ${away.map((t) => `"${t}"`).join(', ')} ${away.length === 1 ? 'sits' : 'sit'} away from ${away.length === 1 ? 'its curve' : 'their curves'}: a reader may not tell which line ${away.length === 1 ? 'it names' : 'they name'}.`,
    });
  }
  return issues;
}
