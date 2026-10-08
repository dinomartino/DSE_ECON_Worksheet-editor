/**
 * Outline → what `insertQuestionBatch` inserts, in one call (one undo). Type-specific
 * construction lives here, like `src/generate/build.ts`: each question is filled into its
 * type's fresh `create()`. Labels are dropped (numbering is derived); text is verbatim on
 * the question's side; absent marks stay absent.
 */
import { createImageBlock, createParagraphBlock, createPart, createSourceBlock, createSubPart, createTableCell, newId } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { normalizeRuns } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type {
  BiText,
  ContentBlock,
  InlineRun,
  LayoutElement,
  McqQuestion,
  QuestionPart,
  QuestionSubPart,
  StructuredQuestion,
} from '@/model/types';
import type { QuestionBuild } from '@/store/worksheetStore';
import { cjkShare } from './normalize';
import type { Analysis, OutBlock, OutPart, OutQuestion, OutStimulus, OutSubPart } from './types';
import { blocksText } from './walk';

export interface ImportBatch {
  builds: QuestionBuild[];
  /** A shared stem before the first question, as a stimulus spanning its questions. */
  lead?: LayoutElement;
  /** Each build's first source line, for linking the preview back to the paste. */
  starts: number[];
  /** Lines not imported: headings, noise, answer keys. */
  skipped: number[];
}

const bi = (runs: readonly InlineRun[], side: Side): BiText => {
  const clean = normalizeRuns(runs.map((r) => ({ ...r })));
  return { en: side === 'en' ? clean : [], zh: side === 'zh' ? clean : [] };
};

