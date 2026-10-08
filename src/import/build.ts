/**
 * Outline → what `insertQuestionBatch` inserts, in one call (one undo). Type-specific
 * construction lives here, like `src/generate/build.ts`: each question is filled into its
 * type's fresh `create()`. Labels are dropped (numbering is derived); text is verbatim on
 * the question's side; absent marks stay absent.
 */
import {
  OPTION_DIAGRAM_WIDTH_PX,
  createImageBlock,
  createParagraphBlock,
  createPart,
  createSourceBlock,
  createSubPart,
  createTableCell,
  newId,
} from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { normalizeRuns } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type {
  BiText,
  ContentBlock,
  ImageBlock,
  InlineRun,
  LayoutElement,
  McqQuestion,
  QuestionPart,
  QuestionSubPart,
  StructuredQuestion,
} from '@/model/types';
import type { QuestionBuild } from '@/store/worksheetStore';
import { cjkShare } from './normalize';
import type { Analysis, ImageRef, OutBlock, OutPart, OutQuestion, OutScheme, OutStimulus, OutSubPart } from './types';
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

/**
 * `preview`: the review pane's build. Figure slots come out as stand-in images, and
 * slots and placed pictures carry ids the pane reads back (`previewFigure`). A real
 * build drops slots and gives every block a fresh id.
 */
interface Ctx {
  preview: boolean;
  /** The display cap for a placed picture; an option's is narrower. */
  maxWidth?: number;
}

const PIN_ID = 'pi-pin:';
const SLOT_ID = 'pi-slot:';
/** A transparent pixel: a slot's stand-in, drawn over by the review pane. */
const SLOT_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SLOT_SIZE = { w: 420, h: 96 };

/** What a preview image block stands for: an image pin's picture, or the slot at a line. */
export function previewFigure(blockId: string): { pin: string } | { slot: number } | undefined {
  if (blockId.startsWith(PIN_ID)) return { pin: blockId.slice(PIN_ID.length) };
  if (blockId.startsWith(SLOT_ID)) return { slot: Number(blockId.slice(SLOT_ID.length)) };
  return undefined;
}

/** The block `imageBlockFromFile` makes: display size within the cap, natural size kept. */
function imageBlock(image: ImageRef, maxWidth?: number): ImageBlock {
  const w = image.widthPx ?? 320;
  const h = image.heightPx ?? Math.round(w * 0.75);
  const scale = maxWidth && w > maxWidth ? maxWidth / w : 1;
  const block = createImageBlock(image.src, Math.round(w * scale), Math.round(h * scale));
  if (image.naturalWidthPx && image.naturalHeightPx) {
    block.naturalWidthPx = image.naturalWidthPx;
    block.naturalHeightPx = image.naturalHeightPx;
  }
  return block;
}

function contentBlocks(blocks: readonly OutBlock[], side: Side, ctx: Ctx, inSource = false): ContentBlock[] {
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
        const inner = contentBlocks(block.blocks, side, ctx, true);
        if (inSource) return [createParagraphBlock(bi(block.label, side)), ...inner];
        const panel = createSourceBlock();
        return [{ ...panel, label: bi(block.label, side), blocks: inner.length ? inner : panel.blocks }];
      }
      case 'image': {
        if (block.missing) {
          if (!ctx.preview) return [];
          const w = Math.min(SLOT_SIZE.w, ctx.maxWidth ?? SLOT_SIZE.w);
          return [{ ...createImageBlock(SLOT_SRC, w, SLOT_SIZE.h), id: `${SLOT_ID}${block.lines[0]}` }];
        }
        if (!/^data:image\//.test(block.image.src)) return [];
        const image = imageBlock(block.image, block.pin ? ctx.maxWidth : undefined);
        return [ctx.preview && block.pin ? { ...image, id: `${PIN_ID}${block.pin}` } : image];
      }
    }
  });
}

/** Lines of runs joined by line breaks; `gap` puts a blank line before the notes. */
const lines = (rows: ReadonlyArray<readonly InlineRun[]>): InlineRun[] => rows.flatMap((r, k) => (k ? [{ text: '\n' }, ...r] : [...r]));

