import { rowsOf } from '@/library/indexer';
import { stimuliServing } from '@/library/stimuli';
import { migrate } from '@/model/migrations';
import { plain } from '@/model/text';
import { isTopicCode } from '@/model/topics';
import type { BiText, ContentBlock, LanguageMode, LayoutElement, McqQuestion, Question, TableBlock, Worksheet } from '@/model/types';
import { getQuestionType } from '@/registry';
import { fitTableToContent, tableFitPlace, type TableFitPlace } from '@/model/tableFit';
import { DEFAULT_PAGE_METRICS, pageMetricsOf, type PageMetrics } from '@/render/ir';

/**
 * Reading the Past paper bank's files (k-0443). The question bank pack is written by another
 * tool (the past-paper bank's exporter, outside this repo) and may still change, so
 * every reader here is tolerant: a field it does not know is ignored, a malformed entry
 * drops only itself, and nothing here throws on data.
 *
 * What the editor needs from the export (also in docs/design/pastpaper-bank.md):
 *  - `manifest.json`: `topics[]` with `id` and `file`; optional `title {en, zh}`,
 *    `questions`, `bytes`, `sha256`, `syllabusOrder`, `syllabus` (topic codes); optional
 *    `enabled` (false = off).
 *  - `topics/<id>.json`: an editor document the editor's own loader (`migrate`) opens;
 *    questions of a type this build does not know are left out and counted.
 *  - per question: a tag `CE2011/P2/Q8` (exam, year, paper, number) for the source filters,
 *    `provenance {en, zh}` for the source line, `lineage.rootId` stable across exports.
 *  - a shared stimulus: a `stimulus` layout element directly before its questions in `flow`.
 */

/**
 * The one format name a manifest may carry (`format`); none at all is the usual case (the
 * published bank names none). Any other name is some other JSON, refused. A later major
 * version is still read, tolerantly.
 */
export const PACK_FORMAT = 'question-bank-pack';

export interface TopicEntry {
  id: string;
  title: { en: string; zh: string };
  /** Position in the syllabus; the list's order. */
  order: number;
  /** Questions in the file, as the manifest says (before this build drops any). */
  questions?: number;
  bytes?: number;
  /** Lower-case hex; when present a download must match it to be kept. */
  sha256?: string;
  file: string;
  /**
   * The editor's topic codes the topic covers (`["C.ped", "C.pes"]`, `["G"]`; `model/topics.ts`),
   * the same codes the export stamps on its questions' tags: the picker groups topics under
   * their syllabus part by these (k-0446). Absent in an older export.
   */
  syllabus?: string[];
}

export interface Manifest {
  enabled: boolean;
  version: number;
  topics: TopicEntry[];
  /** Total questions, as the manifest says, else the topics' sum. */
  questions: number;
  /**
   * The search index (`search` in the list, k-0444): one row per question of every topic, so
   * a search across the bank needs no topic downloaded. Absent in an older export, or one
   * of a later index version: the screen then offers to download every topic instead.
   */
  search?: SearchRow[];
}

/** One question in the search index. */
export interface SearchRow {
  topicId: string;
  source: SourceInfo;
  /** Plain words of the question in reading order (its shared passage first), as exported. */
  en: string;
  zh: string;
  /** Pictures in the question and its passage (0 when the export says none). */
  pictures: number;
  /** Lower-cased: both languages, the source line in both languages and the tag. */
  searchText: string;
}

