import { bandIsEmpty, ZONES, zonesOf } from '@/model/bands';
import { bandFieldSegments } from '@/model/bandSegments';
import { resolveFlow } from '@/model/flow';
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
   * Absent once the teacher has cleared the title text.
   *
   * `worksheet.title` still holds that text — it names the document in the outline, the
   * saved-file list and the download filename — but an empty title has nothing to print,
   * and an unconditional node made it undeletable: clearing the text left a blank
   * `Worksheet Title` paragraph on page 1 and in the .docx, with no affordance to remove
   * it. Optional here for the same reason `instructions` is, so "delete it" and "leave it
   * empty" are the same gesture.
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
      /*
       * One cell per field, carrying the field's segments.
       *
       * The segments are *not* separate cells: a cell is a tab stop, so a field split
       * across three of them would scatter "Full marks: 45 marks" across the row with a
       * `w:tab` between each word. A field is one run of text at one position; the
       * segments describe its interior.
       *
       * `text` stays populated alongside them, so a consumer that only wants the string
       * (the clipboard, a thumbnail) needs to know nothing about segments — while the
       * preview and the .docx walk `parts` to tell typed text from computed.
       */
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
 * The printed text of a band field, computing what must not be stored (§3.5).
 *
 * Exported because the .docx backend needs the identical string for header rows: it
 * cannot reuse the IR node there (a header is not part of the document body), so
 * sharing this function is what stops a header field reading differently on the page
 * than it does in Word.
 */
export function bandFieldText(
  field: BandField,
  totalMarks: number,
  page?: { number: number; count: number },
): BiText {
  /*
   * Composed from `bandFieldSegments`, never spelled a second time.
   *
   * This function used to assemble each kind's string itself, which put the wording
   * around every computed value ("Full marks:", " marks", "分") in the renderer where no
   * teacher could reach it. Concatenating the segments means the string form and the
   * editable form are the same decomposition, so a retyped prefix reaches the .docx and
   * the clipboard for free — and the two can never drift apart.
   */
  const segments = bandFieldSegments(field, { totalMarks, page });
  return {
    en: segments.flatMap((segment) => segment.text.en),
    zh: segments.flatMap((segment) => segment.text.zh),
  };
}

/**
 * One rendered question per question *object*, so an edit to question 3 does not
 * rebuild questions 1–20.
 *
 * Every store commit maps `questions` and replaces only the object it touched
 * (`mapQuestion`), so object identity is exactly "this question has not changed" — a
 * `WeakMap` keyed on it needs no invalidation and cannot leak. The entry also records
 * everything *outside* the question that shaped its nodes — the mode, the derived
 * number, the list stream and whether a leading gap was spent — and a hit requires all
 * of them to match, so a dragged section marker still renumbers and re-streams every
 * question behind it.
 *
 * The payoff is not the walk itself (which is cheap) but **referential stability**: the
 * preview memoises each item's subtree on its nodes array, so a keystroke in one stem
 * re-renders one question instead of the whole document — twice, since the pagination
 * probe renders the very same blocks. The cache changes identity only, never content;
 * a cold cache produces byte-identical output.
 */
const questionRenderCache = new WeakMap<
  Question,
  {
    mode: OutputMode;
    number: number;
    stream: string;
    gapped: boolean;
    nodes: RenderNode[];
  }
>();

/**
 * The cover page's IR (§ `model/cover.ts`).
 *
 * Each region becomes ordinary `RenderNode`s, so the backends reuse the paragraph and
 * columns emitters they already have — only the two-column frame around them is new.
 *
 * Instruction numbers are **derived here from position**, never stored, the same rule
 * questions follow: deleting instruction (2) renumbers the rest rather than leaving a
 * hole. They are literal text on a `columns` row rather than a `w:num` list, because a
 * cover's instructions are not part of the question numbering and putting them on that
 * stream would renumber them as questions are added.
 */
