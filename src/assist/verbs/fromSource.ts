import { aiErrorInfo } from '@/ai/errors';
import { recipeFor, sidesFor } from '@/generate/recipe';
import { MIN_SOURCE_CHARS, type GenerateDeps, type Recipe } from '@/generate/types';
import { computeNumbering } from '@/model/numbering';
import { useWorksheetStore } from '@/store/worksheetStore';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import { sideName } from './translateShared';
import type { AiVerb, ReviewItem, VerbInput, VerbOutcome } from '../types';

/**
 * E3 "Questions from a source…": the teacher's pasted source → HKDSE items for this
 * paper (`recipeFor`), inserted directly at the insertion anchor as one commit. Failed
 * items are reported, never inserted. The engine and the provider load on the first run.
 */

type ResolveDeps = () => Promise<{ ok: true; deps: GenerateDeps } | { ok: false; provider: GenerateDeps['preset']['id'] }>;

const defaultDeps: ResolveDeps = async () => {
  const { createRunDeps } = await import('@/translate/deps');
  const resolved = await createRunDeps();
  return resolved.ok ? { ok: true, deps: resolved.deps } : { ok: false, provider: resolved.provider };
};

function makes(recipe: Recipe): string {
  const m = assistMessages();
  const mcq = recipe.mcq ? m.makesMcq(recipe.mcq) : '';
  const structured = recipe.structured ? m.makesStructured(recipe.structured) : '';
  return [mcq, structured].filter(Boolean).join(m.makesJoin);
}

export function makeFromSourceVerb(resolveDeps: ResolveDeps = defaultDeps): AiVerb {
  return {
    id: 'create.fromSource',
    group: 'create',
    order: 10,
    label: () => assistMessages().fromSourceLabel,
    available: () => ({}),
    needsKey: true,
    sendsLine: (ctx, providerLabel) => assistMessages().sendsSource(providerLabel, makes(recipeFor(ctx.worksheet))),
    get input(): VerbInput {
      const m = assistMessages();
      return { kind: 'text' as const, label: m.pasteSource, placeholder: m.sourcePlaceholder, minChars: MIN_SOURCE_CHARS };
    },

    async run(ctx, io, input): Promise<VerbOutcome> {
      const m = assistMessages();
      const source = (input ?? '').trim();
      if (source.length < MIN_SOURCE_CHARS) return { kind: 'nothing', summary: m.pasteAtLeast(MIN_SOURCE_CHARS) };
      const resolved = await resolveDeps();
      if (!resolved.ok) return { kind: 'error', error: aiErrorInfo('notConfigured', resolved.provider) };
      const recipe = recipeFor(ctx.worksheet);
      // The engine loads on the first run, not with the menu.
      const [{ generateFromSource }, { buildBatch }] = await Promise.all([import('@/generate/run'), import('@/generate/build')]);
      io.progress(0, 1, m.writingFromSource);
      const outcome = await generateFromSource({ source, recipe, sides: sidesFor(ctx.mode.language) }, resolved.deps, io.signal);
      if (!outcome.ok) {
        return outcome.error.kind === 'cancelled' ? { kind: 'nothing', summary: m.stoppedNothingAdded } : { kind: 'error', error: outcome.error };
      }
      if (io.signal.aborted) return { kind: 'nothing', summary: m.stoppedNothingAdded };
      io.progress(1, 1);

      const failed: ReviewItem[] = outcome.items
        .filter((item) => item.status === 'failed')
        .map((item) => ({ id: `fromSource:${item.key}`, tone: 'failed', where: item.label, notes: [...item.notes, m.notAdded] }));
      const batch = buildBatch(outcome.items, recipe, source, outcome.sourceSide);
      if (!batch.builds.length) {
        return { kind: 'findings', summary: m.noneAdded, items: failed };
      }

      const store = useWorksheetStore.getState();
      const report = store.insertQuestionBatch(batch.builds.map((b) => b.build), { worksheetId: ctx.worksheet.id, lead: batch.lead });
      if (!report.ok) return { kind: 'nothing', summary: m.notAddedChanged };

      const { committed, questionIds } = report;
      const numbers = computeNumbering(committed).byQuestionId;
      const byKey = new Map(outcome.items.map((item) => [item.key, item]));
      const inserted: ReviewItem[] = batch.builds.map(({ key }, i) => {
        const item = byKey.get(key)!;
        const n = numbers.get(questionIds[i])?.number;
        return {
          id: `fromSource:${key}`,
          tone: item.status === 'look' ? 'look' : 'inserted',
          questionId: questionIds[i],
          where: n === undefined ? item.label : m.questionN(n),
          notes: item.notes,
        };
      });
      const batchNotes = [...outcome.notes];
      const printsOther = sidesFor(ctx.mode.language).some((side) => side !== outcome.sourceSide);
      if (printsOther) batchNotes.push(m.sourceKept(sideName(outcome.sourceSide)));
      const summaryItem: ReviewItem[] = batchNotes.length
        ? [{ id: 'fromSource:batch', tone: 'look', questionId: questionIds[0], where: m.fromYourSource, notes: batchNotes }]
        : [];

      const live = () => useWorksheetStore.getState().worksheet === committed;
      const added = questionIds.length;
      return {
        kind: 'inserted',
        summary: m.addedQuestions(added, failed.length),
        items: [...inserted, ...summaryItem, ...failed],
        undo: { run: () => { if (live()) useWorksheetStore.getState().undo(); }, live },
        showTeacher: true,
      };
    },
  };
}

registerVerb(makeFromSourceVerb());
