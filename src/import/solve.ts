/**
 * The sequence solver: detectors suggest, family levels and question runs settle,
 * the walk builds the outline. Pins constrain every step; a role pin on a labelled
 * line spreads to its whole family.
 */
import { detect, type DetectContext } from './detectors';
import { labelLevel } from './labels';
import { inferLevels, settleQuestionRuns } from './levels';
import { repeatKey } from './normalize';
import type { Family, Flag, LayoutProfile, Level, LineRole, MarksStyle, Outline, Pin, Role, SourceLine } from './types';
import { walk } from './walk';
import type { Side } from '@/model/textSlots';

const ENDS_SENTENCE = /[.?!。？！:：;；]["'”’)]?$/;
const STRUCTURAL: ReadonlySet<Role> = new Set(['question', 'part', 'subpart', 'option', 'statement']);

/** `visual`: a PDF copy, one line per printed line. Word and HTML pastes are paragraphs. */
export function detectLineMode(lines: readonly SourceLine[], source: 'plain' | 'html'): LayoutProfile['lineMode'] {
  if (source === 'html') return 'paragraph';
  const body = lines.filter((l) => !l.blank && !l.tabOnly && !l.image && l.raw.trim());
  if (body.length < 3) return 'paragraph';
  if (body.filter((l) => l.raw.includes('\t')).length / body.length > 0.1) return 'paragraph';
  if (Math.max(...body.map((l) => l.raw.trim().length)) > 220) return 'paragraph';
  let pairs = 0;
  let wraps = 0;
  for (let k = 0; k + 1 < lines.length; k++) {
    const a = lines[k];
    const b = lines[k + 1];
    if (a.blank || b.blank || !a.raw.trim() || !b.text || b.labelInfo || b.clump) continue;
    pairs++;
    if (!ENDS_SENTENCE.test(a.raw.trim()) || /^[a-z]/.test(b.text)) wraps++;
  }
  return pairs >= 2 && wraps / pairs >= 0.35 ? 'visual' : 'paragraph';
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 80;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const LEVEL_OF_ROLE: Partial<Record<Role, Level>> = { question: 'question', part: 'part', subpart: 'subpart', option: 'option', statement: 'statement' };

function forcedLevels(lines: readonly SourceLine[], pins: readonly Pin[], profile?: LayoutProfile): Map<Family, Level> {
  const forced = new Map<Family, Level>();
  if (profile) {
    for (const level of ['question', 'part', 'subpart', 'option', 'statement'] as const) for (const f of profile[level]) forced.set(f, level);
  }
  for (const pin of pins) {
    if (pin.kind !== 'role' || !STRUCTURAL.has(pin.role)) continue;
    const family = lines[pin.line]?.labelInfo?.family;
    if (family) forced.set(family, LEVEL_OF_ROLE[pin.role]!);
  }
  return forced;
}

export interface Solved {
  roles: LineRole[];
  outline: Outline;
  flags: Flag[];
  profile: LayoutProfile;
}

export function solve(
  lines: readonly SourceLine[],
  opts: { pins?: readonly Pin[]; profile?: LayoutProfile; language?: Side | 'auto'; source: 'plain' | 'html' },
): Solved {
  const pins = opts.pins ?? [];
  const lineMode = opts.profile?.lineMode ?? detectLineMode(lines, opts.source);
  const repeats = new Map<string, number[]>();
  for (const line of lines) {
    if (line.blank || line.tabOnly || line.labelInfo || !line.raw.trim()) continue;
    const key = repeatKey(line.raw);
    repeats.set(key, [...(repeats.get(key) ?? []), line.i]);
  }
  const noise = new Set(opts.profile?.noise ?? []);
  for (const pin of pins) if (pin.kind === 'role' && pin.role === 'noise' && lines[pin.line] && !lines[pin.line].labelInfo) noise.add(repeatKey(lines[pin.line].raw));

  // Pass 1 with default levels finds the lines that are not items at all (keys, noise).
  const ctx: DetectContext = { lines, lineMode, repeats, noise, levelOf: labelLevel };
  const first = detect(lines, ctx);
  const items = lines.filter((l) => !['answerKey', 'noise', 'marks', 'heading'].includes(first[l.i][0]?.role ?? ''));
  const levels = inferLevels(items, forcedLevels(lines, pins, opts.profile));
  const levelOf = (f: Family) => levels.get(f) ?? labelLevel(f);
  const candidates = detect(lines, { ...ctx, levelOf });

  const roles: Role[] = candidates.map((c) => c[0].role);
  const conf: number[] = candidates.map((c) => {
    const [top, next] = c;
    const close = next && next.role !== top.role && top.weight - next.weight < 0.1;
    return Math.min(1, top.weight + 0.1) * (close ? 0.8 : 1);
  });

  const pinned = new Set<number>();
  const newQuestion = new Set<number>();
  const join = new Set<number>();
  for (const pin of pins) {
    if (!lines[pin.line]) continue;
    if (pin.kind === 'role') {
      roles[pin.line] = pin.role;
      pinned.add(pin.line);
    } else if (pin.kind === 'newQuestion') {
      newQuestion.add(pin.line);
      pinned.add(pin.line);
    } else if (pin.kind === 'join') {
      join.add(pin.line);
      pinned.add(pin.line);
    }
  }

  const verdict = settleQuestionRuns(lines, roles, new Set([...pinned].filter((i) => roles[i] === 'question')));
  const fullLine = lineMode === 'visual' ? percentile(lines.filter((l) => l.raw.trim()).map((l) => l.raw.trim().length), 0.9) : 1000;
  const questionFamilies = new Set([...levels].filter(([, level]) => level === 'question').map(([f]) => f));
  const walked = walk({ lines, roles, conf, verdict, lineMode, fullLine, newQuestion, join, questionFamilies });
  const { outline, flags } = walked;

  applyAnswers(outline, walked.owner, pins);
  for (const [k, q] of outline.questions.entries()) {
    if (opts.language && opts.language !== 'auto') q.side = opts.language;
    for (const pin of pins) if (pin.kind === 'language' && questionAt(outline, walked.owner, pin.line) === k) q.side = pin.side;
    if (q.kind === 'mc' && !q.answer) flags.push({ kind: 'noAnswer', line: q.start, question: k });
  }
  // One lead per insert: a shared stem later in the paste stays in its first question.
  for (const stim of outline.stimuli) if (stim.before > 0) flags.push({ kind: 'sharedStemFolded', line: stim.start, question: stim.before });
  for (const line of lines) if (line.image && !/^data:image\//.test(line.image.src)) flags.push({ kind: 'imageLost', line: line.i, question: walked.owner[line.i] });
  for (const flag of flags) if (flag.kind === 'unknownLine' || flag.kind === 'sequenceBreak') conf[flag.line] = Math.min(conf[flag.line], 0.5);

  const out: LineRole[] = lines.map((line) => ({
    role: walked.roles[line.i],
    confidence: pinned.has(line.i) ? 1 : Math.round(walked.conf[line.i] * 100) / 100,
    ...(pinned.has(line.i) ? { pinned: true } : {}),
    ...(walked.owner[line.i] !== undefined ? { question: walked.owner[line.i] } : {}),
  }));

  const profile = profileOf(lines, levels, out, repeats, noise, lineMode);
  flags.sort((a, b) => a.line - b.line);
  return { roles: out, outline, flags, profile };
}

function questionAt(outline: Outline, owner: ReadonlyArray<number | undefined>, line: number): number | undefined {
  return owner[line] ?? outline.questions.findIndex((q) => q.start === line);
}

/** Pins first, then the key list, then what the walk read from formatting or "Ans:" lines. */
function applyAnswers(outline: Outline, owner: ReadonlyArray<number | undefined>, pins: readonly Pin[]): void {
  const used = new Set<number>();
  for (const q of outline.questions) {
    if (q.kind !== 'mc' || q.answer || q.number === undefined || used.has(q.number)) continue;
    const index = outline.answerKey[q.number];
    if (index !== undefined && index < q.options.length) {
      q.answer = { index, from: 'key' };
      used.add(q.number);
    }
  }
  for (const pin of pins) {
    if (pin.kind !== 'answer') continue;
    const at = questionAt(outline, owner, pin.line);
    const q = at === undefined || at < 0 ? undefined : outline.questions[at];
    if (q?.kind === 'mc' && pin.index >= 0 && pin.index < q.options.length) q.answer = { index: pin.index, from: 'pin' };
  }
}

function profileOf(
  lines: readonly SourceLine[],
  levels: ReadonlyMap<Family, Level>,
  roles: readonly LineRole[],
  repeats: ReadonlyMap<string, readonly number[]>,
  noise: ReadonlySet<string>,
  lineMode: LayoutProfile['lineMode'],
): LayoutProfile {
  const present = new Set(lines.map((l) => l.labelInfo?.family).filter((f): f is Family => !!f));
  const of = (level: Level) => [...levels].filter(([f, l]) => l === level && present.has(f)).map(([f]) => f);
  const marks = [...new Set(lines.map((l) => l.marksStyle).filter((s): s is MarksStyle => !!s))];
  const noiseKeys = new Set(noise);
  for (const line of lines) {
    const key = repeatKey(line.raw);
    if (roles[line.i].role === 'noise' && (repeats.get(key)?.length ?? 0) >= 2) noiseKeys.add(key);
  }
  return {
    question: of('question'),
    part: of('part'),
    subpart: of('subpart'),
    option: of('option'),
    statement: of('statement'),
    marks,
    noise: [...noiseKeys],
    lineMode,
  };
}
