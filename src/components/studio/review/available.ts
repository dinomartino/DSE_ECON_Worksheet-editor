import { RELEASE_BUILD } from '@/platform/buildChannel';
import { isDesktop } from '@/platform';

/**
 * Where the studio's review tools show and record (k-0598): a develop build only, never a
 * release build (u-u4av; the same channel switch as the studio itself, `questionStudio/
 * trial.ts`), and only in the desktop app (u-5fy1). A browser on a develop build shows them
 * only when this computer's storage holds `REVIEW_WEB_KEY` = `1`: the screenshot scripts set it,
 * no teacher ever sees it (a release build ignores it).
 */
export const REVIEW_WEB_KEY = 'econgen.studioReview.web';

const webAsked = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(REVIEW_WEB_KEY) === '1';
  } catch {
    return false;
  }
};

export function reviewAvailable(release: boolean = RELEASE_BUILD, desktop: boolean = isDesktop(), web: () => boolean = webAsked): boolean {
  return !release && (desktop || web());
}
