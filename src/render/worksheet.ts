import { bandIsEmpty, ZONES, zonesOf } from '@/model/bands';
import { pageNumberPlaceholder } from '@/model/page';
import { resolveFlow } from '@/model/flow';
import { sectionMarks, worksheetMarks } from '@/model/marks';
import { computeNumbering } from '@/model/numbering';
import { isBiTextEmpty, plain } from '@/model/text';
import type {
  Band,
  BandField,
  BiText,
  LayoutElement,
  OutputMode,
  Worksheet,
} from '@/model/types';
import { requireQuestionType } from '@/registry';
import { includeNode, type RenderNode } from './ir';

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

/** A non-question design element in the section's flow. */
export interface RenderedLayout {
  elementId: string;
  nodes: RenderNode[];
}

/**
 * The section's contents in display order.
 *
 * Consumers that only care about questions keep using `questions`; consumers that
 * render the page walk `items`, which interleaves layout elements in the teacher's
 * chosen order.
 */
export type RenderedItem =
  | { type: 'question'; question: RenderedQuestion }
  | { type: 'layout'; layout: RenderedLayout };

export interface RenderedSection {
  sectionId: string;
  heading?: RenderNode;
  /** Questions only, in flow order — what numbering and marks totalling consume. */
  questions: RenderedQuestion[];
  /** Everything in the section, questions and layout elements interleaved. */
  items: RenderedItem[];
}

export interface RenderedWorksheet {
  /**
   * The masthead, one node per band row.
   *
   * When a worksheet has bands they replace the plain `title` node on the page: the
   * title is one of the fields inside them, so printing both would duplicate it.
   */
  bands: RenderNode[];
  title: RenderNode;
  instructions?: RenderNode;
  sections: RenderedSection[];
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
      cells.push({
        text: bandFieldText(field, totalMarks),
        at: positions[zone],
        align: alignments[zone],
        format: field.format,
        // Only authored text can be edited in place; a derived total has nowhere to
        // write back to, and a fill-in's rule is generated from its width.
        edit:
          field.kind === 'text' || field.kind === 'fillIn'
            ? { kind: 'bandField', fieldId: field.id }
            : undefined,
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
export function bandFieldText(field: BandField, totalMarks: number): BiText {
  if (field.kind === 'text') return field.text;

  if (field.kind === 'totalMarks') {
    const label = field.label;
    const en = `${plain(label?.en) || 'Full marks:'} ${totalMarks} marks`;
    const zh = `${plain(label?.zh) || '總分：'}${totalMarks}分`;
    return { en: [{ text: en }], zh: [{ text: zh }] };
  }

  // A page number only has a real value at print time. This is the *placeholder* the
  // preview shows; the .docx backend replaces it with live PAGE/NUMPAGES fields, which
  // is why the number here is deliberately not a guess at the current page.
  if (field.kind === 'pageNumber') {
    const text = pageNumberPlaceholder(field.pattern);
    return { en: [{ text }], zh: [{ text }] };
  }

  // A fill-in is its label followed by a rule the teacher writes on.
  const rule = '_'.repeat(Math.max(1, field.widthCh ?? 14));
  return {
    en: [{ text: `${plain(field.label.en)}${rule}` }],
    zh: [{ text: `${plain(field.label.zh)}${rule}` }],
  };
}

export function renderWorksheet(worksheet: Worksheet, mode: OutputMode): RenderedWorksheet {
  const numbering = computeNumbering(worksheet);

  // Derived once and passed down, so a band's "Full marks" can never disagree with the
  // questions it totals (§3.5).
  const total = worksheetMarks(worksheet);
  const bands = (worksheet.bands ?? [])
    .map((band) => renderBand(band, total))
    .filter((node): node is RenderNode => node !== undefined);

  const title: RenderNode = {
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

  // Sections that restart numbering open a new Word list stream, so the restart is
  // native rather than a number we typed in; continuing sections share the previous
  // stream so Word keeps counting across the section break (§4).
  let currentStream = 'question:0';

  const sections = worksheet.sections.map((section, sectionIndex) => {
    if (section.restartNumbering) currentStream = `question:${sectionIndex}`;
    const questionStream = currentStream;

    const heading: RenderNode | undefined = isBiTextEmpty(section.heading)
      ? undefined
      : {
          kind: 'text',
          style: 'Section Heading',
          text: section.heading!,
          keepNext: true,
          edit: { kind: 'sectionHeading', sectionId: section.id },
          format: section.headingFormat,
        };

    // Derived, so a part header's "(19 marks)" tracks the questions inside it (§3.5).
    const sectionTotal = sectionMarks(section);

    // One walk over the resolved flow, so questions and layout elements come out in
    // the teacher's order and the two views below can never disagree.
    const items: RenderedItem[] = resolveFlow(section).map((item) => {
      if (item.type === 'layout') {
        return {
          type: 'layout',
          layout: {
            elementId: item.id,
            nodes: renderLayoutElement(item.element, section.id, sectionTotal),
          },
        };
      }

      const question = item.question;
      const entry = numbering.byQuestionId.get(question.id);
      const number = entry ? entry.number : 0;
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

      return { type: 'question', question: { questionId: question.id, number, nodes } };
    });

    const questions = items
      .filter((item): item is Extract<RenderedItem, { type: 'question' }> => item.type === 'question')
      .map((item) => item.question);

    return { sectionId: section.id, heading, questions, items };
  });

  return { bands, title, instructions, sections };
}

/** Expand a layout element into IR nodes. */
function renderLayoutElement(
  element: LayoutElement,
  sectionId: string,
  sectionTotal: number,
): RenderNode[] {
  switch (element.kind) {
    case 'heading':
      return [
        {
          kind: 'text',
          style: 'Section Heading',
          text: element.text,
          keepNext: true,
          format: element.format,
          edit: { kind: 'layoutText', sectionId, elementId: element.id },
        },
      ];
    case 'text':
      return [
        {
          kind: 'text',
          style: 'Body',
          text: element.text,
          format: element.format,
          edit: { kind: 'layoutText', sectionId, elementId: element.id },
        },
      ];
    case 'spacer':
      return [{ kind: 'spacer', heightPt: element.heightPt }];
    case 'divider':
      return [{ kind: 'divider' }];
    case 'pageBreak':
      return [{ kind: 'pageBreak' }];
    case 'answerLines':
      return [{ kind: 'answerLines', lines: element.lines }];

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
        {
          kind: 'text',
          style: 'Section Heading',
          text: element.showMarks === false
            ? element.text
            : { en: withMarks('en'), zh: withMarks('zh') },
          keepNext: true,
          format: element.format,
          edit: { kind: 'layoutText', sectionId, elementId: element.id },
        },
      ];
    }

    case 'labelList': {
      const valueAt = element.valueAt ?? 0.35;
      return element.rows.map((row) => ({
        kind: 'columns',
        style: 'Body',
        indent: element.indent ?? 480,
        cells: [
          {
            text: row.label,
            at: 0,
            format: element.format,
            edit: {
              kind: 'labelListCell',
              sectionId,
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
              sectionId,
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
  for (const section of rendered.sections) {
    for (const question of section.questions) {
      for (const node of question.nodes) {
        if (node.kind === 'text' && node.listRef && !seen.has(node.listRef.stream)) {
          seen.set(node.listRef.stream, node.listRef.definition);
        }
      }
    }
  }
  return [...seen.entries()].map(([stream, definition]) => ({ stream, definition }));
}
