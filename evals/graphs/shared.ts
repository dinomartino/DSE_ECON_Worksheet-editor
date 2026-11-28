import type { DiagramGenInput } from '@/diagramGen/types';
import type { Diagram } from '@/model/diagram';
import { plainOf } from '@/diagramGen/text';
import type { GraphCase } from './cases';

/**
 * The graph eval's helpers, in a file with no test in it (k-0601): a test or eval that imported
 * them from `graphs.eval.ts` also loaded its live describe block, and with a Mentor token set
 * and no EVAL_ONLY that ran the whole paid set (1,073.70 credits spent by mistake, 2026-11-28).
 */

export const letter = (i: number) => 'ABCD'[i] ?? '?';

export function inputOf(c: GraphCase): DiagramGenInput {
  const statements = c.statements ?? [];
  const question = [c.stem, ...statements.map((t, i) => `(${i + 1}) ${t}`), ...c.options.map((o, i) => `${letter(i)}. ${o}`)].join('\n');
  const key = `Correct answer: ${letter(c.answer)}. ${c.options[c.answer]}\n${c.explanation}`;
  return { question, key, sides: ['en', 'zh'], figure: c.figure, mcq: { stem: c.stem, statements: [...statements], options: [...c.options], answer: c.answer } };
}

/** Every label printed on a figure (curve names, point names, ticks, areas, free labels), as plain text. */
export function printedLabels(d: Diagram): string[] {
  const out: string[] = [];
  const add = (t: unknown) => {
    if (!t) return;
    const s = (plainOf(t as never, 'en') || plainOf(t as never, 'zh')).trim();
    if (s) out.push(s);
  };
  for (const c of d.curves) add(c.label);
  for (const p of d.points) {
    add(p.label);
    add(p.xTickLabel);
    add(p.yTickLabel);
  }
  for (const a of d.areas ?? []) add(a.label);
  for (const l of d.labels) add(l.text);
  for (const s of d.spans ?? []) add(s.label);
  for (const s of d.pie?.slices ?? []) add(s.label);
  return out;
}

