import type { Glossary } from '@/glossary/types';
import { parseDuration } from '@/model/paperHealth';
import { plain } from '@/model/text';
import type { SlotKind } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import { consumedSymbols } from './conventions';
import { SIMPLIFIED_PAIRS, simplifiedChars } from './simplified';
import type { Issue, TranslationJob } from './types';
import { type DecodeError, digitGroups, EMPHASIS_WORDS, foldWidth, scriptsOf, SHORT_KINDS, type WireCodec } from './wire';

/**
 * Every deterministic check on one decoded item. A `fail` is never applied; a `warn`
 * unticks the row or sends it to the repair pass. `fix` is the note the repair pass sends.
 */
export type CheckedIssue = Issue & { fix?: string };
export type Decoded = { ok: true; runs: RichText } | { ok: false; error: DecodeError };

const HAN = /[㐀-鿿豈-﫿]/;
const LABEL = /^\s*(?:\(\s*(?:[a-hA-H]|[ivx]{1,4}|\d{1,2})\s*\)|[A-H]\s*[.、)]|\d{1,3}\s*[.、)](?!\d)|第\s*\d+\s*題)/;
const MARKS = /[(（]\s*(?:共\s*)?\d+\s*(?:分|marks?)\s*[)）]/i;
const ANSWER = /^\s*(?:答案|Answer)\s*[:：]/i;
const SOURCE = /^\s*(?:出處|Source)\s*[:：]/i;
const SCHEME_POINT = [/[(（]\s*\d+(?:\s*[–-]\s*\d+)?\s*[)）]\s*$/, /max\s*[:：]\s*\d+/i, /最高\s*\d+\s*分/, /\d+\s*@/];
const SCHEME_LEVEL = [/^\s*Level\s*\d+\s*[:：]/i, /^\s*第\s*\d+\s*級/];
/** mcq's combination shape: "(1) and (2) only", "1, 2 and 3". */
const COMBINATION = /^\s*([(（]\s*(\d+|[ivx]+)\s*[)）]|\d+\s*(,|、|&|and|及|和|only))/i;
const COUNT_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>([
  'instructions', 'heading', 'sectionHeading', 'partHeader', 'coverLine', 'coverField', 'bandText',
]);
const ZH_COUNT = ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];
const ZH_EMPHASIS = ['兩個', '一項', '一個', '兩項', '不', '均須', '無須', '最佳'];

const blankTokens = (wire: string) => (wire.match(/<\s*blank\s*\/?\s*>/gi) ?? []).length;
const squash = (text: string) => foldWidth(text).replace(/\s+/g, '');
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Maximal stretches with `attr`, ignoring whitespace-only ones (a blank is not emphasis). */
function spans(runs: RichText, attr: 'bold' | 'italic' | 'underline'): number {
  let count = 0;
  let open = false;
  for (const run of runs) {
    if (run[attr] !== true) open = false;
    else if (run.text.trim()) {
      if (!open) count += 1;
      open = true;
    }
  }
  return count;
}

/** Digit groups the output may leave out: a kept duration, or a small count written as a
 *  Chinese numeral in instructions and furniture ("Answer any 2" → 任答兩題). */
function satisfiedNumbers(kind: SlotKind, source: string, output: string): Set<string> {
  const out = new Set<string>();
  const minutes = parseDuration(source);
  if (minutes !== undefined && minutes === parseDuration(output)) {
    for (const m of source.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|minutes?|mins?|小時|分鐘|分)/gi)) out.add(m[1]);
  }
  if (COUNT_KINDS.has(kind)) {
    for (let n = 1; n <= 10; n += 1) if (output.includes(ZH_COUNT[n])) out.add(String(n));
  }
  return out;
}

function symbolKept(token: string, source: string, output: string, glossary: Glossary | null | undefined): boolean {
  if (new RegExp(`(?<![A-Za-z])${escapeRe(token)}(?![A-Za-z])`).test(output)) return true;
  if (!glossary) return false;
  const folded = squash(output);
  return glossary
    .matchEn(source)
    .filter((hit) => hit.viaAbbreviation && source.slice(hit.start, hit.end).startsWith(token))
    .some((hit) =>
      glossary.entries
        .find((entry) => entry.id === hit.entryId)
        ?.senses.some((sense) => sense.ranks.flat().some((variant) => folded.includes(squash(variant)))),
    );
}

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
}

