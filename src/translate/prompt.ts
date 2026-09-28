import { ITEMS_SCHEMA } from '@/ai/schema';
import type { ChatTurn, CompletionRequest, ProviderPreset } from '@/ai/types';
import type { Glossary } from '@/glossary/types';
import { plain } from '@/model/text';
import { CONVENTIONS } from './conventions';
import { FEWSHOT_TO_EN, FEWSHOT_TO_ZH, REPAIR_LINE, SYSTEM_TO_EN, SYSTEM_TO_ZH } from './promptText';
import type { Chunk, Direction, PromptPayload, TranslationJob } from './types';
import { encodeRuns, type WireCodec } from './wire';

/**
 * Message layout: a static system prompt and few-shot pair (identical across calls, so
 * provider prefix caches reuse them), then one JSON payload per chunk with its pins.
 */

/** Stamped into eval reports; bump with any rendered-prompt change (a test pins the sha). */
export const PROMPT_VERSION = 'e2.1';

export function systemPrompt(direction: Direction, repair = false): string {
  const base =
    direction === 'toZh'
      ? SYSTEM_TO_ZH.replace('{CONVENTIONS}', CONVENTIONS.map((row) => row.promptLine).join('; '))
      : SYSTEM_TO_EN;
  return repair ? `${base}\n\n${REPAIR_LINE}` : base;
}

export function fewShotTurns(direction: Direction): ChatTurn[] {
  const shot = direction === 'toZh' ? FEWSHOT_TO_ZH : FEWSHOT_TO_EN;
  return [
    { role: 'user', content: JSON.stringify(shot.user) },
    { role: 'assistant', content: JSON.stringify({ items: shot.model }) },
  ];
}

const encoded = new WeakMap<TranslationJob, { wire: string; codec: WireCodec }>();
/** The job's wire text and codec, encoded once. */
export function wireFor(job: TranslationJob): { wire: string; codec: WireCodec } {
  let hit = encoded.get(job);
  if (!hit) {
    hit = encodeRuns(job.source);
    encoded.set(job, hit);
  }
  return hit;
}

export type RepairNotes = ReadonlyMap<string, { previous: string; fix: string[] }>;

export function buildPayload(
  chunk: Chunk,
  jobs: ReadonlyMap<string, TranslationJob>,
  glossary: Glossary | null,
  preset: ProviderPreset,
  repair?: RepairNotes,
): PromptPayload {
  const groups = chunk.groups
    .map((group) => ({
      where: group.where,
      context: group.context,
      items: group.jobKeys
        .filter((key) => !repair || repair.has(key))
        .map((key) => {
          const job = jobs.get(key)!;
          const notes = repair?.get(key);
          return {
            key,
            kind: job.kind,
            text: wireFor(job).wire,
            ...(job.note ? { note: job.note } : {}),
            ...(notes ? { previous: notes.previous, fix: notes.fix } : {}),
          };
        }),
    }))
    .filter((group) => group.items.length > 0);
  const sources = groups.flatMap((group) => group.items.map((item) => plain(jobs.get(item.key)!.source)));
  const pins = glossary?.pin(sources, chunk.direction, { denyHints: preset.denyHintsInPrompt }) ?? [];
  return { task: repair ? 'repair' : 'translate', glossary: pins.map((pin) => pin.line), groups };
}

/** min(cap, 1024 + source × (1.6 to 中文 | 2.6 to English) + a thinking allowance). */
export function maxOutputTokens(sourceChars: number, direction: Direction, preset: ProviderPreset): number {
  const thinking = preset.family === 'gemini' ? 4096 : 0;
  return Math.min(preset.outputCap, 1024 + Math.ceil(sourceChars * (direction === 'toZh' ? 1.6 : 2.6)) + thinking);
}

export function buildRequest(
  chunk: Chunk,
  jobs: ReadonlyMap<string, TranslationJob>,
  glossary: Glossary | null,
  preset: ProviderPreset,
  signal: AbortSignal,
  repair?: RepairNotes,
): CompletionRequest {
  const payload = buildPayload(chunk, jobs, glossary, preset, repair);
  const chars = payload.groups.reduce(
    (n, group) => n + group.items.reduce((m, item) => m + plain(jobs.get(item.key)!.source).length, 0),
    0,
  );
  return {
    system: systemPrompt(chunk.direction, Boolean(repair)),
    turns: [...fewShotTurns(chunk.direction), { role: 'user', content: JSON.stringify(payload) }],
    schema: ITEMS_SCHEMA,
    maxOutputTokens: maxOutputTokens(chars, chunk.direction, preset),
    signal,
  };
}
