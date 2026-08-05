import { bandIsEmpty, ZONES, zonesOf } from '@/model/bands';
import { bandFieldSegments } from '@/model/bandSegments';
import { documentShape, type DocumentShape } from '@/model/documentShape';
import { DEFAULT_QUESTION_COUNT_WORDING, resolveFlow } from '@/model/flow';
import { sectionMarksById, worksheetMarks } from '@/model/marks';
import { computeNumbering } from '@/model/numbering';
import { bi, isBiTextEmpty, plain } from '@/model/text';
import type {
  Band,
  BandField,
  BiText,
  LayoutElement,
  OutputMode,
  Question,
  RichText,
  Worksheet,
} from '@/model/types';
import { requireQuestionType } from '@/registry';
import {
  blankLine,
  endsInBlankLine,
  includeNode,
  type CoverRenderNode,
  type NodeStyle,
  type RenderNode,
} from './ir';
import { coverColumns, coverHasPanel, coverLines } from '@/model/cover';
import type { CoverLine, CoverPage } from '@/model/coverTypes';

/** Twips: the gutter a "(1)" sits in, and where the instruction text column starts. */
const COVER_INSTRUCTION_INDENT = 480;
const COVER_INSTRUCTION_HANGING = 480;

/**
 * Assemble the whole worksheet into render IR. This is the one place that walks
 * the document; every exporter consumes its output, so preview / .docx / clipboard
 * can never disagree about numbering, ordering or teacher-only filtering.
 */

export interface RenderedQuestion {
  questionId: string;
  number: number;
  nodes: RenderNode[];
}

/** A non-question design element in the document flow. */
export interface RenderedLayout {
  elementId: string;
  nodes: RenderNode[];
}

/**
 * The document's contents in display order.
 *
 * Consumers that only care about questions keep using `questions`; consumers that
 * render the page walk `items`, which interleaves layout elements in the teacher's
 * chosen order.
 */
export type RenderedItem =
  | { type: 'question'; question: RenderedQuestion }
  | { type: 'layout'; layout: RenderedLayout };

export interface RenderedWorksheet {
  /**
   * The masthead, one node per band row.
   *
   * When a worksheet has bands they replace the plain `title` node on the page: the
   * title is one of the fields inside them, so printing both would duplicate it.
   */
  bands: RenderNode[];
  /**
   * The cover page, when the document has one.
   *
   * Kept beside `bands` rather than inside `items`, because a cover is not part of the
   * document flow — it is a whole sheet with its own column geometry printed before the
   * body begins (§ `model/cover.ts`).
   */
  cover?: CoverRenderNode;
  /**
   * Absent once the teacher has cleared the title text — an empty title has nothing
   * to print, and an unconditional node made it undeletable.
   */
  title?: RenderNode;
  instructions?: RenderNode;
  /**
   * Everything in the document body, in printed order.
   *
   * One flat list rather than a list of sections: a section is a `section` layout
   * element inside it, so every backend walks this once instead of nesting a loop that
   * would have to re-emit a heading between runs.
   */
  items: RenderedItem[];
  /** Questions only, in flow order — what numbering and marks totalling consume. */
  questions: RenderedQuestion[];
}

/**
 * Render one band as a row of columns.
 *
 * Zone positions are fixed thirds so the centre zone is genuinely centred on the page,
 * which is what a masthead needs; an occupied-zones-only layout would centre the middle
 * of the *content* instead and drift as fields are added.
 */
