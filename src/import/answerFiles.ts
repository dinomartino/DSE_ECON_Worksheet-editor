/**
 * Several files chosen at once: which hold questions, which answers, and which belong
 * together. Pure; the UI shows the guesses and lets the teacher relink.
 */
import { readAnswerSheet, type AnswerEntry } from './answerSheet';
import type { ReadPaste } from './index';
import { blocksText } from './walk';
import { pasteKind } from './scan';
import { solve } from './solve';
import type { OutQuestion, SourceLine } from './types';

export type FileRole = 'questions' | 'answers' | 'both';

export type ClassifyReason =
  | 'nameSaysAnswers' // ans, answer(s), key, MS, marking scheme, soln, 答案, 評卷…
  | 'nameSaysNothing' // no answer word in the name
  | 'keyEntries' // "1. B 2. C" grids, key tables
  | 'schemeEntries' // labelled answers with a mark per point
  | 'mcQuestions' // stems with A–D options
  | 'writtenQuestions' // stems that ask ("Explain…", 解釋…, a question mark)
  | 'answersInPaper' // the paper's MC carry answers (a key at the end, bold, "Ans:")
  | 'noText'; // empty or a scan: only the name decides

export interface FileClass {
  role: FileRole;
  /** 0.5–0.99: how far the evidence leans. */
  confidence: number;
  reasons: ClassifyReason[];
}

const NAME_SEPARATORS = /[_\-.()[\]{}【】（）「」,，+&]+/g;
const ANSWER_WORDS_EN = /\b(ans|answers?|keys?|ms|marking|schemes?|soln|solutions?|suggested)\b/gi;
const ANSWER_WORDS_ZH = /(參考答案|建議答案|答案|評卷參考|評分準則|評分參考|評卷|評分|題解|解答)/g;

const baseName = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
const spaced = (name: string) => baseName(name).replace(NAME_SEPARATORS, ' ');

export function nameSaysAnswers(name: string): boolean {
  const s = spaced(name);
  return new RegExp(ANSWER_WORDS_EN.source, 'i').test(s) || new RegExp(ANSWER_WORDS_ZH.source).test(s);
}

const ASKS =
  /\?|？|^(explain|describe|discuss|state|identify|calculate|compare|suggest|why|what|how|with the aid|draw|illustrate|define|give|name|list|evaluate|analy[sz]e|comment|do you agree|to what extent)\b|解釋|試|為甚麼|為什麼|何謂|計算|列出|指出|說明|討論|比較|你是否同意|繪圖|以圖/i;

function asks(q: OutQuestion): boolean {
  const texts = [blocksText(q.stem), ...q.parts.flatMap((p) => [blocksText(p.blocks), ...p.subParts.map((s) => blocksText(s.blocks))])];
  return texts.some((t) => t.split(/\n|(?<=[.。])\s/).some((s) => ASKS.test(s.trim())));
}

/** Whether a read file holds questions, answers or both, from its content and name. */
export function classifyImport(read: ReadPaste, fileName: string): FileClass {
  const reasons: ClassifyReason[] = [];
  const named = nameSaysAnswers(fileName);
  reasons.push(named ? 'nameSaysAnswers' : 'nameSaysNothing');
  const name = named ? 0.6 : -0.15;
  if (pasteKind(read.lines, read.source) !== 'ok') {
    reasons.push('noText');
    return finish(name, reasons);
  }

  const { outline } = solve(read.lines, { source: read.source });
  const mc = outline.questions.filter((q) => q.kind === 'mc' && q.options.length >= 3 && q.options.some((o) => o.runs.length));
  const answered = mc.filter((q) => q.answer);
  const written = outline.questions.filter((q) => q.kind === 'written' && asks(q));
  const sheet = readAnswerSheet(read);
  const keys = sheet.entries.filter((e) => e.letter !== undefined).length;
  const schemes = sheet.entries.filter((e) => e.letter === undefined && (e.each !== undefined || e.max !== undefined || (e.points ?? []).filter((p) => p.marks !== undefined).length >= 2)).length;

  if (mc.length) reasons.push('mcQuestions');
  if (written.length) reasons.push('writtenQuestions');
  if (keys) reasons.push('keyEntries');
  if (schemes) reasons.push('schemeEntries');
  if (mc.length >= 2 && answered.length >= Math.max(2, 0.6 * mc.length)) {
    reasons.push('answersInPaper');
    return { role: 'both', confidence: Math.min(0.99, 0.6 + 0.4 * (answered.length / mc.length)), reasons };
  }
  const q = 2 * mc.length + 2 * written.length;
  const a = keys + 2 * schemes;
  if (!q && !a) {
    reasons.push('noText');
    return finish(name, reasons);
  }
  if (mc.length + written.length >= 1 && splitAnswers(read).answers) {
    reasons.push('answersInPaper');
    return { role: 'both', confidence: 0.75, reasons };
  }
  return finish(0.7 * ((a - q) / (a + q)) + name, reasons);
}