/** The index versions this reader understands; a later one is ignored, not misread. */
export const SEARCH_VERSION = 1;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' ? x : undefined);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** A manifest, or why not. Entries without an id or a file are dropped; duplicates keep the first. */
export function parseManifest(raw: unknown): Manifest | { error: 'format' } {
  if (!isObject(raw) || !Array.isArray(raw.topics)) return { error: 'format' };
  const format = str(raw.format);
  if (format !== undefined && format !== PACK_FORMAT) return { error: 'format' };
  const seen = new Set<string>();
  const topics: TopicEntry[] = [];
  raw.topics.forEach((entry, index) => {
    if (!isObject(entry)) return;
    const id = str(entry.id)?.trim();
    const file = str(entry.file)?.trim();
    if (!id || !file || seen.has(id)) return;
    seen.add(id);
    const title = isObject(entry.title) ? entry.title : {};
    const en = str(title.en) ?? str(entry.title) ?? id;
    const sha = str(entry.sha256)?.toLowerCase();
    const codes = (Array.isArray(entry.syllabus) ? entry.syllabus : [entry.syllabus]).filter((code): code is string => isTopicCode(code));
    topics.push({
      id,
      file,
      title: { en, zh: str(title.zh) ?? en },
      order: num(entry.syllabusOrder) ?? index + 1,
      ...(num(entry.questions) !== undefined ? { questions: num(entry.questions) } : {}),
      ...(num(entry.bytes) !== undefined ? { bytes: num(entry.bytes) } : {}),
      ...(sha && /^[0-9a-f]{64}$/.test(sha) ? { sha256: sha } : {}),
      ...(codes.length > 0 ? { syllabus: [...new Set(codes)] } : {}),
    });
  });
  topics.sort((a, b) => a.order - b.order);
  const sum = topics.reduce((total, t) => total + (t.questions ?? 0), 0);
  const search = parseSearch(raw.search, topics);
  return {
    enabled: raw.enabled !== false,
    version: num(raw.version) ?? 1,
    topics,
    questions: num(raw.questions) ?? sum,
    ...(search ? { search } : {}),
  };
}

/**
 * The list's `search` block, tolerant like the rest: a row naming no listed topic or no
 * source tag is dropped, a second row of one tag keeps the first, missing words read as
 * none. Rows come out in the list's topic order, each topic's in the order given.
 */
export function parseSearch(raw: unknown, topics: readonly TopicEntry[]): SearchRow[] | undefined {
  if (!isObject(raw) || !Array.isArray(raw.questions)) return undefined;
  const version = num(raw.version) ?? 1;
  if (version > SEARCH_VERSION) return undefined;
  const order = new Map(topics.map((t, i) => [t.id, i]));
  const seen = new Set<string>();
  const rows: SearchRow[] = [];
  for (const entry of raw.questions) {
    if (!isObject(entry)) continue;
    const topicId = str(entry.topic);
    const tag = str(entry.source)?.trim();
    if (!topicId || !order.has(topicId) || !tag || seen.has(tag)) continue;
    const source = sourceOf({ tags: [tag] });
    if (source.exam === 'other') continue;
    seen.add(tag);
    const en = (str(entry.en) ?? '').replace(/\s+/g, ' ').trim();
    const zh = (str(entry.zh) ?? '').replace(/\s+/g, ' ').trim();
    const pictures = Math.max(0, Math.floor(num(entry.pictures) ?? 0));
    const label = sourceLabel(source);
    rows.push({ topicId, source, en, zh, pictures, searchText: [en, zh, label.en, label.zh, tag].join(' ').toLowerCase() });
  }
  rows.sort((a, b) => order.get(a.topicId)! - order.get(b.topicId)!);
  return rows;
}

const PAPER_EN = { HKCEE: 'HKCEE', HKALE: 'HKALE', HKDSE: 'HKDSE', other: '' } as const;
const PAPER_ZH = { HKCEE: '香港中學會考', HKALE: '香港高級程度會考', HKDSE: '香港中學文憑考試', other: '' } as const;
const ZH_NUMERALS = ['', '一', '二', '三', '四', '五'];

/** When a paper was set, as its source line spells it: "2016", "Sample Paper" / "樣本試卷". */
export function whenLabel(source: Pick<SourceInfo, 'year' | 'special'>): { en: string; zh: string } {
  if (source.special === 'SP') return { en: 'Sample Paper', zh: '樣本試卷' };
  if (source.special === 'PP') return { en: 'Practice Paper', zh: '練習卷' };
  const year = String(source.year ?? '');
  return { en: year, zh: year };
}

/** An exam year, as its source lines spell it: "HKDSE 2016" / "香港中學文憑考試 2016". */
export function sittingLabel(source: SourceInfo): { en: string; zh: string } {
  if (source.exam === 'other') return { en: source.tag, zh: source.tag };
  const when = whenLabel(source);
  return { en: `${PAPER_EN[source.exam]} ${when.en}`, zh: `${PAPER_ZH[source.exam]} ${when.zh}` };
}

/** A paper's own name, as its source line spells it: "Paper 1" / "卷一". */
export function paperLabel(source: Pick<SourceInfo, 'paper'>): { en: string; zh: string } {
  const paper = source.paper ?? 1;
  return { en: `Paper ${paper}`, zh: `卷${ZH_NUMERALS[paper] ?? paper}` };
}

/**
 * The paper a source names, as the export's own source lines spell it ("HKDSE 2016 Paper 1",
 * "香港中學文憑考試 2016 卷一"); with `number`, the question too ("… Q34", "… 第 34 題").
 * Printed text of the data, not interface wording.
 */
