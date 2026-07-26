import { createStructuredQuestion } from '@/model/factories';
import { partMarks, questionMarks } from '@/model/marks';
import { partLabel, subPartLabel } from '@/model/numbering';
import { bi, isBiTextEmpty } from '@/model/text';
import type { StructuredQuestion } from '@/model/types';
import { renderContentBlocks, type RenderContext, type RenderNode } from '@/render/ir';
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

  if (firstBlock && firstBlock.kind === 'paragraph') {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: firstBlock.text,
      keepNext: true,
      edit: { kind: 'blockText', blockId: firstBlock.id },
      listRef: numberedRef,
    });
    nodes.push(...renderContentBlocks(restBlocks, 'Question Stem', { keepNext: true }));
  } else {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: { en: [], zh: [] },
      keepNext: true,
      listRef: numberedRef,
    });
    nodes.push(...renderContentBlocks(question.blocks, 'Question Stem', { keepNext: true }));
  }

  question.parts.forEach((part, partIndex) => {
    const hasSubParts = Boolean(part.subParts && part.subParts.length > 0);
    const [partFirst, ...partRest] = part.blocks;
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
        edit: { kind: 'blockText', blockId: partFirst.id },
        listRef: partRef,
      });
      nodes.push(...renderContentBlocks(partRest, 'Sub-question', { keepNext: true, indent: 720 }));
    } else {
      nodes.push({
        kind: 'text',
        style: 'Sub-question',
        text: { en: [], zh: [] },
        marks: hasSubParts ? undefined : partMarks(part),
        keepNext: true,
        listRef: partRef,
      });
      nodes.push(...renderContentBlocks(part.blocks, 'Sub-question', { keepNext: true, indent: 720 }));
    }

    if (!hasSubParts && !isBiTextEmpty(part.answer)) {
      nodes.push({
        kind: 'text',
        style: 'Marking Scheme',
        teacherOnly: true,
        text: part.answer!,
        indent: 720,
        edit: { kind: 'partAnswer', questionId: question.id, partId: part.id },
      });
    }

    (part.subParts ?? []).forEach((subPart, subIndex) => {
      const [subFirst, ...subRest] = subPart.blocks;
      const subRef = {
        stream: context.questionStream,
        definition: 'question' as const,
        level: 2,
        marker: subPartLabel(subIndex),
      };

      if (subFirst && subFirst.kind === 'paragraph') {
        nodes.push({
          kind: 'text',
          style: 'Sub-sub-question',
          text: subFirst.text,
          marks: subPart.marks,
          keepNext: true,
          edit: { kind: 'blockText', blockId: subFirst.id },
          listRef: subRef,
        });
        nodes.push(
          ...renderContentBlocks(subRest, 'Sub-sub-question', { keepNext: true, indent: 1440 }),
        );
      } else {
        nodes.push({
          kind: 'text',
          style: 'Sub-sub-question',
          text: { en: [], zh: [] },
          marks: subPart.marks,
          keepNext: true,
          listRef: subRef,
        });
        nodes.push(
          ...renderContentBlocks(subPart.blocks, 'Sub-sub-question', { keepNext: true, indent: 1440 }),
        );
      }

      if (!isBiTextEmpty(subPart.answer)) {
        nodes.push({
          kind: 'text',
          style: 'Marking Scheme',
          teacherOnly: true,
          text: subPart.answer!,
          indent: 1440,
          edit: {
            kind: 'subPartAnswer',
            questionId: question.id,
            partId: part.id,
            subPartId: subPart.id,
          },
        });
      }
    });

    // A part with sub-parts still shows its aggregate answer, if the teacher wrote one.
    if (hasSubParts && !isBiTextEmpty(part.answer)) {
      nodes.push({
        kind: 'text',
        style: 'Marking Scheme',
        teacherOnly: true,
        text: part.answer!,
        indent: 720,
        edit: { kind: 'partAnswer', questionId: question.id, partId: part.id },
      });
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
