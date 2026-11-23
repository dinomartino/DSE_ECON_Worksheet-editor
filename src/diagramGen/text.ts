import type { BiText, InlineRun } from '@/model/types';
import type { SpecText } from './types';

/**
 * Labels as the model writes them → the editor's runs. A symbol ("S_1", "P_{c}", "E0",
 * "S₁ = MC₁") is the same in both languages with real subscripts; a phrase is a `SpecText`.
 */

const SUB_DIGITS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₜ': 't', 'ₙ': 'n', 'ₘ': 'm', 'ₛ': 's', 'ₚ': 'p', 'ₖ': 'k',
};

/** "S_1 + t" → runs: S, ₁ (subscript), " + t". A bare trailing digit after letters is a subscript too ("D1"). */
export function symbolRuns(raw: string): InlineRun[] {
  const text = raw.trim();
  const runs: InlineRun[] = [];
  const push = (value: string, subscript: boolean) => {
    if (!value) return;
    const last = runs[runs.length - 1];
    if (last && Boolean(last.vertAlign) === subscript) last.text += value;
    else runs.push(subscript ? { text: value, vertAlign: 'subscript' } : { text: value });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '_') {
      if (text[i + 1] === '{') {
        const end = text.indexOf('}', i + 2);
        const close = end === -1 ? text.length : end;
        push(text.slice(i + 2, close), true);
        i = close + 1;
      } else {
        // One subscript word: letters or digits up to the next space or operator.
        let j = i + 1;
        while (j < text.length && /[A-Za-z0-9']/.test(text[j])) j += 1;
        push(text.slice(i + 1, j), true);
        i = j;
      }
      continue;
    }
    if (SUB_DIGITS[ch]) {
      push(SUB_DIGITS[ch], true);
      i += 1;
      continue;
    }
    // "D1", "E0", "SRAS2": digits closing a token that starts with letters.
    if (/[0-9]/.test(ch) && i > 0 && /[A-Za-z]/.test(text[i - 1]) && !runs[runs.length - 1]?.vertAlign) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j += 1;
      if (j === text.length || !/[A-Za-z0-9]/.test(text[j])) {
        push(text.slice(i, j), true);
        i = j;
        continue;
      }
    }
    push(ch, false);
    i += 1;
  }
  return runs;
}

/** A symbol label, identical in both languages; undefined when blank. */
export function symbol(raw: string): BiText | undefined {
  const runs = symbolRuns(raw);
  if (!runs.length) return undefined;
  return { en: runs.map((r) => ({ ...r })), zh: runs.map((r) => ({ ...r })) };
}

/** A phrase in both languages, each side's symbols subscripted; a blank side borrows the other. */
export function phrase(text: SpecText): BiText | undefined {
  const en = (text.en ?? '').trim();
  const zh = (text.zh ?? '').trim();
  if (!en && !zh) return undefined;
  return { en: symbolRunsKeepWords(en || zh), zh: symbolRunsKeepWords(zh || en) };
}

/** A phrase's runs: only explicit `_x` / Unicode subscripts, so "Year 2021" keeps its digits. */
function symbolRunsKeepWords(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const parts = text.split(/(_\{[^}]*\}|_[A-Za-z0-9']+|[₀-₉ₐₑₒₓₜₙₘₛₚₖ]+)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('_')) runs.push({ text: part.startsWith('_{') ? part.slice(2, -1) : part.slice(1), vertAlign: 'subscript' });
    else if (SUB_DIGITS[part[0]]) runs.push({ text: [...part].map((c) => SUB_DIGITS[c] ?? c).join(''), vertAlign: 'subscript' });
    else runs.push({ text: part });
  }
  return runs;
}

/** Plain text of a label (no subscript marks): "S₁ = MC₁" → "S1 = MC1". */
export function plainOf(text: BiText | undefined, side: 'en' | 'zh' = 'en'): string {
  return (text?.[side] ?? []).map((r) => r.text).join('');
}

/**
 * The name a label stands for, without its numbering: "S₀ = MC₀" → "S", "SRAS₁" → "SRAS",
 * "PPF" → "PPF". The baseline text before any " = " or " + ", subscripts dropped.
 */
export function labelBase(text: BiText | undefined): string {
  const runs = text?.en ?? [];
  let out = '';
  for (const run of runs) {
    if (run.vertAlign === 'subscript') {
      if (out) break;
      continue;
    }
    out += run.text;
    if (/[=+−-]/.test(run.text)) break;
  }
  return out.split(/[=+−-]/)[0].trim().replace(/['’]+$/, '');
}

/** The numbering of a label ("D₁" → "1", "S'" → "'"), '' when it has none. */
export function labelIndex(text: BiText | undefined): string {
  const runs = text?.en ?? [];
  const firstSub = runs.find((r) => r.vertAlign === 'subscript');
  if (firstSub) return firstSub.text;
  const flat = plainOf(text);
  const prime = flat.match(/['’]+/);
  return prime ? prime[0] : '';
}
