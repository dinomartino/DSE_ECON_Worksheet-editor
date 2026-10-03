import { resolveFlow } from '@/model/flow';
import { questionMarks } from '@/model/marks';
import { computeNumbering } from '@/model/numbering';
import { bi, documentName, isBiTextEmpty, plain } from '@/model/text';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { AnswerKeyPreset, BiText, DiagramBlock, LanguageMode, Worksheet } from '@/model/types';
import { versionLetters, versionSeed } from '@/model/versions';
import { resolveAnswerKeyLayout, type ResolvedAnswerKeyLayout } from '@/model/answerKeyLayout';
import { requireQuestionType } from '@/registry';
import { pushGap, type EditTarget, type RenderNode, type SchemeAddress } from './ir';
import { ANSWER_KEY_WORDING, KEY_LAYOUT_WORDING } from './answerKeyWording';
import {
  answerGrid,
  hasNotes,
  LQ_KEY_RENDERERS,
  MC_KEY_RENDERERS,
  renderFrontMatter,
  renderNotes,
  renderPaperTotal,
  renderVersionMap,
  shownNotes,
  type KeySectionContext,
  type Own,
} from './answerKeySections';

export { ANSWER_KEY_WORDING, KEY_LAYOUT_WORDING } from './answerKeyWording';
export {
  ANSWER_GRID_PAIRS_PER_ROW,
  UNANSWERED_MARK,
  answerKeyRunningHead,
  hasMarksColumn,
  paragraphLines,
} from './answerKeySections';

/**
 * The answer key: a document of its own, built as IR so the .docx backend draws it with
 * no OOXML of its own. Each question type states its key through the registry's
 * `answerKey` hook; `collectAnswerKey` gathers the entries, and a **key style**
 * (`ANSWER_KEY_STYLES`, chosen by `Worksheet.answerKeyLayout`) lays them out through the
 * section layouts in `answerKeySections.ts`. Nothing here names a question type.
 */

/** A line of question wording the key may print (stems on): its text and where it is typed. */
export interface KeyLine {
  text: BiText;
  edit?: EditTarget;
}

/** One question's key, as its type reports it. */
export type AnswerKeyEntry =
  /**
   * A lettered choice, gathered into the grid. `letter` absent = no key set. `rationale`
   * is per option, lettered in the authored (Version A) order; `provenance` is a source note.
   */
  | {
      kind: 'choice';
      letter?: string;
      note?: BiText;
      rationale?: ChoiceRationale[];
      provenance?: BiText;
      /** Where `note` and `provenance` are typed when the key is on the page. Inert in export. */
      noteEdit?: EditTarget;
      provenanceEdit?: EditTarget;
      /** The question's stem paragraphs, printed only when a layout shows stems. */
      stem?: KeyLine[];
    }
  /** Marked rows under the question's number. `marks` is the whole question's, if a leaf. */
  | { kind: 'scheme'; marks?: number; rows: AnswerKeyRow[]; stem?: KeyLine[] };

/** Why one option is right or wrong, under its Version A letter. */
export interface ChoiceRationale {
  letter: string;
  text: BiText;
  /** Where it is typed when the key is on the page. Inert in export. */
  edit?: EditTarget;
}

export interface AnswerKeyRow {
  /** Literal marker, e.g. "(a)". Absent = a continuation at this depth. */
  label?: string;
  /** 1 = part, 2 = sub-part. */
  depth: 1 | 2;
  /** Absent prints nothing; 0 prints "(0 marks)" — the paper's own rule. */
  marks?: number;
  answer?: BiText;
  /** The model answer diagram, printed under the answer text (§ `QuestionPart.answerDiagram`). */
  diagram?: DiagramBlock;
  /** HKEAA marking points, levels and EC, printed under the answer (`render/markScheme.ts`). */
  scheme?: MarkScheme;
  /**
   * Where `answer` and `scheme` are typed when the key is on the page (the Marking scheme
   * view): the answer's own target, and the leaf owning the scheme. Inert in export.
   */
  answerEdit?: EditTarget;
  schemeAt?: SchemeAddress;
  /** The part's own wording, printed under its label only when a layout shows stems. */
  prompt?: KeyLine[];
}

export interface AnswerKeyContext {
  /** The number the paper prints for this question. */
  questionNumber: number;
}

// --- The key's data ------------------------------------------------------------------

