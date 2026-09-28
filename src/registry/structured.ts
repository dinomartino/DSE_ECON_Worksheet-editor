import { fillWritten, type AnswerVisitor } from '@/model/answerLeaves';
import { createStructuredQuestion } from '@/model/factories';
import { questionMarks } from '@/model/marks';
import { isSchemeEmpty } from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import {
  partLabel,
  subPartLabel,
} from '@/model/numbering';
import { areBlocksEmpty, bi, isBiTextEmpty } from '@/model/text';
import { mapSame, patch, type TextWalker } from '@/model/textSlots';
import type { BiText, DiagramBlock, StructuredQuestion } from '@/model/types';
import {
  diagramNodeFor,
  pushGap,
  renderContentBlocks,
  type RenderContext,
  type RenderNode,
} from '@/render/ir';
import { renderMarkScheme } from '@/render/markScheme';
import { answerGraphNode } from '@/render/answerGraph';
import { StructuredEditorPanel } from '@/components/editor/StructuredEditorPanel';
import type { AnswerKeyEntry, AnswerKeyRow } from '@/render/answerKey';
import type { QuestionHealthFacts, QuestionTypeDefinition } from './types';

/**
 * Structured rendering (§8): stem -> parts (a).. -> sub-parts (i).. with marks on
 * each leaf, teacher answers after the leaf they belong to, question total at the end.
 *
 * Parts and sub-parts sit at levels 1 and 2 of the shared "question" multilevel
 * definition, so Word maintains 1. / (a) / (i) as one live list (§7.2).
 */
/**
 * Put a marks label on the *last* text line a leaf emitted (§"(4 marks)" sits on the
 * last line with text). A leaf whose blocks run paragraph → table → paragraph must
 * print its marks against the closing paragraph, not the lead-in — the reference (DSE
 * 2025 P2 Q9(d)) asks the question after its boxed advertisement, and the label
 * belongs on what is being asked. Walks back over tables, figures and spacers to the
 * nearest paragraph; a leaf ending in a table keeps the label on its lead-in.
 */
function attachMarksToLastText(
  nodes: RenderNode[],
  fromIndex: number,
  marks: number | undefined,
): void {
  if (marks === undefined) return;
  for (let index = nodes.length - 1; index >= fromIndex; index--) {
    const node = nodes[index];
    if (node.kind === 'text') {
      node.marks = marks;
      return;
    }
  }
}

/**
 * A leaf's model answer diagram (§ `QuestionPart.answerDiagram`), teacher-only. A diagram
 * node carries no indent, so it takes its block's own alignment (centred by default).
 */
