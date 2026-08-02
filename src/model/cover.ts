import { newId } from './factories';
import { bi, emptyBiText, isBiTextEmpty, rt } from './text';
import type { BiText, RichText, TextFormat } from './types';
import type { CoverLine, CoverPage, CoverPaperStyle, CoverRegion } from './coverTypes';

export type { CoverLine, CoverPage, CoverPaperStyle, CoverRegion } from './coverTypes';

/** The reference's own split, and the default for an A4 cover. */
export const DEFAULT_COVER_COLUMNS = { left: 5328, gap: 144, right: 3845 };

export function coverColumns(cover: CoverPage) {
  return cover.columns ?? DEFAULT_COVER_COLUMNS;
}

/**
 * The candidate panel's geometry, in twips — the reference's own numbers, read out of
 * its `word/document.xml` (`tblInd=340`, label cell `1558`, digit cells `290` wide in a
 * row `504` exact-high; the barcode box above them is `1584` tall). One definition for
 * both backends: the preview draws these as inches, the `.docx` writes them as `w:tcW`/
 * `w:trHeight`, and two copies is how the two would drift apart.
 */
export const COVER_PANEL = {
  /** `w:tblInd` — how far the panel's tables sit into the right column. */
  indent: 340,
  /** The label cell ("Candidate Number" in the reference; "Class No." here). */
  labelWidth: 1558,
  /** One write-in box. */
  boxWidth: 290,
  /** The write-in row's exact height. */
  boxHeight: 504,
  /** The framed note (the reference's barcode box) reserves at least this. */
  noteMinHeight: 1584,
} as const;

/**
 * Whether the right column has anything to print.
 *
 * Drives the column rule and, on export, whether the section is two columns at all: a
 * cover with an empty panel should print as one wide column, not as a narrow one beside
 * a blank strip.
 */
export function coverHasPanel(cover: CoverPage): boolean {
  return !isBiTextEmpty(cover.panelNote) || (cover.panelBoxes ?? 0) > 0;
}

const line = (
  en: string,
  zh = '',
  format?: TextFormat,
  gapAfter?: number,
): CoverLine => ({
  id: newId(),
  text: bi(en, zh),
  ...(format ? { format } : {}),
  ...(gapAfter ? { gapAfter } : {}),
});

/**
 * The two faces a cover uses.
 *
 * A cover is typographically its own thing — but the two reference papers differ in how
 * far that goes, and the difference is deliberate rather than incidental:
 *
 * - **Paper 2** sets the whole front page in Arial.
 * - **Paper 1** mixes: Arial for the corner block, the identity lines and the paper's own
 *   name — the things read at a glance — and Times New Roman for the timing,
 *   "INSTRUCTIONS" and the instruction body, which are read properly.
 *
 * So the sans face is applied per line, not per page.
 */
/**
 * The academic year a cover created *now* belongs to.
 *
 * Three places print the year and must agree — the corner code, the examination line,
 * and the QAB footer's paper code ("2025-26-ECON 2–5"). They shipped as three separate
 * literals, which is two chances to disagree and three things to remember every August;
 * a document made in 2027 was stamped 2025-26 on all three.
 *
 * Derived rather than constant because the answer is knowable: a school year turns over
 * in September, so `MOCK_YEAR_START_MONTH` is the cut. A mock sat in November 2026
 * belongs to 2026-27; one sat in March 2027 belongs to the same year, not to 2027-28.
 * Takes its `now` as an argument so a test pins the boundary rather than the clock.
 *
 * It remains a **default**: every line it feeds is editable on the page, and
 * `CoverOptions.code` overrides it outright.
 */
const MOCK_YEAR_START_MONTH = 8; // September, zero-based.

export function academicYear(now: Date = new Date()): { short: string; long: string } {
  const start = now.getMonth() >= MOCK_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  const end = start + 1;
  // The corner code abbreviates ("2025-26"); the examination line spells both years out
  // with the spaced en dash the reference's own line uses.
  return { short: `${start}-${String(end).slice(-2)}`, long: `${start} – ${end}` };
}