function renderBand(band: Band, totalMarks: number): RenderNode | undefined {
  if (bandIsEmpty(band)) return undefined;
  const zones = zonesOf(band);

  const cells: Extract<RenderNode, { kind: 'columns' }>['cells'] = [];
  const positions = { left: 0, center: 0.5, right: 1 } as const;
  const alignments = { left: 'left', center: 'center', right: 'right' } as const;

  for (const zone of ZONES) {
    for (const field of zones[zone]) {
      // One cell per field (a cell is a tab stop; splitting segments across cells would
      // scatter the field). `text` stays populated for consumers that only want the
      // string; `parts` tells typed text from computed.
      const segments = bandFieldSegments(field, { totalMarks });
      cells.push({
        text: bandFieldText(field, totalMarks),
        at: positions[zone],
        align: alignments[zone],
        format: field.format,
        parts: segments.map((segment) => ({
          text: segment.text,
          ...(segment.kind === 'value'
            ? { token: segment.token }
            : { edit: { kind: 'bandField' as const, fieldId: field.id, side: segment.side } }),
        })),
      });
    }
  }

  return { kind: 'columns', style: 'Body', cells, rule: band.rule };
}

/**
 * The printed text of a band field. Exported for the .docx header rows (a header is
 * not part of the document body, so the IR node cannot be reused there).
 */
export function bandFieldText(
  field: BandField,
  totalMarks: number,
  page?: { number: number; count: number },
): BiText {
  // Composed from `bandFieldSegments`, never spelled a second time — string form and
  // editable form are the same decomposition, so they cannot drift.
  const segments = bandFieldSegments(field, { totalMarks, page });
  return {
    en: segments.flatMap((segment) => segment.text.en),
    zh: segments.flatMap((segment) => segment.text.zh),
  };
}

/**
 * One rendered question per question *object* (WeakMap): commits replace only the
 * touched object, so identity means "unchanged" — no invalidation, no leak. The entry
 * records everything outside the question that shaped its nodes (mode, number, stream,
 * gap); a hit requires all to match. The payoff is referential stability for the
 * preview's memo boundary. Identity only, never content: a cold cache is
 * byte-identical.
 */
const questionRenderCache = new WeakMap<
  Question,
  {
    mode: OutputMode;
    number: number;
    stream: string;
    gap: number;
    nodes: RenderNode[];
  }
>();

/**
 * The cover page's IR (§ `model/cover.ts`). Each region becomes ordinary
 * `RenderNode`s so the backends reuse their emitters; only the two-column frame is
 * new. Instruction numbers are derived from position, as literal text (a cover's
 * instructions are not part of question numbering).
 */
