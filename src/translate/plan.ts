import { isSymbolOnly } from '@/model/symbols';
import { isRichTextEmpty, normalizeRuns, plain } from '@/model/text';
import { missingSide, type Side, type SlotKind, type TextPath, type TextSlot, type TranslationWrite } from '@/model/textSlots';
import { collectTexts, wordedLabel } from '@/model/textWalk';
import type { OutputMode, Worksheet } from '@/model/types';
import type {
  Chunk,
  ContextPair,
  Direction,
  PlanCounts,
  TranslateOptions,
  TranslateScope,
  TranslationJob,
  TranslationPlan,
} from './types';
import { encodeRuns, SHORT_KINDS } from './wire';

/**
 * Planning: which slots go, in which direction, deduped into jobs and packed into
 * single-direction chunks with same-group context. Pure; the editor mode never decides
 * direction.
 */

export const CHUNK_CHARS = 4000;
export const CHUNK_JOBS = 60;
export const CONTEXT_CHARS = 1200;

const HEADING_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>(['title', 'heading', 'sectionHeading', 'partHeader']);
const kindClass = (kind: SlotKind) => (SHORT_KINDS.has(kind) || HEADING_KINDS.has(kind) ? 'short' : 'prose');

export function slotInScope(slot: TextSlot, scope: TranslateScope): boolean {
  switch (scope.kind) {
    case 'paper':
      return true;
    case 'questions':
      return slot.questionId !== undefined && scope.ids.includes(slot.questionId);
    case 'flowItems':
      return slot.flowId !== undefined && scope.ids.includes(slot.flowId);
    case 'paths':
      return scope.paths.includes(slot.path);
    case 'block':
      return slot.blockIds.includes(scope.blockId) && (scope.questionId === undefined || slot.questionId === scope.questionId);
  }
}

/** Both directions, diagram labels on; teacher text from the remembered setting; symbol
 *  copies on only for the side this edition prints alone. */
export function defaultTranslateOptions(
  mode: OutputMode,
  includeTeacherText: boolean,
  retranslate?: Side,
): TranslateOptions {
  return {
    directions: { toZh: true, toEn: true },
    includeTeacher: includeTeacherText,
    includeDiagramLabels: true,
    copySymbols: { toZh: mode.language === 'zh', toEn: mode.language === 'en' },
    ...(retranslate ? { retranslate } : {}),
  };
}

function groupKeyOf(slot: TextSlot): string {
  const { kind, id } = slot.group;
  if (kind === 'question') return `q:${id}`;
  if (kind === 'layout') return `l:${id}`;
  return kind;
}

const whereOf = (slot: TextSlot) => [slot.group.label, slot.label].filter(Boolean).join(' · ');
const noteOf = (slot: TextSlot) =>
  slot.kind === 'wording' && slot.aroundValue ? `printed ${slot.aroundValue} a value the app fills in` : undefined;
/** Alt text ('meta') never: the ✦ AI badge doesn't count it; its field has its own Fill. */
const roleAllowed = (slot: TextSlot, options: TranslateOptions) =>
  slot.role === 'print' || (slot.role === 'teacher' && options.includeTeacher);
const both = (slot: TextSlot) => !isRichTextEmpty(slot.text.en) && !isRichTextEmpty(slot.text.zh);

function emptyCounts(): PlanCounts {
  return {
    toZh: 0, toEn: 0, teacher: 0, diagramLabels: 0, symbols: { toZh: 0, toEn: 0 },
    copied: 0, replaceable: 0, contextLines: 0, chars: 0, requests: 0,
  };
}