/** The corner block's default code line, for callers wanting only the short form. */
export const defaultCoverCode = (now?: Date) => academicYear(now).short;

export const COVER_SANS = { latin: 'Arial', eastAsia: 'Microsoft JhengHei' };
export const COVER_SERIF = { latin: 'Times New Roman', eastAsia: 'PMingLiU' };

/**
 * Emphasised words inside an instruction.
 *
 * Both reference papers bold the operative quantity — "Answer **ALL** questions", "mark
 * only **ONE** answer" — because it is the word a candidate misreading costs marks for.
 * Per-**run** bold rather than a format on the whole line: the emphasis is a stretch of
 * characters, which is exactly what `InlineRun` is for (§ per-run formatting).
 */
const EMPHASISED = ['ALL', 'ONE', 'TWO', 'NO MARKS'];

/** Split a sentence into runs, bolding each emphasised word where it appears. */
function emphasise(text: string): RichText {
  if (!text) return [];
  // One alternation over the whole list, so a sentence with two emphasised words is split
  // in a single pass and the runs stay in order.
  const pattern = new RegExp(`\\b(${EMPHASISED.join('|')})\\b`, 'g');
  const runs: RichText = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (start > at) runs.push({ text: text.slice(at, start) });
    runs.push({ text: match[0], bold: true });
    at = start + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}

/** A line whose emphasised words are bolded, for the instruction list. */
const instruction = (en: string, zh: string): CoverLine => ({
  id: newId(),
  // Only the English side: the Chinese wording carries its emphasis in the phrasing
  // rather than in a single capitalised word, so a regex over it would bold nothing.
  text: { en: emphasise(en), zh: rt(zh) },
});

/**
 * Instruction wording, per paper style.
 *
 * Written for a school mock rather than transcribed: each says the plain operational
 * thing a candidate needs, in this project's own words. A teacher who wants their
 * centre's exact rubric types it over — the same relationship every preset in this app
 * has to its reference.
 *
 * **An instruction earns its place by describing this booklet.** The list is ordered the
 * way the reference orders its own — identify yourself, then what to answer, then where
 * to write it, then the incidentals — because that is the order a candidate needs them
 * in, and it is the order the page is used in. Two rules that follow from it:
 *
 * - **The paper's *structure* comes before its mechanics.** A QAB ships Sections A/B/C
 *   with "Answer any ONE question." on C (§ `qabSections`), and the cover said nothing
 *   about it: the one fact a candidate must not get wrong — which sections are compulsory
 *   — was reachable only by paging to the back. The reference makes it instruction two,
 *   and so does this.
 * - **The margin rule belongs here too.** The booklet already prints "Do not write in
 *   this margin." down both edges as page furniture (§ `pageFurniture`), but furniture is
 *   read once the candidate is already writing. It is stated on the cover for the same
 *   reason the reference states it: answers outside the ruled space are not marked, which
 *   is a marks consequence, not a formatting preference.
 *
 * Nothing here reproduces the apparatus this app does not model — no barcodes, no
 * candidate-number grids, no invigilation timing rubric (§ structure, not wording).
 */
