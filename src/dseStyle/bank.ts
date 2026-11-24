import type { StyleItem, StyleSide } from './check';

/**
 * A question of the past-paper bank's topic files (editor schema: rich-text runs per side,
 * paragraph/table/image blocks) as a `StyleItem`: bold as `**…**`, table rows as "a | b",
 * pictures left out. Used to run the style check over real HKDSE questions (`check.test.ts`)
 * and the shape an editor question needs for k-0549.
 */

interface Run {
  text?: string;
  bold?: boolean;
}
type Bi = Partial<Record<StyleSide, readonly Run[]>>;
interface Block {
  kind: string;
  text?: Bi;
  rows?: readonly { cells: readonly { text?: Bi }[] }[];
}
export interface BankQuestion {
  blocks?: readonly Block[];
  statements?: readonly Bi[];
  options?: readonly { text?: Bi }[];
}

const runsText = (runs: readonly Run[] | undefined): string =>
  (runs ?? []).map((r) => (r.bold && r.text?.trim() ? `**${r.text}**` : (r.text ?? ''))).join('');

const bi = (t: Bi | undefined) => ({ en: runsText(t?.en), zh: runsText(t?.zh) });

export function styleItemOf(q: BankQuestion): StyleItem {
  const stem = (side: StyleSide) =>
    (q.blocks ?? [])
      .flatMap((b) => {
        if (b.kind === 'paragraph') return [runsText(b.text?.[side])];
        if (b.kind === 'table') return (b.rows ?? []).map((row) => row.cells.map((c) => runsText(c.text?.[side]).replace(/\|/g, '/')).join(' | '));
        return [];
      })
      .join('\n');
  return {
    stem: { en: stem('en'), zh: stem('zh') },
    statements: (q.statements ?? []).map(bi),
    options: (q.options ?? []).map((o) => bi(o.text)),
  };
}