// ---- a paper with its answers after it ----

const BOUNDARY_TITLE =
  /^(answers?|answer\s+key|marking\s+schemes?|mark\s+scheme|suggested\s+answers?|solutions?|答案|參考答案|建議答案|評卷參考|評分準則|評分參考)\s*[:：]?$/i;
const BOUNDARY_END = /^[-–—\s]*end\s+of\s+(the\s+)?(paper|test|exam|examination|quiz|worksheet)\b|^[-–—\s]*(全卷完|試卷完)/i;

const strong = (e: AnswerEntry) => e.letter !== undefined || (e.points ?? []).some((p) => p.marks !== undefined) || e.each !== undefined;

/**
 * A paper whose answers follow it ("-- End of Paper --", "Answers:", "Marking scheme"),
 * cut in two: the questions to analyse, and the answers to read with `readAnswerSheet`
 * (lines renumbered from 0; `offset` is where they started). No cut, no `answers`.
 */
export function splitAnswers(read: ReadPaste): { questions: ReadPaste; answers?: ReadPaste & { offset: number } } {
  const { lines } = read;
  const renumber = (part: readonly SourceLine[]) => part.map((l, k) => ({ ...l, i: k }));
  for (const line of lines) {
    if (line.labelInfo || !(BOUNDARY_TITLE.test(line.text.trim()) || BOUNDARY_END.test(line.text.trim()))) continue;
    const before = lines.slice(0, line.i);
    if (!solve(before, { source: read.source }).outline.questions.some((q) => q.number !== undefined)) continue;
    const after: ReadPaste = { lines: renumber(lines.slice(line.i)), source: read.source };
    // Answers have no A–D options: a cut with MC after it is a heading out of place.
    if (solve(after.lines, { source: read.source }).outline.questions.filter((q) => q.kind === 'mc' && q.options.length >= 3).length > 1) continue;
    const entries = readAnswerSheet(after).entries;
    const sure = entries.filter(strong).length;
    if (sure >= 3 && sure >= entries.length / 2) return { questions: { lines: before, source: read.source }, answers: { ...after, offset: line.i } };
  }
  return { questions: read };
}

function finish(score: number, reasons: ClassifyReason[]): FileClass {
  const s = Math.max(-1, Math.min(1, score));
  return { role: s > 0 ? 'answers' : 'questions', confidence: Math.round(Math.min(0.99, 0.5 + Math.abs(s) / 2) * 100) / 100, reasons };
}

// ---- pairing ----

const ROMAN_NUMBER: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' };
const CN_NUMBER: Record<string, string> = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };

/**
 * The name as tokens, answer words and separators gone, case folded: words, numbers and
 * single Han characters. "2021-22" and "2021-2022" are one token; "P1", "Paper I" and
 * 卷一 all give "paper" "1".
 */
