import { resolveFlow } from '@/model/flow';
import { computeNumbering, DEFAULT_LIST_INDENTS, toUpperLetter } from '@/model/numbering';
import { DEFAULT_CELL_PADDING } from '@/model/table';
import { bi, documentName, isBiTextEmpty, plain } from '@/model/text';
import type { BiText, LanguageMode, Worksheet } from '@/model/types';
import { versionLetters, versionSeed } from '@/model/versions';
import { requireQuestionType } from '@/registry';
import { pushGap, type RenderNode, type TableNode, type TableNodeCell } from './ir';

/**
 * The answer key: a document of its own, built as IR so the .docx backend draws it with
 * no OOXML of its own. Each question type states its key through the registry's
 * `answerKey` hook; this walker only lays the entries out, and never names a type.
 */

/** One question's key, as its type reports it. */
export type AnswerKeyEntry =
  /** A lettered choice, gathered into the grid. `letter` absent = no key set. */
  | { kind: 'choice'; letter?: string; note?: BiText }
  /** Marked rows under the question's number. `marks` is the whole question's, if a leaf. */
  | { kind: 'scheme'; marks?: number; rows: AnswerKeyRow[] };

export interface AnswerKeyRow {
  /** Literal marker, e.g. "(a)". Absent = a continuation at this depth. */
  label?: string;
  /** 1 = part, 2 = sub-part. */
  depth: 1 | 2;
  /** Absent prints nothing; 0 prints "(0 marks)" — the paper's own rule. */
  marks?: number;
  answer?: BiText;
}

export interface AnswerKeyContext {
  /** The number the paper prints for this question. */
  questionNumber: number;
}

/** Number/letter pairs per grid row. */
export const ANSWER_GRID_PAIRS_PER_ROW = 5;

/** What an unkeyed choice prints: a dash, never a guess. */
export const UNANSWERED_MARK = '—';

export const ANSWER_KEY_WORDING = {
  title: { en: 'Answer key', zh: '答案及評分參考' },
  explanations: { en: 'Explanations', zh: '解說' },
  question: (n: number) => ({ en: `Question ${n}`, zh: `第${n}題` }),
  version: (letter: string) => ({ en: `Version ${letter}`, zh: `版本 ${letter}` }),
  versionMap: { en: 'Version map', zh: '版本對照' },
  versionMapHint: {
    en: 'For each printed option, the letter it has in Version A.',
    zh: '各版本每個選項在版本 A 的字母。',
  },
  sameAsA: { en: 'Same as A', zh: '同版本 A' },
} as const;

/** One choice question's key in each paper version. */
interface ChoiceVersion {
  letter?: string;
  /** Per printed option, its Version A letter; absent = the authored order. */
  sourceLetters?: string[];
}

interface Group {
  heading?: BiText;
  choices: Array<{ number: number; letter?: string; note?: BiText; versions: ChoiceVersion[] }>;
  schemes: Array<{ number: number; marks?: number; rows: AnswerKeyRow[] }>;
}

/**
 * Language-neutral text (a number, a letter, "(a)"): one side in bilingual mode, where
 * two filled sides stack and would print it twice.
 */
function neutral(text: string, language: LanguageMode): BiText {
  return language === 'bilingual' ? { en: [{ text }], zh: [] } : bi(text, text);
}

/**
 * Walk the paper's flow and emit the key. Numbers come from `computeNumbering`, the
 * derivation the paper prints, so a section restart restarts here too; each section
 * marker opens a group under its own heading, so a repeated number is never ambiguous.
 */
export function renderAnswerKey(worksheet: Worksheet, language: LanguageMode): RenderNode[] {
  const numbering = computeNumbering(worksheet);
  const groups: Group[] = [{ choices: [], schemes: [] }];
  const letters = versionLetters(worksheet);
  const seed = versionSeed(worksheet);

  for (const item of resolveFlow(worksheet)) {
    if (item.type === 'layout') {
      if (item.element.kind === 'section') {
        groups.push({ heading: item.element.text, choices: [], schemes: [] });
      }
      continue;
    }
    const number = numbering.byQuestionId.get(item.question.id)?.number ?? 0;
    const definition = requireQuestionType(item.question);
    const context = { questionNumber: number };
    const entry = definition.answerKey?.(item.question, context);
    if (!entry) continue;
    const group = groups[groups.length - 1];
    if (entry.kind === 'choice') {
      // Each version's key comes from the same hook, asked of the reordered question.
      const versions = letters.map((_, version): ChoiceVersion => {
        const shown = definition.variant?.(item.question, { seed, version });
        if (!shown?.sourceLetters) return { letter: entry.letter };
        const keyed = definition.answerKey!(shown.question, context);
        return {
          letter: keyed.kind === 'choice' ? keyed.letter : undefined,
          sourceLetters: shown.sourceLetters,
        };
      });
      group.choices.push({ number, letter: entry.letter, note: entry.note, versions });
    } else {
      group.schemes.push({ number, marks: entry.marks, rows: entry.rows });
    }
  }

  const nodes: RenderNode[] = [
    { kind: 'text', style: 'Worksheet Title', text: answerKeyTitle(worksheet), keepNext: true },
  ];

  if (letters.length > 0) {
    renderVersionedKey(nodes, groups, letters, language);
    return nodes;
  }

  for (const group of groups) {
    if (group.choices.length === 0 && group.schemes.length === 0) continue;
    pushGap(nodes);
    if (group.heading && !isBiTextEmpty(group.heading)) {
      nodes.push({ kind: 'text', style: 'Section Heading', text: group.heading, keepNext: true });
      pushGap(nodes);
    }
    if (group.choices.length > 0) {
      // Word follows every table with an empty paragraph, which is the gap below it.
      nodes.push(answerGrid(group.choices, language));
      renderNotes(nodes, group.choices, language);
    }
    for (const scheme of group.schemes) {
      if (nodes[nodes.length - 1]?.kind !== 'table') pushGap(nodes);
      renderScheme(nodes, scheme, language);
    }
  }

  return nodes;
}

