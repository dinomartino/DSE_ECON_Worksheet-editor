import { rowsOf } from '@/library/indexer';
import { migrate } from '@/model/migrations';
import { plain } from '@/model/text';
import type { BiText, LayoutElement, Question, Worksheet } from '@/model/types';
import { getQuestionType } from '@/registry';

/**
 * Reading the Past paper bank's files (k-0443). The export is written by another tool
 * (`question_bank.py export --editor-pack`, repo kp-econ-bank) and may still change, so
 * every reader here is tolerant: a field it does not know is ignored, a malformed entry
 * drops only itself, and nothing here throws on data.
 *
 * What the editor needs from the export (also in docs/design/pastpaper-bank.md):
 *  - `manifest.json`: `topics[]` with `id` and `file`; optional `title {en, zh}`,
 *    `questions`, `bytes`, `sha256`, `syllabusOrder`; optional `enabled` (false = off).
 *  - `topics/<id>.json`: an editor document the editor's own loader (`migrate`) opens;
 *    questions of a type this build does not know are left out and counted.
 *  - per question: a tag `CE2011/P2/Q8` (exam, year, paper, number) for the source filters,
 *    `provenance {en, zh}` for the source line, `lineage.rootId` stable across exports.
 *  - a shared stimulus: a `stimulus` layout element directly before its questions in `flow`.
 */

/** The manifest's format names this reader accepts; a later major version is still read, tolerantly. */
export const PACK_FORMAT = 'kp-editor-pack';

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
}

export interface Manifest {
  enabled: boolean;
  version: number;
  topics: TopicEntry[];
  /** Total questions, as the manifest says, else the topics' sum. */
  questions: number;
}

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
    topics.push({
      id,
      file,
      title: { en, zh: str(title.zh) ?? en },
      order: num(entry.syllabusOrder) ?? index + 1,
      ...(num(entry.questions) !== undefined ? { questions: num(entry.questions) } : {}),
      ...(num(entry.bytes) !== undefined ? { bytes: num(entry.bytes) } : {}),
      ...(sha && /^[0-9a-f]{64}$/.test(sha) ? { sha256: sha } : {}),
    });
  });
  topics.sort((a, b) => a.order - b.order);
  const sum = topics.reduce((total, t) => total + (t.questions ?? 0), 0);
  return {
    enabled: raw.enabled !== false,
    version: num(raw.version) ?? 1,
    topics,
    questions: num(raw.questions) ?? sum,
  };
}

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
  const known = doc.questions.filter((q) => q && typeof q.type === 'string' && getQuestionType(q.type));
  const skipped = doc.questions.length - known.length;
  doc = { ...doc, kind: 'bank', questions: known, bankHidden: undefined };
  doc = { ...doc, flow: (doc.flow ?? []).filter((item) => item.type !== 'question' || known.some((q) => q.id === item.id)) };

  // A stimulus whose first paragraph names the questions after it by their paper numbers
  // has that sentence lifted into its own wording (`liftStimulusLead`), in memory only.
  const questionById = new Map(known.map((q) => [q.id, q]));
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
  const stimulusOf = new Map<string, Extract<LayoutElement, { kind: 'stimulus' }>>();
  const layoutById = new Map((doc.layout ?? []).map((element) => [element.id, element]));
  let open: { element: Extract<LayoutElement, { kind: 'stimulus' }>; left: number } | undefined;
  for (const item of doc.flow) {
    if (item.type === 'layout') {
      const element = layoutById.get(item.id);
      if (element?.kind === 'stimulus') open = { element, left: Math.max(1, element.span ?? 2) };
      continue;
    }
    if (item.type !== 'question') continue;
    if (open && open.left > 0) {
      stimulusOf.set(item.id, open.element);
      open.left -= 1;
    }
  }

  let rows: ReturnType<typeof rowsOf> = [];
  try {
    rows = rowsOf(doc);
  } catch {
    rows = [];
  }
  const rowOf = new Map(rows.map((row) => [row.questionId, row]));
  const items: PastPaperItem[] = known.map((question) => {
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

/** The filters a teacher sets on the bank: words, exam, years. All optional. */
export interface PastPaperQuery {
  words?: string;
  exams?: readonly SourceInfo['exam'][];
  /** Inclusive; a sample or practice paper counts as its exam's first year (2012 for HKDSE). */
  from?: number;
  to?: number;
}

const yearOf = (source: SourceInfo) => source.year ?? (source.exam === 'HKDSE' ? 2012 : undefined);

/** Every word must appear (in either language, the source line or the tag). */
export function matchItem(item: PastPaperItem, query: PastPaperQuery): boolean {
  if (query.exams && query.exams.length > 0 && !query.exams.includes(item.source.exam)) return false;
  const year = yearOf(item.source);
  if (query.from !== undefined && (year === undefined || year < query.from)) return false;
  if (query.to !== undefined && (year === undefined || year > query.to)) return false;
  const words = (query.words ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => item.searchText.includes(word));
}

/** The years the loaded items span, for the year filter. */
export function yearSpan(items: readonly PastPaperItem[]): { from: number; to: number } | undefined {
  const years = items.map((item) => yearOf(item.source)).filter((y): y is number => y !== undefined);
  return years.length ? { from: Math.min(...years), to: Math.max(...years) } : undefined;
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