/** One choice question's key in each paper version. */
export interface ChoiceVersion {
  letter?: string;
  /** Per printed option, its Version A letter; absent = the authored order. */
  sourceLetters?: string[];
}

export interface KeyChoice {
  questionId: string;
  number: number;
  letter?: string;
  note?: BiText;
  noteEdit?: EditTarget;
  rationale?: ChoiceRationale[];
  provenance?: BiText;
  provenanceEdit?: EditTarget;
  stem?: KeyLine[];
  versions: ChoiceVersion[];
}

export interface KeyScheme {
  questionId: string;
  number: number;
  marks?: number;
  rows: AnswerKeyRow[];
  stem?: KeyLine[];
  /** The question's printed total (`questionMarks`), for "(Total: n marks)". */
  total: number;
}

/** The questions under one section marker (the first group: those before any). */
export interface KeyGroup {
  heading?: BiText;
  /** The section's marks, as its heading would total them. */
  total: number;
  choices: KeyChoice[];
  schemes: KeyScheme[];
}

/** Everything a key style lays out, gathered once from the paper. */
export interface AnswerKeyData {
  groups: KeyGroup[];
  /** Paper version letters; empty = versions off. */
  letters: string[];
  /** The paper's marks. */
  total: number;
}

/**
 * Walk the paper's flow and gather the key. Numbers come from `computeNumbering`, the
 * derivation the paper prints, so a section restart restarts here too; each section
 * marker opens a group under its own heading, so a repeated number is never ambiguous.
 */
export function collectAnswerKey(worksheet: Worksheet): AnswerKeyData {
  const numbering = computeNumbering(worksheet);
  const groups: KeyGroup[] = [{ total: 0, choices: [], schemes: [] }];
  const letters = versionLetters(worksheet);
  const seed = versionSeed(worksheet);
  let total = 0;

  for (const item of resolveFlow(worksheet)) {
    if (item.type === 'layout') {
      if (item.element.kind === 'section') {
        groups.push({ heading: item.element.text, total: 0, choices: [], schemes: [] });
      }
      continue;
    }
    const group = groups[groups.length - 1];
    const marks = questionMarks(item.question);
    group.total += marks;
    total += marks;
    const number = numbering.byQuestionId.get(item.question.id)?.number ?? 0;
    const definition = requireQuestionType(item.question);
    const context = { questionNumber: number };
    const entry = definition.answerKey?.(item.question, context);
    if (!entry) continue;
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
      group.choices.push({
        questionId: item.question.id,
        number,
        letter: entry.letter,
        note: entry.note,
        noteEdit: entry.noteEdit,
        rationale: entry.rationale,
        provenance: entry.provenance,
        provenanceEdit: entry.provenanceEdit,
        stem: entry.stem,
        versions,
      });
    } else {
      group.schemes.push({
        questionId: item.question.id,
        number,
        marks: entry.marks,
        rows: entry.rows,
        stem: entry.stem,
        total: marks,
      });
    }
  }
  return { groups, letters, total };
}

// --- Styles --------------------------------------------------------------------------

/**
 * The key as the Marking scheme view shows it: the very nodes the `.docx` key is built
 * from, plus `owners[i]`, the question node `i` belongs to (undefined for the title,
 * headings, gaps, grids and the version map), and `fields`, the key's own authored
 * lines (title, subtitle) by node index. The view selects the owner on a click and types
 * into the fields; the export reads neither.
 */
export interface AnswerKeyView {
  nodes: RenderNode[];
  owners: (string | undefined)[];
  fields: Array<{ index: number; edit: EditTarget }>;
}

/** What a style is handed besides the data. */
export interface KeyStyleContext {
  language: LanguageMode;
  layout: ResolvedAnswerKeyLayout;
  /** The printed title, already resolved (override, part title or derived). */
  title: BiText;
}

/**
 * A whole-key style: a pure function from the key's data to its IR, and the wording its
 * derived title ends with. **The extension point for a preset** (with its settings in
 * `model/answerKeyLayout.ts:ANSWER_KEY_PRESETS`): a style may reuse `renderStandardKey`
 * and differ only by settings (Classic, HKEAA), or lay the key out its own way.
 */
export interface AnswerKeyStyle {
  titleWording: { en: string; zh: string };
  render: (data: AnswerKeyData, context: KeyStyleContext) => AnswerKeyView;
}