function instructionLines(style: CoverPaperStyle): CoverLine[] {
  const shared: Array<[string, string]> = [
    [
      'Write your name, class and class number in the spaces provided on this cover.',
      '在封面指定位置填寫姓名、班別及班號。',
    ],
    ['Do not open this question paper until you are told to do so.', '未獲監考員指示前，不得翻閱試卷。'],
  ];

  const rest: Array<[string, string]> =
    style === 'mcq'
      ? [
          ['All questions carry equal marks. Answer ALL questions.', '各題分數相同，全部題目均須作答。'],
          [
            'Mark your answers on the answer sheet provided, using an HB pencil so that a wrong mark can be erased cleanly.',
            '請用 HB 鉛筆在答題紙上作答，以便修改時能完全擦去。',
          ],
          [
            'Mark only ONE answer for each question. A question with more than one answer marked scores no mark.',
            '每題只可選一個答案；選多於一個答案者，該題不獲分數。',
          ],
          ['No marks are deducted for a wrong answer.', '答錯不會扣分。'],
        ]
      : [
          // What to answer, before how to answer it — the section rule is the one a
          // candidate cannot recover from getting wrong.
          [
            'Answer ALL questions in Section A and Section B. Answer any ONE question in Section C.',
            '甲部及乙部所有題目均須作答。丙部只須選答一題。',
          ],
          [
            'Write your answers in the spaces provided in this booklet.',
            '請在本試題答題簿指定的空位內作答。',
          ],
          // The furniture prints this down every margin; the cover is where it is read
          // before any of it has been written on.
          [
            'Answers written in the margins will not be marked.',
            '寫於邊界以外的答案，將不予評閱。',
          ],
          [
            'Write your answers legibly in ink. Working may be written in pencil.',
            '請用墨水筆清楚書寫答案，計算過程可用鉛筆。',
          ],
          [
            'The marks for each question are shown in brackets at the end of the question.',
            '每題的分數在題末括號內列出。',
          ],
          [
            'Supplementary answer sheets are available on request. Write your name and the question number on each sheet used.',
            '如需補充作答紙可向監考員索取，並在每張紙上填寫姓名及題號。',
          ],
        ];

  return [...shared, ...rest].map(([en, zh]) => instruction(en, zh));
}

/**
 * A cover value as the teacher may give it: one side, or both.
 *
 * Every head line is bilingual, so an option that could only carry English would make
 * the Chinese cover unfillable from the wizard. A bare string sets the English side and
 * leaves the Chinese default in place, which is what a caller written before the
 * Chinese defaults existed means by it.
 */
export type CoverText = string | { en?: string; zh?: string };

const sideOf = (value: CoverText | undefined, side: 'en' | 'zh'): string | undefined =>
  typeof value === 'string' ? (side === 'en' ? value : undefined) : value?.[side];

export interface CoverOptions {
  paperStyle: CoverPaperStyle;
  /** Corner block: a short code, the subject, and which paper this is. */
  code?: string;
  subject?: string;
  paperLabel?: string;
  school?: CoverText;
  examName?: CoverText;
  paperName?: CoverText;
  paperKind?: CoverText;
  timeAllowed?: CoverText;
  languageNote?: CoverText;
  /** Overrides the derived academic year; tests pin the boundary through it. */
  now?: Date;
}

/**
 * Build a cover in the reference's shape, with this project's wording.
 *
 * Every value is a placeholder the teacher edits on the page, so leaving one out yields
 * the generic version rather than a blank — the cover is never a form to fill before it
 * can be looked at.
 *
 * **Both sides carry defaults.** Every line shipped with `zh` empty, so a cover viewed
 * in Chinese was a blank sheet with a candidate panel on it: the mode this app exists to
 * serve showed nothing at all, while English looked finished. The Chinese is this
 * project's own school-mock wording, matching the English line for line — deliberately
 * *not* the reference's authority lines (§ structure is reproduced, wording is not),
 * which name the HKEAA and its public examination and belong to neither a school mock
 * nor this repository.
 */