function derived(job: TranslationJob, source: string, output: string): string | null {
  const s = foldWidth(source);
  const o = foldWidth(output);
  const label = o.match(LABEL);
  if (label && !squash(s).includes(squash(label[0]))) return label[0].trim();
  // Each group names one derived thing in either language; the source having it allows it.
  const groups: RegExp[][] = [[MARKS], [ANSWER]];
  if (job.kind === 'provenance') groups.push([SOURCE]);
  if (job.kind === 'schemePoint') groups.push(SCHEME_POINT);
  if (job.kind === 'schemeLevel') groups.push(SCHEME_LEVEL);
  for (const group of groups) {
    if (group.some((pattern) => pattern.test(s))) continue;
    const hit = group.map((pattern) => o.match(pattern)).find(Boolean);
    if (hit) return hit[0].trim();
  }
  return null;
}

/** `output` is the model's wire text; `decoded` its decode against the job's codec. */
export function validateItem(
  job: TranslationJob,
  codec: WireCodec,
  output: string,
  decoded: Decoded,
  glossary?: Glossary | null,
): CheckedIssue[] {
  const toZh = job.direction === 'toZh';
  if (!decoded.ok) {
    const { error } = decoded;
    return [error.code === 'unbalanced'
      ? { code: 'unbalanced', severity: 'fail', message: 'Formatting markers broken', fix: 'Close every marker you open, e.g. <b>…</b>.' }
      : { code: 'unknownStyle', severity: 'fail', message: 'Formatting markers broken', fix: `There is no <s${error.n}>; use only the markers in the text.` }];
  }
  const issues: CheckedIssue[] = [];
  const add = (issue: CheckedIssue) => issues.push(issue);
  const runs = decoded.runs;
  const source = plain(job.source);
  const out = plain(runs);

  if (!out.trim()) {
    return [{ code: 'empty', severity: 'fail', message: 'Came back empty', fix: 'Translate this item; it came back empty.' }];
  }
  const latinWord = /[a-z]{3,}/.test(source);
  if ((toZh && latinWord && !HAN.test(out)) || ((latinWord || HAN.test(source)) && squash(out) === squash(source))) {
    add({ code: 'untranslated', severity: 'fail', message: 'Not translated', fix: 'Translate this item; it came back untranslated.' });
  }
  const blanks = blankTokens(output);
  if (blanks !== codec.blanks.length) {
    add({ code: 'blanks', severity: 'fail', message: 'Answer blank lost',
      fix: `Keep exactly ${codec.blanks.length} <blank/> marker${codec.blanks.length === 1 ? '' : 's'}; you returned ${blanks}.` });
  }
  const breaks = (out.match(/\n/g) ?? []).length - codec.lead - codec.trail;
  if (SHORT_KINDS.has(job.kind) ? breaks > codec.breaks : breaks !== codec.breaks) {
    add({ code: 'breaks', severity: SHORT_KINDS.has(job.kind) ? 'warn' : 'fail', message: 'Line breaks differ',
      fix: `Keep exactly ${codec.breaks} <br/> marker${codec.breaks === 1 ? '' : 's'}; you returned ${breaks}.` });
  }
  if (!sameMultiset(scriptsOf(runs), codec.scripts)) {
    const first = codec.scripts[0]?.split(':');
    add({ code: 'scripts', severity: 'fail', message: 'Subscript lost',
      fix: first ? `Copy <${first[0]}>${first.slice(1).join(':')}</${first[0]}> exactly.` : 'Add no <sub> or <sup> the text lacks.' });
  }
  const leak = derived(job, source, out);
  if (leak) {
    add({ code: 'derived', severity: 'fail', message: `Remove “${leak}”`, fix: `Remove “${leak}” — the app prints numbers, labels and marks itself.` });
  }
  if (job.kind === 'wording') {
    const digits = new Set(source.match(/\d/g) ?? []);
    if ((foldWidth(out).match(/\d/g) ?? []).some((d) => !digits.has(d))) {
      add({ code: 'wordingDigits', severity: 'fail', message: 'Digits added', fix: 'Write no digits: the app fills in the number.' });
    }
  }
  if (toZh) {
    const simplified = simplifiedChars(out);
    if (simplified.length) {
      add({ code: 'simplified', severity: 'warn', message: 'Simplified characters',
        fix: `Use Traditional Chinese (Hong Kong) characters: ${simplified.map((ch) => `${SIMPLIFIED_PAIRS.get(ch)}, not ${ch}`).join('; ')}.` });
    }
  } else if (HAN.test(out.replace(/“[^”]*”|"[^"]*"|「[^」]*」|\([^)]*\)|（[^）]*）/g, ''))) {
    add({ code: 'latinInZh', severity: 'warn', message: 'Chinese left in English' });
  }
  checkEmphasis(job, codec, output, runs, add);
  checkFacts(job, codec, source, out, glossary, add);
  return issues;
}

type Add = (issue: CheckedIssue) => void;

function checkEmphasis(job: TranslationJob, codec: WireCodec, output: string, runs: RichText, add: Add): void {
  const bold = spans(runs, 'bold');
  if (job.direction === 'toZh') {
    const expected = codec.emphasis.bold + codec.emphasis.capitals;
    const lost = (a: 'italic' | 'underline') => (codec.emphasis[a] > 0) !== (spans(runs, a) > 0);
    if ((expected > 0 && bold === 0) || bold > expected + 1 || lost('italic') || lost('underline')) {
      const capital = plain(job.source).match(/\b[A-Z]{2,}\b/g)?.find((w) => EMPHASIS_WORDS.has(w));
      add({ code: 'emphasis', severity: 'warn', message: 'Bold not kept',
        fix: capital ? `Bold the Chinese for “${capital}”.` : 'Keep the same bold, italic and underline as the source.' });
    }
  } else {
    const emphasised = job.source.some((run) => run.bold && ZH_EMPHASIS.some((word) => run.text.includes(word)));
    const capitals = (plain(runs).match(/\b[A-Z]{2,}\b/g) ?? []).some((w) => EMPHASIS_WORDS.has(w));
    if (emphasised && !capitals) {
      add({ code: 'emphasis', severity: 'warn', message: 'Bold not kept', fix: 'Write the bold counting word in CAPITALS: <b>TWO</b>.' });
    }
  }
  const unused = codec.styles.map((_, i) => i + 1).filter((n) => !new RegExp(`<\\s*s${n}\\s*>`, 'i').test(output));
  if (unused.length) add({ code: 'styles', severity: 'warn', message: 'Formatting dropped', fix: `Keep <s${unused[0]}>…</s${unused[0]}>.` });
}

function checkFacts(
  job: TranslationJob,
  codec: WireCodec,
  source: string,
  out: string,
  glossary: Glossary | null | undefined,
  add: Add,
): void {
  const toZh = job.direction === 'toZh';
  const have = digitGroups(out);
  const satisfied = satisfiedNumbers(job.kind, source, out);
  const missing = codec.numbers.filter((g) => !satisfied.has(g) && !have.includes(g));
  if (missing.length) add({ code: 'numbers', severity: 'warn', message: 'Numbers differ', fix: `Keep the number ${missing[0]}.` });

  if (toZh) {
    const consumed = consumedSymbols(source, out);
    const lost = codec.latinSymbols.filter((t) => !consumed.has(t) && !symbolKept(t, source, out, glossary));
    if (lost.length) {
      add({ code: 'symbols', severity: 'warn', message: `Symbol ${lost[0]} missing`, fix: `Keep the symbol ${lost[0]} in Latin letters.` });
    }
  }
  if (['coverLine', 'bandText', 'heading'].includes(job.kind)) {
    const minutes = parseDuration(source);
    if (minutes !== undefined && minutes !== parseDuration(out)) {
      add({ code: 'duration', severity: 'warn', message: 'Time not kept', fix: `Keep the time: ${minutes} minutes.` });
    }
  }
  if ((job.kind === 'sectionHeading' || job.kind === 'heading') && /[:：]/.test(source) && !/[:：]/.test(out)) {
    add({ code: 'colon', severity: 'warn', message: 'Heading colon lost', fix: toZh ? 'Keep the colon as “：”.' : 'Keep the colon.' });
  }
  if (job.kind === 'option' && COMBINATION.test(source) && !/[(（]\s*(?:\d+|[ivx]+)\s*[)）]|只有|only/i.test(out)) {
    add({ code: 'combination', severity: 'warn', message: 'Combination wording differs', fix: toZh ? 'Write it as “只有(1)及(2)”.' : 'Write it as “(1) and (2) only”.' });
  }
  const from = source.replace(/\s+/g, '').length;
  if (from >= 4) {
    const ratio = out.replace(/\s+/g, '').length / from;
    if (toZh ? ratio < 0.15 || ratio > 1.3 : ratio < 1.2 || ratio > 7) {
      add({ code: 'length', severity: 'warn', message: 'Check length' });
    }
  }
}
