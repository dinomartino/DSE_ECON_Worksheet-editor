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
          [
            'Answer ALL questions in the spaces provided in this booklet.',
            '請在本試卷指定的空位內作答所有題目。',
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

export interface CoverOptions {
  paperStyle: CoverPaperStyle;
  /** Corner block: a short code, the subject, and which paper this is. */
  code?: string;
  subject?: string;
  paperLabel?: string;
  school?: string;
  examName?: string;
  paperName?: string;
  paperKind?: string;
  timeAllowed?: string;
  languageNote?: string;
}

/**
 * Build a cover in the reference's shape, with this project's wording.
 *
 * Every value is a placeholder the teacher edits on the page, so leaving one out yields
 * the generic version rather than a blank — the cover is never a form to fill before it
 * can be looked at.
 */
export function createCoverPage(options: CoverOptions): CoverPage {
  const {
    paperStyle,
    code = '2025-26',
    subject = 'ECON',
    paperLabel = paperStyle === 'mcq' ? 'PAPER 1' : 'PAPER 2',
    school = 'SCHOOL NAME',
    examName = 'S.6 MOCK EXAMINATION 2025 – 2026',
    paperName = paperStyle === 'mcq' ? 'ECONOMICS   PAPER 1' : 'ECONOMICS   PAPER 2',
    paperKind = paperStyle === 'mcq' ? 'Multiple-choice Questions' : 'Question Booklet',
    timeAllowed = paperStyle === 'mcq'
      ? '8:30 am – 9:30 am (1 hour)'
      : '10:15 am – 12:45 pm (2 hours 30 minutes)',
    languageNote = 'This paper must be answered in English',
  } = options;

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
  // Centred in one wide column, ranged left in a narrow one — matching each reference.
  const headFormat = hasPanel ? {} : { align: 'center' as const };

  return {
    /*
     * The reference sets its whole corner block in Arial bold at the body size (its
     * style is `sz=22` half-points — 11pt, which is `Body` here, so no size is stored).
     * The block was once 18pt, and that oversize is what forced a wider textbox and a
     * shortened diagonal in the export — at the body size the reference's own geometry
     * fits placeholders too (§ `cornerGroupXml`).
     */
    cornerLines: [
      line(code, '', { ...sans, bold: true }),
      line(subject, '', { ...sans, bold: true }),
      line(paperLabel, '', { ...sans, bold: true }, 1),
    ],
    cornerRule: true,

    /*
     * Air between the groups, exactly as the reference spends blank paragraphs: one
     * inside the identity pair, two before the title pair, one before the timing, six
     * before INSTRUCTIONS. Measured off its `word/document.xml`, not chosen by eye — a
     * cover that runs its lines together reads as one block of text rather than as a
     * title page, and one that spaces them differently reads as a different paper.
     */
    headLines: [
      line(school, '', { ...headFormat, ...sans, fontSize: 18 }, 1),
      line(examName, '', { ...headFormat, ...sans, fontSize: 16 }, 2),
      // The paper's name is the largest thing on the page, as in the reference, and is
      // sans on both papers — it is the line a candidate identifies the paper by.
      line(paperName, '', { ...headFormat, ...sans, bold: true, fontSize: 28 }),
      line(paperKind, '', { ...headFormat, ...sans, bold: true, fontSize: 24 }, 1),
      // Read properly rather than at a glance, so serif on Paper 1.
      line(timeAllowed, '', { ...headFormat, ...body }),
      line(languageNote, '', { ...headFormat, ...body }, 6),
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

    footLines: [line(school, '', { ...sans, fontSize: 16 })],

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