function renderCover(cover: CoverPage, baseFontSize?: number): CoverRenderNode {
  // The cover's own font reaches every line, merged *under* the line's own format.
  const withFonts = (format: CoverLine['format']) =>
    cover.fonts ? { fonts: cover.fonts, ...format } : format;

  /** A region's lines, each followed by the blank lines it asks for. */
  const withGaps = (lines: CoverLine[]): RenderNode[] =>
    lines.flatMap((line) => [
      asText(line),
      ...Array.from({ length: line.gapAfter ?? 0 }, () => blankLine()),
    ]);

  const asText = (line: CoverLine, style: NodeStyle = 'Body'): RenderNode => ({
    kind: 'text',
    style,
    text: line.text,
    format: withFonts(line.format),
    edit: { kind: 'coverLine', lineId: line.id },
  });

  const instructionLines = coverLines(cover, 'instructions');
  // Derived from position like every other number in this app, so deleting one
  // instruction renumbers the rest instead of leaving a hole.
  const marker = (index: number) =>
    cover.instructionMarker === 'dot' ? `${index + 1}.` : `(${index + 1})`;
  const instructions: RenderNode[] = [];
  if (!isBiTextEmpty(cover.instructionsHeading)) {
    instructions.push({
      kind: 'text',
      style: 'Section Heading',
      text: cover.instructionsHeading!,
      keepNext: true,
      // At the body size, not the heading style's 14pt: the reference sets
      // "INSTRUCTIONS" at its own body size — the word is a label, not a title. The
      // *document's* body size, so a 10pt QAB prints a 10pt label (§ baseFontSize).
      format: { ...withFonts(undefined), fontSize: baseFontSize ?? 11 },
      edit: { kind: 'coverField', field: 'instructionsHeading' },
    });
    instructions.push(blankLine());
  }
  instructionLines.forEach((line, index) => {
    instructions.push({
      kind: 'columns',
      style: 'Body',
      indent: COVER_INSTRUCTION_INDENT,
      // Hung, so a wrapped instruction stays in its own column rather than running back
      // under its own number (§ ColumnsNode.hanging).
      hanging: COVER_INSTRUCTION_HANGING,
      cells: [
        { text: bi(marker(index), marker(index)), at: 0, format: withFonts(undefined) },
        {
          text: line.text,
          at: 0.5,
          format: withFonts(line.format),
          edit: { kind: 'coverLine', lineId: line.id },
        },
      ],
    });
    if (index < instructionLines.length - 1) instructions.push(blankLine());
  });

  const panelPresent = coverHasPanel(cover);

  return {
    kind: 'cover',
    columns: coverColumns(cover),
    corner: withGaps(coverLines(cover, 'corner')),
    cornerRule: cover.cornerRule ?? false,
    head: withGaps(coverLines(cover, 'head')),
    instructions,
    panel: {
      note: isBiTextEmpty(cover.panelNote)
        ? undefined
        : {
            kind: 'text',
            style: 'Body',
            text: cover.panelNote!,
            format: withFonts(undefined),
            edit: { kind: 'coverField', field: 'panelNote' },
          },
      fieldLabel: isBiTextEmpty(cover.panelFieldLabel)
        ? undefined
        : {
            kind: 'text',
            style: 'Body',
            text: cover.panelFieldLabel!,
            format: withFonts(undefined),
            edit: { kind: 'coverField', field: 'panelFieldLabel' },
          },
      boxes: cover.panelBoxes ?? 0,
      present: panelPresent,
    },
    foot: withGaps(coverLines(cover, 'foot')),
    ...(isBiTextEmpty(cover.footNote)
      ? {}
      : {
          footNote: {
            kind: 'text',
            style: 'Body',
            text: cover.footNote!,
            format: withFonts(undefined),
            edit: { kind: 'coverField', field: 'footNote' },
          } satisfies RenderNode,
        }),
  };
}