export function createCoverPage(options: CoverOptions): CoverPage {
  const { paperStyle, now } = options;
  const year = academicYear(now);
  const mcq = paperStyle === 'mcq';

  const code = options.code ?? year.short;
  const subject = options.subject ?? 'ECON';
  const paperLabel = options.paperLabel ?? (mcq ? 'PAPER 1' : 'PAPER 2');

  /*
   * Each line's two sides, resolved independently: a teacher who types an English
   * school name keeps the Chinese placeholder rather than blanking it, which is the
   * only behaviour that lets a half-filled form still produce a readable cover.
   */
  const school = sideOf(options.school, 'en') ?? 'SCHOOL NAME';
  const schoolZh = sideOf(options.school, 'zh') ?? '學校名稱';
  // The examination line is the year's other home; both sides spell it from `year`.
  const examName = sideOf(options.examName, 'en') ?? `S.6 MOCK EXAMINATION ${year.long}`;
  const examNameZh = sideOf(options.examName, 'zh') ?? `${year.long} 年度中六模擬考試`;
  const paperName =
    sideOf(options.paperName, 'en') ?? (mcq ? 'ECONOMICS   PAPER 1' : 'ECONOMICS   PAPER 2');
  const paperNameZh = sideOf(options.paperName, 'zh') ?? (mcq ? '經濟  試卷一' : '經濟  試卷二');
  const paperKind =
    sideOf(options.paperKind, 'en') ?? (mcq ? 'Multiple-choice Questions' : 'Question-Answer Book');
  const paperKindZh = sideOf(options.paperKind, 'zh') ?? (mcq ? '多項選擇題' : '試題答題簿');
  const timeAllowed =
    sideOf(options.timeAllowed, 'en') ??
    (mcq ? '8:30 am – 9:30 am (1 hour)' : '10:15 am – 12:45 pm (2 hours 30 minutes)');
  /*
   * The Chinese timing line carries its own break.
   *
   * Written as one sentence it overran the 5328tw column at 11pt and wrapped wherever
   * the renderer chose — which orphaned the closing bracket onto a line of its own
   * directly beneath a centred title. Chinese spells clock times in characters rather
   * than digits, so the line is simply longer than its English counterpart and no
   * rewording gets it under the column width; the reference breaks it too. `\n` is
   * ordinary run text (§ newline is run text), so both backends split it identically
   * and the break lands where it was chosen rather than where the column ran out.
   */
  const timeAllowedZh =
    sideOf(options.timeAllowed, 'zh') ??
    (mcq
      ? '一小時完卷\n（上午八時三十分至九時三十分）'
      : '兩小時三十分完卷\n（上午十時十五分至下午十二時四十五分）');
  const languageNote =
    sideOf(options.languageNote, 'en') ?? 'This paper must be answered in English';
  const languageNoteZh = sideOf(options.languageNote, 'zh') ?? '本試卷必須用中文作答';

  /*
   * Only a write-in paper gets a side panel, and that decides the whole page.
   *
   * An MCQ candidate answers on a separate machine-read sheet, so there is nothing to
   * write on the cover and the reference's Paper 1 has no panel at all — it is one
   * full-width column with its identity lines **centred** across the page. Paper 2 is the
   * booklet the candidate writes in, so it carries the panel and the two-column split
   * that makes room for it.
   *
   * `coverHasPanel()` reads this, and both backends follow: no panel means no `w:cols`,
   * no column break, and one wide column (§ `coverXml`). So the two covers differ in
   * *shape*, not merely in wording.
   */
  const hasPanel = paperStyle === 'writeIn';
  /*
   * Paper 2 is Arial throughout; Paper 1 mixes, keeping sans for the lines read at a
   * glance and serif for the ones read properly (§ `COVER_SANS`). Expressed as two
   * locals so each line below says which of the two it is, rather than the reader having
   * to hold the rule in their head.
   */
  const sans = { fonts: { ...COVER_SANS } };
  const body = hasPanel ? sans : { fonts: { ...COVER_SERIF } };
  /*
   * Centred on both papers — each within its own column. Paper 1's one wide column
   * centres across the page; Paper 2 centres within the narrow left column, which is
   * the reference's own arrangement (its head lines ride a centre tab at 2610, the
   * midpoint of its 5328tw column — `w:jc` centring lands within ~54tw of the same
   * place without the negative indents the tab trick needs). Ranged-left was wrong
   * for the booklet: beside the centred candidate panel it read as a draft.
   */
  const headFormat = { align: 'center' as const };

  return {
    /*
     * The corner block is set at 11pt Arial whatever the document's own body size — a
     * QAB body is 10pt (§ `baseFontSize`) but its corner code is not, so the size is
     * stored rather than inherited. The block was once 18pt, and that oversize is what
     * forced a wider textbox and a shortened diagonal in the export — at 11pt the
     * reference's own geometry fits placeholders too (§ `cornerGroupXml`).
     *
     * **The paper line is quieter than the code above it**: regular weight at 10.5pt
     * with a small gap above — the reference's own setting (its "PAPER 2" paragraph is
     * plain Arial with `w:spacing w:before="120"`; the manually refined export uses
     * `sz="21"` and `w:before="115"`, which is what these numbers spell). Bolding it
     * like its neighbours shipped once and read as three lines of one heading instead
     * of a code block with the paper number hung under it.
     */
    /*
     * The corner block is a code, not a sentence — the year, the subject's short form
     * and which paper this is. The reference prints its own code block identically on
     * the Chinese and English editions but for the subject, which is the one word in it
     * that is language at all; the rest is read the same way in both.
     */
    cornerLines: [
      line(code, code, { ...sans, bold: true, fontSize: 11 }),
      line(subject, '經濟', { ...sans, bold: true, fontSize: 11 }),
      line(paperLabel, mcq ? '卷一' : '卷二', { ...sans, fontSize: 10.5, spaceBefore: 5.75 }, 1),
    ],
    cornerRule: true,

    /*
     * Air between the groups, exactly as the reference spends blank paragraphs: one
     * inside the identity pair, two before the title pair, one before the timing, six
     * before INSTRUCTIONS. Measured off its `word/document.xml`, not chosen by eye — a
     * cover that runs its lines together reads as one block of text rather than as a
     * title page, and one that spaces them differently reads as a different paper.
     */
    /*
     * Sizes are the reference's own, measured out of its cover XML, not chosen for
     * emphasis: the identity lines at 11pt (stored, so a 10pt QAB body does not shrink
     * them — § `baseFontSize`), and the paper's name plus its kind at **14pt bold**
     * (`sz=28` in both the 2019 paper and the manually refined export). The title
     * shipped at 16pt once and read visibly heavier than the reference page beside it;
     * the largest thing on a DSE cover is quiet by this app's standards. The timing and
     * language lines carry no size, deliberately: they are body text and follow the
     * document's own base — 10pt on a QAB, which is where the reference sets them.
     */
    headLines: [
      line(school, schoolZh, { ...headFormat, ...sans, fontSize: 11 }, 1),
      line(examName, examNameZh, { ...headFormat, ...sans, fontSize: 11 }, 2),
      // The line a candidate identifies the paper by — sans on both papers.
      line(paperName, paperNameZh, { ...headFormat, ...sans, fontSize: 14, bold: true }),
      line(paperKind, paperKindZh, { ...headFormat, ...sans, fontSize: 14, bold: true }, 1),
      // Read properly rather than at a glance, so serif on Paper 1.
      line(timeAllowed, timeAllowedZh, { ...headFormat, ...body }),
      line(languageNote, languageNoteZh, { ...headFormat, ...body }, 6),
    ],

    instructionsHeading: bi('INSTRUCTIONS', '考生須知'),
    // The two references differ: Paper 1 numbers `1.`, Paper 2 `(1)`.
    instructionMarker: hasPanel ? 'paren' : 'dot',
    instructions: instructionLines(paperStyle),

    // Name / class / number, not a barcode: same slot, a school's own apparatus.
    ...(hasPanel
      ? {
          panelNote: bi(
            'Write your name and class in the spaces below.',
            '請在下欄填寫姓名及班別。',
          ),
          panelFieldLabel: bi('Class No.', '班號'),
          panelBoxes: 3,
        }
      : { panelBoxes: 0 }),

    // The reference's foot line is 12pt bold (its `footer1.xml`, `sz=24` + `w:b`).
    // The same school name as the head line, so both sides follow it.
    footLines: [line(school, schoolZh, { ...sans, bold: true, fontSize: 12 })],

    // The reference's Paper 1 boxes a note bottom-right; the write-in paper has none.
    // This project's own words, as everywhere (§ the copyright constraint).
    ...(hasPanel
      ? {}
      : {
          footNote: bi(
            'Keep this question paper on your desk until the end of the examination.',
            '請將試卷放在桌上，直至考試結束。',
          ),
        }),

    // The default for anything not carrying its own face — the instruction list
    // among them, which is serif on Paper 1 and sans on Paper 2.
    fonts: hasPanel ? { ...COVER_SANS } : { ...COVER_SERIF },

    columns: { ...DEFAULT_COVER_COLUMNS },
  };
}

