import type { Diagram } from '@/model/diagram';
import { mapDiagramTexts } from '@/model/diagramText';
import { computeNumbering } from '@/model/numbering';
import { areBlocksEmpty, isBiTextEmpty, plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { BiText, ContentBlock, RichText, TableBlock, Worksheet } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import { getQuestionType } from '@/registry';
import type { QualityAnchor } from '@/registry/types';
import { slotInScope } from '@/translate/plan';
import type { TranslateScope } from '@/translate/types';
import type { QualityQuestion } from './types';

/**
 * The questions a check covers, read from the model through the registry's `qualityView`
 * (never the IR or the DOM), and their words as the prompt carries them.
 */

/** Questions in `scope`, in print order; a type without `qualityView` is left out. */
export function qualityQuestions(ws: Worksheet, scope: TranslateScope): QualityQuestion[] {
  const direct = scope.kind === 'questions' || scope.kind === 'flowItems' ? new Set(scope.ids) : null;
  const touched = new Set<string>();
  if (scope.kind !== 'paper' && !direct) {
    for (const slot of collectTexts(ws)) if (slot.questionId && slotInScope(slot, scope)) touched.add(slot.questionId);
  }
  const out: QualityQuestion[] = [];
  for (const { question, number } of computeNumbering(ws).questions) {
    if (scope.kind !== 'paper' && !(direct ?? touched).has(question.id)) continue;
    const view = getQuestionType(question.type)?.qualityView?.(question);
    if (!view) continue;
    const anchors = view.anchors.map((anchor) => {
      const target = anchor.target ?? firstParagraph(anchor.blocks);
      return target ? { ...anchor, target } : anchor;
    });
    out.push({ questionId: question.id, where: `Question ${number}`, format: view.format, anchors });
  }
  return out;
}

function firstParagraph(blocks: ContentBlock[] | undefined): EditTarget | undefined {
  const paragraph = blocks?.find((block) => block.kind === 'paragraph');
  return paragraph ? { kind: 'blockText', blockId: paragraph.id } : undefined;
}

export const anchorEmpty = (anchor: QualityAnchor): boolean =>
  isBiTextEmpty(anchor.text) && areBlocksEmpty(anchor.blocks);

/** Nothing authored in the question: no call is spent on it. */
export const questionEmpty = (question: QualityQuestion): boolean => question.anchors.every(anchorEmpty);

// ---- words as sent ----

/** Plain text with bold and underline kept as <b>…</b> and <u>…</u>, so emphasis can be judged. */
export function runsText(runs: RichText | undefined): string {
  let out = '';
  for (const run of runs ?? []) {
    let text = run.text;
    if (!text) continue;
    if (run.underline && text.trim()) text = `<u>${text}</u>`;
    if (run.bold && text.trim()) text = `<b>${text}</b>`;
    out += text;
  }
  return out.replace(/<\/b><b>/g, '').replace(/<\/u><u>/g, '').trim();
}

const side = (text: BiText | undefined, lang: Side) => (text ? runsText(text[lang]) : '');

function tableLines(table: TableBlock, lang: Side): string[] {
  const rows = table.rows.map((row) =>
    `| ${row.cells.filter((cell) => !cell.covered).map((cell) => plain(cell.text[lang]).replace(/\s+/g, ' ').trim()).join(' | ')} |`,
  );
  const caption = side(table.caption, lang);
  return caption ? [`Table: ${caption}`, ...rows] : rows;
}

function diagramLine(diagram: Diagram, alt: BiText, lang: Side): string {
  const words: string[] = [];
  mapDiagramTexts(diagram, (_segment, text, kind) => {
    const value = plain(text[lang]).trim();
    if (value) words.push(kind === 'axisTitle' ? `axis “${value}”` : value);
    return text;
  });
  const altText = plain(alt[lang]).trim();
  return `[Diagram${altText ? `: ${altText}` : ''}${words.length ? ` — ${words.join('; ')}` : ''}]`;
}

/** One side of a block list as lines: paragraphs, table rows, figure descriptions. */
export function blocksLines(blocks: ContentBlock[] | undefined, lang: Side): string[] {
  const lines: string[] = [];
  for (const block of blocks ?? []) {
    switch (block.kind) {
      case 'paragraph':
        lines.push(side(block.text, lang));
        break;
      case 'table':
        lines.push(...tableLines(block, lang));
        break;
      case 'image': {
        const alt = plain(block.altText?.[lang]).trim();
        lines.push(`[Picture${alt ? `: ${alt}` : ''}]`, side(block.caption, lang));
        break;
      }
      case 'diagram':
        lines.push(diagramLine(block.diagram, block.altText, lang));
        break;
      case 'figureRow':
        lines.push(...blocksLines([block.figure, block.table], lang));
        break;
      case 'source':
        lines.push(side(block.label, lang), ...blocksLines(block.blocks, lang), side(block.footnote, lang));
        break;
      default:
        break;
    }
  }
  return lines.filter((line) => line.length > 0);
}

/** An anchor's words on one side, '' when that side is empty. */
export function anchorText(anchor: QualityAnchor, lang: Side): string {
  return [side(anchor.text, lang), ...blocksLines(anchor.blocks, lang)].filter(Boolean).join('\n');
}
