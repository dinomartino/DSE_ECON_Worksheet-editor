import { normalizeRuns } from '@/model/text';
import type { RichText } from '@/model/types';
import { SIMPLIFIED_PAIRS } from './simplified';
import { isCjk } from './wire';

/**
 * Deterministic Hong Kong clean-up after decoding. Never inside a sub/superscript or a
 * blank; run boundaries are kept (each character stays in its run).
 */

interface Ch { ch: string; run: number; fixed: boolean }
export interface Normalized { runs: RichText; normalized: boolean }

function explode(runs: RichText): Ch[] {
  const out: Ch[] = [];
  runs.forEach((run, index) => {
    for (const ch of run.text) out.push({ ch, run: index, fixed: Boolean(run.vertAlign) });
  });
  // Blanks: ≥ 4 consecutive underlined spaces.
  let start = -1;
  for (let i = 0; i <= out.length; i += 1) {
    const blankish = i < out.length && out[i].ch === ' ' && runs[out[i].run].underline === true;
    if (blankish && start < 0) start = i;
    if (!blankish && start >= 0) {
      if (i - start >= 4) for (let j = start; j < i; j += 1) out[j].fixed = true;
      start = -1;
    }
  }
  return out;
}

function implode(chars: Ch[], runs: RichText, before: RichText): Normalized {
  const texts = runs.map(() => '');
  for (const c of chars) texts[c.run] += c.ch;
  const next = normalizeRuns(runs.map((run, index) => ({ ...run, text: texts[index] })));
  const changed = texts.join('') !== before.map((r) => r.text).join('');
  return { runs: changed ? next : before, normalized: changed };
}

const FULL: Record<string, string> = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' };
const HALF: Record<string, string> = { '，': ',', '。': '.', '：': ':', '；': ';', '？': '?', '！': '!', '、': ',' };
const LATIN_EDGE = /[A-Za-z0-9$%]/;

/** Index of the nearest non-space neighbour, skipping ASCII spaces. */
function neighbour(chars: Ch[], index: number, step: 1 | -1): Ch | undefined {
  let i = index + step;
  while (i >= 0 && i < chars.length && chars[i].ch === ' ') i += step;
  return chars[i];
}

export function normalizeZh(runs: RichText): Normalized {
  let chars = explode(runs);
  const text = () => chars.map((c) => c.ch).join('');
  const set = (i: number, ch: string) => {
    if (!chars[i].fixed) chars[i] = { ...chars[i], ch };
  };

  chars.forEach((c, i) => {
    if (c.fixed) return;
    const prev = chars[i - 1];
    const next = chars[i + 1];
    const cjkPrev = prev !== undefined && isCjk(prev.ch);
    const near = [neighbour(chars, i, -1), neighbour(chars, i, 1)];
    if (FULL[c.ch] && near.some((x) => x !== undefined && isCjk(x.ch))) set(i, FULL[c.ch]);
    else if (c.ch === '.' && cjkPrev && (next === undefined || /\s/.test(next.ch) || isCjk(next.ch))) set(i, '。');
  });

  // Parentheses holding Chinese go full-width; around a symbol or unit they stay: 價格 ($).
  const stack: number[] = [];
  chars.forEach((c, i) => {
    if (c.fixed) return;
    if (c.ch === '(' || c.ch === '（') stack.push(i);
    else if ((c.ch === ')' || c.ch === '）') && stack.length) {
      const open = stack.pop()!;
      if (chars.slice(open + 1, i).some((x) => isCjk(x.ch) && !/[，。：；？！]/.test(x.ch))) {
        set(open, '（');
        set(i, '）');
      }
    }
  });

  // Straight or curly double quotes around Chinese become 「」.
  const quoted = /["“]([^"“”]*)["”]/g;
  for (const match of text().matchAll(quoted)) {
    if (![...match[1]].some(isCjk)) continue;
    set(match.index!, '「');
    set(match.index! + match[0].length - 1, '」');
  }

  for (const [from, to] of [['甚麼', '什麼'], ['住户', '住戶']]) {
    for (const match of text().matchAll(new RegExp(from, 'g'))) [...to].forEach((ch, k) => set(match.index! + k, ch));
  }

  // One spacing rule: no typed space between a CJK character and a Latin letter, a digit
  // or another CJK character.
  chars = chars.filter((c, i) => {
    if (c.ch !== ' ' || c.fixed) return true;
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (!prev || !next || prev.ch === ' ' || next.ch === ' ') return true;
    const cjk = [isCjk(prev.ch), isCjk(next.ch)];
    return !((cjk[0] && (cjk[1] || LATIN_EDGE.test(next.ch))) || (cjk[1] && LATIN_EDGE.test(prev.ch)));
  });
  return implode(chars, runs, runs);
}

export function normalizeEn(runs: RichText): Normalized {
  let chars = explode(runs);
  const out: Ch[] = [];
  chars.forEach((c, i) => {
    if (c.fixed) return void out.push(c);
    const half = HALF[c.ch];
    if (half) {
      out.push({ ...c, ch: half });
      const next = chars[i + 1];
      if (next && next.ch !== ' ' && !HALF[next.ch]) out.push({ ...c, ch: ' ' });
      return;
    }
    const mapped =
      c.ch === '「' ? '“' : c.ch === '」' ? '”' : c.ch === '『' ? '‘' : c.ch === '』' ? '’'
        : c.ch === '（' ? '(' : c.ch === '）' ? ')'
          : /[０-９Ａ-Ｚａ-ｚ]/.test(c.ch) ? String.fromCharCode(c.ch.charCodeAt(0) - 0xfee0) : c.ch;
    out.push({ ...c, ch: mapped });
  });
  chars = out.filter((c, i) => !(c.ch === ' ' && !c.fixed && out[i - 1]?.ch === ' ' && !out[i - 1].fixed));
  return implode(chars, runs, runs);
}

/** After the final pass: remaining Simplified characters to their Hong Kong forms. */
export function traditionalize(runs: RichText): { runs: RichText; converted: Array<{ from: string; to: string }> } {
  const converted: Array<{ from: string; to: string }> = [];
  const next = runs.map((run) => {
    const text = [...run.text].map((ch) => {
      const to = SIMPLIFIED_PAIRS.get(ch);
      if (to && !converted.some((c) => c.from === ch)) converted.push({ from: ch, to });
      return to ?? ch;
    }).join('');
    return text === run.text ? run : { ...run, text };
  });
  return { runs: converted.length ? next : runs, converted };
}