export function sourceLabel(source: SourceInfo, withNumber = true): { en: string; zh: string } {
  if (source.exam === 'other') return { en: source.tag, zh: source.tag };
  const when = whenLabel(source);
  const paper = paperLabel(source);
  const en = `${PAPER_EN[source.exam]} ${when.en} ${paper.en}`;
  const zh = `${PAPER_ZH[source.exam]} ${when.zh} ${paper.zh}`;
  if (!withNumber || source.number === undefined) return { en, zh };
  return { en: `${en} Q${source.number}`, zh: `${zh} 第 ${source.number} 題` };
}

/**
 * A name from the pack ({en, zh}: a topic, a paper, a source) in the language the questions
 * are shown in, never the interface's: pack names are paper words, as curriculum names are
 * (`topicNamesFor`, SYSTEM_ARCHITECTURE § Curriculum names are paper-side). The other side
 * when this one is empty; `wide` gives both names for a bilingual view, `tight` English.
 */
export function packName(name: { en: string; zh: string }, view: LanguageMode, room: 'tight' | 'wide' = 'tight'): string {
  const en = name.en.trim();
  const zh = name.zh.trim();
  if (view === 'zh') return zh || en;
  if (view === 'bilingual' && room === 'wide' && en && zh && en !== zh) return `${en} ${zh}`;
  return en || zh;
}

/** The paper a source tag belongs to: `DSE2016/P1` of `DSE2016/P1/Q34`; '' without a tag. */
export const paperKey = (source: SourceInfo) => source.tag.replace(/\/Q\d+$/, '');

/** The exam year a source tag belongs to: `DSE2016` of `DSE2016/P1/Q34`, `DSESP`; '' without a tag. */
export const sittingKey = (source: SourceInfo) => source.tag.split('/')[0] ?? '';

/** Where a question comes from, read off its source tag (`CE2011/P2/Q8`). */
export interface SourceInfo {
  exam: 'HKCEE' | 'HKALE' | 'HKDSE' | 'other';
  /** 1991…; absent for a sample or practice paper. */
  year?: number;
  /** `SP` sample paper, `PP` practice paper (HKDSE). */
  special?: 'SP' | 'PP';
  paper?: number;
  number?: number;
  /** The tag itself, `CE2011/P2/Q8`; '' when there is none. */
  tag: string;
}

const EXAMS = { CE: 'HKCEE', AL: 'HKALE', DSE: 'HKDSE' } as const;
const SOURCE_TAG = /^(CE|AL|DSE)(\d{4}|SP|PP)\/P(\d+)\/Q(\d+)$/;

export function sourceOf(question: Pick<Question, 'tags'>): SourceInfo {
  const tags = Array.isArray(question.tags) ? question.tags : [];
  for (const tag of tags) {
    const match = typeof tag === 'string' ? SOURCE_TAG.exec(tag) : null;
    if (!match) continue;
    const [, exam, when, paper, number] = match;
    const special = when === 'SP' || when === 'PP' ? when : undefined;
    return {
      exam: EXAMS[exam as keyof typeof EXAMS],
      ...(special ? { special } : { year: Number(when) }),
      paper: Number(paper),
      number: Number(number),
      tag,
    };
  }
  return { exam: 'other', tag: '' };
}

/** One question of the bank, ready to show and copy. */
export interface PastPaperItem {
  topicId: string;
  /** The topic document's id: the copies' `lineage.fromDocId`. */
  docId: string;
  question: Question;
  /** A shared stimulus printed before this question in the paper (it serves the next `span`). */
  stimulus?: Extract<LayoutElement, { kind: 'stimulus' }>;
  source: SourceInfo;
  /** The source line, `HKCEE 2011 Paper 2 Q8` / `香港中學會考 2011 卷二 第 8 題`. */
  provenance: { en: string; zh: string };
  excerpt: { en: string; zh: string };
  /** Lower-cased words of the question (both languages), its source and tag. */
  searchText: string;
  /** Printed number in the topic file (preview only). */
  number?: number;
}

export interface TopicData {
  entry: TopicEntry;
  /** The topic document as the editor's loader read it (read-only; never saved). */
  doc: Worksheet;
  items: PastPaperItem[];
  /** Questions left out: a type this build does not know. */
  skipped: number;
}

