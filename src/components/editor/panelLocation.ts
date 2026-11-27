import { flattenBlocks } from '@/model/edits';
import { answerBlocksOf, type AnswerOwner } from '@/model/answerBlocks';
import { sourceLetter } from '@/model/drq';
import { partLabel, subPartLabel } from '@/model/numbering';
import type { ContentBlock, StructuredQuestion } from '@/model/types';
import type { PanelKind } from './panelKinds';

/**
 * Where the page's selection sits inside a structured question, as the panel's sticky
 * "where am I" line shows it (k-0474): Question text › Source B, or (c) › (ii) › Teacher
 * only. Read from the model by the selection's `editTargetKey`, never the DOM, the way
 * `StructuredEditorPanel`'s `targetOwner` opens the right row.
 */
export interface Crumb {
  kind: PanelKind;
  label: string;
  /** The `data-panel-anchor` of the card the crumb scrolls to. */
  anchor: string;
}

export interface CrumbWords {
  stem: string;
  source: (letter: string) => string;
  teacher: string;
}

/** Kinds whose key names a block id, so the block is looked up in the content. */
const BLOCK_KINDS = new Set(['blockText', 'blockCaption', 'tableCell', 'sourceLabel', 'sourceFootnote']);
/** Kinds that live in a leaf's teacher-only answer or marking scheme. */
const TEACHER_KINDS = new Set(['partAnswer', 'subPartAnswer', 'questionAnswer', 'schemePoint', 'schemeAlternative', 'schemeLevel', 'schemeEc']);

/** The source among `blocks` that is, or holds, block `id`, with its letter. */
function sourceHolding(blocks: readonly ContentBlock[], id: string): { block: ContentBlock; letter: string } | undefined {
  let ordinal = 0;
  for (const block of blocks) {
    if (block.kind !== 'source') continue;
    if (block.id === id || flattenBlocks(block.blocks).some((inner) => inner.id === id)) {
      return { block, letter: sourceLetter(block, ordinal) };
    }
    ordinal += 1;
  }
  return undefined;
}

const holds = (blocks: readonly ContentBlock[] | undefined, id: string) =>
  Boolean(blocks && flattenBlocks([...blocks]).some((block) => block.id === id));

/** Whether a leaf's answer (its text or any of its blocks) or scheme is what `id` names. */
function inTeacherArea(leaf: AnswerOwner & { id: string; scheme?: unknown }, kind: string, id: string): boolean {
  if (kind === 'partAnswer' || kind === 'subPartAnswer' || kind === 'questionAnswer') return id === leaf.id;
  // The answer's blocks (u-0c5q): a table, picture, diagram or paragraph inside the answer.
  if (BLOCK_KINDS.has(kind)) return holds(answerBlocksOf(leaf), id);
  // A scheme's points, levels and descriptors carry their own ids somewhere inside it.
  return leaf.scheme !== undefined && JSON.stringify(leaf.scheme).includes(`"${id}"`);
}

/** Kinds that may name something in a leaf's teacher area: its answer text, blocks or scheme. */
const inTeacher = (kind: string) => TEACHER_KINDS.has(kind) || BLOCK_KINDS.has(kind);

export function panelLocation(
  question: StructuredQuestion,
  key: string | undefined,
  words: CrumbWords,
): Crumb[] {
  if (!key) return [];
  const [kind, id] = key.split(':');
  if (!id || (!BLOCK_KINDS.has(kind) && !TEACHER_KINDS.has(kind))) return [];
  const teacher = (anchor: string): Crumb => ({ kind: 'scheme', label: words.teacher, anchor });

  // The question text, and a source inside it.
  if (BLOCK_KINDS.has(kind) && holds(question.blocks, id)) {
    const stem: Crumb = { kind: 'stem', label: words.stem, anchor: 'stem' };
    const source = sourceHolding(question.blocks, id);
    return source
      ? [stem, { kind: 'source', label: words.source(source.letter), anchor: source.block.id }]
      : [stem];
  }
  // An essay question with no parts: its answer and scheme.
  if (inTeacher(kind) && question.parts.length === 0 && inTeacherArea(question, kind, id)) {
    return [teacher(`teacher:${question.id}`)];
  }

  for (const [partIndex, part] of question.parts.entries()) {
    const partCrumb: Crumb = { kind: 'part', label: partLabel(partIndex), anchor: part.id };
    for (const [subIndex, sub] of (part.subParts ?? []).entries()) {
      const subCrumb: Crumb = { kind: 'subPart', label: subPartLabel(subIndex), anchor: sub.id };
      if (BLOCK_KINDS.has(kind) && holds(sub.blocks, id)) return [partCrumb, subCrumb];
      if (inTeacher(kind) && inTeacherArea(sub, kind, id)) {
        return [partCrumb, subCrumb, teacher(`teacher:${sub.id}`)];
      }
    }
    if (BLOCK_KINDS.has(kind) && (holds(part.blocks, id) || holds(part.blocksBefore, id))) return [partCrumb];
    if (inTeacher(kind) && inTeacherArea(part, kind, id)) return [partCrumb, teacher(`teacher:${part.id}`)];
  }
  return [];
}
