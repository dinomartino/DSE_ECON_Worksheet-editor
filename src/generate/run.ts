import { aiErrorInfo, mapThrown } from '@/ai/errors';
import { buildSourceRequest } from './prompt';
import { sourceSideOf } from './recipe';
import type { GenerateDeps, GenerateInput, GenerateOutcome, GeneratedItem, ItemDraft } from './types';
import { checkDraft, draftOf, isCombination, parseSourceReply, type CheckContext } from './validate';

/**
 * One request → checked items. Pure over injected deps (like `src/translate/run.ts`):
 * never rejects, honours the signal, and never repairs — a failed item is reported, not
 * retried, so a click costs one request.
 */
export async function generateFromSource(input: GenerateInput, deps: GenerateDeps, signal: AbortSignal): Promise<GenerateOutcome> {
  const provider = deps.preset.id;
  const sourceSide = sourceSideOf(input.source);
  let text: string;
  let model: string;
  try {
    const res = await deps.client.complete(buildSourceRequest(input, deps.glossary, sourceSide, deps.preset, signal));
    if (res.finish === 'length') return { ok: false, error: aiErrorInfo('truncated', provider) };
    if (res.finish === 'safety') return { ok: false, error: aiErrorInfo('safety', provider) };
    text = res.text;
    model = res.model;
  } catch (error) {
    return { ok: false, error: mapThrown(provider, error, signal.aborted ? 'user' : null) };
  }
  if (signal.aborted) return { ok: false, error: aiErrorInfo('cancelled', provider) };
  const raw = parseSourceReply(text);
  if (!raw) return { ok: false, error: aiErrorInfo('badOutput', provider) };

  const ctx: CheckContext = { sides: input.sides, source: input.source, sourceSide, recipe: input.recipe, glossary: deps.glossary };
  const drafts = raw.map(draftOf);
  const pick = (kind: ItemDraft['kind'], count: number) => drafts.filter((d): d is ItemDraft => d?.kind === kind).slice(0, count);
  const mcqs = pick('mcq', input.recipe.mcq);
  const structured = pick('structured', input.recipe.structured);

  let key = 0;
  const item = (draft: ItemDraft, label: string): GeneratedItem => {
    key += 1;
    const checked = checkDraft(draft, ctx);
    if (checked.fails.length) return { key: `g${key}`, label, status: 'failed', notes: checked.fails };
    return { key: `g${key}`, label, status: checked.looks.length ? 'look' : 'ok', draft: checked.draft, notes: checked.looks };
  };
  const items = [
    ...mcqs.map((d, i) => item(d, `MCQ ${i + 1}`)),
    ...structured.map((d, i) => item(d, structured.length > 1 ? `Structured question ${i + 1}` : 'Structured question')),
  ];

  const notes: string[] = [];
  if (mcqs.length < input.recipe.mcq) notes.push(`Asked for ${input.recipe.mcq} MCQs; the reply had ${mcqs.length}.`);
  if (structured.length < input.recipe.structured) notes.push('The reply had no structured question.');
  const combinations = items.filter((i) => i.status !== 'failed' && isCombination(i.draft)).length;
  if (input.recipe.combination && combinations < input.recipe.combination) notes.push('No combination-statement item came back.');
  return { ok: true, items, notes, sourceSide, model };
}