const sideText = (text: BiText | undefined) => ({ en: text ? plain(text.en).trim() : '', zh: text ? plain(text.zh).trim() : '' });

/**
 * A topic file → its questions, in the file's order, or undefined when it is not a document
 * at all. Read with the editor's own loader (`migrate`), so a file the editor would open is
 * read exactly as the editor would open it. The document is marked `bankHidden: false` and
 * `kind: 'bank'` in memory only.
 */
export function parseTopic(raw: unknown, entry: TopicEntry): TopicData | undefined {
  let doc: Worksheet;
  try {
    doc = migrate(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(doc.questions)) return undefined;
  const known = doc.questions
    .filter((q) => q && typeof q.type === 'string' && getQuestionType(q.type))
    .map(withPictureGrid);
  // Sized for the narrower of the bank's page and a new paper's, as widths are shares of the
  // column: a table that fits there fits in any paper a teacher copies it into.
  const page = pageMetricsOf(doc);
  const metrics = { ...page, textWidth: Math.min(page.textWidth, DEFAULT_PAGE_METRICS.textWidth) };
  const fitted = known.map((question) => withFittedTables(question, metrics));
  const skipped = doc.questions.length - known.length;
  doc = {
    ...doc,
    kind: 'bank',
    questions: fitted,
    bankHidden: undefined,
    layout: (doc.layout ?? []).map((element) => (element.kind === 'stimulus' ? withFittedStimulus(element, metrics) : element)),
  };
  doc = { ...doc, flow: (doc.flow ?? []).filter((item) => item.type !== 'question' || known.some((q) => q.id === item.id)) };

  // A stimulus whose first paragraph names the questions after it by their paper numbers
  // has that sentence lifted into its own wording (`liftStimulusLead`), in memory only.
  const questionById = new Map(fitted.map((q) => [q.id, q]));
  const lifted = new Map<string, LayoutElement>();
  doc.flow.forEach((item, index) => {
    const element = item.type === 'layout' ? (doc.layout ?? []).find((e) => e.id === item.id) : undefined;
    if (element?.kind !== 'stimulus') return;
    const following: SourceInfo[] = [];
    for (const next of doc.flow.slice(index + 1)) {
      if (next.type !== 'question') break;
      const question = questionById.get(next.id);
      if (question) following.push(sourceOf(question));
    }
    const better = liftStimulusLead(element, following);
    if (better !== element) lifted.set(element.id, better);
  });
  if (lifted.size > 0) doc = { ...doc, layout: doc.layout.map((element) => lifted.get(element.id) ?? element) };

  // Each stimulus serves the questions after it, up to its span (default 2) or the next stimulus.
  const stimulusOf = stimuliServing(doc);

  let rows: ReturnType<typeof rowsOf> = [];
  try {
    rows = rowsOf(doc);
  } catch {
    rows = [];
  }
  const rowOf = new Map(rows.map((row) => [row.questionId, row]));
  const items: PastPaperItem[] = fitted.map((question) => {
    const row = rowOf.get(question.id);
    const source = sourceOf(question);
    const provenance = sideText((question as { provenance?: BiText }).provenance);
    if (!provenance.en) provenance.en = source.tag;
    if (!provenance.zh) provenance.zh = provenance.en;
    const stimulus = stimulusOf.get(question.id);
    const stimulusWords = stimulus ? stimulus.blocks.flatMap((b) => ('text' in b && b.text ? [plain(b.text.en), plain(b.text.zh)] : [])) : [];
    return {
      topicId: entry.id,
      docId: doc.id,
      question,
      ...(stimulus ? { stimulus } : {}),
      source,
      provenance,
      excerpt: row?.excerpt ?? { en: '', zh: '' },
      searchText: [row?.searchText ?? '', provenance.en, provenance.zh, source.tag, ...stimulusWords].join(' ').toLowerCase(),
      ...(row?.number !== undefined ? { number: row.number } : {}),
    };
  });
  return { entry, doc, items, skipped };
}

/** Where a table sits, for sizing it: the text column, or half of it in a two-by-two option grid. */
const inColumn = (metrics: PageMetrics): TableFitPlace => tableFitPlace([], '', metrics);
const inOptionCell = (metrics: PageMetrics): TableFitPlace => tableFitPlace([{ type: 'mcq', optionLayout: 'columns2', options: [{ blocks: [{ id: 'x' }] }] }], 'x', metrics);

const fitBlocks = <B extends { kind: string }>(blocks: B[], place: TableFitPlace): B[] => {
  let changed = false;
  const out = blocks.map((block) => {
    if (block.kind !== 'table') return block;
    const next = fitTableToContent(block as unknown as TableBlock, place) as unknown as B;
    changed ||= next !== block;
    return next;
  });
  return changed ? out : blocks;
};

/**
 * The bank's tables sized to their words (`model/tableFit.ts`, user u-zhww): the export
 * leaves every table without a width, which the editor reads as the whole text column. Done
 * here, in memory, so the card, the copy a teacher takes and its `.docx` all carry the same
 * stored width; a table that has one (the export's, or a teacher's resize) is kept.
 */
export function withFittedTables(question: Question, metrics: PageMetrics): Question {
  const q = question as Question & { blocks?: ContentBlock[]; options?: McqQuestion['options'] };
  const blocks = Array.isArray(q.blocks) ? fitBlocks(q.blocks, inColumn(metrics)) : q.blocks;
  const grid = question.type === 'mcq' && (question as McqQuestion).optionLayout === 'columns2';
  const options = Array.isArray(q.options)
    ? q.options.map((option) => {
        if (!option.blocks?.length) return option;
        const fitted = fitBlocks(option.blocks, grid ? inOptionCell(metrics) : { ...inColumn(metrics), centre: false });
        return fitted === option.blocks ? option : { ...option, blocks: fitted };
      })
    : q.options;
  const optionsChanged = Array.isArray(q.options) && options!.some((option, i) => option !== q.options![i]);
  if (blocks === q.blocks && !optionsChanged) return question;
  return { ...q, ...(blocks ? { blocks } : {}), ...(optionsChanged ? { options } : {}) } as Question;
}

/** A passage's tables, sized as a stem's. */
function withFittedStimulus(element: Extract<LayoutElement, { kind: 'stimulus' }>, metrics: PageMetrics): LayoutElement {
  const blocks = fitBlocks(element.blocks, inColumn(metrics));
  return blocks === element.blocks ? element : { ...element, blocks };
}

/**
 * A question whose four options are pictures (or tables) prints them two by two, each letter
 * above its own figure (the MC panel's "2 per row", `optionLayout: 'columns2'`), as the
 * papers do. The export says so itself (docs/design/pastpaper-bank.md); one that does not
 * gets it here, in memory, so an older export prints right too. A layout the export set is
 * kept.
 */
export function withPictureGrid(question: Question): Question {
  if (question.type !== 'mcq') return question;
  const mcq = question as McqQuestion;
  if (mcq.optionLayout !== undefined || !Array.isArray(mcq.options) || mcq.options.length < 2) return question;
  const figure = (option: McqQuestion['options'][number]) =>
    (option.blocks ?? []).some((block) => block.kind === 'image' || block.kind === 'diagram' || block.kind === 'table');
  return mcq.options.every(figure) ? ({ ...mcq, optionLayout: 'columns2' } as Question) : question;
}

/** The filters a teacher sets on the bank: words, exam, years. All optional. */
export interface PastPaperQuery {
  words?: string;
  exams?: readonly SourceInfo['exam'][];
  /** Inclusive; a sample or practice paper counts as its exam's first year (2012 for HKDSE). */
  from?: number;
  to?: number;
  /** One paper only (`paperKey`, `DSE2016/P1`). */
  paper?: string;
  /** One exam year only, every paper of it (`sittingKey`, `DSE2016`, `DSESP`). */
  sitting?: string;
}

const yearOf = (source: SourceInfo) => source.year ?? (source.exam === 'HKDSE' ? 2012 : undefined);

/**
 * Every word must appear (in either language, the source line or the tag). Works on a
 * loaded question and on a search-index row alike: both carry a source and a search text.
 */
export function matchItem(item: Pick<PastPaperItem, 'source' | 'searchText'>, query: PastPaperQuery): boolean {
  if (query.exams && query.exams.length > 0 && !query.exams.includes(item.source.exam)) return false;
  const year = yearOf(item.source);
  if (query.from !== undefined && (year === undefined || year < query.from)) return false;
  if (query.to !== undefined && (year === undefined || year > query.to)) return false;
  if (query.paper !== undefined && paperKey(item.source) !== query.paper) return false;
  if (query.sitting !== undefined && sittingKey(item.source) !== query.sitting) return false;
  const words = (query.words ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => item.searchText.includes(word));
}

/** The years some questions span, for the year filter. */
export function yearSpan(items: readonly Pick<PastPaperItem, 'source'>[]): { from: number; to: number } | undefined {
  const years = items.map((item) => yearOf(item.source)).filter((y): y is number => y !== undefined);
  return years.length ? { from: Math.min(...years), to: Math.max(...years) } : undefined;
}

export interface PaperChoice {
  /** `DSE2016/P1` (`paperKey`). */
  key: string;
  source: SourceInfo;
  /** Questions of it in the bank. */
  questions: number;
}

const EXAM_ORDER = { HKCEE: 0, HKALE: 1, HKDSE: 2, other: 3 } as const;

/** The papers some questions come from, for the paper filter: by exam, then year (sample and practice papers first), then paper. */
export function papersOf(items: readonly Pick<PastPaperItem, 'source'>[]): PaperChoice[] {
  const byKey = new Map<string, PaperChoice>();
  for (const { source } of items) {
    const key = paperKey(source);
    if (!key) continue;
    const known = byKey.get(key);
    if (known) known.questions += 1;
    else byKey.set(key, { key, source, questions: 1 });
  }
  const when = (s: SourceInfo) => (s.special === 'SP' ? 0 : s.special === 'PP' ? 1 : s.year ?? 0);
  return [...byKey.values()].sort(
    (a, b) =>
      EXAM_ORDER[a.source.exam] - EXAM_ORDER[b.source.exam] ||
      when(a.source) - when(b.source) ||
      (a.source.paper ?? 0) - (b.source.paper ?? 0),
  );
}

type StimulusElement = Extract<LayoutElement, { kind: 'stimulus' }>;

const EN_RANGE = /^([\s\S]*?)\bquestions?\s+(?:no\.?\s*)?(\d+)\s*(?:,|and|&|to|-|–)\s*(\d+)([\s\S]*)$/i;
const ZH_RANGE = /^([\s\S]*?)第\s*(\d+)\s*(?:及|至|和|、|-|–)\s*(?:第\s*)?(\d+)\s*題([\s\S]*)$/;

/**
 * The export keeps a stimulus's lead sentence as printed in its paper ("Answer Questions 2
 * and 3 by referring to the following information:"), but the editor prints its own lead
 * with numbers it derives ("…Questions 5 and 6…": `prefix` + range + `suffix`). Left as is,
 * a copy would print both, the old numbers wrong. So, only when the stimulus's first block
 * is a plain paragraph that in **both** languages is exactly one such sentence naming the
 * paper numbers of the questions right after it, the sentence becomes the stimulus's
 * `prefix` and `suffix` (its wording kept word for word around the range) and `span` the
 * number of those questions. Anything else is left exactly as exported. Ideally the export
 * does this itself (docs/design/pastpaper-bank.md § What the editor needs).
 */
export function liftStimulusLead(stimulus: StimulusElement, following: readonly SourceInfo[]): StimulusElement {
  if (stimulus.prefix || stimulus.suffix) return stimulus;
  const [first, ...rest] = stimulus.blocks;
  if (!first || first.kind !== 'paragraph') return stimulus;
  const runs = (first as { text?: BiText }).text;
  if (!runs) return stimulus;
  const formatted = [...runs.en, ...runs.zh].some((run) => Object.keys(run).some((key) => key !== 'text'));
  if (formatted) return stimulus;
  const en = EN_RANGE.exec(plain(runs.en).trim());
  const zh = ZH_RANGE.exec(plain(runs.zh).trim());
  if (!en || !zh) return stimulus;
  const from = Number(en[2]);
  const to = Number(en[3]);
  if (Number(zh[2]) !== from || Number(zh[3]) !== to || to < from || to - from > 5) return stimulus;
  // The questions it names must be the ones that follow, in order, from one paper.
  const served = following.slice(0, to - from + 1);
  const samePaper = (a: SourceInfo, b: SourceInfo) => a.exam === b.exam && a.year === b.year && a.special === b.special && a.paper === b.paper;
  const fits =
    served.length === to - from + 1 && served.every((source, i) => source.number === from + i && samePaper(source, served[0]));
  if (!fits) return stimulus;
  const run = (text: string) => (text ? [{ text }] : []);
  return {
    ...stimulus,
    prefix: { en: run(en[1]), zh: run(zh[1]) },
    suffix: { en: run(en[4]), zh: run(zh[4]) },
    span: served.length,
    // A stimulus keeps one paragraph, as a new one has, so it stays clickable on the page.
    blocks: rest.length > 0 ? rest : [{ ...first, text: { en: [], zh: [] } }],
  };
}