/** How a style varies the standard arrangement; nothing set = the arrangement as is. */
export interface StandardKeyOptions {
  /** With versions on, end with the version map. Default on. */
  versionMap?: boolean;
  /** The settings the MC sections read instead of the style's own. */
  mcLayout?: ResolvedAnswerKeyLayout;
}

/**
 * The standard arrangement every built-in style uses: title, front matter, then each
 * section's MC answers (`MC_KEY_RENDERERS[mcLayout]`) and long questions
 * (`LQ_KEY_RENDERERS[lqLayout]`), the paper total, and with versions on a key per version
 * and the version map. Classic's settings reproduce the key exactly as it printed before
 * layouts existed (`answerKeyLayout.test.ts` pins it byte for byte).
 */
export function renderStandardKey(
  data: AnswerKeyData,
  { language, layout, title }: KeyStyleContext,
  options: StandardKeyOptions = {},
): AnswerKeyView {
  const nodes: RenderNode[] = [{ kind: 'text', style: 'Worksheet Title', text: title, keepNext: true }];
  const fields: AnswerKeyView['fields'] = [{ index: 0, edit: { kind: 'answerKeyTitle' } }];
  if (layout.subtitle) fields.push({ index: 1, edit: { kind: 'answerKeySubtitle' } });
  const owners: (string | undefined)[] = [];
  const own: Own = (from, questionId) => {
    for (let index = from; index < nodes.length; index += 1) owners[index] = questionId;
  };
  let figures = 0;
  const context: KeySectionContext = { language, layout, own, nextFigure: () => (figures += 1) };
  // The MC sections may read their own settings (Suggested answers' MC wording switch).
  const mc: KeySectionContext = options.mcLayout ? { ...context, layout: options.mcLayout } : context;
  renderFrontMatter(nodes, context);

  const groups = data.groups.map((group) => ({
    ...group,
    choices: group.choices.map((choice) => shownNotes(choice, layout)),
  }));
  const heading = (group: KeyGroup): RenderNode => ({
    kind: 'text',
    style: 'Section Heading',
    text: group.heading!,
    ...(layout.sectionTotals ? { marks: group.total } : {}),
    keepNext: true,
  });

  if (data.letters.length > 0) {
    renderVersionedKey(nodes, groups, data.letters, context, heading, mc, options.versionMap ?? true);
  } else {
    for (const group of groups) {
      if (group.choices.length === 0 && group.schemes.length === 0) continue;
      pushGap(nodes);
      if (group.heading && !isBiTextEmpty(group.heading)) {
        nodes.push(heading(group));
        pushGap(nodes);
      }
      if (group.choices.length > 0) MC_KEY_RENDERERS[mc.layout.mcLayout].render(nodes, group.choices, mc);
      for (const scheme of group.schemes) {
        if (nodes[nodes.length - 1]?.kind !== 'table') pushGap(nodes);
        LQ_KEY_RENDERERS[layout.lqLayout](nodes, scheme, context);
      }
    }
    if (layout.paperTotal) renderPaperTotal(nodes, data.total);
  }

  return {
    nodes,
    owners: Array.from({ length: nodes.length }, (_, index) => owners[index]),
    fields,
  };
}

/**
 * With versions on: one MC key per version (the layout's table; the list prints as the
 * grid), then the notes and schemes once (they do not change between versions), the
 * paper total, then the version map.
 */
function renderVersionedKey(
  nodes: RenderNode[],
  groups: KeyGroup[],
  letters: string[],
  context: KeySectionContext,
  heading: (group: KeyGroup) => RenderNode,
  mc: KeySectionContext,
  versionMap: boolean,
): void {
  const { language, layout, own } = context;
  const table = MC_KEY_RENDERERS[mc.layout.mcLayout].table ?? answerGrid;
  const withChoices = groups.filter((group) => group.choices.length > 0);
  letters.forEach((letter, version) => {
    if (withChoices.length === 0) return;
    pushGap(nodes);
    const title = ANSWER_KEY_WORDING.version(letter);
    nodes.push({ kind: 'text', style: 'Section Heading', text: bi(title.en, title.zh), keepNext: true });
    for (const group of withChoices) {
      if (nodes[nodes.length - 1]?.kind === 'table') pushGap(nodes);
      if (group.heading && !isBiTextEmpty(group.heading)) {
        nodes.push({ kind: 'text', style: 'Body', text: group.heading, keepNext: true, format: { bold: true } });
      }
      nodes.push(
        table(
          group.choices.map((choice) => ({ ...choice, letter: choice.versions[version]?.letter })),
          language,
        ),
      );
    }
  });

  for (const group of groups) {
    const noted = group.choices.some(hasNotes);
    if (!noted && group.schemes.length === 0) continue;
    pushGap(nodes);
    if (group.heading && !isBiTextEmpty(group.heading)) {
      nodes.push(heading(group));
      pushGap(nodes);
    }
    renderNotes(nodes, group.choices, language, true, own);
    for (const scheme of group.schemes) {
      pushGap(nodes);
      LQ_KEY_RENDERERS[layout.lqLayout](nodes, scheme, context);
    }
  }

  if (layout.paperTotal) {
    renderPaperTotal(nodes, groups.reduce((sum, group) => sum + group.total, 0));
  }
  if (versionMap && withChoices.length > 0) renderVersionMap(nodes, withChoices, letters, language);
}