/** Pure core: testable with hand-built slots. */
export function planFromSlots(
  worksheetId: string,
  slots: readonly TextSlot[],
  scope: TranslateScope,
  options: TranslateOptions,
): TranslationPlan {
  const counts = emptyCounts();
  const jobs = new Map<string, TranslationJob>();
  const byKey = new Map<string, TranslationJob>();
  const copies: TranslationWrite[] = [];
  const wordedPaths = new Map<TextPath, string>();
  const inJobs = new Set<TextSlot>();
  const groupOrder: string[] = [];
  const groupWhere = new Map<string, string>();

  for (const slot of slots) {
    if (!slotInScope(slot, scope) || slot.unprinted || !roleAllowed(slot, options)) continue;
    if (slot.fallsBack && !options.includeDiagramLabels) continue;
    if (scope.kind !== 'paper' && both(slot)) counts.replaceable += 1;
    let target = missingSide(slot.text);
    let replacing = false;
    if (!target && options.retranslate && scope.kind !== 'paper' && both(slot)) {
      target = options.retranslate;
      replacing = true;
    }
    if (!target) continue;
    const direction: Direction = target === 'zh' ? 'toZh' : 'toEn';
    if (!options.directions[direction]) continue;
    const sourceSide: Side = target === 'zh' ? 'en' : 'zh';
    const source = normalizeRuns(slot.text[sourceSide]);
    const planned = { path: slot.path, side: target, sourceSnapshot: slot.text[sourceSide], targetSnapshot: slot.text[target] };

    if (isSymbolOnly(source)) {
      // Re-translating never copies a symbol over text the teacher already has ('2024年').
      if (replacing) continue;
      // DWL, TR on an area: the glossary's term, filled in by `writesFor`.
      const worded = direction === 'toZh' ? wordedLabel(slot, source) : undefined;
      if (worded) {
        copies.push({ ...planned, next: source.map((run) => ({ ...run })) });
        wordedPaths.set(slot.path, worded);
        counts.copied += 1;
        continue;
      }
      // Diagram text falls back and de-duplicates in the renderer: never copied, nor counted.
      if (slot.fallsBack) continue;
      counts.symbols[direction] += 1;
      if (options.copySymbols[direction]) {
        copies.push({ ...planned, next: source.map((run) => ({ ...run })) });
        counts.copied += 1;
      }
      continue;
    }

    counts[direction] += 1;
    if (slot.role !== 'print') counts.teacher += 1;
    if (slot.fallsBack) counts.diagramLabels += 1;
    inJobs.add(slot);
    const dedupe = [direction, kindClass(slot.kind), slot.aroundValue ?? '', JSON.stringify(source)].join('|');
    const existing = byKey.get(dedupe);
    if (existing) {
      existing.slots.push(planned);
      continue;
    }
    const groupKey = groupKeyOf(slot);
    if (!groupWhere.has(groupKey)) {
      groupOrder.push(groupKey);
      groupWhere.set(groupKey, slot.group.label);
    }
    const note = noteOf(slot);
    const job: TranslationJob = {
      key: `t${jobs.size + 1}`,
      direction,
      kind: slot.kind,
      ...(slot.aroundValue ? { aroundValue: slot.aroundValue } : {}),
      groupKey,
      where: whereOf(slot),
      ...(note ? { note } : {}),
      source,
      slots: [planned],
      replacing,
    };
    jobs.set(job.key, job);
    byKey.set(dedupe, job);
  }

  const context = contextByGroup(slots, groupOrder, inJobs, options);
  const chunks = packChunks(jobs, groupOrder, groupWhere, context);
  counts.contextLines = [...context.values()].reduce((n, pairs) => n + pairs.length, 0);
  counts.chars = [...jobs.values()].reduce((n, job) => n + plain(job.source).length, 0);
  counts.requests = chunks.length;
  return { worksheetId, scope, options, jobs, copies, ...(wordedPaths.size ? { worded: wordedPaths } : {}), chunks, counts };
}

/** Already-bilingual lines of the same group, wire-encoded, in reading order, capped. */
function contextByGroup(
  slots: readonly TextSlot[],
  groups: readonly string[],
  inJobs: ReadonlySet<TextSlot>,
  options: TranslateOptions,
): Map<string, ContextPair[]> {
  const out = new Map<string, ContextPair[]>(groups.map((key) => [key, []]));
  const used = new Map<string, number>();
  for (const slot of slots) {
    const key = groupKeyOf(slot);
    const pairs = out.get(key);
    if (!pairs || inJobs.has(slot) || slot.unprinted || !roleAllowed(slot, options) || !both(slot)) continue;
    if (slot.fallsBack && !options.includeDiagramLabels) continue;
    const pair = { en: encodeRuns(slot.text.en).wire, zh: encodeRuns(slot.text.zh).wire };
    if (pair.en === pair.zh) continue;
    const size = (used.get(key) ?? 0) + pair.en.length + pair.zh.length;
    if (size > CONTEXT_CHARS) continue;
    used.set(key, size);
    pairs.push(pair);
  }
  return out;
}

/** Single-direction chunks in reading order; a group splits, at job boundaries, only when
 *  it alone exceeds the cap (each piece carries the group's context). */
function packChunks(
  jobs: ReadonlyMap<string, TranslationJob>,
  groups: readonly string[],
  where: ReadonlyMap<string, string>,
  context: ReadonlyMap<string, ContextPair[]>,
): Chunk[] {
  const chunks: Chunk[] = [];
  const chars = (keys: readonly string[]) => keys.reduce((n, key) => n + plain(jobs.get(key)!.source).length, 0);
  const jobCount = (chunk: Chunk) => chunk.groups.reduce((n, g) => n + g.jobKeys.length, 0);
  for (const direction of ['toZh', 'toEn'] as const) {
    let current: Chunk | null = null;
    for (const groupKey of groups) {
      const keys = [...jobs.values()].filter((j) => j.direction === direction && j.groupKey === groupKey).map((j) => j.key);
      const pieces: string[][] = [];
      for (const key of keys) {
        const last = pieces[pieces.length - 1];
        if (last && last.length < CHUNK_JOBS && chars([...last, key]) <= CHUNK_CHARS) last.push(key);
        else pieces.push([key]);
      }
      for (const piece of pieces) {
        const size = chars(piece);
        if (current && (current.sourceChars + size > CHUNK_CHARS || jobCount(current) + piece.length > CHUNK_JOBS)) {
          chunks.push(current);
          current = null;
        }
        current ??= { id: `c${chunks.length + 1}`, direction, groups: [], sourceChars: 0 };
        current.groups.push({ groupKey, where: where.get(groupKey) ?? '', context: context.get(groupKey) ?? [], jobKeys: piece });
        current.sourceChars += size;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

/** = planFromSlots(ws.id, collectTexts(ws), …). */
export function planTranslation(ws: Worksheet, scope: TranslateScope, options: TranslateOptions): TranslationPlan {
  return planFromSlots(ws.id, collectTexts(ws), scope, options);
}
