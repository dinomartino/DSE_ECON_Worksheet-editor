/**
 * Chinese term matching: a character trie over every folded variant and its 的-less alias,
 * matched leftmost-longest on folded text (需求價格彈性 wins over 需求). Offsets here are
 * folded; `foldZh`'s map turns them back into the teacher's own string.
 */
import type { GlossaryEntry } from './types';
import { foldZh } from './fold';

interface ZhNode {
  next: Map<string, ZhNode>;
  entryIds: number[];
}

export interface FoldedHit {
  entryIds: number[];
  /** Folded offsets. */
  from: number;
  to: number;
}

/** Every folded form of a variant: itself, and without a 的 between two CJK characters. */
export function variantForms(variant: string): string[] {
  const folded = foldZh(variant).folded;
  const bare = foldZh(variant, { dropDe: true }).folded;
  return bare === folded ? [folded] : [folded, bare];
}

export interface ZhMatcher {
  /** Leftmost-longest over already-folded text. */
  matchFolded(folded: string): FoldedHit[];
  /** Every variant occurrence, overlaps included, over already-folded text. */
  matchFoldedAll(folded: string): FoldedHit[];
}

export function buildZhMatcher(entries: readonly GlossaryEntry[]): ZhMatcher {
  const root: ZhNode = { next: new Map(), entryIds: [] };
  for (const entry of entries) {
    for (const sense of entry.senses) {
      for (const variant of sense.ranks.flat()) {
        for (const form of variantForms(variant)) {
          let node = root;
          // Code units, as the lookup below reads them.
          for (let k = 0; k < form.length; k++) {
            let child = node.next.get(form[k]);
            if (!child) node.next.set(form[k], (child = { next: new Map(), entryIds: [] }));
            node = child;
          }
          if (!node.entryIds.includes(entry.id)) node.entryIds.push(entry.id);
        }
      }
    }
  }

  /** Every variant starting at `start`, shortest first. */
  function* from(text: string, start: number): Generator<FoldedHit> {
    let node: ZhNode | undefined = root;
    for (let j = start; j < text.length; j++) {
      node = node.next.get(text[j]);
      if (!node) return;
      if (node.entryIds.length) yield { entryIds: node.entryIds, from: start, to: j + 1 };
    }
  }

  return {
    matchFolded(text) {
      const hits: FoldedHit[] = [];
      let i = 0;
      while (i < text.length) {
        let best: FoldedHit | undefined;
        for (const h of from(text, i)) best = h;
        if (best) {
          hits.push(best);
          i = best.to;
        } else i++;
      }
      return hits;
    },
    matchFoldedAll(text) {
      const hits: FoldedHit[] = [];
      for (let i = 0; i < text.length; i++) for (const h of from(text, i)) hits.push(h);
      return hits;
    },
  };
}
