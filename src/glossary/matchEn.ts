/**
 * English term matching: a token trie over every entry's surface forms, with spelling and
 * plural folded on both sides. Leftmost-longest chooses what to pin; all-overlaps feeds the
 * check, which needs nested sub-terms (demand inside price elasticity of demand).
 */
import type { GlossaryEntry, GlossaryMatchEn } from './types';
import { EXACT_KEYS } from './overrides';
import { foldEnToken, isTermGap, singular, tokenizeEn, type EnToken } from './fold';

interface TrieEnd {
  entryId: number;
  /** The form that matched, as the glossary spells it ("real GDP"). */
  form: string;
  viaAbbreviation: boolean;
  /** A one-token proper name (Octopus, Keynes): the text must be capitalised too. */
  needsCapital: boolean;
}
interface TrieNode {
  next: Map<string, TrieNode>;
  ends: TrieEnd[];
}

export interface EnHit extends GlossaryMatchEn {
  form: string;
}

const isAbbreviation = (token: string) => /^[A-Z]{2,}$/.test(token);

/** The trie key of a token in a glossary form. */
function keyFor(token: string, single: boolean): string {
  if (isAbbreviation(token)) return `ABBR:${token}`;
  if (single && EXACT_KEYS.has(token.toLowerCase())) return `EXACT:${token.toLowerCase()}`;
  return singular(foldEnToken(token));
}

/** Every trie key a token in the text may stand for. */
function candidates(token: string): string[] {
  const out = [`EXACT:${token.toLowerCase()}`];
  if (/^[A-Z]{2,}s?$/.test(token)) out.push(`ABBR:${token.replace(/s$/, '')}`);
  const folded = foldEnToken(token);
  out.push(folded, singular(folded));
  return out;
}

export interface EnMatcher {
  matchEn(text: string): EnHit[];
  matchEnAll(text: string): EnHit[];
}

export function buildEnMatcher(entries: readonly GlossaryEntry[]): EnMatcher {
  const root: TrieNode = { next: new Map(), ends: [] };
  for (const entry of entries) {
    const forms = new Set(entry.enForms);
    // co-operative also as cooperative; spaced keys already accept a hyphen in the text.
    for (const f of entry.enForms) if (/[a-z]-[a-z]/i.test(f)) forms.add(f.replace(/([a-z])-([a-z])/gi, '$1$2'));
    for (const form of forms) {
      const tokens = tokenizeEn(form).map((t) => t.text);
      if (!tokens.length) continue;
      let node = root;
      for (const token of tokens) {
        const key = keyFor(token, tokens.length === 1);
        let child = node.next.get(key);
        if (!child) node.next.set(key, (child = { next: new Map(), ends: [] }));
        node = child;
      }
      if (node.ends.some((e) => e.entryId === entry.id)) continue;
      node.ends.push({
        entryId: entry.id,
        form,
        viaAbbreviation: !!entry.abbreviation && tokens.includes(entry.abbreviation),
        needsCapital: tokens.length === 1 && /^[A-Z][a-z]/.test(tokens[0]),
      });
    }
  }

  /** Every term starting at token `i`: `[lastTokenIndex, end]` pairs. */
  function walk(text: string, tokens: EnToken[], i: number, found: (j: number, end: TrieEnd) => void) {
    const step = (node: TrieNode, j: number) => {
      if (j >= tokens.length) return;
      if (j > i && !isTermGap(text.slice(tokens[j - 1].end, tokens[j].start))) return;
      const seen = new Set<TrieNode>();
      for (const key of candidates(tokens[j].text)) {
        const child = node.next.get(key);
        if (!child || seen.has(child)) continue;
        seen.add(child);
        for (const end of child.ends) {
          if (end.needsCapital && !/^[A-Z]/.test(tokens[j].text)) continue;
          found(j, end);
        }
        step(child, j + 1);
      }
    };
    step(root, i);
  }

  const hit = (tokens: EnToken[], i: number, j: number, end: TrieEnd): EnHit => ({
    entryId: end.entryId,
    start: tokens[i].start,
    end: tokens[j].end,
    viaAbbreviation: end.viaAbbreviation,
    form: end.form,
  });

  return {
    matchEn(text) {
      const tokens = tokenizeEn(text);
      const hits: EnHit[] = [];
      let i = 0;
      while (i < tokens.length) {
        let best = -1;
        let ends: TrieEnd[] = [];
        walk(text, tokens, i, (j, end) => {
          if (j > best) [best, ends] = [j, [end]];
          else if (j === best && !ends.some((e) => e.entryId === end.entryId)) ends.push(end);
        });
        if (best < 0) {
          i++;
          continue;
        }
        for (const end of ends) hits.push(hit(tokens, i, best, end));
        i = best + 1;
      }
      return hits;
    },
    matchEnAll(text) {
      const tokens = tokenizeEn(text);
      const hits: EnHit[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < tokens.length; i++) {
        walk(text, tokens, i, (j, end) => {
          const id = `${end.entryId}:${i}:${j}`;
          if (seen.has(id)) return;
          seen.add(id);
          hits.push(hit(tokens, i, j, end));
        });
      }
      return hits;
    },
  };
}