function renderCover(cover: CoverPage): CoverRenderNode {
  /*
   * The cover's own font reaches every line.
   *
   * Both reference papers set the whole front page in Arial while the body behind it is
   * Times New Roman, so the face is a property of the cover rather than something
   * inherited from the worksheet. Merged *under* the line's own format, so a teacher who
   * sets a face on one line still wins.
   */
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
      // "INSTRUCTIONS" at its own body size — the word is a label, not a title.
      format: { ...withFonts(undefined), fontSize: 11 },
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

  const cover = worksheet.cover ? renderCover(worksheet.cover) : undefined;

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

  /*
   * A section that restarts numbering opens a new Word list stream, so the restart is
   * native `w:num` rather than a number we typed in; sections that continue share the
   * previous stream so Word keeps counting across the heading (§4).
   *
   * The stream is keyed on the section **element's id** rather than a section index,
   * because there is no longer an index to key on — a section is a marker in the flow,
   * and dragging one changes which questions follow it without changing its identity.
   */
  let questionStream = 'question:0';

  /*
   * Does anything print above the flow?
   *
   * A heading's leading blank line is suppressed only at the **true top of the page**,
   * where a gap is just a shifted top margin. Flow index 0 is not that place: the
   * masthead bands, the title and the instructions all render above the flow, so a
   * section sitting first in the flow usually has a title directly over it and needs its
   * gap exactly like every other heading.
   *
   * Keying on the index alone made the same element space differently depending only on
   * where it sat — "Section A" printed tight under the header rule while "Section B",
   * identical in every other way, had air above it. Worse, the gap reappeared the moment
   * anything was dragged in front of the section, so the fix looked like it depended on
   * unrelated content.
   */
  const somethingAboveFlow =
    bands.length > 0 || title !== undefined || instructions !== undefined;

  // The section marker the walk has most recently passed. A part header's derived total
  // is scoped to it, which is what "(19 marks)" under "Section B" means.
  let currentSectionId: string | undefined;

  // What the previous item emitted, so a gap can tell whether the boundary already has
  // a spent line on it. Reset per walk rather than derived afterwards, because the
  // decision has to be made while the run is being built.
  let previousNodes: RenderNode[] = [];

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
      );
      previousNodes = nodes;
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

    /*
     * A blank line between consecutive questions, completing the reference paper's
     * rhythm: a question is separated from the next the same way its own parts are
     * separated from each other.
     *
     * Emitted here rather than inside each question type because it is a property of the
     * *boundary*, not of either question — a type that appended its own trailing gap
     * would double up against whatever the walker put before the next item, and would
     * leave a stray blank at the very end of the document. Suppressed only when nothing
     * precedes it at all — including the title, instructions and masthead that render
     * above the flow — since a gap there is just a shifted top margin.
     *
     * It is also suppressed when the previous item already ended in a spent line, so an
     * item whose last text carries a trailing hard break does not sit two lines from the
     * next one while its neighbours sit one (§ a gap counts what is already there).
     */
    const atTrueTop = index === 0 && !somethingAboveFlow;
    const gapped = !(atTrueTop || endsInBlankLine(previousNodes));

    // The leading gap is part of the cached array, so an unchanged question hands back
    // one stable identity for the preview to memoise on (see `questionRenderCache`).
    const cached = questionRenderCache.get(question);
    let separated: RenderNode[];
    if (
      cached &&
      cached.mode === mode &&
      cached.number === number &&
      cached.stream === questionStream &&
      cached.gapped === gapped
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
      separated = gapped ? [ITEM_GAP, ...nodes] : nodes;
      questionRenderCache.set(question, {
        mode,
        number,
        stream: questionStream,
        gapped,
        nodes: separated,
      });
    }
    previousNodes = separated;

    return { type: 'question', question: { questionId: question.id, number, nodes: separated } };
  });

  const questions = items
    .filter((item): item is Extract<RenderedItem, { type: 'question' }> => item.type === 'question')
    .map((item) => item.question);

  return { bands, cover, title, instructions, items, questions };
}

/**
 * The blank line that separates one top-level item from the next — a heading from what
 * precedes it, and a question from the question before it.
 *
 * With the reference paper's spacing model there is no `w:before`/`w:after` anywhere —
 * every paragraph sits in the same fixed 12pt box — so the only way to open air is to
 * spend a line on it. That is precisely what the reference does: 102 of its 296
 * paragraphs are empty. Emitting it here rather than as paragraph spacing keeps every
 * line on the shared grid, which is the whole point of the fixed rule.
 *
 * The same `blankLine()` the question types use for the gaps *inside* a question, so
 * every gap on the page is one number.
 */
const ITEM_GAP: RenderNode = blankLine();

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
): RenderNode[] {
  switch (element.kind) {
    /*
     * A section heading and a free heading render identically.
     *
     * They differ only in what they mean to numbering — a section restarts it — and
     * numbering is derived before this point. Rendering them the same way is what keeps
     * the flattening invisible in the exported .docx: a v4 document's section heading
     * becomes a `section` element and still emits the byte-identical paragraph.
     */
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
    case 'text':
      return [
        {
          kind: 'text',
          style: 'Body',
          text: element.text,
          format: element.format,
          edit: { kind: 'layoutText', elementId: element.id },
        },
      ];
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
      /*
       * A hanging label keeps its wrapped value text in one column
       * (§ ColumnsNode.hanging).
       *
       * The hang *is* the label column: the row begins at `indent - hanging`, the label
       * prints in that gutter, and the value starts at `indent` — where every wrapped
       * line then also starts, which is the whole point of hanging it. So `valueAt` is
       * not authored in this mode; it is exactly where the hang ends, and storing one
       * too would be a second answer to the same question.
       *
       * The backends place the value cell from `hanging` directly rather than from a
       * fraction, because only they know the row's real width — `render/` may not import
       * the exporter's page constants, and threading page setup down here to compute a
       * fraction would buy nothing the backends cannot already do.
       */
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
