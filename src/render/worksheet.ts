import { bandIsEmpty, ZONES, zonesOf } from '@/model/bands';
import { bandFieldPrintText, bandFieldSegments } from '@/model/bandSegments';
import { documentShape, type DocumentShape } from '@/model/documentShape';
import {
  DEFAULT_QUESTION_COUNT_WORDING,
  DEFAULT_STIMULUS_SPAN,
  DEFAULT_STIMULUS_WORDING,
  resolveFlow,
} from '@/model/flow';
import { questionMarks, sectionMarksById, worksheetMarks } from '@/model/marks';
import { computeNumbering, listIndentScheme } from '@/model/numbering';
import { bi, isBiTextEmpty, plain } from '@/model/text';
import { activeVersion, versionLetter, versionSeed } from '@/model/versions';
import { versionInPageOneHeader } from '@/model/headerMarks';
import type {
  Band,
  BandField,
  BiText,
  FontPair,
  LanguageMode,
  LayoutElement,
  OutputMode,
  Question,
  RichText,
  Worksheet,
} from '@/model/types';
import { requireQuestionType } from '@/registry';
import { isKeptWhole, sheetOpeners, startsEveryQuestion } from './pageFlow';
import { boundaryGapLines, gapNumberApplies, stimulusGapLines } from './questionGap';
import {
  blankLine,
  endsInBlankLine,
  includeNode,
  withAnswerLayers,
  withJustifiedBody,
  isWritingRoom,
  pushGap,
  renderContentBlocks,
  withLeadingGap,
  type CoverGridRender,
  type CoverRenderNode,
  type NodeStyle,
  type TextNode,
  pageMetricsOf,
  type RenderNode,
} from './ir';
import {
  coverColumns,
  coverGapLines,
  coverHasPanel,
  coverLinePrintsOnce,
  coverLines,
  coverPanelWidth,
  COVER_GRID,
  COVER_PANEL,
  EXAMINER_GRID_WORDING,
  examinerGridBands,
  examinerGridWidth,
  fitCoverColumns,
} from '@/model/cover';
import { contentWidth, pageSetupOf } from '@/model/page';
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
  /**
   * The width this question's leading boundary is aiming at, in blank lines — present
   * only where a stored number can set it (§ `gapNumberApplies`: straight under a
   * question of the same type, on any paper shape). The preview offers its drag handle
   * on it; both exports ignore it (the first node already carries the gap as `spaceBefore`).
   */
  adjustableGap?: number;
  /**
   * The question asked to be kept on one page (`keepOnOnePage`) and nothing else already
   * keeps it whole (§ `isKeptWhole`): the paginator offers no break inside it, so it moves to
   * the next sheet whole when it does not fit the room left, and is cut only where it is
   * taller than a sheet. Absent for every other question, which is every question of a paper
   * nobody set it on.
   */
  keptTogether?: boolean;
  /** This item opens a new sheet unless one already begins here (§ `startsPage` on the layout). */
  startsPage?: boolean;
}

