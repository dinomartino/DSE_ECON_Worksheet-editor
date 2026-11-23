import { AiError, isAiError, type AiErrorInfo, type CompletionRequest, type JsonSchema } from '@/ai/types';
import type { QualityDeps } from '@/quality/types';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { ContentBlock, McqQuestion, StructuredQuestion } from '@/model/types';
import { blockKey, blockText, listOf, listsOf, loose, ownerMarks, placeLabel, type LineTarget, type ListPath, type OwnerPath } from './address';
import { spans } from './checks';
import { applyOp, type CheckOp } from './ops';
import { SYSTEM_IMPORT_CHECK } from './promptText';
import type { CheckInput, ImportFinding } from './types';

/**
 * The import check's AI half (k-0494): for what the rules cannot see (a garbled word, two
 * sentences run together, a mark the solver misread), each question goes with its stretch
 * of the file to the provider in Settings → AI. The model may only propose one of three
 * edits on text it was sent — replace words, remove words, set marks — and each proposal
 * is checked before it is offered: the words to change must be on the paper, the new words
 * must be the file's, a mark must be one the file prints. Anything else is dropped.
 */

/** Bump with any change to the request's words, payload or schema. */
export const PROMPT_VERSION = 'ic.1';
export const MAX_CHUNK_CHARS = 7000;
export const MAX_CHUNK_QUESTIONS = 5;
const MAX_FILE_CHARS = 2400;
const MAX_PER_QUESTION = 4;

export const ISSUES = ['lostWords', 'garbled', 'merged', 'split', 'marks', 'leftover', 'language', 'other'] as const;