/**
 * With versions on: one grid set per version, then the explanations and schemes once
 * (they do not change between versions), then the version map.
 */
function renderVersionedKey(
  nodes: RenderNode[],
  groups: Group[],
  letters: string[],
  language: LanguageMode,
): void {
  const withChoices = groups.filter((group) => group.choices.length > 0);
  letters.forEach((letter, version) => {
    if (withChoices.length === 0) return;
    pushGap(nodes);
    const heading = ANSWER_KEY_WORDING.version(letter);
    nodes.push({ kind: 'text', style: 'Section Heading', text: bi(heading.en, heading.zh), keepNext: true });
    for (const group of withChoices) {
      if (nodes[nodes.length - 1]?.kind === 'table') pushGap(nodes);
      if (group.heading && !isBiTextEmpty(group.heading)) {
        nodes.push({ kind: 'text', style: 'Body', text: group.heading, keepNext: true, format: { bold: true } });
      }
      nodes.push(
        answerGrid(
          group.choices.map((choice) => ({ ...choice, letter: choice.versions[version]?.letter })),
          language,
        ),
      );
    }
  });

  for (const group of groups) {
    const noted = group.choices.some((choice) => choice.note && !isBiTextEmpty(choice.note));
    if (!noted && group.schemes.length === 0) continue;
    pushGap(nodes);
    if (group.heading && !isBiTextEmpty(group.heading)) {
      nodes.push({ kind: 'text', style: 'Section Heading', text: group.heading, keepNext: true });
      pushGap(nodes);
    }
    renderNotes(nodes, group.choices, language);
    for (const scheme of group.schemes) {
      pushGap(nodes);
      renderScheme(nodes, scheme, language);
    }
  }

  if (withChoices.length > 0) renderVersionMap(nodes, withChoices, letters, language);
}

/**
 * Question × version: each cell reads "A→C B→A …", the Version A letter of every
 * printed option, so any version's responses can be marked or pooled against A.
 */
function renderVersionMap(
  nodes: RenderNode[],
  groups: Group[],
  letters: string[],
  language: LanguageMode,
): void {
  const { versionMap, versionMapHint, sameAsA } = ANSWER_KEY_WORDING;
  const others = letters.slice(1);
  pushGap(nodes);
  nodes.push({ kind: 'text', style: 'Section Heading', text: bi(versionMap.en, versionMap.zh), keepNext: true });
  nodes.push({ kind: 'text', style: 'Body', text: bi(versionMapHint.en, versionMapHint.zh), keepNext: true });

  const cell = (text: BiText, bold = false): TableNodeCell => ({
    text,
    colSpan: 1,
    rowSpan: 1,
    align: 'left',
    covered: false,
    padding: DEFAULT_CELL_PADDING,
    ...(bold ? { format: { bold: true } } : {}),
  });
  const same =
    language === 'bilingual' ? neutral(`${sameAsA.en} ${sameAsA.zh}`, language) : bi(sameAsA.en, sameAsA.zh);

  const rows: TableNodeCell[][] = [
    [cell(neutral('', language)), ...others.map((letter) => cell(neutral(letter, language), true))],
  ];
  for (const group of groups) {
    group.choices.forEach((choice) => {
      rows.push([
        cell(neutral(String(choice.number), language), true),
        ...others.map((_, offset) => {
          const map = choice.versions[offset + 1]?.sourceLetters;
          if (!map) return cell(same);
          return cell(neutral(map.map((source, printed) => `${toUpperLetter(printed)}→${source}`).join('  '), language));
        }),
      ]);
    });
  }

  const questionColumn = 0.1;
  nodes.push({
    kind: 'table',
    rows,
    columnCount: others.length + 1,
    columnWidths: [questionColumn, ...others.map(() => (1 - questionColumn) / others.length)],
    width: 1,
    indent: 0,
    align: 'left',
    borders: 'all',
    rowHeights: rows.map(() => undefined),
    blockId: 'answer-key-version-map',
    captionPlacement: 'below',
  });
}