/** A non-question design element in the document flow. */
export interface RenderedLayout {
  elementId: string;
  nodes: RenderNode[];
  /**
   * A sheet opens here because a question below asked to start a new page and this heading or
   * source lead-in travels with it (§ `sheetOpeners`). The paginator opens the sheet, so the
   * `.docx` takes its page break from the preview's measured sheets; Copy for Word writes the
   * break itself. Absent on every item of a paper nobody set it on.
   */
  startsPage?: boolean;
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
  /** "Version B", under the masthead: only when the paper has versions and page 1's
   *  running header does not already name it (`versionInPageOneHeader`). */
  versionLabel?: RenderNode;
  /** The label the page-1 header already carries: a backend with no header (the
   *  clipboard) prints it in `versionLabel`'s place. */
  headerVersionLabel?: RenderNode;
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
 * Render one band as a row: one cell per field, positioned by its zone's tab stop
 * (left 0, centre 0.5, right 1), so the centre zone is centred on the page rather than
 * on the content. `band: true` tells backends to lay it out as a tab-stop paragraph.
 */
function renderBand(
  band: Band,
  totalMarks: number,
  language: LanguageMode,
): RenderNode | undefined {
  if (bandIsEmpty(band)) return undefined;
  const zones = zonesOf(band);

  const cells: Extract<RenderNode, { kind: 'columns' }>['cells'] = [];
  const positions = { left: 0, center: 0.5, right: 1 } as const;
  const alignments = { left: 'left', center: 'center', right: 'right' } as const;

  for (const zone of ZONES) {
    for (const field of zones[zone]) {
      // One cell per field (a cell is a tab stop; splitting segments across cells would
      // scatter the field). `text` is the printed string — in bilingual mode a side that
      // repeats the other is left empty (§ `bandFieldPrintSides`); `parts` tells typed
      // text from computed.
      const segments = bandFieldSegments(field, { totalMarks });
      cells.push({
        text: bandFieldPrintText(field, { totalMarks }, language),
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

  return { kind: 'columns', style: 'Body', cells, rule: band.rule, band: true };
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
    keepWhole: boolean;
    /** Picks the list indent scheme; `keepWhole` no longer implies it (an MC keeps whole on any shape). */
    shape: DocumentShape;
    /** `seed:version` of the paper version this was rendered as; '' when off. */
    variant: string;
    /** `Worksheet.justifyText`, which stamps the body paragraphs. */
    justify: boolean;
    /** The page metrics, as one string: a question type may lay out by them. */
    page: string;
    nodes: RenderNode[];
  }
>();

/**
 * The cover page's IR (§ `model/cover.ts`). Each region becomes ordinary
 * `RenderNode`s so the backends reuse their emitters; only the two-column frame is
 * new. Instruction numbers are derived from position, as literal text (a cover's
 * instructions are not part of question numbering).
 */
function renderCover(
  cover: CoverPage,
  language: LanguageMode,
  /** The page's text width in twips; the columns never exceed it. */
  textWidth: number,
  baseFontSize?: number,
  /** The derived marks the examiner's grid prints; only read when the cover asks for it. */
  marks?: CoverMarks,
): CoverRenderNode {
  // The cover's own font reaches every line, merged *under* the line's own format.
  const withFonts = (format: CoverLine['format']) =>
    cover.fonts ? { fonts: cover.fonts, ...format } : format;

  /** A region's lines, each followed by the blank lines it asks for. */
  const withGaps = (lines: CoverLine[]): RenderNode[] =>
    lines.flatMap((line) => [
      asText(line),
      ...Array.from({ length: coverGapLines(line.gapAfter, language) }, () => blankLine()),
    ]);

  /*
   * A line whose sides read the same prints once in bilingual (§ `coverLinePrintsOnce`).
   * Its one editable side carries the whole stored pair, so an edit keeps the other side
   * (the preview mirrors it — § `mirrorBilingualEdit`).
   */
  const printed = (line: CoverLine) => {
    const edit = { kind: 'coverLine' as const, lineId: line.id };
    if (!coverLinePrintsOnce(line.text, language)) return { text: line.text, edit };
    return {
      text: { en: line.text.en, zh: [] },
      edit,
      segments: { en: [{ edit, value: line.text }], zh: [] },
    };
  };

  const asText = (line: CoverLine, style: NodeStyle = 'Body'): RenderNode => ({
    kind: 'text',
    style,
    ...printed(line),
    format: withFonts(line.format),
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
        {
          // A number reads the same in both languages, so bilingual prints it once, beside
          // the English line: stacked, "(1)" also broke the Chinese line off the hang.
          text:
            language === 'bilingual'
              ? { en: [{ text: marker(index) }], zh: [] }
              : bi(marker(index), marker(index)),
          at: 0,
          format: withFonts(undefined),
        },
        {
          ...printed(line),
          at: 0.5,
          format: withFonts(line.format),
        },
      ],
    });
    // Bilingual runs them together: the hung number already separates two-language
    // instructions, and the blanks are what pushed the column off the page.
    if (index < instructionLines.length - 1 && language !== 'bilingual') {
      instructions.push(blankLine());
    }
  });

  const panelPresent = coverHasPanel(cover);
  const columns = fitCoverColumns(coverColumns(cover), textWidth, coverPanelWidth(cover));

  return {
    kind: 'cover',
    columns,
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
    ...(cover.examinerGrid && marks
      ? {
          examinerGrid: renderExaminerGrid(
            marks,
            language,
            examinerGridWidth(columns, textWidth, panelPresent),
            panelPresent,
            cover.fonts,
          ),
        }
      : {}),
  };
}

/** What the examiner's grid totals: each question's derived number and marks, and the paper's. */
interface CoverMarks {
  questions: Array<{ number: number; marks: number }>;
  total: number;
}

/**
 * The "For examiner's use" grid (§ `CoverPage.examinerGrid`): one bordered band per
 * `examinerGridBands` chunk, three rows each — numbers, full marks, empty boxes — with
 * the Total closing the last band. Every number is derived; nothing here is editable.
 */
function renderExaminerGrid(
  marks: CoverMarks,
  language: LanguageMode,
  available: number,
  inPanel: boolean,
  fonts: FontPair | undefined,
): CoverGridRender {
  const format = { ...(fonts ? { fonts } : {}), fontSize: COVER_GRID.fontSize };
  const cell = (text: BiText, align: 'left' | 'center' = 'center', bold = false): TextNode => ({
    kind: 'text',
    style: 'Body',
    text,
    format: { ...format, align, ...(bold ? { bold: true } : {}) },
  });
  // A number reads the same in both languages, so bilingual prints it once (as the
  // instruction numbers do); a label stacks both sides like every other cover line.
  const number = (value: number) =>
    cell(
      language === 'bilingual'
        ? { en: [{ text: String(value) }], zh: [] }
        : bi(String(value), String(value)),
    );
  const box = () => cell({ en: [], zh: [] });
  const labelRow = COVER_GRID.lineRowHeight * (language === 'bilingual' ? 2 : 1);

  const bands: CoverGridRender['bands'] = [];
  let at = 0;
  const sizes = examinerGridBands(marks.questions.length, available);
  sizes.forEach((size, index) => {
    const chunk = marks.questions.slice(at, at + size);
    at += size;
    const last = index === sizes.length - 1;
    bands.push({
      columns: [
        COVER_GRID.labelWidth,
        ...chunk.map(() => COVER_GRID.cellWidth),
        ...(last ? [COVER_GRID.totalWidth] : []),
      ],
      rows: [
        {
          height: labelRow,
          cells: [
            cell(EXAMINER_GRID_WORDING.question, 'left'),
            ...chunk.map((entry) => number(entry.number)),
            ...(last ? [cell(EXAMINER_GRID_WORDING.total, 'center', true)] : []),
          ],
        },
        {
          height: labelRow,
          cells: [
            cell(EXAMINER_GRID_WORDING.full, 'left'),
            ...chunk.map((entry) => number(entry.marks)),
            ...(last ? [number(marks.total)] : []),
          ],
        },
        {
          height: Math.max(COVER_GRID.boxHeight, labelRow),
          cells: [
            cell(EXAMINER_GRID_WORDING.score, 'left'),
            ...chunk.map(box),
            ...(last ? [box()] : []),
          ],
        },
      ],
    });
  });

  return {
    placement: inPanel ? 'panel' : 'main',
    // In the panel the candidate boxes already end on a blank line; after the
    // instructions the grid needs its own.
    heading: [
      ...(inPanel ? [] : [blankLine()]),
      {
        ...cell(EXAMINER_GRID_WORDING.heading, 'left', true),
        keepNext: true,
        // Lined up with the bands under it, as the panel's tables are indented.
        ...(inPanel ? { indent: COVER_PANEL.indent } : {}),
      },
    ],
    indent: inPanel ? COVER_PANEL.indent : 0,
    trailingBlank: inPanel,
    bands,
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
    .map((band) => renderBand(band, total, mode.language))
    .filter((node): node is RenderNode => node !== undefined);

  const cover = worksheet.cover && !mode.omitCover
    ? renderCover(
        worksheet.cover,
        mode.language,
        contentWidth(pageSetupOf(worksheet)),
        worksheet.baseFontSize,
        worksheet.cover.examinerGrid
          ? {
              // The numbers a candidate sees, from the one numbering plan; the total is
              // the paper's own, so an "answer any ONE" section counts once.
              questions: numbering.questions.map((entry) => ({
                number: entry.number,
                marks: questionMarks(entry.question),
              })),
              total,
            }
          : undefined,
      )
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

  // The paper version this output prints; each question type reorders itself for it.
  const version = activeVersion(worksheet, mode);
  const seed = versionSeed(worksheet);
  const variantKey = version === undefined ? '' : `${seed}:${version}`;
  const anyVersionLabel =
    version === undefined ? undefined : renderVersionLabel(versionLetter(version), mode);
  const labelInHeader = anyVersionLabel !== undefined && versionInPageOneHeader(worksheet, mode);
  const versionLabel = labelInHeader ? undefined : anyVersionLabel;

  // The document's "Justify text": body paragraphs of every flow item, never the cover,
  // masthead, title or instructions (§ `withJustifiedBody`).
  const justify = worksheet.justifyText === true;

  // The text column and body size, for a question type that lays out by width.
  const page = pageMetricsOf(worksheet);
  const pageKey = `${page.textWidth}:${page.fontSize}:${page.latinFont}`;

  // A restarting section opens a new Word list stream (native `w:num`), keyed on the
  // section element's id — a dragged marker keeps its identity.
  let questionStream = 'question:0';

  // A leading gap is suppressed only at the *true top* of the page. Flow index 0 is
  // not that place: the masthead, title and instructions render above the flow.
  const somethingAboveFlow =
    bands.length > 0 ||
    title !== undefined ||
    instructions !== undefined ||
    versionLabel !== undefined;

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

  // Omitted writing room leaves the flow as if never placed, so boundaries close up
  // and a fill element no longer ends its sheet in any backend.
  const resolved = resolveFlow(worksheet).filter(
    (item) => !(mode.omitAnswerSpace && item.type === 'layout' && isWritingRoom(item.element)),
  );

  // The items a question's "Start on a new page" opens a sheet at: itself, or the heading or
  // source lead-in that travels with it. Read off the flow that prints, so a writing room
  // omitted from a student copy does not stand between a break and its question.
  const openers = sheetOpeners(resolved, startsEveryQuestion(worksheet));

  // Each stimulus's derived question range ("Questions 8 and 9"), from the numbering
  // plan — never stored, so inserting or reordering questions renumbers the sentence.
  // The look-ahead stops at the next stimulus: the questions past it are that one's.
  const stimulusRanges = new Map<string, number[]>();
  resolved.forEach((item, index) => {
    if (item.type !== 'layout' || item.element.kind !== 'stimulus') return;
    const span = Math.max(1, item.element.span ?? DEFAULT_STIMULUS_SPAN);
    const numbers: number[] = [];
    for (let i = index + 1; i < resolved.length && numbers.length < span; i++) {
      const next = resolved[i];
      if (next.type === 'layout' && next.element.kind === 'stimulus') break;
      if (next.type !== 'question') continue;
      const entry = numbering.byQuestionId.get(next.id);
      if (entry) numbers.push(entry.number);
    }
    stimulusRanges.set(item.element.id, numbers);
  });

  // One walk over the one resolved flow. Questions, layout elements and section
  // headings come out in the teacher's order, so nothing downstream has to interleave
  // them and the three backends cannot disagree about what follows what.
  const items: RenderedItem[] = resolved.map((item, index) => {
    if (item.type === 'layout') {
      if (item.element.kind === 'section') {
        currentSectionId = item.element.id;
        if (item.element.restartNumbering) questionStream = `question:${item.element.id}`;
      }
      // A stimulus opens a question group, so on the exam paper it stands off from the
      // previous question by the same wide boundary a question would (§ boundaryGapLines)
      // — one line short of that and it reads as part of the question above it.
      let stimulus: StimulusRender | undefined;
      if (item.element.kind === 'stimulus') {
        const atTrueTop = index === 0 && !somethingAboveFlow;
        const wanted = stimulusGapLines(shape, previous, worksheet.examGapLines);
        stimulus = {
          range: questionRangeText(stimulusRanges.get(item.element.id) ?? []),
          // Nothing is spaced above what opens a sheet: the air would only die at its top.
          gapLines: atTrueTop || openers.has(index)
            ? 0
            : Math.max(0, wanted - (endsInBlankLine(previousNodes) ? 1 : 0)),
          // Kept whole as an exam question is, in Word and so in the preview, which
          // reads the same chain (§ keepQuestionWhole).
          keepWhole: shape === 'paper1',
        };
      }
      const laid = renderLayoutElement(
        item.element,
        item.element.kind === 'partHeader' || item.element.kind === 'section'
          ? (sectionTotals.get(currentSectionId) ?? 0)
          : 0,
        // A heading's leading gap is skipped at the true top of the page, and also when
        // the previous item already spent a line — otherwise a note ending in a trailing
        // hard break would sit two lines above the next heading. And when it opens a sheet
        // a question below asked for (`startOnNewPage`): the air above it would die there.
        (index === 0 && !somethingAboveFlow) || endsInBlankLine(previousNodes) || openers.has(index),
        // Taken from the numbering plan, not `worksheet.questions.length`: the plan is
        // what the printed numbers come from, so the lead-in's "There are 45 questions"
        // counts exactly the questions a candidate can see and number through.
        numbering.questions.length,
        stimulus,
      );
      const shown = withAnswerLayers(laid, mode);
      const nodes = justify ? withJustifiedBody(shown) : shown;
      previousNodes = nodes;
      previous = { layout: item.element };
      return {
        type: 'layout',
        layout: {
          elementId: item.id,
          // Derived, so a part header's "(19 marks)" tracks the questions inside its
          // own section (§3.5).
          nodes,
          ...(openers.has(index) ? { startsPage: true } : {}),
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
    const wanted = boundaryGapLines(shape, previous, question, worksheet.examGapLines);
    // A question that opens a sheet because it asked to (`startOnNewPage`) has no air above
    // it: it leads the page in every backend, so the gap is not stamped at all rather than
    // dropped later by each (the page sheds it, the `.docx` sheds it given measured starts,
    // and Copy for Word, which has no pages, would keep it).
    const opensSheet = openers.has(index);
    const gap = atTrueTop || opensSheet ? 0 : Math.max(0, wanted - (endsInBlankLine(previousNodes) ? 1 : 0));

    // On the exam paper a question is kept whole, and on any paper one whose type asks
    // for it (an MC), in Word and so in the preview, which reads the same keep chain
    // (§ keepQuestionWhole). A teacher can ask it of the rest (`keepOnOnePage`), which is
    // not spelled in the nodes but told to the paginator (`keptTogether`, below).
    const definition = requireQuestionType(question);
    const keepWhole = isKeptWhole(shape, definition);

    // The leading gap is part of the cached array, so an unchanged question hands back
    // one stable identity for the preview to memoise on (see `questionRenderCache`).
    const cached = questionRenderCache.get(question);
    let separated: RenderNode[];
    if (
      cached &&
      cached.mode === mode &&
      cached.number === number &&
      cached.stream === questionStream &&
      cached.gap === gap &&
      cached.keepWhole === keepWhole &&
      cached.shape === shape &&
      cached.variant === variantKey &&
      cached.justify === justify &&
      cached.page === pageKey
    ) {
      separated = cached.nodes;
    } else {
      const printed =
        version === undefined
          ? question
          : (definition.variant?.(question, { seed, version }).question ?? question);
      const rendered = definition
        .render(printed, {
          mode,
          questionNumber: number,
          questionId: question.id,
          questionStream,
          // `shape` is in the cache key, so a scheme change re-renders.
          indents: listIndentScheme(shape),
          page,
        })
        // Student output must contain no teacher content anywhere (§11.8).
        .filter((node) => includeNode(node, mode));
      const shown = withAnswerLayers(rendered, mode);
      const kept = keepWhole ? keepQuestionWhole(shown) : shown;
      const nodes = justify ? withJustifiedBody(kept) : kept;
      // The boundary rides on the first paragraph, not on spacers above it, so it dies
      // at a page top in both backends (§ `withLeadingGap`).
      separated = withLeadingGap(nodes, gap);
      questionRenderCache.set(question, {
        mode,
        number,
        stream: questionStream,
        gap,
        keepWhole,
        shape,
        variant: variantKey,
        justify,
        page: pageKey,
        nodes: separated,
      });
    }
    // Whether a stored number sets this boundary: the same test `boundaryGapLines`
    // applies before it reads one, on every paper shape.
    const adjustableGap = gapNumberApplies(previous, question) && !opensSheet ? wanted : undefined;

    previousNodes = separated;
    previous = { question };

    return {
      type: 'question',
      question: {
        questionId: question.id,
        number,
        nodes: separated,
        adjustableGap,
        ...(question.keepOnOnePage === true && !keepWhole ? { keptTogether: true } : {}),
        ...(opensSheet ? { startsPage: true } : {}),
      },
    };
  });

  const questions = items
    .filter((item): item is Extract<RenderedItem, { type: 'question' }> => item.type === 'question')
    .map((item) => item.question);

  return {
    bands, cover, title, instructions, versionLabel,
    ...(labelInHeader ? { headerVersionLabel: anyVersionLabel } : {}),
    items, questions,
  };
}

/** Derived, so it carries no edit target; one line in every language mode. */
function renderVersionLabel(letter: string, mode: OutputMode): RenderNode {
  const en = `Version ${letter}`;
  const zh = `版本 ${letter}`;
  return {
    kind: 'text',
    style: 'Body',
    text: mode.language === 'bilingual' ? { en: [{ text: `${en} ${zh}` }], zh: [] } : bi(en, zh),
    format: { bold: true, align: 'right' },
  };
}

/**
 * The gap separating one top-level item from the next, in blank lines.
 *
 * Applied through `withLeadingGap`, which spells it on the item's own first paragraph
 * so it dies at a page top. Inside a question the separation is still a spent line —
 * a gap between a stem and its options can never fall on a page boundary, because the
 * question is kept whole.
 */
const ITEM_GAP_LINES = 1;

/**
 * The printed form of a stimulus's derived question range. With no questions after
 * the element yet, the sentence stays honest ("the questions below") rather than
 * printing a dash a teacher would have to notice.
 */
function questionRangeText(numbers: number[]): { en: string; zh: string } {
  if (numbers.length === 0) return { en: 'the questions below', zh: '以下題目' };
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  if (numbers.length === 1) return { en: `Question ${first}`, zh: `第${first}題` };
  if (numbers.length === 2)
    return { en: `Questions ${first} and ${last}`, zh: `第${first}及第${last}題` };
  return { en: `Questions ${first} to ${last}`, zh: `第${first}至第${last}題` };
}

/** What the walker derived for one stimulus: its range and its exam-paper spacing. */
interface StimulusRender {
  range: { en: string; zh: string };
  /** Blank lines above the lead-in, already reduced by a line the previous item spent. */
  gapLines: number;
  /** Chain the nodes with keep-next, as an exam question is (§ keepQuestionWhole). */
  keepWhole: boolean;
}

/**
 * Word's keep-together, spelled over one question's nodes: every node but the last
 * keeps with the next, and a text or columns row keeps its own lines. The exam paper
 * keeps each question on one sheet, and every paper keeps a type that asks for it
 * (`keepWhole` on its definition: an MC); the preview's paginator reads the same chain,
 * so both move it whole (§ An item breaks where its keep chain allows). The last node stays free,
 * or the chain would run through the boundary gap and glue every question to the next.
 */
function keepQuestionWhole(nodes: RenderNode[]): RenderNode[] {
  return nodes.map((node, index) => {
    const last = index === nodes.length - 1;
    switch (node.kind) {
      case 'text':
      case 'columns':
        return { ...node, keepNext: last ? node.keepNext : true, keepLines: true };
      case 'table':
      case 'image':
      case 'diagram':
      case 'figureRow':
      // A figure-option grid row is one atomic box (`cantSplit`), like a source.
      case 'optionRow':
      // A source panel is one atomic box like any other figure — the chain runs
      // *through* it, never into it: its own body is held together by the frame.
      case 'source':
      case 'spacer':
        return last ? node : { ...node, keepNext: true };
      default:
        return node;
    }
  });
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
  /** A stimulus's derived range and spacing, computed by the walker. */
  stimulus?: StimulusRender,
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
      return withLeadingGap(
        [
          {
            kind: 'text',
            style: 'Section Heading',
            text: showMarks ? { en: withMarks('en'), zh: withMarks('zh') } : element.text,
            keepNext: true,
            format: element.format,
            edit: { kind: 'layoutText', elementId: element.id },
          },
        ],
        first ? 0 : ITEM_GAP_LINES,
      );
    }
    // A free line of prose. Takes the same leading gap a heading does (a closing
    // landmark like "END OF PAPER" must not print flush under the last option),
    // suppressed at the true top and after an already-spent line via `first`.
    case 'text':
      return withLeadingGap(
        [
          {
            kind: 'text',
            style: 'Body',
            text: element.text,
            format: element.format,
            edit: { kind: 'layoutText', elementId: element.id },
          },
        ],
        first ? 0 : ITEM_GAP_LINES,
      );
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
    // A shared stimulus: the lead-in sentence (authored wording around the derived
    // question range, the `questionCount` decomposition), a blank line, then the
    // stimulus content through the same block renderer a question stem uses.
    case 'stimulus': {
      const range = stimulus?.range ?? { en: '', zh: '' };
      const side = (which: 'en' | 'zh'): RichText => {
        const prefix = element.prefix?.[which] ?? DEFAULT_STIMULUS_WORDING.prefix[which];
        const suffix = element.suffix?.[which] ?? DEFAULT_STIMULUS_WORDING.suffix[which];
        return [...prefix, { text: range[which] }, ...suffix];
      };
      const nodes: RenderNode[] = [
        {
          kind: 'text',
          style: 'Body',
          text: { en: side('en'), zh: side('zh') },
          // The sentence introduces the content: it must not strand at a page bottom.
          keepNext: true,
          format: element.format,
          edit: { kind: 'layoutText', elementId: element.id },
        },
      ];
      pushGap(nodes);
      renderContentBlocks(nodes, element.blocks, 'Body');
      const kept = stimulus?.keepWhole ? keepQuestionWhole(nodes) : nodes;
      return withLeadingGap(kept, stimulus?.gapLines ?? (first ? 0 : ITEM_GAP_LINES));
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
      return withLeadingGap(
        [
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
        ],
        first ? 0 : ITEM_GAP_LINES,
      );
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
