import { fillMcq } from '@/generate/build';
import type { McqQuestion } from '@/model/types';
import type { QuestionBuild } from '@/store/worksheetStore';
import { stemBlocks } from './stemTable';
import type { StudioDraft } from './types';

/**
 * Drafts the teacher picked → what the store inserts (`insertQuestionBatch`), one build
 * each. Nothing here runs until the teacher presses Add: the studio never writes to a
 * paper by itself. A draft with a failed check (a warning) goes in like any other once the
 * teacher picks it (k-0531: the teacher decides, nothing is refused). Each question is tagged with the key point it was asked to test (`keyPoint`: one
 * for all, or one per draft when a sheet holds drafts for several), so the coverage check
 * counts it; it carries no source line and no lineage (an original, not a copy). Each is
 * marked `aiMade` (§ `Question.aiMade`) until the teacher presses Checked, in a paper and
 * in the question bank alike.
 */
export function studioBuilds(drafts: readonly StudioDraft[], keyPoint: string | ((draft: StudioDraft) => string)): QuestionBuild[] {
  return drafts.map((d) => {
    const tag = typeof keyPoint === 'function' ? keyPoint(d) : keyPoint;
    return {
      typeId: 'mcq',
      key: d.id,
      // `aiMade`: the editor says so until the teacher presses Checked (decision 5).
      fill: (fresh) => {
        const q = fillMcq(d.draft)(fresh) as McqQuestion;
        // The AI's figure goes with the question when it is meant for the students (ok, or look: the teacher saw its issues).
        // An MC question has no slot for a model-answer diagram, so a figure placed `answer` is not inserted.
        const figure = d.diagram && (d.diagram.status === 'ok' || d.diagram.status === 'look') && d.diagram.placement === 'question' ? d.diagram.block : null;
        // A table written in the stem (pipe rows) is drawn as a table (k-0531).
        return { ...q, blocks: [...stemBlocks(d.draft.stem), ...(figure ? [figure] : [])], tags: [tag], aiMade: true };
      },
    };
  });
}