function pushAnswerDiagram(nodes: RenderNode[], block: DiagramBlock | undefined): void {
  if (block) nodes.push(diagramNodeFor(block, { teacherOnly: true }));
}

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
    renderContentBlocks(nodes, restBlocks, 'Question Stem', {
      keepNext: true,
      indent: context.indents.stemText,
    });
  } else {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: { en: [], zh: [] },
      marks: question.blocks.length === 0 ? stemMarks : undefined,
      keepNext: true,
      listRef: numberedRef,
    });
    renderContentBlocks(nodes, question.blocks, 'Question Stem', {
      keepNext: true,
      indent: context.indents.stemText,
    });
  }

  /*
   * The marks label belongs on the stem's *last* line, so a multi-paragraph stem does
   * not print "(8 marks)" against its opening sentence with three more to follow. The
   * branches above claim it only when they emitted the whole stem themselves; otherwise
   * it lands here, on the trailing text `renderContentBlocks` produced.
   */
  const stemClaimed =
    (firstBlock && firstBlock.kind === 'paragraph' && restBlocks.length === 0) ||
    question.blocks.length === 0;
  if (isLeaf && !stemClaimed) attachMarksToLastText(nodes, 0, stemMarks);

  // The leaf question's own writing room, under the stem it answers (§ the LQ line).
  // Absent prints nothing, like marks. Blank axes to draw on come first (§ AnswerGraph),
  // after the teacher's model diagram.
  if (isLeaf) pushAnswerDiagram(nodes, question.answerDiagram);
  if (isLeaf && question.answerGraph) nodes.push(answerGraphNode(question.answerGraph));
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

    /*
     * The mid-question interlude (§`QuestionPart.blocksBefore`): unnumbered blocks that
     * revise the scenario before this part is asked.
     *
     * At `STEM_TEXT_INDENT`, not `PART_TEXT_INDENT` — it is level with the stem because
     * it addresses the whole group of parts below it, and indenting it to the part would
     * read as a continuation of (a) above. `keepNext` holds it against the part it
     * introduces, or Word breaks the page between the new scenario and the only question
     * that uses it. Its trailing gap goes through `pushGap`, so an interlude ending in a
     * hard break does not open a double blank before the part's number.
     */
    const interlude = part.blocksBefore ?? [];
    if (interlude.length > 0) {
      renderContentBlocks(nodes, interlude, 'Question Stem', {
        keepNext: true,
        indent: context.indents.stemText,
      });
      pushGap(nodes);
    }

    const partRef = {
      stream: context.questionStream,
      definition: 'question' as const,
      level: 1,
      marker: partLabel(partIndex),
    };

    // A leaf part shows its own marks; a part with sub-parts does not (§3.5). Like the
    // stem, the label lands on the part's *last* text line: a part running
    // paragraph → table → paragraph asks its question after the table, and printing
    // "(2 marks)" against the lead-in labels the wrong sentence.
    //
    // The label reads `part.marks` raw, not `partMarks()` — the totals helper spells
    // absent as 0, and "absent prints nothing, 0 prints (0 marks)" needs the two
    // kept apart. An unmarked leaf part prints no label at all.
    const leafMarks = hasSubParts ? undefined : part.marks;
    const partStart = nodes.length;

    if (partFirst && partFirst.kind === 'paragraph') {
      nodes.push({
        kind: 'text',
        style: 'Sub-question',
        text: partFirst.text,
        marks: partRest.length === 0 ? leafMarks : undefined,
        keepNext: true,
        format: partFirst.format,
        edit: { kind: 'blockText', blockId: partFirst.id },
        listRef: partRef,
      });
      renderContentBlocks(nodes, partRest, 'Sub-question', { keepNext: true, indent: context.indents.partText });
      if (partRest.length > 0) attachMarksToLastText(nodes, partStart, leafMarks);
    } else {
      nodes.push({
        kind: 'text',
        style: 'Sub-question',
        text: { en: [], zh: [] },
        marks: part.blocks.length === 0 ? leafMarks : undefined,
        keepNext: true,
        listRef: partRef,
      });
      renderContentBlocks(nodes, part.blocks, 'Sub-question', { keepNext: true, indent: context.indents.partText });
      if (part.blocks.length > 0) attachMarksToLastText(nodes, partStart, leafMarks);
    }

    if (!hasSubParts && !isBiTextEmpty(part.answer)) {
      nodes.push({
        kind: 'text',
        style: 'Marking Scheme',
        teacherOnly: true,
        text: part.answer!,
        indent: context.indents.partText,
        // An answer keeps with the model diagram under it.
        ...(part.answerDiagram ? { keepNext: true } : {}),
        edit: { kind: 'partAnswer', questionId: question.id, partId: part.id },
      });
    }
    // The model diagram, then the HKEAA scheme, follow the plain answer; teacher only.
    if (!hasSubParts) {
      pushAnswerDiagram(nodes, part.answerDiagram);
      nodes.push(
        ...renderMarkScheme(part.scheme, { indent: context.indents.partText, teacherOnly: true }),
      );
    }

    subParts.forEach((subPart, subIndex) => {
      const [subFirst, ...subRest] = subPart.blocks;
      // Its own marks, or — for a group sharing one label — the part's own marks on
      // the last. Raw `part.marks`, not `partMarks()`: with the whole group unmarked
      // the label is absent and nothing prints, rather than a phantom "(0 marks)".
      const subMarks = subIndex === sharedMarksIndex ? part.marks : subPart.marks;
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

      // The sub-part's label follows the same last-line rule as the part's.
      const subStart = nodes.length;

      if (subFirst && subFirst.kind === 'paragraph') {
        nodes.push({
          kind: 'text',
          style: 'Sub-sub-question',
          text: subFirst.text,
          marks: subRest.length === 0 ? subMarks : undefined,
          keepNext: true,
          format: subFirst.format,
          edit: { kind: 'blockText', blockId: subFirst.id },
          listRef: subRef,
        });
        renderContentBlocks(nodes, subRest, 'Sub-sub-question', { keepNext: true, indent: context.indents.subPartText });
        if (subRest.length > 0) attachMarksToLastText(nodes, subStart, subMarks);
      } else {
        nodes.push({
          kind: 'text',
          style: 'Sub-sub-question',
          text: { en: [], zh: [] },
          marks: subPart.blocks.length === 0 ? subMarks : undefined,
          keepNext: true,
          listRef: subRef,
        });
        renderContentBlocks(nodes, subPart.blocks, 'Sub-sub-question', { keepNext: true, indent: context.indents.subPartText });
        if (subPart.blocks.length > 0) attachMarksToLastText(nodes, subStart, subMarks);
      }

      if (!isBiTextEmpty(subPart.answer)) {
        nodes.push({
          kind: 'text',
          style: 'Marking Scheme',
          teacherOnly: true,
          text: subPart.answer!,
          indent: context.indents.subPartText,
          ...(subPart.answerDiagram ? { keepNext: true } : {}),
          edit: {
            kind: 'subPartAnswer',
            questionId: question.id,
            partId: part.id,
            subPartId: subPart.id,
          },
        });
      }
      pushAnswerDiagram(nodes, subPart.answerDiagram);
      nodes.push(
        ...renderMarkScheme(subPart.scheme, {
          indent: context.indents.subPartText,
          teacherOnly: true,
        }),
      );

      // The QAB's writing room, directly under the sub-part it answers (§ the LQ
      // line). Absent prints nothing, like marks.
      if (subPart.answerGraph) nodes.push(answerGraphNode(subPart.answerGraph));
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
        indent: context.indents.partText,
        // An answer keeps with the model diagram under it.
        ...(part.answerDiagram ? { keepNext: true } : {}),
        edit: { kind: 'partAnswer', questionId: question.id, partId: part.id },
      });
    }
    if (hasSubParts) {
      pushAnswerDiagram(nodes, part.answerDiagram);
      nodes.push(
        ...renderMarkScheme(part.scheme, { indent: context.indents.partText, teacherOnly: true }),
      );
    }

    // The part's own writing room, after the whole group. Each sub-part's space is its
    // own field, so this is the per-part room a QAB grants a leaf part.
    if (part.answerGraph) nodes.push(answerGraphNode(part.answerGraph));
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

