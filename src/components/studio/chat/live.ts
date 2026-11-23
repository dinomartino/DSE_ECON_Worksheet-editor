import { liveEnv, useTrialLog } from '@/questionStudio/live';
import { MINE } from '@/questionStudio/trialLog';
import { paperLanguage } from '@/settings/paperLanguage';
import { localChatStorage } from './chatStorage';
import { createChatStore } from './chatStore';
import { liveEngine } from './engine';

/**
 * The app's one chat studio: the provider and libraries of the studio's live environment
 * (`liveEnv`), the engine behind `engine.ts`'s seam, chats kept in this browser's storage, and
 * every request recorded for the Trial kit (Settings → AI) as the teacher's own.
 */
export const useChat = createChatStore({
  env: liveEnv,
  engine: liveEngine,
  storage: localChatStorage(),
  language: () => (typeof window === 'undefined' ? 'en' : paperLanguage()),
  onRun: (info) => useTrialLog.getState().record({ label: MINE, ...info }),
});
