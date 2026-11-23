import type { ReportLanguage } from './language';

/**
 * The language a teacher last downloaded a coverage report in (k-0503). Remembered on this
 * device only, for the next download; until there is one, a report starts in the paper's
 * language. Not stored with the paper: the choice is the reader's, not the document's.
 */
export const REPORT_LANGUAGE_KEY = 'econ-coverage-report-language';

export function readReportLanguage(fallback: ReportLanguage): ReportLanguage {
  try {
    const value = window.localStorage.getItem(REPORT_LANGUAGE_KEY);
    return value === 'en' || value === 'zh' ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeReportLanguage(language: ReportLanguage): void {
  try {
    window.localStorage.setItem(REPORT_LANGUAGE_KEY, language);
  } catch {
    // Private mode or blocked storage: the choice just doesn't outlive the visit.
  }
}
