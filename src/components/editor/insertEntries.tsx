import {
  createAnswerLinesElement,
  createAnswerSpaceElement,
  createDividerElement,
  createHeadingElement,
  createLabelListElement,
  createPageBreakElement,
  createPartHeaderElement,
  createQuestionCountElement,
  createSectionElement,
  createSpacerElement,
  createStimulusElement,
  createTextElement,
} from '@/model/flow';
import { documentShape, offersLayoutKind } from '@/model/documentShape';
import { createTableBlock } from '@/model/factories';
import { insertHostFor } from '@/model/insertHost';
import { contentWidth, pageSetupOf } from '@/model/page';
import { defaultTableIndent } from '@/model/table';
import { bi, plain } from '@/model/text';
import type { ContentBlock, LayoutElement, Worksheet } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { useBankSession } from '@/components/bank/bankSession';
import {
  AnswerLinesIcon,
  AnswerSpaceIcon,
  DividerIcon,
  HeadingIcon,
  ImageIcon,
  LabelListIcon,
  ListIcon,
  McqIcon,
  PageBreakIcon,
  PartHeaderIcon,
  QuestionCountIcon,
  SectionIcon,
  SpacerIcon,
  StimulusIcon,
  StructuredIcon,
  TableIcon,
  TextIcon,
} from '@/components/ui/icons';
import type { Messages } from '@/i18n/catalogue';
import type { ADD_RAIL_MESSAGES } from './AddRail.messages';

/**
 * Everything the Insert and Question menus offer, built in one place (k-0201) so the rail
 * (`AddRail`) and ⌘K (`CommandPalette`) list the same entries, with the same words, and a
 * new entry reaches both.
 */

/** The hidden file input Picture… clicks (rendered by `AddRail`). */
export const PICTURE_INPUT = 'add-rail-picture-input';

/** One insertable thing. Nothing is constructed until it runs. */
export interface InsertEntry {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** `afterId` is the item to land behind, or undefined to append. */
  run?: (afterId?: string) => void;
  /** Word's size grid opens in the flyout's place; the table lands at the size picked. */
  pickTable?: (rows: number, columns: number, afterId?: string) => void;
  /** Kinds to choose between, listed under the entry once it is clicked ("Answer lines…"). */
  choices?: InsertEntry[];
}

export interface InsertContext {
  m: Messages<typeof ADD_RAIL_MESSAGES>;
  /** The English interface: question types carry their 中文 name as the hint. */
  english: boolean;
  worksheet: Worksheet;
  /** The insert anchor: where the entries land. */
  afterId?: string;
  /** "Q3", a heading's words…: `flowItemLabel` by printed number. */
  labelFor: (id: string | undefined) => string | undefined;
  /** With no anchor, the section each question type lands in, by its short label. */
  typeDestinations?: Map<string, string | undefined>;
  addQuestion: (typeId: string, afterId?: string) => void;
  addLayoutElement: (element: LayoutElement, afterId?: string) => void;
  insertBlockAtAnchor: (block: ContentBlock, afterId?: string) => void;
}