function contentBlocks(blocks: readonly OutBlock[], side: Side, inSource = false): ContentBlock[] {
  return blocks.flatMap((block): ContentBlock[] => {
    switch (block.kind) {
      case 'paragraph':
        return [createParagraphBlock(bi(block.runs, side))];
      case 'table': {
        const width = Math.max(...block.rows.map((r) => r.length));
        return [
          {
            kind: 'table',
            id: newId(),
            rows: block.rows.map((cells) => ({
              id: newId(),
              cells: Array.from({ length: width }, (_, k) => createTableCell(bi(cells[k] ?? [], side))),
            })),
          },
        ];
      }
      case 'source': {
        // A source holds no source: a nested one gives up its frame, not its content.
        const inner = contentBlocks(block.blocks, side, true);
        if (inSource) return [createParagraphBlock(bi(block.label, side)), ...inner];
        const panel = createSourceBlock();
        return [{ ...panel, label: bi(block.label, side), blocks: inner.length ? inner : panel.blocks }];
      }
      case 'image': {
        if (!/^data:image\//.test(block.image.src)) return [];
        const w = block.image.widthPx ?? 320;
        const h = block.image.heightPx ?? Math.round(w * 0.75);
        return [createImageBlock(block.image.src, w, h)];
      }
    }
  });
}

/** Never an empty stem: a fresh question keeps its one empty paragraph to type into. */
const stemOr = (blocks: ContentBlock[], fresh: ContentBlock[]) => (blocks.length ? blocks : fresh);

function subPart(sub: OutSubPart, side: Side): QuestionSubPart {
  const { marks: _m, ...fresh } = createSubPart();
  void _m;
  return {
    ...fresh,
    blocks: stemOr(contentBlocks(sub.blocks, side), fresh.blocks),
    ...(sub.marks !== undefined ? { marks: sub.marks } : {}),
    ...(sub.answerSpace ? { answerSpace: sub.answerSpace } : {}),
  };
}

function part(p: OutPart, side: Side): QuestionPart {
  const { marks: _m, ...fresh } = createPart();
  void _m;
  const blocks = contentBlocks(p.blocks, side);
  const before = contentBlocks(p.before, side);
  return {
    ...fresh,
    ...(before.length ? { blocksBefore: before } : {}),
    blocks: p.subParts.length ? blocks : stemOr(blocks, fresh.blocks),
    ...(p.marks !== undefined ? { marks: p.marks } : {}),
    ...(p.subParts.length ? { subParts: p.subParts.map((s) => subPart(s, side)) } : {}),
    ...(p.answerSpace ? { answerSpace: p.answerSpace } : {}),
  };
}

function fillMcq(q: OutQuestion, extra: ContentBlock[]): QuestionBuild['fill'] {
  return (fresh) => {
    const mcq = fresh as McqQuestion;
    return {
      ...mcq,
      blocks: stemOr([...extra, ...contentBlocks(q.stem, q.side)], mcq.blocks),
      ...(q.statements.length ? { statements: q.statements.map((s) => bi(s.runs, q.side)) } : {}),
      options: q.options.map((o, k) => ({ id: mcq.options[k]?.id ?? newId(), text: bi(o.runs, q.side) })),
      answerIndex: q.answer?.index ?? 0,
      ...(q.marks !== undefined ? { marks: q.marks } : {}),
    } satisfies McqQuestion;
  };
}

function fillStructured(q: OutQuestion, extra: ContentBlock[]): QuestionBuild['fill'] {
  return (fresh) => {
    const sq = fresh as StructuredQuestion;
    const { marks: _m, answerSpace: _a, ...rest } = sq;
    void _m;
    void _a;
    const leaf = q.parts.length === 0;
    return {
      ...rest,
      blocks: stemOr([...extra, ...contentBlocks(q.stem, q.side)], sq.blocks),
      parts: q.parts.map((p) => part(p, q.side)),
      ...(leaf && q.marks !== undefined ? { marks: q.marks } : {}),
      ...(leaf && q.answerSpace ? { answerSpace: q.answerSpace } : {}),
    } satisfies StructuredQuestion;
  };
}

/** The shared-stem sentence becomes the stimulus's own wording around its derived range. */
function leadOf(stim: OutStimulus, questions: number): LayoutElement {
  const side: Side = cjkShare(blocksText(stim.blocks)) >= 0.5 ? 'zh' : 'en';
  const [first, ...rest] = stim.blocks;
  const element = { ...createStimulusElement(), span: Math.max(1, Math.min(stim.span, questions)) };
  if (first?.kind === 'paragraph') {
    const sentence = first.runs.map((r) => r.text).join('');
    const m = /\bQuestions?\s+\d{1,3}\s*(?:and|to|&|-|–)\s*\d{1,3}\b|第\s*\d{1,3}\s*(?:及|至|和|與|、)\s*(?:第\s*)?\d{1,3}\s*題/i.exec(sentence);
    if (m) {
      const prefix = sentence.slice(0, m.index);
      const suffix = sentence.slice(m.index + m[0].length);
      const blocks = contentBlocks(rest, side);
      return {
        ...element,
        prefix: { en: side === 'en' ? [{ text: prefix }] : [], zh: side === 'zh' ? [{ text: prefix }] : [] },
        suffix: { en: side === 'en' ? [{ text: suffix }] : [], zh: side === 'zh' ? [{ text: suffix }] : [] },
        blocks: blocks.length ? blocks : element.blocks,
      };
    }
  }
  const blocks = contentBlocks(stim.blocks, side);
  return { ...element, blocks: blocks.length ? blocks : element.blocks };
}

/**
 * The analysis as one batch. A shared stem before the first question becomes the
 * `lead`; any later one is kept as the first text of the question it introduces
 * (flagged `sharedStemFolded`), since a batch carries one lead.
 */
export function buildImport(analysis: Analysis): ImportBatch {
  const { outline } = analysis;
  const folded = new Map<number, ContentBlock[]>();
  let lead: LayoutElement | undefined;
  for (const stim of outline.stimuli) {
    if (stim.before === 0 && !lead) {
      lead = leadOf(stim, outline.questions.length);
      continue;
    }
    const q = outline.questions[stim.before];
    if (q) folded.set(stim.before, [...(folded.get(stim.before) ?? []), ...contentBlocks(stim.blocks, q.side)]);
  }
  const builds: QuestionBuild[] = outline.questions.map((q, k) => {
    const extra = folded.get(k) ?? [];
    return q.kind === 'mc' ? { typeId: 'mcq', fill: fillMcq(q, extra) } : { typeId: 'structured', fill: fillStructured(q, extra) };
  });
  const skipped = analysis.roles.flatMap((r, i) => (r.role === 'heading' || r.role === 'noise' || r.role === 'answerKey' ? [i] : []));
  return { builds, ...(lead ? { lead } : {}), starts: outline.questions.map((q) => q.start), skipped };
}