export function renderWorksheet(worksheet: Worksheet, mode: OutputMode): RenderedWorksheet {
  const numbering = computeNumbering(worksheet);

  // Derived once and passed down, so a band's "Full marks" can never disagree with the
  // questions it totals (§3.5).
  const total = worksheetMarks(worksheet);

  // Every section's total in one walk, rather than one walk per heading — see
  // `sectionMarksById`. Same numbers, computed before the item walk needs them.
  const sectionTotals = sectionMarksById(worksheet);
  const bands = (worksheet.bands ?? [])
    .map((band) => renderBand(band, total))
    .filter((node): node is RenderNode => node !== undefined);

  const cover = worksheet.cover
    ? renderCover(worksheet.cover, worksheet.baseFontSize)
    : undefined;

  const title: RenderNode | undefined = isBiTextEmpty(worksheet.title)
    ? undefined
    : {
        kind: 'text',
        style: 'Worksheet Title',
        text: worksheet.title,
        edit: { kind: 'worksheetTitle' },
        format: worksheet.titleFormat,
      };

  const instructions: RenderNode | undefined = isBiTextEmpty(worksheet.instructions)
    ? undefined
    : {
        kind: 'text',
        style: 'Instructions',
        text: worksheet.instructions!,
        edit: { kind: 'worksheetInstructions' },
        format: worksheet.instructionsFormat,
      };

  // A restarting section opens a new Word list stream (native `w:num`), keyed on the
  // section element's id — a dragged marker keeps its identity.
  let questionStream = 'question:0';

  // A leading gap is suppressed only at the *true top* of the page. Flow index 0 is
  // not that place: the masthead, title and instructions render above the flow.
  const somethingAboveFlow =
    bands.length > 0 || title !== undefined || instructions !== undefined;

  // The section marker the walk has most recently passed; a part header's derived
  // total is scoped to it.
  let currentSectionId: string | undefined;

  // What the previous item emitted, so a gap can tell whether the boundary already
  // has a spent line on it.
  let previousNodes: RenderNode[] = [];

  // What the previous flow item *was* — a boundary's width depends on both sides
  // (§ boundaryGapLines), which the nodes alone cannot say.
  let previous: { question?: Question; layout?: LayoutElement } | undefined;

  // Which of the four papers this is, derived (not passed in) so a hand-assembled
  // Paper 1 spaces exactly as a wizard-built one.
  const shape = documentShape(worksheet);

  // One walk over the one resolved flow. Questions, layout elements and section
  // headings come out in the teacher's order, so nothing downstream has to interleave
  // them and the three backends cannot disagree about what follows what.
  const items: RenderedItem[] = resolveFlow(worksheet).map((item, index) => {
    if (item.type === 'layout') {
      if (item.element.kind === 'section') {
        currentSectionId = item.element.id;
        if (item.element.restartNumbering) questionStream = `question:${item.element.id}`;
      }
      const nodes = renderLayoutElement(
        item.element,
        item.element.kind === 'partHeader' || item.element.kind === 'section'
          ? (sectionTotals.get(currentSectionId) ?? 0)
          : 0,
        // A heading's leading gap is skipped at the true top of the page, and also when
        // the previous item already spent a line — otherwise a note ending in a trailing
        // hard break would sit two lines above the next heading.
        (index === 0 && !somethingAboveFlow) || endsInBlankLine(previousNodes),
        // Taken from the numbering plan, not `worksheet.questions.length`: the plan is
        // what the printed numbers come from, so the lead-in's "There are 45 questions"
        // counts exactly the questions a candidate can see and number through.
        numbering.questions.length,
      );
      previousNodes = nodes;
      previous = { layout: item.element };
      return {
        type: 'layout',
        layout: {
          elementId: item.id,
          // Derived, so a part header's "(19 marks)" tracks the questions inside its
          // own section (§3.5).
          nodes,
        },
      };
    }

    const question = item.question;
    const entry = numbering.byQuestionId.get(question.id);
    const number = entry ? entry.number : 0;

    // The blank line(s) between consecutive items. Emitted here because it is a
    // property of the *boundary*, not of either question; suppressed at the true top
    // of the page, and reduced by a line the previous item already spent
    // (§ a gap counts what is already there).
    const atTrueTop = index === 0 && !somethingAboveFlow;
    const wanted = boundaryGapLines(shape, previous, question);
    const gap = atTrueTop ? 0 : Math.max(0, wanted - (endsInBlankLine(previousNodes) ? 1 : 0));

    // The leading gap is part of the cached array, so an unchanged question hands back
    // one stable identity for the preview to memoise on (see `questionRenderCache`).
    const cached = questionRenderCache.get(question);
    let separated: RenderNode[];
    if (
      cached &&
      cached.mode === mode &&
      cached.number === number &&
      cached.stream === questionStream &&
      cached.gap === gap
    ) {
      separated = cached.nodes;
    } else {
      const definition = requireQuestionType(question);
      const nodes = definition
        .render(question, {
          mode,
          questionNumber: number,
          questionId: question.id,
          questionStream,
        })
        // Student output must contain no teacher content anywhere (§11.8).
        .filter((node) => includeNode(node, mode));
      separated = gap > 0 ? [...Array.from({ length: gap }, blankLine), ...nodes] : nodes;
      questionRenderCache.set(question, {
        mode,
        number,
        stream: questionStream,
        gap,
        nodes: separated,
      });
    }
    previousNodes = separated;
    previous = { question };

    return { type: 'question', question: { questionId: question.id, number, nodes: separated } };
  });

  const questions = items
    .filter((item): item is Extract<RenderedItem, { type: 'question' }> => item.type === 'question')
    .map((item) => item.question);

  return { bands, cover, title, instructions, items, questions };
}

