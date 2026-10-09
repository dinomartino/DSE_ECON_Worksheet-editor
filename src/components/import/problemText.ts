import type { Messages } from '@/i18n/catalogue';
import type { FileOutcome } from './fileImport';
import type { IMPORT_MESSAGES } from './messages';

type Text = Messages<typeof IMPORT_MESSAGES>;
type Problem = Extract<FileOutcome, { kind: 'problem' }>;

/**
 * Why a file is not reviewed, in a teacher's words. A scan with no text recognition here:
 * on the web, the desktop app reads it; in a desktop app without the engine, update it.
 */
export function problemText(m: Text, outcome: Problem, desktop: boolean): string {
  switch (outcome.problem) {
    case 'scan':
      if (desktop) return m.problemNoOcr;
      return outcome.pictures ? m.problemPictures(outcome.pictures) : m.problemScan(outcome.pages ?? 0);
    case 'legacyDoc':
      return m.problemLegacyDoc;
    case 'encrypted':
      return m.problemEncrypted;
    case 'notPaper':
      return m.problemNotPaper;
    case 'unreadable':
      return m.problemUnreadable;
    case 'stopped':
      return m.problemStopped;
    case 'ocrFailed':
      return m.problemOcrFailed;
    case 'picture':
      return m.problemPicture;
  }
}