/**
 * Print order: stem, answer figure, blank axes, then each part — interlude, body, its
 * sub-parts (body, answer, answer figure, scheme, blank axes), answer, answer figure,
 * scheme, blank axes. A part without sub-parts prints its answer before the (empty)
 * sub-parts, so one order serves both. Question-level figures print only without parts.
 * Letters label review rows only; they are never text to translate.
 */
function mapTexts(question: StructuredQuestion, walk: TextWalker): StructuredQuestion {
  const questionId = question.id;
  const own = question.parts.length > 0 ? walk.unprinted() : walk;
  return patch(question, {
    blocks: walk.blocks('blocks', question.blocks, { paragraphKind: 'stem' }),
    answerDiagram: own.diagramBlock('answerDiagram', question.answerDiagram, 'teacher'),
    answerGraph: own.answerGraph('answerGraph', question.answerGraph, 'print'),
    parts: mapSame(question.parts, (part, index) => {
      const partId = part.id;
      const w = walk.scope(`part:${partId}`, partLabel(index));
      return patch(part, {
        blocksBefore: w.optionalBlocks('blocksBefore', part.blocksBefore),
        blocks: w.blocks('blocks', part.blocks, { paragraphKind: 'part' }),
        subParts: part.subParts && mapSame(part.subParts, (sub, subIndex) => {
          const sw = w.scope(`sub:${sub.id}`, `${partLabel(index)}${subPartLabel(subIndex)}`);
          return patch(sub, {
            blocks: sw.blocks('blocks', sub.blocks, { paragraphKind: 'part' }),
            answer: sw.optional('answer', sub.answer, {
              kind: 'answer', role: 'teacher', target: { kind: 'subPartAnswer', questionId, partId, subPartId: sub.id },
            }),
            answerDiagram: sw.diagramBlock('answerDiagram', sub.answerDiagram, 'teacher'),
            scheme: sw.scheme('scheme', sub.scheme),
            answerGraph: sw.answerGraph('answerGraph', sub.answerGraph, 'print'),
          });
        }),
        answer: w.optional('answer', part.answer, {
          kind: 'answer', role: 'teacher', target: { kind: 'partAnswer', questionId, partId },
        }),
        answerDiagram: w.diagramBlock('answerDiagram', part.answerDiagram, 'teacher'),
        scheme: w.scheme('scheme', part.scheme),
        answerGraph: w.answerGraph('answerGraph', part.answerGraph, 'print'),
      });
    }),
  });
}

/**
 * Each answerable leaf — a part without sub-parts, or a sub-part — for the AI answer
 * writer. The part is every leaf's stamp: editing its body or any sub-part is stale.
 */