export const IMPORT_CHECK_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          ref: { type: 'string' },
          issue: { type: 'string', enum: [...ISSUES] },
          text: { type: 'string' },
          op: { type: 'string', enum: ['replace', 'remove', 'marks', 'none'] },
          from: { type: 'string' },
          to: { type: 'string' },
          marks: { type: 'number' },
        },
        required: ['key', 'ref', 'issue', 'text', 'op', 'from', 'to', 'marks'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** What a ref in the payload stands for. Request-local: never an app id. */
type Ref =
  | { kind: 'block'; list: ListPath; block: ContentBlock; side: Side; text: string }
  | { kind: 'line'; target: LineTarget; side: Side; text: string }
  | { kind: 'owner'; owner: OwnerPath };

interface Sent {
  q: number;
  key: string;
  file: string[];
  refs: Map<string, Ref>;
  payload: unknown;
  chars: number;
}

const sideOf = (text: { en: unknown[]; zh: unknown[] }): Side => (text.en.length || !text.zh.length ? 'en' : 'zh');

/** One question's payload: the file's lines in its span, the paper's texts by ref. */
export function questionPayload(input: CheckInput, q: number, key: string): Sent | undefined {
  const k = input.map[q];
  const question = input.paper[q];
  if (k === undefined) return undefined;
  const [from, to] = spans(input)[k];
  const file: string[] = [];
  let chars = 0;
  for (let i = from; i < to && chars < MAX_FILE_CHARS; i++) {
    const line = input.analysis.lines[i];
    const role = input.analysis.roles[i]?.role;
    if (role === 'ignore' || line.blank) continue;
    const words = line.image ? (line.image.src ? '[picture]' : '[drawing that could not be imported]') : line.raw.replace(/\s+/g, ' ').trim();
    if (!words) continue;
    file.push(words);
    chars += words.length;
  }
  const refs = new Map<string, Ref>();
  const texts: Array<Record<string, unknown>> = [];
  let n = 0;
  for (const list of listsOf(question)) {
    const walk = (blocks: readonly ContentBlock[]) => {
      for (const block of blocks) {
        if (block.kind === 'source') {
          walk(block.blocks);
          continue;
        }
        if (block.kind !== 'paragraph') {
          if (block.kind === 'table') texts.push({ ref: `t${++n}`, at: placeLabel(list) || 'stem', table: blockText(block).slice(0, 400) });
          if (block.kind === 'image') texts.push({ ref: `p${++n}`, at: placeLabel(list) || 'stem', picture: true });
          continue;
        }
        const side = sideOf(block.text);
        const text = plain(block.text[side]);
        if (!text.trim()) continue;
        const ref = `b${++n}`;
        refs.set(ref, { kind: 'block', list, block, side, text });
        texts.push({ ref, at: placeLabel(list) || 'stem', text });
      }
    };
    walk(listOf(question, list) ?? []);
  }
  if (question.type === 'mcq') {
    const mc = question as McqQuestion;
    (mc.statements ?? []).forEach((s, index) => {
      const side = sideOf(s);
      const ref = `s${index + 1}`;
      refs.set(ref, { kind: 'line', target: { line: 'statement', index }, side, text: plain(s[side]) });
      texts.push({ ref, at: `(${index + 1})`, text: plain(s[side]) });
    });
    mc.options.forEach((o, option) => {
      const side = sideOf(o.text);
      const ref = String.fromCharCode(65 + option);
      refs.set(ref, { kind: 'line', target: { line: 'option', option }, side, text: plain(o.text[side]) });
      texts.push({ ref, at: `option ${ref}`, text: plain(o.text[side]) });
    });
  }
  const marks: Array<Record<string, unknown>> = [];
  const owner = (o: OwnerPath, ref: string) => {
    refs.set(ref, { kind: 'owner', owner: o });
    const m = ownerMarks(question, o);
    marks.push({ ref, marks: m ?? null });
  };
  if (question.type === 'structured') {
    const sq = question as StructuredQuestion;
    if (!sq.parts.length) owner({ owner: 'question' }, 'm');
    sq.parts.forEach((p, part) => {
      owner({ owner: 'part', part }, `m${placeLabel({ owner: 'part', part })}`);
      (p.subParts ?? []).forEach((_s, sub) => owner({ owner: 'sub', part, sub }, `m${placeLabel({ owner: 'sub', part, sub })}`));
    });
  }
  const payload = { key, type: question.type, file, paper: texts, ...(marks.length ? { marks } : {}) };
  return { q, key, file, refs, payload, chars: chars + JSON.stringify(texts).length };
}

export function chunk(sent: Sent[]): Sent[][] {
  const out: Sent[][] = [];
  let current: Sent[] = [];
  let chars = 0;
  for (const s of sent) {
    if (current.length && (current.length >= MAX_CHUNK_QUESTIONS || chars + s.chars > MAX_CHUNK_CHARS)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(s);
    chars += s.chars;
  }
  if (current.length) out.push(current);
  return out;
}

export function buildRequest(sent: Sent[], deps: QualityDeps, signal: AbortSignal): CompletionRequest {
  return {
    system: SYSTEM_IMPORT_CHECK,
    turns: [{ role: 'user', content: JSON.stringify({ questions: sent.map((s) => s.payload) }) }],
    schema: IMPORT_CHECK_SCHEMA,
    maxOutputTokens: Math.min(deps.preset.outputCap, 1024 + 400 * sent.length + (deps.preset.family === 'gemini' ? 4096 : 0)),
    feature: 'importCheck',
    signal,
  };
}

export interface RawProposal {
  key: string;
  ref: string;
  issue: string;
  text: string;
  op: 'replace' | 'remove' | 'marks' | 'none';
  from: string;
  to: string;
  marks: number;
}

export function parseProposals(text: string): RawProposal[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const out: RawProposal[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.key !== 'string' || typeof r.text !== 'string' || !r.text.trim()) continue;
    const op = r.op === 'replace' || r.op === 'remove' || r.op === 'marks' ? r.op : 'none';
    out.push({
      key: r.key,
      ref: typeof r.ref === 'string' ? r.ref : '',
      issue: typeof r.issue === 'string' ? r.issue : 'other',
      text: r.text.trim().slice(0, 300),
      op,
      from: typeof r.from === 'string' ? r.from : '',
      to: typeof r.to === 'string' ? r.to : '',
      marks: typeof r.marks === 'number' ? r.marks : NaN,
    });
  }
  return out;
}

const bare = (text: string) => loose(text).replace(/[\p{P}\p{S}]/gu, '');

/**
 * The proposals that may be offered, as findings: each must name a question and ref that
 * were sent, and its edit must check out against the file and still apply to the paper.
 * A finding with no acceptable edit is kept only as a note when it names a sent ref.
 */
export function validateProposals(raw: readonly RawProposal[], sent: readonly Sent[], input: CheckInput): ImportFinding[] {
  const out: ImportFinding[] = [];
  const count = new Map<number, number>();
  const seen = new Set<string>();
  for (const p of raw) {
    const s = sent.find((x) => x.key.toLowerCase() === p.key.toLowerCase().trim());
    if (!s) continue;
    const ref = s.refs.get(p.ref.trim());
    if (!ref) continue;
    const dedupe = `${s.q}|${p.ref}|${p.op}|${p.from}|${p.to}|${p.marks}`;
    if (seen.has(dedupe) || (count.get(s.q) ?? 0) >= MAX_PER_QUESTION) continue;
    seen.add(dedupe);
    const file = bare(s.file.join(' '));
    const qref = input.refs[s.q];
    let op: CheckOp | undefined;
    let before: string | undefined;
    let after: string | undefined;
    if ((p.op === 'replace' || p.op === 'remove') && ref.kind !== 'owner' && p.from && ref.text.includes(p.from)) {
      const to = p.op === 'remove' ? '' : p.to;
      // New words must be the file's (no invention); removed words must not be (nothing of the file is taken out).
      const fromFile = to === '' || file.includes(bare(to));
      const notFile = to !== '' || !file.includes(bare(p.from));
      if (fromFile && notFile && to !== p.from) {
        op =
          ref.kind === 'block'
            ? { op: 'editText', at: { q: qref, list: ref.list, key: blockKey(ref.block) }, side: ref.side, from: p.from, to }
            : { op: 'editLine', q: qref, target: ref.target, side: ref.side, from: p.from, to };
        before = ref.text;
        after = ref.text.replace(p.from, to).replace(/\s{2,}/g, ' ').trim();
      }
    } else if (p.op === 'marks' && ref.kind === 'owner' && Number.isInteger(p.marks) && p.marks > 0) {
      const printed = s.file.join(' ').match(/\d{1,2}(?=\s*(?:marks?|m\b|分))|(?<=\[)\s*\d{1,2}(?=\s*m?\s*\])/gi)?.map((x) => Number(x.trim())) ?? [];
      const now = ownerMarks(input.paper[s.q], ref.owner);
      if (printed.includes(p.marks) && now !== null && now !== p.marks) {
        op = { op: 'setMarks', q: qref, owner: ref.owner, marks: p.marks, expect: now ?? null };
        before = now === undefined ? '—' : String(now);
        after = String(p.marks);
      }
    }
    if (op && !applyOp(input.paper, op)) op = undefined;
    // A finding with an edit that did not check out says only what it saw, with no fix.
    count.set(s.q, (count.get(s.q) ?? 0) + 1);
    const place = ref.kind === 'block' ? placeLabel(ref.list) : ref.kind === 'line' ? placeLabel(ref.target) : placeLabel(ref.owner);
    out.push({
      id: `ai:${s.q}:${p.ref}:${count.get(s.q)}`,
      kind: 'ai',
      q: s.q,
      place,
      params: { text: p.text, issue: p.issue },
      ...(op ? { fix: { op }, before, after } : {}),
      safe: false,
      from: 'ai',
    });
  }
  return out;
}

/** What went to the model, counted for the run's summary (k-0501). */
export interface AiChecked {
  questions: number;
  options: number;
  statements: number;
  /** Pictures and drawings: the model sees only where they are, never the image. */
  pictures: number;
  tables: number;
  /** Parts (or questions) whose marks were sent to compare with the file's. */
  marks: number;
}

export interface AiCheckOutcome {
  findings: ImportFinding[];
  total: number;
  failed: number;
  stopped: boolean;
  fatal?: AiErrorInfo;
  /** Questions answered by the model (total minus failed and not reached). */
  done: number;
  checked: AiChecked;
  /** Proposals the model made that named nothing sent (or past the per-question cap): never shown. */
  dropped: number;
  /** The last error that cost questions without stopping the run (timeout, connection). */
  lastError?: AiErrorInfo;
  /** Wall time of the run. */
  ms: number;
}

/** Counts what a run sends, for its summary. */
export function countChecked(sent: readonly Sent[]): AiChecked {
  const out: AiChecked = { questions: sent.length, options: 0, statements: 0, pictures: 0, tables: 0, marks: 0 };
  for (const s of sent) {
    for (const ref of s.refs.values()) {
      if (ref.kind === 'owner') out.marks++;
      else if (ref.kind === 'line' && ref.target.line === 'option') out.options++;
      else if (ref.kind === 'line') out.statements++;
    }
    const paper = (s.payload as { paper: Array<Record<string, unknown>> }).paper;
    for (const entry of paper) {
      if (entry.picture) out.pictures++;
      else if ('table' in entry) out.tables++;
    }
    // A drawing the import could not make is no picture on the paper, but the model is told it is there.
    out.pictures += s.file.filter((line) => line === '[drawing that could not be imported]').length;
  }
  return out;
}

/** Every question with an outline question, in chunks, to the model. Never rejects. */
export async function runAiCheck(
  input: CheckInput,
  deps: QualityDeps,
  signal: AbortSignal,
  onProgress: (done: number, total: number, batches: number) => void = () => {},
  only?: ReadonlySet<number>,
): Promise<AiCheckOutcome> {
  const sent = input.paper.flatMap((_q, q) => (only && !only.has(q) ? [] : (questionPayload(input, q, `q${q + 1}`) ?? [])));
  const queue = chunk(sent);
  const batches = queue.length;
  const findings: ImportFinding[] = [];
  const started = Date.now();
  let done = 0;
  let failed = 0;
  let dropped = 0;
  let answered = 0;
  let stopped = false;
  let fatal: AiErrorInfo | undefined;
  let lastError: AiErrorInfo | undefined;
  onProgress(0, sent.length, queue.length);
  const ask = async (part: Sent[], retried = false): Promise<void> => {
    if (signal.aborted) throw new AiError({ kind: 'cancelled', provider: deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
    const result = await deps.client.complete(buildRequest(part, deps, signal));
    const split = async () => {
      if (part.length === 1) {
        failed++;
        return;
      }
      const mid = Math.ceil(part.length / 2);
      await ask(part.slice(0, mid));
      await ask(part.slice(mid));
    };
    if (result.finish === 'length' || result.finish === 'safety') return split();
    const raw = parseProposals(result.text);
    if (!raw) return retried ? split() : ask(part, true);
    const valid = validateProposals(raw, part, input);
    dropped += raw.length - valid.length;
    answered += part.length;
    findings.push(...valid);
  };
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const part = queue.shift()!;
      try {
        await ask(part);
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) stopped = true;
        else if (isAiError(error) && error.info.fatal) fatal ??= error.info;
        else {
          failed += part.length;
          if (isAiError(error)) lastError = error.info;
        }
      }
      done += part.length;
      onProgress(done, sent.length, batches);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(deps.preset.concurrency, queue.length)) }, worker));
  return {
    findings: findings.sort((a, b) => a.q - b.q),
    total: sent.length,
    failed,
    stopped: stopped || signal.aborted,
    ...(fatal ? { fatal } : {}),
    done: answered,
    checked: countChecked(sent),
    dropped,
    ...(lastError ? { lastError } : {}),
    ms: Date.now() - started,
  };
}
