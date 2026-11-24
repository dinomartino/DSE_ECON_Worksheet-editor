import { fillMcq } from '@/generate/build';
import { isGridCell } from '@/diagramGen/figureAt';
import { createFigureGridBlock } from '@/model/factories';
import type { ContentBlock, DiagramBlock, McqQuestion } from '@/model/types';
import type { QuestionBuild } from '@/store/worksheetStore';
import { stemBlocks, stemBlocksOf } from './stemTable';
import type { DraftDiagram, StudioDraft } from './types';

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
/** A figure of a set that goes on the paper: drawn, and meant for the students. */
const printable = (f: DraftDiagram): f is DraftDiagram & { block: DiagramBlock } =>
  Boolean(f.block) && (f.status === 'ok' || f.status === 'look') && f.placement === 'question';

/**
 * A draft's several figures (k-0545) where the paper prints them: the stem's after its words,
 * the grid "(1)"–"(4)" as one figure grid after that, each option's under its letter (the
 * options then two to a row, the HKDSE 2 × 2). A failed figure is left out, as one alone is.
 */
export function withFigureSet(q: McqQuestion, stem: ContentBlock[], d: Pick<StudioDraft, 'diagramSet'>): McqQuestion {
  const figures = (d.diagramSet?.figures ?? []).filter(printable);
  if (!figures.length) return { ...q, blocks: stem };
  const at = (where: string) => figures.find((f) => f.at === where)?.block;
  const lead = at('stem');
  const cells = figures.filter((f) => f.at && isGridCell(f.at)).map((f) => f.block);
  const blocks = [...stem, ...(lead ? [lead] : []), ...(cells.length >= 2 ? [createFigureGridBlock(cells)] : cells)];
  const optionBlocks = q.options.map((_, i) => at('ABCD'[i]));
  if (!optionBlocks.some(Boolean)) return { ...q, blocks };
  return {
    ...q,
    blocks,
    options: q.options.map((option, i) => (optionBlocks[i] ? { ...option, blocks: [optionBlocks[i]!] } : option)),
    optionLayout: 'columns2',
  };
}

export function studioBuilds(drafts: readonly StudioDraft[], keyPoint: string | ((draft: StudioDraft) => string)): QuestionBuild[] {
  return drafts.map((d) => {
    const tag = typeof keyPoint === 'function' ? keyPoint(d) : keyPoint;
    return {
      typeId: 'mcq',
      key: d.id,
      // `aiMade`: the editor says so until the teacher presses Checked (decision 5).
      fill: (fresh) => {
        const filled = fillMcq(d.draft)(fresh) as McqQuestion;
        // The teacher's edit keeps its formatting (k-0530): its rich text is what prints.
        const rich = d.rich;
        const q: McqQuestion = rich
          ? {
              ...filled,
              options: filled.options.map((option, i) => ({ ...option, text: rich.options[i] ?? option.text })),
              ...(rich.statements.length ? { statements: rich.statements } : {}),
              ...(filled.explanation ? { explanation: rich.explanation } : {}),
            }
          : filled;
        // The AI's figure goes with the question when it is meant for the students (ok, or look: the teacher saw its issues).
        // An MC question has no slot for a model-answer diagram, so a figure placed `answer` is not inserted.
        const figure = d.diagram && (d.diagram.status === 'ok' || d.diagram.status === 'look') && d.diagram.placement === 'question' ? d.diagram.block : null;
        // A table written in the stem (pipe rows) is drawn as a table (k-0531).
        const stem = [...(rich ? stemBlocksOf(rich.stem) : stemBlocks(d.draft.stem)), ...(figure ? [figure] : [])];
        return { ...withFigureSet(q, stem, d), tags: [tag], aiMade: true };
      },
    };
  });
}