function mapAnswers(question: StructuredQuestion, visit: AnswerVisitor): StructuredQuestion {
  const questionId = question.id;
  return patch(question, {
    parts: mapSame(question.parts, (part, index) => {
      const partId = part.id;
      const subParts = part.subParts ?? [];
      if (subParts.length === 0) {
        return fillWritten(part, visit({
          shape: 'written', key: `part:${partId}`, label: partLabel(index), stamp: part,
          ...(part.marks !== undefined ? { marks: part.marks } : {}),
          blank: areBlocksEmpty(part.blocks), answer: part.answer, scheme: part.scheme,
          answerTarget: { kind: 'partAnswer', questionId, partId },
        }));
      }
      return patch(part, {
        subParts: mapSame(subParts, (sub, subIndex) => fillWritten(sub, visit({
          shape: 'written', key: `part:${partId}/sub:${sub.id}`, label: `${partLabel(index)}${subPartLabel(subIndex)}`, stamp: part,
          ...(sub.marks !== undefined ? { marks: sub.marks } : {}),
          blank: areBlocksEmpty(sub.blocks), answer: sub.answer, scheme: sub.scheme,
          answerTarget: { kind: 'subPartAnswer', questionId, partId, subPartId: sub.id },
        }))),
      });
    }),
  });
}

/** A part's answer covers its sub-parts; otherwise each unanswered leaf counts once. */
function healthFacts(question: StructuredQuestion): QuestionHealthFacts {
  let unansweredParts = 0;
  let bodyEmpty = true;
  for (const part of question.parts) {
    const subParts = part.subParts ?? [];
    if (!areBlocksEmpty(part.blocksBefore) || !areBlocksEmpty(part.blocks)) bodyEmpty = false;
    if (subParts.some((sub) => !areBlocksEmpty(sub.blocks))) bodyEmpty = false;
    // A marking scheme or a model diagram answers its leaf as fully as answer text does.
    const answered = (leaf: { answer?: BiText; scheme?: MarkScheme; answerDiagram?: DiagramBlock }) =>
      !isBiTextEmpty(leaf.answer) || !isSchemeEmpty(leaf.scheme) || Boolean(leaf.answerDiagram);
    if (answered(part)) continue;
    unansweredParts += subParts.length === 0 ? 1 : subParts.filter((sub) => !answered(sub)).length;
  }
  return { empty: areBlocksEmpty(question.blocks) && bodyEmpty, unansweredParts };
}

/**
 * The answer key's rows: each part and sub-part with the marks the paper prints on it
 * (same placement as `render` — a shared label on the last sub-part, absent prints
 * nothing) and the author's answer text.
 */
function answerKey(question: StructuredQuestion): AnswerKeyEntry {
  const rows: AnswerKeyRow[] = [];
  question.parts.forEach((part, partIndex) => {
    const subParts = part.subParts ?? [];
    const hasSubParts = subParts.length > 0;
    const sharedMarksIndex =
      hasSubParts && subParts.every((sub) => sub.marks === undefined) ? subParts.length - 1 : -1;
    rows.push({
      depth: 1,
      label: partLabel(partIndex),
      marks: hasSubParts ? undefined : part.marks,
      answer: hasSubParts ? undefined : part.answer,
      ...(!hasSubParts && part.answerDiagram ? { diagram: part.answerDiagram } : {}),
      ...(!hasSubParts && part.scheme ? { scheme: part.scheme } : {}),
    });
    subParts.forEach((subPart, subIndex) => {
      rows.push({
        depth: 2,
        label: subPartLabel(subIndex),
        marks: subIndex === sharedMarksIndex ? part.marks : subPart.marks,
        answer: subPart.answer,
        ...(subPart.answerDiagram ? { diagram: subPart.answerDiagram } : {}),
        ...(subPart.scheme ? { scheme: subPart.scheme } : {}),
      });
    });
    // A part with sub-parts may still carry an aggregate answer (and scheme), printed
    // after the group.
    if (
      hasSubParts &&
      (!isBiTextEmpty(part.answer) || !isSchemeEmpty(part.scheme) || part.answerDiagram)
    ) {
      rows.push({
        depth: 1,
        ...(!isBiTextEmpty(part.answer) ? { answer: part.answer } : {}),
        ...(part.answerDiagram ? { diagram: part.answerDiagram } : {}),
        ...(part.scheme ? { scheme: part.scheme } : {}),
      });
    }
  });
  // With no parts the question is the leaf, and its marks ride on its own line; its
  // model diagram is an unlabelled row under the number.
  const marks = question.parts.length === 0 ? questionMarks(question) || undefined : undefined;
  if (question.parts.length === 0 && question.answerDiagram) {
    rows.push({ depth: 1, diagram: question.answerDiagram });
  }
  return { kind: 'scheme', marks, rows };
}

export const structuredType: QuestionTypeDefinition<StructuredQuestion> = {
  id: 'structured',
  displayName: bi('Structured Question', '結構性問題'),
  create: createStructuredQuestion,
  render,
  EditorPanel: StructuredEditorPanel,
  mapTexts,
  mapAnswers,
  healthFacts,
  answerKey,
  // Timed by marks, at the paper's rate (`MINUTES_PER_MARK`).
  summary: { label: { en: 'structured', zh: '結構題' } },
};
