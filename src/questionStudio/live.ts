import { aiErrorInfo } from '@/ai/errors';
import { usePastPaperBank } from '@/pastpapers/bank';
import { bankRowsNow } from '@/library/useBank';
import { readAiStatus } from '@/settings/aiSettings';
import { paperLanguage } from '@/settings/paperLanguage';
import { studioCorpus, type PastRow } from './corpus';
import { createStudioSession, type StudioEnv } from './session';

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

export const liveEnv: StudioEnv = {
  async resolve() {
    const provider = readAiStatus().provider;
    try {
      const { createRunDeps } = await import('@/translate/deps');
      const resolved = await createRunDeps();
      if (!resolved.ok) return { ok: false, error: aiErrorInfo('notConfigured', resolved.provider) };
      const corpus = studioCorpus(await pastRows(), await bankRowsNow());
      const { client, preset, glossary } = resolved.deps;
      return { ok: true, deps: { client, preset, glossary, corpus: corpus.index }, compared: { past: corpus.past, mine: corpus.mine } };
    } catch {
      // Settings or the key store could not be read: the same way out as a missing key.
      return { ok: false, error: aiErrorInfo('notConfigured', provider) };
    }
  },
};

/** The app's one studio session. */
export const useStudio = createStudioSession(liveEnv, typeof window === 'undefined' ? 'en' : paperLanguage());