/** An empty cover, for a teacher building one from nothing. */
export function emptyCoverPage(): CoverPage {
  return {
    cornerLines: [],
    headLines: [line('')],
    instructionsHeading: bi('INSTRUCTIONS', '考生須知'),
    instructions: [],
    panelNote: emptyBiText(),
    panelBoxes: 0,
    footLines: [],
    columns: { ...DEFAULT_COVER_COLUMNS },
  };
}

/** Where a `CoverLine` list lives on the page, keyed by region. */
export const COVER_REGION_KEY = {
  corner: 'cornerLines',
  head: 'headLines',
  instructions: 'instructions',
  foot: 'footLines',
} as const satisfies Record<Exclude<CoverRegion, 'panel'>, keyof CoverPage>;

/** Read a region's lines. Absent reads as empty, so callers never branch on undefined. */
export function coverLines(cover: CoverPage, region: Exclude<CoverRegion, 'panel'>): CoverLine[] {
  return (cover[COVER_REGION_KEY[region]] as CoverLine[] | undefined) ?? [];
}

/** Replace one region's lines, leaving every other region untouched. */
export function setCoverLines(
  cover: CoverPage,
  region: Exclude<CoverRegion, 'panel'>,
  lines: CoverLine[],
): CoverPage {
  return { ...cover, [COVER_REGION_KEY[region]]: lines };
}

