import { fillMcq } from '@/generate/build';
import type { McqQuestion } from '@/model/types';
import type { QuestionBuild } from '@/store/worksheetStore';
import type { StudioDraft } from './types';

/**
 * Drafts the teacher picked → what the store inserts (`insertQuestionBatch`), one build
 * each. Nothing here runs until the teacher presses Add: the studio never writes to a
 * paper by itself. A draft that failed a hard check is refused here too, not only in the
 * sheet. Each question is tagged with the key point it was asked to test (`keyPoint`: one
 * for all, or one per draft when a sheet holds drafts for several), so the coverage check
 * counts it; it carries no source line and no lineage (an original, not a copy). Each is
 * marked `aiMade` (§ `Question.aiMade`) until the teacher presses Checked, in a paper and
 * in the question bank alike.
 */
export function studioBuilds(drafts: readonly StudioDraft[], keyPoint: string | ((draft: StudioDraft) => string)): QuestionBuild[] {
  return drafts
    .filter((d) => d.status !== 'failed')
    .map((d) => {
      const tag = typeof keyPoint === 'function' ? keyPoint(d) : keyPoint;
      return {
        typeId: 'mcq',
        key: d.id,
        // `aiMade`: the editor says so until the teacher presses Checked (decision 5).
        fill: (fresh) => ({ ...(fillMcq(d.draft)(fresh) as McqQuestion), tags: [tag], aiMade: true }),
      };
    });
}