/**
 * The blank line separating one top-level item from the next. With no
 * `w:before`/`w:after` anywhere, air is bought by spending a line — the same
 * `blankLine()` the question types use, so every gap on the page is one number.
 */
const ITEM_GAP: RenderNode = blankLine();

/** The ordinary boundary: one spent line, the same gap a question's own parts get. */
const DEFAULT_GAP_LINES = 1;

/**
 * Blank lines under the MCQ paper's lead-in, before question 1. Measured off the
 * reference: rubric stands off by more than a neighbour, less than a whole question.
 */
const QUESTION_COUNT_GAP_LINES = 2;

/**
 * The width of the boundary between two consecutive flow items, in blank lines.
 * Wider only on an exam paper (§ documentShape), only between two questions of the
 * same type (`examGapLines` on the type definition states the number; this function
 * only decides when to honour it — the walker may not name a concrete type id), and
 * never on the first item of the page.
 */
function boundaryGapLines(
  shape: DocumentShape,
  previous: { question?: Question; layout?: LayoutElement } | undefined,
  next: Question,
): number {
  if (shape !== 'paper1' || !previous) return DEFAULT_GAP_LINES;

  if (previous.layout) {
    return previous.layout.kind === 'questionCount'
      ? QUESTION_COUNT_GAP_LINES
      : DEFAULT_GAP_LINES;
  }

  if (previous.question?.type !== next.type) return DEFAULT_GAP_LINES;
  const wide = requireQuestionType(next).examGapLines;
  return wide !== undefined && wide > DEFAULT_GAP_LINES ? wide : DEFAULT_GAP_LINES;
}

/**
 * Expand a layout element into IR nodes.
 *
 * `first` suppresses a heading's leading blank line when nothing precedes it — a gap
 * above the very first thing on the page is just a shifted top margin.
 */