/** Rewrite one line's text, addressed by id — what an in-place page edit commits. */
export function setCoverLineText(cover: CoverPage, lineId: string, text: BiText): CoverPage {
  let next = cover;
  for (const region of ['corner', 'head', 'instructions', 'foot'] as const) {
    const lines = coverLines(next, region);
    if (!lines.some((item) => item.id === lineId)) continue;
    next = setCoverLines(
      next,
      region,
      lines.map((item) => (item.id === lineId ? { ...item, text } : item)),
    );
  }
  return next;
}

/** Format one line, addressed by id. Deltas only, as everywhere else. */
export function setCoverLineFormat(
  cover: CoverPage,
  lineId: string,
  patch: Partial<TextFormat>,
): CoverPage {
  let next = cover;
  for (const region of ['corner', 'head', 'instructions', 'foot'] as const) {
    const lines = coverLines(next, region);
    if (!lines.some((item) => item.id === lineId)) continue;
    next = setCoverLines(
      next,
      region,
      lines.map((item) =>
        item.id === lineId ? { ...item, format: { ...item.format, ...patch } } : item,
      ),
    );
  }
  return next;
}

/** Add a line to a region, optionally after a given one. */
export function addCoverLine(
  cover: CoverPage,
  region: Exclude<CoverRegion, 'panel'>,
  afterId?: string,
): CoverPage {
  const lines = coverLines(cover, region);
  const fresh = line('');
  const at = afterId ? lines.findIndex((item) => item.id === afterId) : -1;
  const next = [...lines];
  next.splice(at < 0 ? lines.length : at + 1, 0, fresh);
  return setCoverLines(cover, region, next);
}

/** Remove a line, addressed by id. */
export function removeCoverLine(cover: CoverPage, lineId: string): CoverPage {
  let next = cover;
  for (const region of ['corner', 'head', 'instructions', 'foot'] as const) {
    const lines = coverLines(next, region);
    if (!lines.some((item) => item.id === lineId)) continue;
    next = setCoverLines(
      next,
      region,
      lines.filter((item) => item.id !== lineId),
    );
  }
  return next;
}

/** Find one line anywhere on the cover, addressed by id. */
export function findCoverLine(cover: CoverPage, lineId: string): CoverLine | undefined {
  for (const region of ['corner', 'head', 'instructions', 'foot'] as const) {
    const found = coverLines(cover, region).find((item) => item.id === lineId);
    if (found) return found;
  }
  return undefined;
}