/** The Question menu's entries and the Insert menu's, as this paper offers them. */
export function buildInsertEntries({
  m,
  english,
  worksheet,
  afterId,
  labelFor,
  typeDestinations,
  addQuestion,
  addLayoutElement,
  insertBlockAtAnchor,
}: InsertContext): { questions: InsertEntry[]; layout: InsertEntry[] } {
  const splitDestinations = new Set(typeDestinations?.values()).size > 1;
  const layoutIcons: Record<LayoutElement['kind'], React.ReactNode> = {
    section: <SectionIcon size={18} />,
    partHeader: <PartHeaderIcon size={18} />,
    questionCount: <QuestionCountIcon size={18} />,
    heading: <HeadingIcon size={18} />,
    text: <TextIcon size={18} />,
    labelList: <LabelListIcon size={18} />,
    stimulus: <StimulusIcon size={18} />,
    answerLines: <AnswerLinesIcon size={18} />,
    answerSpace: <AnswerSpaceIcon size={18} />,
    spacer: <SpacerIcon size={18} />,
    divider: <DividerIcon size={18} />,
    pageBreak: <PageBreakIcon size={18} />,
  };

  // Question types come from the registry, never a hard-coded list — a new type shows
  // up in the rail with no change here (§9).
  const questionEntries: InsertEntry[] = listQuestionTypes().map((definition) => {
    const zh = plain(definition.displayName.zh);
    const destination = typeDestinations?.get(definition.id);
    const where = destination ? m.inSection(destination) : m.atEnd;
    return {
      id: definition.id,
      label: english ? plain(definition.displayName.en) : zh,
      hint: splitDestinations ? (english ? `${zh} · ${where}` : where) : english ? zh : '',
      icon: definition.id === 'mcq' ? <McqIcon size={18} /> : <StructuredIcon size={18} />,
      run: (afterId) => addQuestion(definition.id, afterId),
    };
  });
  // Copies from the other saved documents: opens the sidebar's 題庫 tab, where the
  // anchor line names the same destination this flyout does.
  questionEntries.push({
    id: 'fromBank',
    label: m.fromBank,
    hint: m.fromBankHint,
    icon: <ListIcon size={18} />,
    run: () => useBankSession.getState().openBank(),
  });

  /*
   * Table and Picture, first, as on Word's Insert tab (k-0201). They go inside the question
   * or shared stimulus the rail points at, or become a new question where the header says;
   * the hint names which, since "Inserts after Q3" would not say the table goes *into* Q3.
   */
  const host = insertHostFor(worksheet, afterId);
  const hostHint = host ? m.intoHost(labelFor(host.id) ?? '') : m.newQuestionHost;
  const layoutEntries: InsertEntry[] = [
    {
      id: 'table',
      label: m.table,
      hint: hostHint,
      icon: <TableIcon size={18} />,
      pickTable: (rows, columns, afterId) =>
        insertBlockAtAnchor(
          { ...createTableBlock(rows, columns), indent: defaultTableIndent(contentWidth(pageSetupOf(worksheet))) },
          afterId,
        ),
    },
    {
      id: 'picture',
      label: m.picture,
      hint: hostHint,
      icon: <ImageIcon size={18} />,
      // The file chooser; the anchor is read at the click, not the pick, and rides on the input.
      run: (afterId) => {
        const input = document.getElementById(PICTURE_INPUT) as HTMLInputElement | null;
        if (!input) return;
        if (afterId) input.dataset.insertAfter = afterId;
        else delete input.dataset.insertAfter;
        input.click();
      },
    },
    {
      id: 'section',
      label: m.section,
      hint: m.sectionHint,
      icon: layoutIcons.section,
      run: (afterId) => addLayoutElement(createSectionElement(), afterId),
    },
    {
      id: 'partHeader',
      label: m.partHeader,
      hint: m.partHeaderHint,
      icon: layoutIcons.partHeader,
      run: (afterId) =>
        addLayoutElement(
          createPartHeaderElement(bi('Part A: Multiple-choice questions', '甲部：多項選擇題')),
          afterId,
        ),
    },
    {
      id: 'questionCount',
      label: m.questionCount,
      // The number is the point: it says what the element does that a text line cannot.
      hint: m.questionCountHint,
      icon: layoutIcons.questionCount,
      run: (afterId) => addLayoutElement(createQuestionCountElement(), afterId),
    },
    {
      id: 'stimulus',
      label: m.stimulus,
      // The derived range is the point: the sentence renumbers itself.
      hint: m.stimulusHint,
      icon: layoutIcons.stimulus,
      run: (afterId) => addLayoutElement(createStimulusElement(), afterId),
    },
    {
      id: 'heading',
      label: m.heading,
      hint: m.headingHint,
      icon: layoutIcons.heading,
      run: (afterId) => addLayoutElement(createHeadingElement(), afterId),
    },
    {
      id: 'text',
      label: m.text,
      hint: m.textHint,
      icon: layoutIcons.text,
      run: (afterId) => addLayoutElement(createTextElement(), afterId),
    },
    {
      id: 'labelList',
      label: m.labelList,
      hint: m.labelListHint,
      icon: layoutIcons.labelList,
      run: (afterId) => addLayoutElement(createLabelListElement(), afterId),
    },
    {
      // One entry for the three kinds of writing lines, chosen under it (k-0201).
      id: 'answerLinesAll',
      label: m.answerLines,
      hint: m.answerLinesHint,
      icon: layoutIcons.answerLines,
      choices: [
        {
          id: 'answerLines',
          label: m.ruledLines,
          hint: m.ruledLinesHint,
          icon: layoutIcons.answerLines,
          run: (afterId) => addLayoutElement(createAnswerLinesElement(), afterId),
        },
        {
          id: 'answerSpace',
          label: m.dottedLines,
          hint: m.dottedLinesHint,
          icon: layoutIcons.answerSpace,
          run: (afterId) => addLayoutElement(createAnswerSpaceElement(), afterId),
        },
        {
          id: 'answerSpaceFill',
          label: m.dottedToEnd,
          hint: m.dottedToEndHint,
          icon: layoutIcons.answerSpace,
          run: (afterId) => addLayoutElement(createAnswerSpaceElement(8, true), afterId),
        },
      ],
    },
    {
      id: 'spacer',
      label: m.spacer,
      hint: m.spacerHint,
      icon: layoutIcons.spacer,
      run: (afterId) => addLayoutElement(createSpacerElement(), afterId),
    },
    {
      id: 'divider',
      label: m.divider,
      hint: m.dividerHint,
      icon: layoutIcons.divider,
      run: (afterId) => addLayoutElement(createDividerElement(), afterId),
    },
    {
      id: 'pageBreak',
      label: m.pageBreak,
      hint: m.pageBreakHint,
      icon: layoutIcons.pageBreak,
      run: (afterId) => addLayoutElement(createPageBreakElement(), afterId),
    },
  ];

  /*
   * Withhold what this paper cannot contain.
   *
   * An MCQ paper's candidate answers on a separate machine-read sheet, so ruled lines,
   * dotted answer space and fill-to-page all describe a page it does not have; it also
   * runs as one unbroken sequence, so a section marker would restart numbering it never
   * restarts. A Question-Answer Book has its own dotted answer space at the reference's
   * pitch, so the worksheet's 24pt ruled lines are a second, disagreeing rhythm.
   *
   * Withheld rather than disabled: a dead row in a menu reads as a bug, while a menu
   * that simply does not offer the thing reads as a tool that knows what it is making
   * (§ `documentShape`). The elements every paper does carry — heading, note, divider,
   * page break, blank space — are untouched.
   */
  const shape = documentShape(worksheet);
  const offered = (entry: InsertEntry) => {
    // Table and Picture go in a question, which every paper has.
    if (entry.id === 'table' || entry.id === 'picture') return true;
    // The two fill variants are the same element kind under different starting values.
    const kind = (entry.id === 'answerSpaceFill' ? 'answerSpace' : entry.id) as LayoutElement['kind'];
    return offersLayoutKind(shape, kind);
  };
  // "Answer lines…" offers the kinds this paper takes, and is withheld when it takes none.
  const offeredLayout = layoutEntries.flatMap((entry) => {
    if (!entry.choices) return offered(entry) ? [entry] : [];
    const choices = entry.choices.filter(offered);
    return choices.length > 0 ? [{ ...entry, choices }] : [];
  });

  return { questions: questionEntries, layout: offeredLayout };
}