/** An answer file's points, verbatim, then any marker's notes after a blank line. */
const joined = (scheme: OutScheme): InlineRun[] => {
  const body = lines(scheme.points.map((p) => p.runs).filter((r) => r.length));
  return scheme.notes?.length ? [...body, { text: '\n\n' }, ...lines(scheme.notes)] : body;
};

/**
 * An answer file's text on a written leaf: a `scheme` (one route; a group with a point per
 * line and its mark, then the marker's notes as a second, unmarked group) when anything
 * carries marks, else the model `answer` (notes after a blank line).
 */
function schemeFields(scheme: OutScheme | undefined, side: Side): { scheme?: MarkScheme; answer?: BiText } {
  if (!scheme?.points.length && !scheme?.notes?.length) return {};
  const marked = scheme.each !== undefined || scheme.max !== undefined || scheme.points.some((p) => p.marks !== undefined);
  if (!marked) return { answer: bi(joined(scheme), side) };
  const point = (runs: InlineRun[], marks?: number) => ({ id: newId(), text: bi(runs, side), ...(marks !== undefined ? { marks } : {}) });
  const group = {
    id: newId(),
    points: scheme.points.map((p) => point(p.runs, p.marks)),
    ...(scheme.each !== undefined ? { each: scheme.each } : {}),
    ...(scheme.max !== undefined ? { max: scheme.max } : {}),
  };
  const notes = scheme.notes?.length ? [{ id: newId(), points: scheme.notes.map((n) => point(n)) }] : [];
  return { scheme: { routes: [{ id: newId(), groups: [group, ...notes] }] } };
}

/** Never an empty stem: a fresh question keeps its one empty paragraph to type into. */
const stemOr = (blocks: ContentBlock[], fresh: ContentBlock[]) => (blocks.length ? blocks : fresh);

function subPart(sub: OutSubPart, side: Side, ctx: Ctx): QuestionSubPart {
  const { marks: _m, ...fresh } = createSubPart();
  void _m;
  return {
    ...fresh,
    blocks: stemOr(contentBlocks(sub.blocks, side, ctx), fresh.blocks),
    ...(sub.marks !== undefined ? { marks: sub.marks } : {}),
    ...(sub.answerSpace ? { answerSpace: sub.answerSpace } : {}),
    ...schemeFields(sub.scheme, side),
  };
}

function part(p: OutPart, side: Side, ctx: Ctx): QuestionPart {
  const { marks: _m, ...fresh } = createPart();
  void _m;
  const blocks = contentBlocks(p.blocks, side, ctx);
  const before = contentBlocks(p.before, side, ctx);
  return {
    ...fresh,
    ...(before.length ? { blocksBefore: before } : {}),
    blocks: p.subParts.length ? blocks : stemOr(blocks, fresh.blocks),
    ...(p.marks !== undefined ? { marks: p.marks } : {}),
    ...(p.subParts.length ? { subParts: p.subParts.map((s) => subPart(s, side, ctx)) } : {}),
    ...(p.answerSpace ? { answerSpace: p.answerSpace } : {}),
    ...schemeFields(p.scheme, side),
  };
}

type Extra = (ctx: Ctx) => ContentBlock[];

function fillMcq(q: OutQuestion, extra: Extra, ctx: Ctx): QuestionBuild['fill'] {
  const optionCtx: Ctx = { ...ctx, maxWidth: OPTION_DIAGRAM_WIDTH_PX };
  return (fresh) => {
    const mcq = fresh as McqQuestion;
    return {
      ...mcq,
      blocks: stemOr([...extra(ctx), ...contentBlocks(q.stem, q.side, ctx)], mcq.blocks),
      ...(q.statements.length ? { statements: q.statements.map((s) => bi(s.runs, q.side)) } : {}),
      options: q.options.map((o, k) => {
        const blocks = o.blocks?.length ? contentBlocks(o.blocks, q.side, optionCtx) : [];
        return { id: mcq.options[k]?.id ?? newId(), text: bi(o.runs, q.side), ...(blocks.length ? { blocks } : {}) };
      }),
      answerIndex: q.answer?.index ?? 0,
      ...(q.scheme && (q.scheme.points.length || q.scheme.notes?.length) ? { explanation: bi(joined(q.scheme), q.side) } : {}),
      ...(q.marks !== undefined ? { marks: q.marks } : {}),
    } satisfies McqQuestion;
  };
}