/**
 * Suggested answers 參考答案: the standard arrangement with nothing a marker alone reads.
 * Its settings fix the rest (`ANSWER_KEY_FIXED`: answers-only long questions, no legend,
 * disclaimer or source notes); here the MC answers print as the list when the MC wording
 * switch is on (the one layout that shows it), and the version map (a marker's pooling
 * tool) is left out: each student finds their own version's answers by its heading.
 */
function renderSuggestedKey(data: AnswerKeyData, context: KeyStyleContext): AnswerKeyView {
  const { layout } = context;
  return renderStandardKey(data, context, {
    versionMap: false,
    mcLayout: {
      ...layout,
      showStems: layout.showMcStems,
      ...(layout.showMcStems ? { mcLayout: 'list' as const } : {}),
    },
  });
}

/**
 * Every whole-key style by preset id. Classic, HKEAA and Detailed differ only in settings
 * (their section layouts); Suggested answers brings its own `render` around the same
 * arrangement.
 */
export const ANSWER_KEY_STYLES: Record<AnswerKeyPreset, AnswerKeyStyle> = {
  classic: { titleWording: ANSWER_KEY_WORDING.title, render: renderStandardKey },
  hkeaa: { titleWording: KEY_LAYOUT_WORDING.hkeaaTitle, render: renderStandardKey },
  suggested: { titleWording: KEY_LAYOUT_WORDING.suggestedTitle, render: renderSuggestedKey },
  detailed: { titleWording: KEY_LAYOUT_WORDING.detailedTitle, render: renderStandardKey },
};

// --- Titles --------------------------------------------------------------------------

/** A title override's filled sides over the derived title's. */
function withOverride(derived: BiText, override: BiText | undefined): BiText {
  if (!override) return derived;
  return {
    en: plain(override.en).trim() ? override.en : derived.en,
    zh: plain(override.zh).trim() ? override.zh : derived.zh,
  };
}

/** The title the key derives: the printed title plus its style's wording, each side falling back to the document's name. */
export function derivedAnswerKeyTitle(worksheet: Worksheet): BiText {
  const wording = ANSWER_KEY_STYLES[resolveAnswerKeyLayout(worksheet.answerKeyLayout).preset].titleWording;
  const name = documentName(worksheet) ?? 'Worksheet';
  const en = plain(worksheet.title.en).trim() || name;
  const zh = plain(worksheet.title.zh).trim() || en;
  return bi(`${en} — ${wording.en}`, `${zh} — ${wording.zh}`);
}

/** The key's printed title: the teacher's override where typed, else derived. */
export function answerKeyTitle(worksheet: Worksheet): BiText {
  return withOverride(derivedAnswerKeyTitle(worksheet), worksheet.answerKeyLayout?.title);
}

/**
 * What to store when the title is typed on the page: a side equal to the derived title
 * is left empty (it keeps following the document's title); all of it equal → no override.
 */
export function answerKeyTitleOverride(worksheet: Worksheet, next: BiText): BiText {
  const derived = derivedAnswerKeyTitle(worksheet);
  const same = (side: 'en' | 'zh') => plain(next[side]).trim() === plain(derived[side]).trim();
  return { en: same('en') ? [] : next.en, zh: same('zh') ? [] : next.zh };
}

const COVER_PAPER_EN = /\bpaper\s*(\d+|[ivx]+)\b/i;
const COVER_PAPER_ZH = /試?卷\s*([一二三四五六七八九十\d]+)/;

/**
 * Which paper a cover names — "PAPER 1" / "卷一" in its head or corner lines — as
 * "Paper 1" / "試卷一". Undefined without a cover or with no such line.
 */
