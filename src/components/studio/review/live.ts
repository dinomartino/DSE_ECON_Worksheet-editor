import { reviewAvailable } from './available';
import { createRecorder } from './recorder';
import { sharedReviewStore } from './reviewStore';

/**
 * The app's one review recorder (k-0598), shared by the studio's chats and the ✦ Write panel's.
 * Built on first use, never at load (the static build prerenders these modules, k-0551).
 */
let recorder: ReturnType<typeof createRecorder> | undefined;
export const reviewRecorder = () => (recorder ??= createRecorder({ store: sharedReviewStore(), on: () => reviewAvailable() }));

/** The recorder as the chat store's `trace` dep: nothing is built until a reply asks. */
export const liveTrace = {
  on: () => reviewAvailable(),
  begin: (chatId: string, turnId: string) => reviewRecorder().begin(chatId, turnId),
  event: (...args: Parameters<ReturnType<typeof createRecorder>['event']>) => reviewRecorder().event(...args),
  client: (...args: Parameters<ReturnType<typeof createRecorder>['client']>) => reviewRecorder().client(...args),
  end: (chatId: string, turnId: string) => reviewRecorder().end(chatId, turnId),
  forget: (chatId: string) => {
    if (reviewAvailable()) reviewRecorder().forget(chatId);
  },
};
