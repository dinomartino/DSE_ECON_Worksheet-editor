import { loadGlossary } from '@/glossary/load';
import { appSettings } from '@/settings/store';
import { parseTermsCsv, termsToCsv } from '@/settings/termsCsv';
import { TERM_SETTINGS } from '@/settings/termPreferences';
import { applyImport, previewImport } from './termsImport';
import { EMPTY_PREFERENCES, full } from './termRows';

/**
 * Translation terms in the app backup: the same CSV as Export, so a teacher's own wordings
 * and terms survive a new computer. Restore only merges: what is new is added, the
 * teacher's current choices win, nothing is removed.
 */

/** The CSV to put in a backup, or undefined when the teacher has nothing of their own. */
export function backupTermsCsv(): string | undefined {
  const prefs = full(appSettings.read(TERM_SETTINGS));
  const any =
    Object.keys(prefs.choices).length + Object.keys(prefs.own).length + Object.keys(prefs.terms).length + Object.keys(prefs.related).length;
  return any ? termsToCsv(prefs) : undefined;
}

/** Merges a backup's CSV into Settings; resolves to the rows added (0 on any failure). */
export async function restoreTermsCsv(csv: string): Promise<number> {
  try {
    const parsed = parseTermsCsv(csv);
    if ('error' in parsed) return 0;
    const base = await loadGlossary(EMPTY_PREFERENCES);
    const rows = new Map(base.terms.filter((t) => !t.custom).map((t) => [t.en, t]));
    const current = full(appSettings.read(TERM_SETTINGS));
    const preview = previewImport(parsed.rows, rows, base.edbKeyFor, current);
    if (!preview.counts.add) return 0;
    appSettings.write(TERM_SETTINGS, applyImport(preview, current, 'merge'));
    return preview.counts.add;
  } catch {
    return 0;
  }
}
