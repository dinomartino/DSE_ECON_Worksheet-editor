/**
 * The outline walk: settled roles in, questions out. Text is never dropped: a line the
 * walk cannot place stays in the nearest stem and is flagged. Detached option letters
 * (PDF copies) are paired with option texts by order, joining wrapped lines to fit.
 */
import { cjkShare } from './normalize';
import { inlineAnswer, isShared, keyPairs, sharedSpan } from './detectors';
import type { RunVerdict } from './levels';
import type { Family, Flag, FlagKind, OutBlock, OutPart, OutQuestion, OutStimulus, OutSubPart, OutText, Outline, Role, SourceLine } from './types';
import type { InlineRun } from '@/model/types';
import { normalizeRuns } from '@/model/text';

type Paragraph = Extract<OutBlock, { kind: 'paragraph' }>;
type SourcePanel = Extract<OutBlock, { kind: 'source' }>;
type ListLevel = 'statement' | 'option';

type Event =
  /** `blocks`: pictures right after a label-only option line ("A.⇥[picture]"). */
  | { kind: 'slot'; level: ListLevel; count: number; line: number; blocks?: OutBlock[] }
  | { kind: 'item'; level: ListLevel; text: OutText; line: number }
  | { kind: 'loose'; text: OutText; line: number; join?: boolean };

interface Draft {
  q: OutQuestion;
  index: number;
  events: Event[];
}

export interface WalkInput {
  lines: readonly SourceLine[];
  roles: Role[];
  conf: number[];
  verdict: ReadonlyMap<number, RunVerdict>;
  lineMode: 'paragraph' | 'visual';
  /** A typical full printed line, in characters (visual mode). */
  fullLine: number;
  newQuestion: ReadonlySet<number>;
  join: ReadonlySet<number>;
  /** Families settled at the question level; a pinned new question keeps any other label as text. */
  questionFamilies: ReadonlySet<Family>;
}

export interface WalkResult {
  outline: Outline;
  roles: Role[];
  conf: number[];
  owner: Array<number | undefined>;
  flags: Flag[];
}

