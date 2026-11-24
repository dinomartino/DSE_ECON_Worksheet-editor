import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, McqQuestion, RichText } from '@/model/types';
import { digitGroups } from '@/translate/wire';
import type { PolishChange } from './types';

/**
 * What a reworded question must keep (k-0549): every number of each text, the order of the
 * statements and options, and the key. A change that breaks one is shown to the teacher
 * with the reason and never offered for Accept.
 */

/** The digit groups one side has that the other lacks (thousands separators ignored). */
export function numbersMoved(before: RichText, after: RichText): { lost: string[]; added: string[] } | null {
  const count = (runs: RichText) => {
    const m = new Map<string, number>();
    for (const n of digitGroups(plain(runs))) m.set(n, (m.get(n) ?? 0) + 1);
    return m;
  };
  const a = count(before);
  const b = count(after);
  const lost: string[] = [];
  const added: string[] = [];
  for (const [n, k] of a) for (let i = (b.get(n) ?? 0); i < k; i += 1) lost.push(n);
  for (const [n, k] of b) for (let i = (a.get(n) ?? 0); i < k; i += 1) added.push(n);
  return lost.length || added.length ? { lost, added } : null;
}

const bigrams = (text: string): Set<string> => {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2));
  if (t.length === 1) out.add(t);
  return out;
};

function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const g of x) if (y.has(g)) both += 1;
  return both / (x.size + y.size - both);
}

/** How much closer a moved text must read to another slot than to its own to count as moved. */
const MOVE_MARGIN = 0.15;

/**
 * True when a list (options or statements) reads reordered: some new text is clearly closer
 * to another old text than to its own. Compared on every side the list has.
 */
export function orderMoved(before: readonly BiText[], after: readonly BiText[], sides: readonly Side[]): boolean {
  if (before.length !== after.length) return true;
  for (const side of sides) {
    const old = before.map((t) => plain(t[side]));
    const now = after.map((t) => plain(t[side]));
    if (old.filter(Boolean).length < 2) continue;
    for (let i = 0; i < now.length; i += 1) {
      if (!now[i] || now[i] === old[i]) continue;
      const own = similarity(now[i], old[i]);
      for (let j = 0; j < old.length; j += 1) {
        if (j !== i && old[j] && similarity(now[i], old[j]) > own + MOVE_MARGIN) return true;
      }
    }
  }
  return false;
}

/** The question with these changes' texts in place (for the style check after). Pure. */
export function questionWith(question: McqQuestion, changes: readonly PolishChange[]): McqQuestion {
  const byTarget = new Map<string, BiText>();
  for (const c of changes) {
    const t = c.target;
    if (t?.kind === 'blockText') byTarget.set(`b:${t.blockId}`, c.after);
    else if (t?.kind === 'mcqStatement') byTarget.set(`s:${t.index}`, c.after);
    else if (t?.kind === 'mcqOption') byTarget.set(`o:${t.optionId}`, c.after);
  }
  if (!byTarget.size) return question;
  return {
    ...question,
    blocks: question.blocks.map((b) => (b.kind === 'paragraph' && byTarget.has(`b:${b.id}`) ? { ...b, text: byTarget.get(`b:${b.id}`)! } : b)),
    ...(question.statements ? { statements: question.statements.map((s, i) => byTarget.get(`s:${i}`) ?? s) } : {}),
    options: question.options.map((o) => (byTarget.has(`o:${o.id}`) ? { ...o, text: byTarget.get(`o:${o.id}`)! } : o)),
  };
}