/** The printed title plus "Answer key", each side falling back to the document's name. */
export function answerKeyTitle(worksheet: Worksheet): BiText {
  const name = documentName(worksheet) ?? 'Worksheet';
  const en = plain(worksheet.title.en).trim() || name;
  const zh = plain(worksheet.title.zh).trim() || en;
  return bi(
    `${en} — ${ANSWER_KEY_WORDING.title.en}`,
    `${zh} — ${ANSWER_KEY_WORDING.title.zh}`,
  );
}

/** Number → letter pairs, `ANSWER_GRID_PAIRS_PER_ROW` to a row; a short last row pads empty. */
function answerGrid(choices: Group['choices'], language: LanguageMode): TableNode {
  const cell = (text: string, bold = false): TableNodeCell => ({
    text: neutral(text, language),
    colSpan: 1,
    rowSpan: 1,
    align: 'center',
    covered: false,
    padding: DEFAULT_CELL_PADDING,
    ...(bold ? { format: { bold: true } } : {}),
  });

  const rows: TableNodeCell[][] = [];
  for (let start = 0; start < choices.length; start += ANSWER_GRID_PAIRS_PER_ROW) {
    const row: TableNodeCell[] = [];
    for (let offset = 0; offset < ANSWER_GRID_PAIRS_PER_ROW; offset++) {
      const choice = choices[start + offset];
      row.push(
        cell(choice ? String(choice.number) : ''),
        cell(choice ? (choice.letter ?? UNANSWERED_MARK) : '', true),
      );
    }
    rows.push(row);
  }

  const columnCount = ANSWER_GRID_PAIRS_PER_ROW * 2;
  return {
    kind: 'table',
    rows,
    columnCount,
    columnWidths: Array.from({ length: columnCount }, () => 1 / columnCount),
    width: 1,
    indent: 0,
    align: 'left',
    borders: 'all',
    rowHeights: rows.map(() => undefined),
    blockId: 'answer-key-grid',
    captionPlacement: 'below',
  };
}

/** The choices' explanations, if any, as a hung list under the grid. */
function renderNotes(nodes: RenderNode[], choices: Group['choices'], language: LanguageMode): void {
  const noted = choices.filter((choice) => choice.note && !isBiTextEmpty(choice.note));
  if (noted.length === 0) return;
  nodes.push({
    kind: 'text',
    style: 'Body',
    text: bi(ANSWER_KEY_WORDING.explanations.en, ANSWER_KEY_WORDING.explanations.zh),
    keepNext: true,
    format: { bold: true },
  });
  for (const choice of noted) {
    nodes.push({
      kind: 'columns',
      style: 'Body',
      indent: DEFAULT_LIST_INDENTS.stemText,
      hanging: DEFAULT_LIST_INDENTS.stemText,
      keepLines: true,
      cells: [
        { text: neutral(`${choice.number}.`, language), at: 0 },
        { text: choice.note!, at: 0.5 },
      ],
    });
  }
}

/**
 * One marked question: its number, then a label line per part and sub-part carrying the
 * marks, with the author's scheme text under it at the paper's own text columns.
 */
function renderScheme(
  nodes: RenderNode[],
  scheme: Group['schemes'][number],
  language: LanguageMode,
): void {
  const { question, partText, subPartText } = DEFAULT_LIST_INDENTS;
  nodes.push({
    kind: 'text',
    style: 'Question Stem',
    text: bi(ANSWER_KEY_WORDING.question(scheme.number).en, ANSWER_KEY_WORDING.question(scheme.number).zh),
    marks: scheme.marks,
    keepNext: scheme.rows.length > 0,
    format: { bold: true },
  });
  scheme.rows.forEach((row, index) => {
    const labelIndent = row.depth === 1 ? question[0].left : partText;
    const answerIndent = row.depth === 1 ? partText : subPartText;
    const hasAnswer = row.answer !== undefined && !isBiTextEmpty(row.answer);
    const last = index === scheme.rows.length - 1;
    if (row.label !== undefined) {
      nodes.push({
        kind: 'text',
        style: row.depth === 1 ? 'Sub-question' : 'Sub-sub-question',
        text: neutral(row.label, language),
        marks: row.marks,
        indent: labelIndent,
        keepNext: hasAnswer || !last,
      });
    }
    if (hasAnswer) {
      nodes.push({
        kind: 'text',
        style: 'Marking Scheme',
        text: row.answer!,
        indent: answerIndent,
      });
    }
  });
}
