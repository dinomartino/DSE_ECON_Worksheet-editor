import { onLightFallback } from '@/ai/lightJobs';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { notify, type NoticeInput } from '@/store/notices';
import { AI_UI_MESSAGES } from './messages';

/**
 * Own Gemini key with Flash-Lite for simple jobs on (u-zso2): when Google refuses the light
 * model, the call already ran on the chosen model (`ai/client.ts`); this says so, once a session.
 * The app's notice stack sits under a dialog's scrim, so while Settings → AI is open (its Test is
 * a light job) the notice goes to the dialog's own stack (`useLightFallbackNoticeHere`).
 */
let shown = false;
const here: Array<(input: NoticeInput) => unknown> = [];

export function startLightFallbackNotice(): () => void {
  return onLightFallback(() => {
    if (shown) return;
    shown = true;
    const input: NoticeInput = { id: 'gemini-light-fallback', tone: 'info', body: resolveMessages(AI_UI_MESSAGES, uiLanguage()).lightFallback };
    const local = here.at(-1);
    if (local) local(input);
    else notify(input);
  });
}

/** While mounted, the notice is raised through `raise` (a dialog's `useNotices().notify`). Returns the release. */
export function routeLightFallbackNotice(raise: (input: NoticeInput) => unknown): () => void {
  here.push(raise);
  return () => {
    const i = here.lastIndexOf(raise);
    if (i >= 0) here.splice(i, 1);
  };
}

/** For tests: show it again. */
export function resetLightFallbackNotice(): void {
  shown = false;
  here.length = 0;
}