export function coverPaperLabel(worksheet: Worksheet): { en: string; zh: string } | undefined {
  const lines = [...(worksheet.cover?.headLines ?? []), ...(worksheet.cover?.cornerLines ?? [])];
  let en: string | undefined;
  let zh: string | undefined;
  for (const line of lines) {
    en ??= COVER_PAPER_EN.exec(plain(line.text.en))?.[1];
    zh ??= COVER_PAPER_ZH.exec(plain(line.text.zh))?.[1];
  }
  if (en === undefined && zh === undefined) return undefined;
  const enLabel = en !== undefined ? `Paper ${en.toUpperCase()}` : `試卷${zh}`;
  return { en: enLabel, zh: zh !== undefined ? `試卷${zh}` : enLabel };
}

/** Whether `label` already reads in `text`, ignoring case and spacing. */
const mentions = (text: string, label: string) =>
  text.replace(/\s+/g, '').toLowerCase().includes(label.replace(/\s+/g, '').toLowerCase());

/**
 * One paper's heading in a combined key: `answerKeyTitle` plus the paper its cover
 * names, unless the title already says it ("Mock 2026, Paper 2 — Answer key"). A title
 * the teacher typed for this document's key heads its part instead.
 */
export function answerKeyPartTitle(worksheet: Worksheet): BiText {
  const wording = ANSWER_KEY_STYLES[resolveAnswerKeyLayout(worksheet.answerKeyLayout).preset].titleWording;
  const paper = coverPaperLabel(worksheet);
  // An unnamed paper is called by its paper name alone, not "Worksheet, Paper 1".
  const name = documentName(worksheet);
  const baseEn = plain(worksheet.title.en).trim() || name || paper?.en || 'Worksheet';
  const en = !paper || mentions(baseEn, paper.en) ? baseEn : `${baseEn}, ${paper.en}`;
  const baseZh = plain(worksheet.title.zh).trim() || (name || !paper ? baseEn : paper.zh);
  const zh =
    !paper || mentions(baseZh, paper.zh) || mentions(baseZh, paper.en) ? baseZh : `${baseZh}，${paper.zh}`;
  return withOverride(bi(`${en} — ${wording.en}`, `${zh} — ${wording.zh}`), worksheet.answerKeyLayout?.title);
}

// --- Entry points ----------------------------------------------------------------------

/** `renderAnswerKey`, with each node's question and the key's own fields (§ `AnswerKeyView`). */
export function answerKeyView(
  worksheet: Worksheet,
  language: LanguageMode,
  options: { title?: BiText } = {},
): AnswerKeyView {
  const layout = resolveAnswerKeyLayout(worksheet.answerKeyLayout);
  return ANSWER_KEY_STYLES[layout.preset].render(collectAnswerKey(worksheet), {
    language,
    layout,
    title: options.title ?? answerKeyTitle(worksheet),
  });
}

/** The answer key of one document, laid out as its `answerKeyLayout` says. */
export function renderAnswerKey(
  worksheet: Worksheet,
  language: LanguageMode,
  options: { title?: BiText } = {},
): RenderNode[] {
  return answerKeyView(worksheet, language, options).nodes;
}

/**
 * Several documents' keys as one: each under its `answerKeyPartTitle`, numbered as that
 * paper prints and laid out as that document's own layout says, the second onward from
 * a new page. One document is `renderAnswerKey` unchanged, so a single key exports as it
 * always has.
 */
export function renderCombinedAnswerKey(worksheets: Worksheet[], language: LanguageMode): RenderNode[] {
  if (worksheets.length <= 1) {
    return worksheets.length === 0 ? [] : renderAnswerKey(worksheets[0], language);
  }
  return answerKeyParts(worksheets, language).flatMap((nodes, index): RenderNode[] => [
    ...(index > 0 ? [{ kind: 'pageBreak' } as const] : []),
    ...nodes,
  ]);
}

/**
 * A combined key's parts, one per document under its `answerKeyPartTitle`: what
 * `renderCombinedAnswerKey` joins, and what the `.docx` sets as one section each, in
 * that document's own page setup and body size.
 */
export function answerKeyParts(worksheets: Worksheet[], language: LanguageMode): RenderNode[][] {
  return worksheets.map((worksheet) =>
    renderAnswerKey(worksheet, language, { title: answerKeyPartTitle(worksheet) }),
  );
}