function fillStructured(q: OutQuestion, extra: Extra, ctx: Ctx): QuestionBuild['fill'] {
  return (fresh) => {
    const sq = fresh as StructuredQuestion;
    const { marks: _m, answerSpace: _a, ...rest } = sq;
    void _m;
    void _a;
    const leaf = q.parts.length === 0;
    return {
      ...rest,
      blocks: stemOr([...extra(ctx), ...contentBlocks(q.stem, q.side, ctx)], sq.blocks),
      parts: q.parts.map((p) => part(p, q.side, ctx)),
      ...(leaf && q.marks !== undefined ? { marks: q.marks } : {}),
      ...(leaf && q.answerSpace ? { answerSpace: q.answerSpace } : {}),
      ...(leaf ? schemeFields(q.scheme, q.side) : {}),
    } satisfies StructuredQuestion;
  };
}

/** The shared-stem sentence becomes the stimulus's own wording around its derived range. */
function leadOf(stim: OutStimulus, questions: number, ctx: Ctx): LayoutElement {
  const side: Side = cjkShare(blocksText(stim.blocks)) >= 0.5 ? 'zh' : 'en';
  const [first, ...rest] = stim.blocks;
  const element = { ...createStimulusElement(), span: Math.max(1, Math.min(stim.span, questions)) };
  if (first?.kind === 'paragraph') {
    const sentence = first.runs.map((r) => r.text).join('');
    const m = /\bQuestions?\s+\d{1,3}\s*(?:and|to|&|-|–)\s*\d{1,3}\b|第\s*\d{1,3}\s*(?:及|至|和|與|、)\s*(?:第\s*)?\d{1,3}\s*題/i.exec(sentence);
    if (m) {
      const prefix = sentence.slice(0, m.index);
      const suffix = sentence.slice(m.index + m[0].length);
      const blocks = contentBlocks(rest, side, ctx);
      return {
        ...element,
        prefix: { en: side === 'en' ? [{ text: prefix }] : [], zh: side === 'zh' ? [{ text: prefix }] : [] },
        suffix: { en: side === 'en' ? [{ text: suffix }] : [], zh: side === 'zh' ? [{ text: suffix }] : [] },
        blocks: blocks.length ? blocks : element.blocks,
      };
    }
  }
  const blocks = contentBlocks(stim.blocks, side, ctx);
  return { ...element, blocks: blocks.length ? blocks : element.blocks };
}

/**
 * The analysis as one batch. A shared stem before the first question becomes the
 * `lead`; any later one is kept as the first text of the question it introduces
 * (flagged `sharedStemFolded`), since a batch carries one lead. `preview` is the review
 * pane's build (figure slots shown, `previewFigure` ids): never insert it.
 */
export function buildImport(analysis: Analysis, options: { preview?: boolean } = {}): ImportBatch {
  const { outline } = analysis;
  const ctx: Ctx = { preview: Boolean(options.preview) };
  const folded = new Map<number, OutBlock[]>();
  let lead: LayoutElement | undefined;
  for (const stim of outline.stimuli) {
    if (stim.before === 0 && !lead) {
      lead = leadOf(stim, outline.questions.length, ctx);
      continue;
    }
    if (outline.questions[stim.before]) folded.set(stim.before, [...(folded.get(stim.before) ?? []), ...stim.blocks]);
  }
  const builds: QuestionBuild[] = outline.questions.map((q, k) => {
    const extra: Extra = (c) => contentBlocks(folded.get(k) ?? [], q.side, c);
    return q.kind === 'mc' ? { typeId: 'mcq', fill: fillMcq(q, extra, ctx) } : { typeId: 'structured', fill: fillStructured(q, extra, ctx) };
  });
  const skipped = analysis.roles.flatMap((r, i) => (r.role === 'heading' || r.role === 'noise' || r.role === 'answerKey' ? [i] : []));
  return { builds, ...(lead ? { lead } : {}), starts: outline.questions.map((q) => q.start), skipped };
}
