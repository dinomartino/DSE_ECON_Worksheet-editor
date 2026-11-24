import { aiErrorInfo } from '@/ai/errors';
import { usePastPaperBank } from '@/pastpapers/bank';
import { bankRowsNow } from '@/library/useBank';
import { readAiStatus } from '@/settings/aiSettings';
import { paperLanguage } from '@/settings/paperLanguage';
import { studioCorpus, type PastRow } from './corpus';
import { autoReferencesOn } from './options';
import { findReferences, type ReferenceBank } from './references';
import { createStudioSession, type StudioEnv } from './session';
import { createTrialLog, MINE } from './trialLog';
import { createBriefRunner } from './trialRun';

/**
 * The studio's session wired to the app: the provider from Settings (`createRunDeps`, the
 * same door every ✦ run uses, loaded on the first Write), the glossary, and a corpus of
 * the Past paper bank's search index and the teacher's own questions (`bankRowsNow`, the library index read when a run starts). The engine and the
 * provider layer load on the first Write, not with the screen.
 */

/** The bank's questions as words, from its list (read once per source; offline it is the kept copy). */
async function pastRows(): Promise<PastRow[] | undefined> {
  const bank = usePastPaperBank.getState();
  await bank.open().catch(() => undefined);
  return usePastPaperBank.getState().manifest?.search;
}

/** The app's Past paper bank as the reference finder reads it. */
export const liveBank: ReferenceBank = {
  open: () => usePastPaperBank.getState().open(),
  manifest: () => usePastPaperBank.getState().manifest,
  items: async (topicId) => {
    const state = await usePastPaperBank.getState().topic(topicId);
    return state?.state === 'ready' ? state.data.items : undefined;
  },
};

export const liveEnv: StudioEnv = {
  figures: async (examples) => (await import('./figures')).withFigures(examples),
  async localChecks() {
    // No provider: the glossary and the corpus only (an edit never reaches the AI, k-0530).
    const [glossary, corpus] = await Promise.all([
      import('@/glossary/load').then(({ loadGlossary }) => loadGlossary()).catch(() => null),
      Promise.all([pastRows(), bankRowsNow()]).then(([past, mine]) => studioCorpus(past, mine).index).catch(() => null),
    ]);
    return { glossary, corpus };
  },
  references: (request, signal) => (autoReferencesOn() ? findReferences(request, liveBank, { signal }) : Promise.resolve([])),
  async resolve() {
    const provider = readAiStatus().provider;
    try {
      const { createRunDeps } = await import('@/translate/deps');
      const resolved = await createRunDeps();
      if (!resolved.ok) return { ok: false, error: aiErrorInfo('notConfigured', resolved.provider) };
      const corpus = studioCorpus(await pastRows(), await bankRowsNow());
      const { client, preset, glossary } = resolved.deps;
      return { ok: true, deps: { client, preset, glossary, corpus: corpus.index, diagrams: true }, compared: { past: corpus.past, mine: corpus.mine } };
    } catch {
      // Settings or the key store could not be read: the same way out as a missing key.
      return { ok: false, error: aiErrorInfo('notConfigured', provider) };
    }
  },
};

/** The trial's record (`trialLog.ts`): kept on this computer, so a long reading survives a reload. */
export const useTrialLog = createTrialLog();

/** The 30 invented briefs' run, over the same provider and corpus as Write; its drafts go to the record only. */
export const useBriefRun = createBriefRunner(liveEnv, useTrialLog);

/** The app's one studio session; every request the teacher makes in it goes into the trial's record, as theirs. */
export const useStudio = createStudioSession(liveEnv, typeof window === 'undefined' ? 'en' : paperLanguage(), {
  onRun: (info) => useTrialLog.getState().record({ label: MINE, ...info }),
});