export function nameTokens(name: string): string[] {
  const s = spaced(name)
    .replace(/\b(19|20)(\d{2})\s*(?:[-–/]|\s)\s*(?:19|20)?(\d{2})\b/g, (_, c, a, b) => ` y${c}${a}y${b} `)
    .replace(ANSWER_WORDS_ZH, ' ')
    .replace(ANSWER_WORDS_EN, ' ')
    .toLowerCase();
  return (s.match(/[a-z0-9]+|[㐀-鿿]/g) ?? []).flatMap((t) => {
    if (CN_NUMBER[t]) return [CN_NUMBER[t]];
    if (ROMAN_NUMBER[t]) return [ROMAN_NUMBER[t]];
    const p = /^p(?:aper)?(\d)$/.exec(t);
    return p ? ['paper', p[1]] : t === '卷' ? ['paper'] : [t];
  });
}

/** Tokens that number a paper or a test ("1", "s5", "y2021y22"): two names must not disagree on them. */
const numbers = (tokens: readonly string[]) => tokens.filter((t) => /\d/.test(t));

/**
 * 0–1: how alike two names are once answer words are gone. `series`: the answer name
 * leaves out a number the question name has ("S6 Mock marking scheme" for "S6 Mock
 * Paper I" and "Paper II"), so it may answer several papers.
 */
export function nameSimilarity(questions: string, answers: string): { score: number; series: boolean } {
  const tq = nameTokens(questions);
  const ta = nameTokens(answers);
  if (!tq.length || !ta.length) return { score: 0, series: false };
  const nq = numbers(tq);
  const na = numbers(ta);
  const same = nq.length === na.length && na.every((t) => nq.includes(t));
  const subset = na.length < nq.length && na.every((t) => nq.includes(t));
  if (!same && !subset) return { score: 0, series: false };
  const left = [...tq];
  let shared = 0;
  for (const t of ta) {
    const k = left.indexOf(t);
    if (k >= 0) {
      shared++;
      left.splice(k, 1);
    }
  }
  // A series file leaves out the paper's number and the word for it; score it on what it has.
  const score = subset ? shared / ta.length : (2 * shared) / (tq.length + ta.length);
  return { score: subset ? score * 0.9 : score, series: subset };
}

const PAIR_AT = 0.6;

/**
 * Question files with the answer file that goes with each, by name. Each answer file
 * goes first to its best paper; a paper left without one then shares the best answer file
 * that fits it (the .docx and .pdf of one paper; "S6 Mock marking scheme" for Paper I and
 * Paper II). A `both` file pairs with itself; ties go to the answer file nearest after the
 * question file in the list (folder order). One answer file named only "Answers" pairs
 * with a lone question file.
 */
export function suggestPairs(files: ReadonlyArray<{ id: string; name: string; role: FileRole }>): Array<{ questions: string; answers?: string }> {
  const indexed = files.map((f, k) => ({ ...f, k }));
  const questions = indexed.filter((f) => f.role !== 'answers');
  const answers = indexed.filter((f) => f.role === 'answers');
  const pairs: Array<{ q: number; a: number; score: number; series: boolean; gap: number }> = [];
  for (const q of questions) {
    if (q.role === 'both') continue;
    for (const a of answers) {
      const { score, series } = nameSimilarity(q.name, a.name);
      if (score >= PAIR_AT) pairs.push({ q: q.k, a: a.k, score, series, gap: a.k > q.k ? a.k - q.k : files.length + q.k - a.k });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.gap - y.gap);
  const link = new Map<number, number>();
  const used = new Set<number>();
  // First each answer file to one paper; then a paper left over shares its best (the
  // .docx and .pdf of one paper, or a series file).
  for (const shared of [false, true]) {
    for (const p of pairs) {
      if (link.has(p.q) || (!shared && used.has(p.a) && !p.series)) continue;
      link.set(p.q, p.a);
      used.add(p.a);
    }
  }
  const linked = new Set(link.values());
  const lonelyQ = questions.filter((q) => q.role === 'questions' && !link.has(q.k));
  const lonelyA = answers.filter((a) => !linked.has(a.k));
  if (lonelyQ.length === 1 && lonelyA.length === 1 && !nameTokens(lonelyA[0].name).length) link.set(lonelyQ[0].k, lonelyA[0].k);
  return questions.map((q) => {
    const a = q.role === 'both' ? q.k : link.get(q.k);
    return { questions: q.id, ...(a !== undefined ? { answers: files[a].id } : {}) };
  });
}