function renderLayoutElement(
  element: LayoutElement,
  sectionTotal: number,
  first = false,
  /**
   * How many questions the whole document holds, for the MCQ lead-in's derived count.
   *
   * Passed in for the same reason `sectionTotal` is: the number belongs to the
   * document, not to the element, and computing it here would mean walking the
   * worksheet once per element.
   */
  questionTotal = 0,
): RenderNode[] {
  switch (element.kind) {
    // A section heading and a free heading render identically; they differ only in
    // what they mean to numbering, which is derived before this point.
    case 'section':
    case 'heading': {
      // A section may opt into the derived "(44 marks)" suffix a part header carries —
      // the QAB's own heading is "Section A (44 marks)" on one line, and its numbering
      // runs 1..14 across all three sections, so the marks cannot ride on a separate
      // restart-bearing element. Opt-in and appended at render, never stored, for the
      // reason partHeader's is: a stored total goes stale on the next re-mark.
      const showMarks = element.kind === 'section' && element.showMarks;
      const withMarks = (side: 'en' | 'zh') => {
        const suffix = side === 'en' ? ` (${sectionTotal} marks)` : `（${sectionTotal}分）`;
        return [...element.text[side], { text: suffix }];
      };
      return [
        ...(first ? [] : [ITEM_GAP]),
        {
          kind: 'text',
          style: 'Section Heading',
          text: showMarks ? { en: withMarks('en'), zh: withMarks('zh') } : element.text,
          keepNext: true,
          format: element.format,
          edit: { kind: 'layoutText', elementId: element.id },
        },
      ];
    }
    // A free line of prose. Takes the same leading gap a heading does (a closing
    // landmark like "END OF PAPER" must not print flush under the last option),
    // suppressed at the true top and after an already-spent line via `first`.
    case 'text':
      return [
        ...(first ? [] : [ITEM_GAP]),
        {
          kind: 'text',
          style: 'Body',
          text: element.text,
          format: element.format,
          edit: { kind: 'layoutText', elementId: element.id },
        },
      ];
    // The MCQ paper's lead-in: authored prefix · derived number · authored suffix
    // (the band-field decomposition). The number carries no EditTarget; the wording
    // is reached through `layoutText`.
    case 'questionCount': {
      const side = (which: 'en' | 'zh'): RichText => {
        const prefix = element.prefix?.[which] ?? DEFAULT_QUESTION_COUNT_WORDING.prefix[which];
        const suffix = element.suffix?.[which] ?? DEFAULT_QUESTION_COUNT_WORDING.suffix[which];
        return [...prefix, { text: String(questionTotal) }, ...suffix];
      };
      return [
        {
          kind: 'text',
          style: 'Body',
          text: { en: side('en'), zh: side('zh') },
          format: element.format,
          edit: { kind: 'layoutText', elementId: element.id },
        },
      ];
    }
    case 'spacer':
      return [{ kind: 'spacer', heightPt: element.heightPt, elementId: element.id }];
    case 'divider':
      return [{ kind: 'divider' }];
    case 'pageBreak':
      return [{ kind: 'pageBreak' }];
    case 'answerLines':
      return [{ kind: 'answerLines', lines: element.lines, elementId: element.id }];
    case 'answerSpace':
      return [
        {
          kind: 'answerSpace',
          lines: element.lines,
          elementId: element.id,
          ...(element.fill ? { fill: true } : {}),
        },
      ];

    case 'partHeader': {
      // The "(19 marks)" suffix is appended to the authored text rather than stored
      // with it, so editing the header never captures a stale total.
      const withMarks = (side: 'en' | 'zh') => {
        const authored = element.text[side];
        if (element.showMarks === false) return authored;
        const suffix = side === 'en' ? ` (${sectionTotal} marks)` : `（${sectionTotal}分）`;
        return [...authored, { text: suffix }];
      };
      return [
        ...(first ? [] : [ITEM_GAP]),
        {
          kind: 'text',
          style: 'Section Heading',
          text: element.showMarks === false
            ? element.text
            : { en: withMarks('en'), zh: withMarks('zh') },
          keepNext: true,
          format: element.format,
          edit: { kind: 'layoutText', elementId: element.id },
        },
      ];
    }

    case 'labelList': {
      const indent = element.indent ?? 480;
      // With a hang, the hang *is* the label column and supersedes `valueAt`
      // (§ ColumnsNode.hanging). The backends place the value cell from `hanging`
      // directly — only they know the row's real width.
      const hanging = element.hanging;
      const valueAt = element.valueAt ?? 0.35;
      return element.rows.map((row) => ({
        kind: 'columns',
        style: 'Body',
        indent,
        hanging,
        cells: [
          {
            text: row.label,
            at: 0,
            format: element.format,
            edit: {
              kind: 'labelListCell',
              elementId: element.id,
              rowId: row.id,
              column: 'label',
            },
          },
          {
            text: row.value,
            at: valueAt,
            format: element.format,
            edit: {
              kind: 'labelListCell',
              elementId: element.id,
              rowId: row.id,
              column: 'value',
            },
          },
        ],
      }));
    }

    default:
      return [];
  }
}

/** Every numbering stream used by a rendered worksheet, in first-use order. */
export function collectListStreams(
  rendered: RenderedWorksheet,
): Array<{ stream: string; definition: 'question' | 'option' | 'statement' }> {
  const seen = new Map<string, 'question' | 'option' | 'statement'>();
  // Questions only, deliberately: a layout element carries no list numbering, and
  // walking `items` instead would invent `w:num` instances nothing references.
  for (const question of rendered.questions) {
    for (const node of question.nodes) {
      if (node.kind === 'text' && node.listRef && !seen.has(node.listRef.stream)) {
        seen.set(node.listRef.stream, node.listRef.definition);
      }
    }
  }
  return [...seen.entries()].map(([stream, definition]) => ({ stream, definition }));
}
