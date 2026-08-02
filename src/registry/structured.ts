import { createStructuredQuestion } from '@/model/factories';
import { partMarks, questionMarks } from '@/model/marks';
import {
  PART_TEXT_INDENT,
  STEM_TEXT_INDENT,
  SUBPART_TEXT_INDENT,
  partLabel,
  subPartLabel,
} from '@/model/numbering';
import { bi, isBiTextEmpty } from '@/model/text';
import type { StructuredQuestion } from '@/model/types';
import { pushGap, renderContentBlocks, type RenderContext, type RenderNode } from '@/render/ir';
import { StructuredEditorPanel } from '@/components/editor/StructuredEditorPanel';
import type { QuestionTypeDefinition } from './types';

/**
 * Structured rendering (§8): stem -> parts (a).. -> sub-parts (i).. with marks on
 * each leaf, teacher answers after the leaf they belong to, question total at the end.
 *
 * Parts and sub-parts sit at levels 1 and 2 of the shared "question" multilevel
 * definition, so Word maintains 1. / (a) / (i) as one live list (§7.2).
 */
function render(question: StructuredQuestion, context: RenderContext): RenderNode[] {
  const nodes: RenderNode[] = [];
  const [firstBlock, ...restBlocks] = question.blocks;

  const numberedRef = {
    stream: context.questionStream,
    definition: 'question' as const,
    level: 0,
    marker: `${context.questionNumber}.`,
  };

  /*
   * With no parts the question *is* the leaf: the stem carries the marks label and the
   * writing room follows it, exactly as a part would (§`StructuredQuestion.answerSpace`).
   * With parts the stem is a lead-in, so marks belong on whichever part is being marked
   * and hanging them here would label the introduction rather than the question.
   */
  const isLeaf = question.parts.length === 0;
  const stemMarks = isLeaf ? questionMarks(question) || undefined : undefined;

  if (firstBlock && firstBlock.kind === 'paragraph') {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: firstBlock.text,
      marks: restBlocks.length === 0 ? stemMarks : undefined,
      keepNext: true,
      // Built by hand rather than through `renderContentBlocks`, so the block's own
      // formatting has to be carried across explicitly — see the note in `mcq.ts`.
      format: firstBlock.format,
      edit: { kind: 'blockText', blockId: firstBlock.id },
      listRef: numberedRef,
    });
    // Continuation blocks indent to the stem's own text column, exactly as a part's do
    // to theirs (§ STEM_TEXT_INDENT) — without it a paragraph after the stem's table
    // printed at the page margin, hanging in the question number's gutter.
    nodes.push(
      ...renderContentBlocks(restBlocks, 'Question Stem', {
        keepNext: true,
        indent: STEM_TEXT_INDENT,
      }),
    );
  } else {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: { en: [], zh: [] },
      marks: question.blocks.length === 0 ? stemMarks : undefined,
      keepNext: true,
      listRef: numberedRef,
    });
    nodes.push(
      ...renderContentBlocks(question.blocks, 'Question Stem', {
        keepNext: true,
        indent: STEM_TEXT_INDENT,
      }),
    );
  }

  /*
   * The marks label belongs on the stem's *last* line, so a multi-paragraph stem does
   * not print "(8 marks)" against its opening sentence with three more to follow. The
   * branches above claim it only when they emitted the whole stem themselves; otherwise
   * it lands here, on the trailing block `renderContentBlocks` produced.
   */
  if (isLeaf && stemMarks !== undefined) {
    const last = nodes[nodes.length - 1];
    if (last && last.kind === 'text' && last.marks === undefined) last.marks = stemMarks;
  }

  // The leaf question's own writing room, under the stem it answers (§ the LQ line).
  // Absent prints nothing, like marks.
  if (isLeaf && question.answerSpace !== undefined && question.answerSpace > 0) {
    nodes.push({ kind: 'answerSpace', lines: question.answerSpace });
  }

  question.parts.forEach((part, partIndex) => {
    const subParts = part.subParts ?? [];
    const hasSubParts = subParts.length > 0;
    const [partFirst, ...partRest] = part.blocks;

    /*
     * A group of sub-parts sharing one marks label (§`QuestionSubPart.marks`).
     *
     * When no sub-part is separately marked, the part's total belongs to the group as a
     * whole. The reference prints it against the **last** sub-part — DSE 2019 P2 Q13(b)
     * puts "(5 marks)" after (ii), covering (i) and (ii) together — so that is where it
     * goes. On the part's own line it would read as marks for the part's lead-in text,
     * which is not what is being marked.
     */
    const sharedMarks = hasSubParts && subParts.every((sub) => sub.marks === undefined);
    const sharedMarksIndex = sharedMarks ? subParts.length - 1 : -1;

    /*
     * A blank line before every part — including the first, which separates part (a)
     * from the stem above it. This is the reference paper's shape: stem, blank, (a),
     * blank, (b). The gap is a spent line because the page runs on a fixed 12pt line
     * with no paragraph spacing (§ One fixed line, no paragraph spacing).
     */
    pushGap(nodes);
    const partRef = {
      stream: context.questionStream,
      definition: 'question' as const,
      level: 1,
      marker: partLabel(partIndex),
    };

    if (partFirst && partFirst.kind === 'paragraph') {
      nodes.push({
        kind: 'text',
        style: 'Sub-question',
        text: partFirst.text,
        // A leaf part shows its own marks; a part with sub-parts does not (§3.5).
        marks: hasSubParts ? undefined : partMarks(part),
        keepNext: true,
        format: partFirst.format,
        edit: { kind: 'blockText', blockId: partFirst.id },
        listRef: partRef,
      });
      nodes.push(...renderContentBlocks(partRest, 'Sub-question', { keepNext: true, indent: PART_TEXT_INDENT }));
    } else {
      nodes.push({
        kind: 'text',
        style: 'Sub-question',
        text: { en: [], zh: [] },
        marks: hasSubParts ? undefined : partMarks(part),
        keepNext: true,
        listRef: partRef,
      });
      nodes.push(...renderContentBlocks(part.blocks, 'Sub-question', { keepNext: true, indent: PART_TEXT_INDENT }));
    }

    if (!hasSubParts && !isBiTextEmpty(part.answer)) {
      nodes.push({
        kind: 'text',
        style: 'Marking Scheme',
        teacherOnly: true,
        text: part.answer!,
        indent: PART_TEXT_INDENT,
        edit: { kind: 'partAnswer', questionId: question.id, partId: part.id },
      });
    }

    subParts.forEach((subPart, subIndex) => {
      const [subFirst, ...subRest] = subPart.blocks;
      // Its own marks, or — for a group sharing one label — the part's total on the last.
      const subMarks = subIndex === sharedMarksIndex ? partMarks(part) : subPart.marks;
      const subRef = {
        stream: context.questionStream,
        definition: 'question' as const,
        level: 2,
        marker: subPartLabel(subIndex),
      };

      // Each (i)/(ii) sub-part gets the same blank line above it that its parent part
      // gets, so the depths read alike rather than sub-parts running together. Via
      // `pushGap`, so a part whose text ends in a trailing hard break does not open a
      // double gap before its first sub-part.
      pushGap(nodes);

      if (subFirst && subFirst.kind === 'paragraph') {
        nodes.push({
          kind: 'text',
          style: 'Sub-sub-question',
          text: subFirst.text,
          marks: subMarks,
          keepNext: true,
          format: subFirst.format,
          edit: { kind: 'blockText', blockId: subFirst.id },
          listRef: subRef,
        });
        nodes.push(
          ...renderContentBlocks(subRest, 'Sub-sub-question', { keepNext: true, indent: SUBPART_TEXT_INDENT }),
        );
      } else {
        nodes.push({
          kind: 'text',
          style: 'Sub-sub-question',
          text: { en: [], zh: [] },
          marks: subMarks,
          keepNext: true,
          listRef: subRef,
        });
        nodes.push(
          ...renderContentBlocks(subPart.blocks, 'Sub-sub-question', { keepNext: true, indent: SUBPART_TEXT_INDENT }),
        );
      }

      if (!isBiTextEmpty(subPart.answer)) {
        nodes.push({
          kind: 'text',
          style: 'Marking Scheme',
          teacherOnly: true,
          text: subPart.answer!,
          indent: SUBPART_TEXT_INDENT,
          edit: {
            kind: 'subPartAnswer',
            questionId: question.id,
            partId: part.id,
            subPartId: subPart.id,
          },
        });
      }

      // The QAB's writing room, directly under the sub-part it answers (§ the LQ
      // line). Absent prints nothing, like marks.
      if (subPart.answerSpace !== undefined && subPart.answerSpace > 0) {
        nodes.push({ kind: 'answerSpace', lines: subPart.answerSpace });
      }
    });

    // A part with sub-parts still shows its aggregate answer, if the teacher wrote one.
    if (hasSubParts && !isBiTextEmpty(part.answer)) {
      nodes.push({
        kind: 'text',
        style: 'Marking Scheme',
        teacherOnly: true,
        text: part.answer!,
        indent: PART_TEXT_INDENT,
        edit: { kind: 'partAnswer', questionId: question.id, partId: part.id },
      });
    }

    // The part's own writing room, after the whole group. Each sub-part's space is its
    // own field, so this is the per-part room a QAB grants a leaf part.
    if (part.answerSpace !== undefined && part.answerSpace > 0) {
      nodes.push({ kind: 'answerSpace', lines: part.answerSpace });
    }
  });

  // Opt-in, and off by default: a multi-part question is normally marked per-part, so
  // the trailing sum is noise unless the teacher asks for it.
  if (question.showTotalMarks) {
    const total = questionMarks(question);
    nodes.push({
      kind: 'text',
      style: 'Marks',
      text: bi(`(Total: ${total} marks)`, `（共${total}分）`),
    });
  }

  return nodes;
}

function countMissingTranslations(question: StructuredQuestion): number {
  let missing = 0;
  const check = (text?: { en: unknown[]; zh: unknown[] }) => {
    if (!text) return;
    if ((text.en.length > 0) !== (text.zh.length > 0)) missing += 1;
  };
  const checkBlocks = (blocks: StructuredQuestion['blocks']) => {
    for (const block of blocks) if (block.kind === 'paragraph') check(block.text);
  };
  checkBlocks(question.blocks);
  question.parts.forEach((part) => {
    checkBlocks(part.blocks);
    check(part.answer);
    (part.subParts ?? []).forEach((sub) => {
      checkBlocks(sub.blocks);
      check(sub.answer);
    });
  });
  return missing;
}

export const structuredType: QuestionTypeDefinition<StructuredQuestion> = {
  id: 'structured',
  displayName: bi('Structured Question', '結構性問題'),
  create: createStructuredQuestion,
  render,
  EditorPanel: StructuredEditorPanel,
  countMissingTranslations,
};
