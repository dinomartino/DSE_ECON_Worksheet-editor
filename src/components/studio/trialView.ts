import type { Side } from '@/model/textSlots';
import type { TopicNames } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import type { SheetDraft } from '@/questionStudio/session';
import { isBriefLabel, isMarked, type TrialDraft, type TrialRun } from '@/questionStudio/trialLog';
import { lookupCode } from '@/syllabus';
import { syllabusName } from './studioView';

/** The trial kit's pure half: what its list holds, in what order, and how a recorded draft is drawn. */

export type ListFilter = 'todo' | 'all' | 'briefs' | 'mine';

export interface ListItem {
  run: TrialRun;
  entry: TrialDraft;
}

/**
 * The drafts to read: only those the studio showed (a hard check's failure was never offered),
 * the teacher's own requests first, newest first (what they have just written), then the
 * invented briefs B01, B02… in order. `todo` leaves out the drafts with both marks given, so
 * the top of the list is always the next one to mark.
 */
export function readingList(runs: readonly TrialRun[], filter: ListFilter): ListItem[] {
  const mine = runs.filter((run) => !isBriefLabel(run.label)).reverse();
  const briefs = runs.filter((run) => isBriefLabel(run.label)).sort((a, b) => a.label.localeCompare(b.label) || a.at.localeCompare(b.at));
  return [...mine, ...briefs]
    .flatMap((run) => run.drafts.map((entry): ListItem => ({ run, entry })))
    .filter(({ run, entry }) => {
      if (filter === 'todo') return !isMarked(entry);
      if (filter === 'briefs') return isBriefLabel(run.label);
      if (filter === 'mine') return !isBriefLabel(run.label);
      return true;
    });
}

/** A recorded draft as the sheet the studio draws it from (the record keeps no example words, and none is needed to draw). */
export function sheetDraftOf(run: TrialRun, entry: TrialDraft): SheetDraft {
  const { keyPoint, count, level, shape, sides } = run.request;
  return { draft: entry.draft, request: { keyPoint, points: [], examples: [], count, level, shape, sides, note: '' } };
}

/** The language a draft was written in, as the paper preview names it. */
export function languageOfSides(sides: readonly Side[]): LanguageMode {
  return sides.length === 2 ? 'bilingual' : sides[0] === 'zh' ? 'zh' : 'en';
}

/** A key point's name as `names` asks (the draft's own language, k-0500), or its code. */
export function keyPointLabel(code: string, names: TopicNames): string {
  const hit = lookupCode(code);
  return hit ? syllabusName(hit.keyPoint, names) : code;
}