const text = (runs: readonly InlineRun[]) => runs.map((r) => r.text).join('');
const ENDS_SENTENCE = /[.?!。？！:：;；]["'”’)]?$/;
const HINT = /^[(（]?\s*(hint|note|提示|注意)\b/i;

/** "re-" + "opened" keeps its hyphen; "eco-" + "nomics" loses it; CJK joins tight. */
export function joinRuns(a: readonly InlineRun[], b: readonly InlineRun[]): InlineRun[] {
  const left = text(a);
  const right = text(b);
  if (!left) return [...b];
  if (!right) return [...a];
  const out = a.map((r) => ({ ...r }));
  const hyphen = /([A-Za-z]+)-$/.exec(left);
  if (hyphen && /^[a-z]/.test(right)) {
    if (hyphen[1].length > 3) {
      const last = out[out.length - 1];
      last.text = last.text.replace(/-$/, '');
    }
    return [...out, ...b];
  }
  const tight = /[㐀-鿿＀-￯]$/.test(left) && /^[㐀-鿿＀-￯]/.test(right);
  return [...out, ...(tight ? [] : [{ text: ' ' }]), ...b];
}

class Walker {
  readonly out: Outline = { questions: [], stimuli: [], headings: [], answerKey: {} };
  readonly flags: Flag[] = [];
  readonly owner: Array<number | undefined>;
  private q: Draft | null = null;
  private part: OutPart | null = null;
  private partDone = false;
  private sub: OutSubPart | null = null;
  private subDone = false;
  private source: SourcePanel | null = null;
  private context: OutBlock[] = [];
  private stim: OutStimulus | null = null;
  private pre: SourceLine[] = [];
  private lastPara: { block: Paragraph; ctr: OutBlock[]; tail: string } | null = null;
  private lastTable: { block: Extract<OutBlock, { kind: 'table' }>; ctr: OutBlock[] } | null = null;
  private afterBlank = false;
  private answerRun = 0;

  constructor(private readonly input: WalkInput) {
    this.owner = input.lines.map(() => undefined);
  }

  private get lines() {
    return this.input.lines;
  }

  private setRole(i: number, role: Role, conf?: number) {
    this.input.roles[i] = role;
    if (conf !== undefined) this.input.conf[i] = Math.min(this.input.conf[i] ?? 1, conf);
  }

  private flag(kind: FlagKind, line: number, detail?: number) {
    this.flags.push({ kind, line, ...(this.q ? { question: this.q.index } : {}), ...(detail !== undefined ? { detail } : {}) });
  }

  private own(i: number) {
    if (this.q) this.owner[i] = this.q.index;
  }

  /** The label back in front of the body, for a labelled line that is not structural. */
  private full(line: SourceLine): InlineRun[] {
    const clump = line.clump
      ? [{ text: `${line.clump.values.map((v) => (line.clump!.family === '(n)' ? `(${v})` : `${String.fromCharCode(64 + v)}.`)).join(' ')} ` }]
      : [];
    const body = line.cells ? cellsAsText(line.cells) : line.runs;
    return [...clump, ...(line.labelRuns ?? []), ...body].filter((r) => r.text);
  }

  private textOf(line: SourceLine): OutText {
    return { lines: [line.i], runs: line.cells ? cellsAsText(line.cells) : [...line.runs], ...(line.emphasis ? { emphasis: line.emphasis } : {}) };
  }

  // ---- containers ----

  private target(): OutBlock[] | null {
    if (this.source) return this.source.blocks;
    if (this.stim) return this.stim.blocks;
    if (!this.q) return null;
    if (this.sub) return this.subDone ? this.context : this.sub.blocks;
    if (this.part) return this.partDone ? this.context : this.part.blocks;
    return this.q.q.stem;
  }

  /** `alone`: a paragraph of its own that nothing joins (a flattened table row). */
  private addParagraph(line: SourceLine, runs: InlineRun[], opts: { join?: boolean; alone?: boolean } = {}) {
    let ctr = this.target();
    if (ctr === this.context && HINT.test(text(runs))) ctr = this.sub ? this.sub.blocks : this.part!.blocks;
    if (!ctr) {
      this.pre.push(line);
      return;
    }
    const last = this.lastPara;
    const joinable = last && last.ctr === ctr && ctr[ctr.length - 1] === last.block;
    if (joinable && !opts.alone && (opts.join || (this.input.lineMode === 'visual' && !this.afterBlank && this.wraps(last.tail, text(runs))))) {
      last.block.runs = joinRuns(last.block.runs, runs);
      last.block.lines.push(line.i);
      last.tail = text(runs);
    } else {
      const block: Paragraph = { kind: 'paragraph', lines: [line.i], runs: [...runs] };
      ctr.push(block);
      this.lastPara = opts.alone ? null : { block, ctr, tail: text(runs) };
    }
    this.lastTable = null;
    this.afterBlank = false;
  }

  /** Visual mode: does line `next` continue the paragraph whose last line was `prev`? */
  private wraps(prev: string, next: string): boolean {
    const a = prev.trimEnd();
    if (!ENDS_SENTENCE.test(a) || /^[a-z]/.test(next.trimStart())) return true;
    // A sentence that ends at the right margin may still run on.
    return a.length >= this.input.fullLine * 0.85;
  }

  private addTableRow(line: SourceLine) {
    const ctr = this.target();
    if (!ctr) {
      this.pre.push(line);
      return;
    }
    if (!line.cells) {
      // A flattened PDF table row: its own paragraph, never joined.
      this.addParagraph(line, line.runs, { alone: true });
      return;
    }
    const row = rowCells(line, line.cells);
    const last = this.lastTable;
    if (last && last.ctr === ctr && ctr[ctr.length - 1] === last.block) {
      last.block.rows.push(row);
      last.block.lines.push(line.i);
    } else {
      const block = { kind: 'table' as const, lines: [line.i], rows: [row] };
      ctr.push(block);
      this.lastTable = { block, ctr };
    }
    this.lastPara = null;
    this.afterBlank = false;
  }

  // ---- questions ----

  private open(line: SourceLine | null, stem: SourceLine[] = []) {
    this.finish();
    const index = this.out.questions.length;
    const q: OutQuestion = {
      start: line?.i ?? stem[0]?.i ?? 0,
      kind: 'written',
      stem: [],
      statements: [],
      options: [],
      parts: [],
      side: 'en',
    };
    if (line?.labelInfo && this.input.questionFamilies.has(line.labelInfo.family)) {
      q.label = line.label;
      q.number = line.labelInfo.value;
    }
    this.q = { q, index, events: [] };
    if (this.stim) {
      this.stim.before = index;
      this.out.stimuli.push(this.stim);
      this.stim = null;
    }
    this.takePre(stem.length ? stem : null);
    for (const s of stem) {
      this.own(s.i);
      this.place(s);
    }
    if (line) {
      this.own(line.i);
      const body = q.label !== undefined ? line.runs : this.full(line);
      if (text(body).trim()) this.addParagraph(line, body);
      if (line.trailingMarks !== undefined) q.marks = line.trailingMarks;
    }
  }

  /** Lines before the first question: instructions (headings), unless they carry content the question needs. */
  private takePre(into: SourceLine[] | null) {
    const pre = this.pre;
    this.pre = [];
    if (!pre.length || into) return;
    const content = pre.some((l) => l.cells || l.image || this.input.roles[l.i] === 'source' || this.input.roles[l.i] === 'table');
    if (content && this.q) {
      for (const l of pre) {
        this.own(l.i);
        this.place(l);
      }
      this.flag('mixedContent', pre[0].i);
      return;
    }
    for (const l of pre) {
      this.out.headings.push(l.i);
      this.setRole(l.i, 'heading', 0.5);
    }
  }

  /** Re-dispatch a buffered line once a question exists. */
  private place(line: SourceLine) {
    const role = this.input.roles[line.i];
    if (role === 'table') this.addTableRow(line);
    else if (role === 'statement') this.listEvent(line, 'statement');
    else if (role === 'source') this.openSource(line);
    else if (line.image) this.addImage(line);
    else {
      if (line.text || line.labelInfo || line.cells) this.addParagraph(line, this.full(line));
      if (line.trailingMarks !== undefined) this.attachMarks({ ...line, text: 'x' }, line.trailingMarks);
    }
  }

  private ensureQuestion(line: SourceLine) {
    if (this.q) return;
    const stem = this.pre;
    this.pre = [];
    this.open(null, stem);
    this.q!.q.start = stem[0]?.i ?? line.i;
    this.flag('unlabelledStart', line.i);
  }

  private closeSource() {
    this.source = null;
  }

  private openPart(line: SourceLine) {
    this.ensureQuestion(line);
    this.closeSource();
    const q = this.q!.q;
    // Options before a part: but one stray "D: Demand" (a figure's legend) is text, not options.
    const listed = this.q!.events.reduce((n, e) => n + (e.kind === 'slot' ? e.count : e.kind === 'item' ? 1 : 0), 0);
    if (listed >= 2) this.flag('mixedContent', line.i);
    const part: OutPart = { start: line.i, label: line.label, before: this.context, blocks: [], subParts: [] };
    this.context = [];
    q.parts.push(part);
    this.part = part;
    this.partDone = false;
    this.sub = null;
    this.subDone = false;
    this.lastPara = null;
    this.own(line.i);
    if (line.text) this.addParagraph(line, line.runs);
    if (line.trailingMarks !== undefined) this.setMarks(part, line, line.trailingMarks);
  }

  private openSub(line: SourceLine) {
    if (!this.part) {
      this.setRole(line.i, 'part');
      this.openPart(line);
      return;
    }
    this.closeSource();
    if (this.context.length) {
      (this.sub?.blocks ?? this.part.blocks).push(...this.context);
      this.context = [];
    }
    const sub: OutSubPart = { start: line.i, label: line.label, blocks: [] };
    this.part.subParts.push(sub);
    this.sub = sub;
    this.subDone = false;
    this.lastPara = null;
    this.own(line.i);
    if (line.text) this.addParagraph(line, line.runs);
    if (line.trailingMarks !== undefined) this.setMarks(sub, line, line.trailingMarks);
  }

  private setMarks(leaf: OutSubPart | OutQuestion, line: SourceLine, marks: number) {
    if (line.extraMarks !== undefined) this.flag('duplicateMarks', line.i, line.extraMarks);
    leaf.marks = marks;
    if (leaf === this.sub) this.subDone = true;
    else if (leaf === this.part) this.partDone = true;
  }

  /** The `(i)` that follows `(h)` is a letter; otherwise a roman sub-part. */
  private isLetterAfterH(line: SourceLine): boolean {
    const alt = line.labelInfo?.alt;
    if (!alt || !this.part) return false;
    const prev = this.lines[this.part.start]?.labelInfo;
    return !!prev && prev.family === alt.family && prev.value === alt.value - 1 && !this.sub;
  }

  // ---- MC lists ----

  private listEvent(line: SourceLine, level: ListLevel) {
    // "(1) … (2) …" before any question is a cover's instructions list until options follow.
    if (!this.q && !this.stim && level === 'statement') {
      this.pre.push(line);
      return;
    }
    this.ensureQuestion(line);
    const d = this.q!;
    if (this.part) {
      // A list inside a part is text.
      this.setRole(line.i, 'stem', 0.6);
      this.own(line.i);
      this.addParagraph(line, this.full(line));
      return;
    }
    const value = line.clump ? line.clump.values[0] : line.labelInfo?.value;
    const options = d.events.filter((e) => e.kind !== 'loose' && e.level === 'option');
    const restart =
      value === 1 &&
      !d.events.some((e) => e.kind === 'slot') &&
      options.length >= 2 &&
      (level === 'option' || level === 'statement');
    if (restart) this.splitAtRestart(line);
    const q = this.q!;
    if (level === 'statement' && q.events.some((e) => e.kind !== 'loose' && e.level === 'option')) {
      // "(1), (2) and (3)" read as a label: option text.
      q.events.push({ kind: 'loose', text: { lines: [line.i], runs: this.full(line) }, line: line.i });
      this.own(line.i);
      return;
    }
    this.own(line.i);
    this.closeSource();
    if (line.clump) {
      q.events.push({ kind: 'slot', level, count: line.clump.values.length, line: line.i });
      if (line.text) q.events.push({ kind: 'loose', text: this.textOf(line), line: line.i });
    } else if (!line.text && !line.cells) q.events.push({ kind: 'slot', level, count: 1, line: line.i });
    else q.events.push({ kind: 'item', level, text: this.textOf(line), line: line.i });
    if (line.trailingMarks !== undefined) q.q.marks = line.trailingMarks;
    this.lastPara = null;
  }

  /** A second "A." after a full set: the next question's number was lost. */
  private splitAtRestart(line: SourceLine) {
    const d = this.q!;
    let cut = d.events.length;
    while (cut > 0 && d.events[cut - 1].kind === 'loose') cut--;
    const tail = d.events.splice(cut);
    // In a PDF copy the first loose line may still wrap the last option.
    if (tail.length && this.input.lineMode === 'visual') {
      const last = d.events[d.events.length - 1];
      const first = tail[0];
      if (last?.kind === 'item' && first.kind === 'loose' && this.wrapScore(last.text, first.text) >= 3) d.events.push(tail.shift()!);
    }
    const number = d.q.number;
    this.open(null, []);
    const q = this.q!;
    if (number !== undefined) q.q.number = number + 1;
    q.q.start = tail[0]?.line ?? line.i;
    for (const e of tail) {
      if (e.kind !== 'loose') continue;
      for (const i of e.text.lines) this.owner[i] = q.index;
      q.q.stem.push({ kind: 'paragraph', lines: e.text.lines, runs: e.text.runs });
      for (const i of e.text.lines) this.setRole(i, 'stem', 0.5);
    }
    this.flag('sequenceBreak', line.i);
  }

  /** How surely `b` wraps `a`: only a line that reached the margin can wrap. */
  private wrapScore(a: OutText, b: OutText): number {
    const last = a.lines[a.lines.length - 1];
    const left = last === undefined ? text(a.runs).trim() : this.lines[last].raw.trim();
    const right = text(b.runs).trimStart();
    if (left.length < this.input.fullLine * 0.75) return 0;
    let score = 2;
    if (/^[a-z]/.test(right)) score += 2;
    if (!ENDS_SENTENCE.test(left)) score += 1;
    if (/^[A-Z“"(]/.test(right) && ENDS_SENTENCE.test(left)) score -= 2;
    return score;
  }

  // ---- other roles ----

  private attachMarks(line: SourceLine, marks: number) {
    if (!this.q) {
      this.flag('unknownLine', line.i);
      return;
    }
    this.own(line.i);
    const q = this.q.q;
    const part = this.part;
    if (this.sub && part && part.subParts.length >= 2 && part.subParts.every((s) => s.marks === undefined) && line.text === '') {
      // Group marks after (i)+(ii): the part's mark.
      part.marks = marks;
      this.partDone = true;
      this.subDone = true;
      return;
    }
    const leaf: OutSubPart | OutQuestion = this.sub ?? part ?? q;
    const filled = (l: OutSubPart | OutQuestion) => ('stem' in l ? l.stem.length > 0 || l.parts.length > 0 || this.q!.events.length > 0 : l.blocks.length > 0);
    if (leaf.marks === undefined && filled(leaf)) {
      this.setMarks(leaf, line, marks);
      return;
    }
    // Drifted: the nearest earlier leaf with no marks.
    const leaves: Array<OutSubPart | OutQuestion> = [];
    for (const d of [...this.out.questions.slice(-1), q]) {
      if (d.parts.length) for (const p of d.parts) leaves.push(...(p.subParts.length ? p.subParts : [p]));
      else leaves.push(d);
    }
    const target = leaves.reverse().find((l) => l !== leaf && l.marks === undefined && filled(l));
    if (target && (leaf.marks !== undefined || !filled(leaf))) {
      target.marks = marks;
      this.flag('marksMoved', line.i);
      this.input.conf[line.i] = 0.6;
      return;
    }
    if (leaf.marks === undefined) this.setMarks(leaf, line, marks);
    else this.flag('duplicateMarks', line.i, marks);
  }

  private answerSpace(line: SourceLine) {
    if (!this.q) return;
    this.own(line.i);
    this.closeSource();
    const leaf: OutSubPart | OutQuestion = this.sub ?? this.part ?? this.q.q;
    if (leaf === this.q.q && this.q.q.parts.length) return;
    leaf.answerSpace = (leaf.answerSpace ?? 0) + 1;
    if (leaf === this.sub) this.subDone = true;
    else if (leaf === this.part) this.partDone = true;
  }

  private openSource(line: SourceLine) {
    if (isShared(line.text) && !this.part) {
      this.finish();
      this.stim = { start: line.i, before: -1, span: sharedSpan(line.text) ?? 2, blocks: [] };
      this.stim.blocks.push({ kind: 'paragraph', lines: [line.i], runs: [...line.runs] });
      this.lastPara = null;
      return;
    }
    this.closeSource();
    const ctr = this.target();
    if (!ctr) {
      this.pre.push(line);
      return;
    }
    this.own(line.i);
    const panel: SourcePanel = { kind: 'source', lines: [line.i], label: [...line.runs], blocks: [] };
    ctr.push(panel);
    this.source = panel;
    this.lastPara = null;
  }

  private addImage(line: SourceLine) {
    const option = this.optionBefore(line);
    if (option) {
      // "A.⇥[picture]": the picture is the option (`McqOption.blocks`).
      this.own(line.i);
      (option.blocks ??= []).push({ kind: 'image', lines: [line.i], image: line.image! });
      return;
    }
    const ctr = this.target();
    if (!ctr) {
      this.pre.push(line);
      return;
    }
    this.own(line.i);
    ctr.push({ kind: 'image', lines: [line.i], image: line.image! });
    this.lastPara = null;
  }

  /** The option line right before `line` (blanks between), when no part has opened since. */
  private optionBefore(line: SourceLine): { blocks?: OutBlock[] } | undefined {
    const d = this.q;
    if (!d || this.part) return undefined;
    const last = d.events[d.events.length - 1];
    if (!last || last.kind === 'loose' || last.level !== 'option' || (last.kind === 'slot' && last.count !== 1)) return undefined;
    for (let k = line.i - 1; k > last.line; k--) if (!this.lines[k].blank && !this.lines[k].tabOnly) return undefined;
    return last.kind === 'item' ? last.text : last;
  }

  private heading(line: SourceLine) {
    this.finish();
    if (this.stim) {
      this.flag('unknownLine', this.stim.start);
      for (const b of this.stim.blocks) for (const i of b.lines) this.out.headings.push(i);
      this.stim = null;
    }
    this.takePre(null);
    this.out.headings.push(line.i);
  }

  private answerKeyLine(line: SourceLine) {
    const inline = inlineAnswer(`${line.label ?? ''} ${line.text}`.trim());
    if (inline !== undefined) {
      const d = this.q ?? null;
      if (d) {
        d.q.answer = { index: inline - 1, from: 'inline' };
        this.own(line.i);
      }
      return;
    }
    if (this.answerRun === 1) this.finish();
    for (const [n, letter] of keyPairs(line) ?? []) this.out.answerKey[n] = letter - 1;
  }

  // ---- the walk ----

  run(): WalkResult {
    const { lines, roles, verdict } = this.input;
    for (const line of lines) {
      let role = roles[line.i];
      const v = verdict.get(line.i);
      if (this.input.newQuestion.has(line.i)) this.setRole(line.i, (role = 'question'));
      else if (this.input.join.has(line.i)) this.setRole(line.i, (role = 'stem'));
      if (role === 'question' && (v === 'nested' || v === 'outlier' || v === 'instructions')) {
        role = v === 'nested' ? 'statement' : v === 'instructions' ? 'heading' : 'stem';
        this.setRole(line.i, role, v === 'outlier' ? 0.4 : 0.7);
        if (v === 'outlier') this.flag('sequenceBreak', line.i, line.labelInfo?.value);
      }
      if (role === 'subpart' && this.isLetterAfterH(line)) {
        role = 'part';
        this.setRole(line.i, 'part', 0.7);
      }
      this.answerRun = role === 'answerKey' ? this.answerRun + 1 : 0;
      switch (role) {
        case 'ignore':
          this.afterBlank = true;
          break;
        case 'noise':
          break;
        case 'heading':
          this.heading(line);
          break;
        case 'question':
          this.open(line);
          if (v === 'skip') this.flag('sequenceBreak', line.i, line.labelInfo?.value);
          if (v === 'restart') this.flag('numberRestart', line.i, line.labelInfo?.value);
          break;
        case 'part':
          this.openPart(line);
          break;
        case 'subpart':
          this.openSub(line);
          break;
        case 'option':
        case 'statement':
          this.listEvent(line, role);
          break;
        case 'marks': {
          const marks = line.trailingMarks ?? Number.parseInt(line.text, 10);
          if (Number.isFinite(marks)) this.attachMarks(line, marks);
          else this.loose(line);
          break;
        }
        case 'answerSpace':
          this.answerSpace(line);
          break;
        case 'table':
          if (this.q?.events.length && !this.part) this.loose(line);
          else {
            this.own(line.i);
            this.addTableRow(line);
          }
          break;
        case 'source':
          this.openSource(line);
          break;
        case 'answerKey':
          this.answerKeyLine(line);
          break;
        default:
          if (line.image) {
            this.addImage(line);
            break;
          }
          this.loose(line);
      }
    }
    this.finish();
    if (this.stim) {
      // A shared stem with nothing after it: keep it as the last question's text.
      const last = this.out.questions[this.out.questions.length - 1];
      if (last) last.stem.push(...this.stim.blocks);
      this.flag('unknownLine', this.stim.start);
      this.stim = null;
    }
    if (this.pre.length && !this.out.questions.length) {
      const stem = this.pre;
      this.pre = [];
      this.open(null, stem);
      this.flag('unlabelledStart', stem[0].i);
      this.finish();
    } else this.takePre(null);
    return { outline: this.out, roles: this.input.roles, conf: this.input.conf, owner: this.owner, flags: this.flags };
  }

  private loose(line: SourceLine) {
    const join = this.input.join.has(line.i);
    const runs = join || line.labelInfo ? this.full(line) : line.cells ? cellsAsText(line.cells) : line.runs;
    if (this.q && this.q.events.length && !this.part) {
      this.own(line.i);
      this.q.events.push({ kind: 'loose', text: { lines: [line.i], runs, ...(line.emphasis ? { emphasis: line.emphasis } : {}) }, line: line.i, join });
      if (line.trailingMarks !== undefined) this.q.q.marks = line.trailingMarks;
      return;
    }
    if (!runs.length && line.trailingMarks === undefined) return;
    if (!this.q && !this.stim) {
      this.pre.push(line);
      return;
    }
    this.own(line.i);
    if (runs.length) this.addParagraph(line, runs, { join });
    if (line.trailingMarks !== undefined) this.attachMarks({ ...line, text: 'x' }, line.trailingMarks);
    if (this.input.roles[line.i] === 'stem' && line.labelInfo && !join) this.input.conf[line.i] = Math.min(this.input.conf[line.i], 0.6);
  }

  // ---- closing a question ----

  private finish() {
    const d = this.q;
    if (!d) return;
    this.closeSource();
    if (this.context.length) {
      const lastPart = d.q.parts[d.q.parts.length - 1];
      const into = lastPart ? (lastPart.subParts[lastPart.subParts.length - 1]?.blocks ?? lastPart.blocks) : d.q.stem;
      into.push(...this.context);
    }
    this.context = [];
    this.resolveLists(d);
    const q = d.q;
    if (q.kind === 'mc' && q.parts.length) {
      for (const p of q.parts) q.stem.push(...p.before, ...p.blocks, ...p.subParts.flatMap((s) => s.blocks));
      q.parts = [];
      this.flags.push({ kind: 'mixedContent', line: q.start, question: d.index });
    }
    q.side = cjkShare(outlineText(q)) >= 0.5 ? 'zh' : 'en';
    this.out.questions.push(q);
    this.q = null;
    this.part = null;
    this.sub = null;
    this.partDone = false;
    this.subDone = false;
    this.lastPara = null;
    this.lastTable = null;
  }

  private resolveLists(d: Draft) {
    const q = d.q;
    const events = d.events;
    if (!events.length) return;
    const firstOption = events.findIndex((e) => e.kind !== 'loose' && e.level === 'option');
    const statementPhase = firstOption < 0 ? events : events.slice(0, firstOption);
    const optionPhase = firstOption < 0 ? [] : events.slice(firstOption);
    const optionSlots = optionPhase.reduce((n, e) => n + (e.kind === 'slot' ? e.count : e.kind === 'item' ? 1 : 0), 0);
    if (optionSlots < 2) {
      // Not an MC after all: every listed line is stem text, labels kept.
      for (const e of events) {
        const line = this.lines[e.line];
        const runs = e.kind === 'loose' ? e.text.runs : this.full(line);
        if (runs.length) q.stem.push({ kind: 'paragraph', lines: [e.line], runs });
        q.stem.push(...((e.kind === 'slot' ? e.blocks : e.kind === 'item' ? e.text.blocks : undefined) ?? []));
        this.setRole(e.line, 'stem', 0.6);
      }
      return;
    }
    q.kind = 'mc';
    const statements = this.phase(statementPhase, 'statement', d);
    const options = this.phase(optionPhase, 'option', d);
    q.statements = statements.items;
    q.options = options.items;
    for (const extra of [...statements.extra, ...options.extra]) {
      q.stem.push({ kind: 'paragraph', lines: extra.lines, runs: extra.runs });
      for (const i of extra.lines) this.setRole(i, 'stem', 0.5);
    }
    if (options.items.length !== 4) this.flags.push({ kind: 'optionCount', line: q.start, question: d.index, detail: options.items.length });
    const marked = q.options.map((o, k) => (o.emphasis ? k : -1)).filter((k) => k >= 0);
    if (!q.answer && marked.length === 1) {
      q.answer = { index: marked[0], from: 'format' };
      q.options[marked[0]] = { ...q.options[marked[0]], runs: plainRuns(q.options[marked[0]].runs, q.options[marked[0]].emphasis) };
    }
  }

  private phase(events: Event[], level: ListLevel, d: Draft): { items: OutText[]; extra: OutText[] } {
    const items: OutText[] = [];
    const extra: OutText[] = [];
    if (!events.length) return { items, extra };
    const detached = events.some((e) => e.kind === 'slot');
    const mark = (t: OutText, conf: number) => t.lines.forEach((i) => this.setRole(i, level, conf));
    if (!detached) {
      for (const e of events) {
        if (e.kind === 'item') {
          items.push({ ...e.text, lines: [...e.text.lines] });
          continue;
        }
        if (e.kind !== 'loose') continue;
        const last = items[items.length - 1];
        if (last && (this.input.lineMode === 'visual' || e.join)) {
          last.runs = joinRuns(last.runs, e.text.runs);
          last.lines.push(...e.text.lines);
          mark(e.text, 0.75);
        } else {
          extra.push(e.text);
          this.flags.push({ kind: level === 'option' ? 'textAfterOptions' : 'mixedContent', line: e.line, question: d.index });
        }
      }
      return { items, extra };
    }
    const slots = events.reduce((n, e) => n + (e.kind === 'slot' ? e.count : e.kind === 'item' ? 1 : 0), 0);
    if (level === 'option' && this.input.lineMode === 'paragraph' && events.every((e) => e.kind === 'slot' && e.count === 1)) {
      // Every option a bare label ("A." alone, a picture or nothing after it): options without
      // text, each on its own line, not detached letters waiting for text.
      for (const e of events as Array<Extract<Event, { kind: 'slot' }>>) {
        items.push({ lines: [e.line], runs: [], ...(e.blocks ? { blocks: e.blocks } : {}) });
        this.setRole(e.line, level, 0.7);
      }
      return { items, extra };
    }
    const texts: OutText[] = events.filter((e) => e.kind !== 'slot').map((e) => ({ ...(e as { text: OutText }).text, lines: [...(e as { text: OutText }).text.lines] }));
    while (texts.length > slots) {
      let best = -1;
      let bestScore = 2;
      for (let k = 0; k + 1 < texts.length; k++) {
        const s = this.wrapScore(texts[k], texts[k + 1]);
        if (s > bestScore) {
          best = k;
          bestScore = s;
        }
      }
      if (best < 0) break;
      texts.splice(best, 2, { runs: joinRuns(texts[best].runs, texts[best + 1].runs), lines: [...texts[best].lines, ...texts[best + 1].lines], emphasis: texts[best].emphasis });
    }
    items.push(...texts.slice(0, slots));
    extra.push(...texts.slice(slots));
    for (const t of items) mark(t, 0.6);
    for (const e of events) if (e.kind === 'slot') this.setRole(e.line, level, 0.6);
    this.flags.push({ kind: 'optionsByOrder', line: events[0].line, question: d.index });
    if (items.length < slots) this.flags.push({ kind: level === 'option' ? 'optionCount' : 'statementCount', line: events[0].line, question: d.index, detail: items.length });
    while (items.length < slots && level === 'option') items.push({ lines: [], runs: [] });
    // A picture after a bare label goes with the text paired to that label.
    let at = 0;
    for (const e of events) {
      if (e.kind === 'slot' && e.blocks) {
        const item = items[at] ?? items[items.length - 1];
        if (item) (item.blocks ??= []).push(...e.blocks);
      }
      at += e.kind === 'slot' ? e.count : e.kind === 'item' ? 1 : 0;
    }
    return { items, extra };
  }
}

/** A table row's cells, a row label kept: its own cell when a TAB followed it, else in the first. */
function rowCells(line: SourceLine, cells: InlineRun[][]): InlineRun[][] {
  const label = line.labelInfo && line.label && line.labelRuns ? normalizeRuns(line.labelRuns.map((r) => ({ ...r, text: r.text.trimEnd() })).filter((r) => r.text)) : [];
  if (!label.length) return cells;
  const own = line.labelSource === 'list' || line.raw.slice(line.raw.indexOf(line.label!) + line.label!.length).startsWith('\t');
  if (own) return [label, ...cells];
  const [first = [], ...rest] = cells;
  return [normalizeRuns([...label, { text: ' ' }, ...first]), ...rest];
}

function cellsAsText(cells: readonly InlineRun[][]): InlineRun[] {
  const out: InlineRun[] = [];
  cells.forEach((cell, k) => {
    if (k) out.push({ text: ' ' });
    out.push(...cell);
  });
  return out;
}

/** Strip the formatting that marked the answer, so the student copy does not show it. */
function plainRuns(runs: readonly InlineRun[], emphasis: OutText['emphasis']): InlineRun[] {
  if (emphasis !== 'bold' && emphasis !== 'color') return [...runs];
  return runs.map((r) => {
    const { bold, color, ...rest } = r;
    void bold;
    void color;
    return emphasis === 'bold' ? { ...rest, ...(color ? { color } : {}) } : { ...rest, ...(bold ? { bold } : {}) };
  });
}

export function blocksText(blocks: readonly OutBlock[]): string {
  return blocks
    .map((b) => (b.kind === 'paragraph' ? text(b.runs) : b.kind === 'table' ? b.rows.map((r) => r.map(text).join(' ')).join(' ') : b.kind === 'source' ? `${text(b.label)} ${blocksText(b.blocks)}` : ''))
    .join(' ');
}

export function outlineText(q: OutQuestion): string {
  return [
    blocksText(q.stem),
    ...q.statements.map((s) => text(s.runs)),
    ...q.options.map((o) => text(o.runs)),
    ...q.parts.flatMap((p) => [blocksText(p.before), blocksText(p.blocks), ...p.subParts.map((s) => blocksText(s.blocks))]),
  ].join(' ');
}

export function walk(input: WalkInput): WalkResult {
  return new Walker(input).run();
}
