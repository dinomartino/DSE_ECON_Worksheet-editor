/**
 * Detected page chrome → the new paper's header, footer, masthead and cover, so the
 * dialog never reasons about layout. Pure. Rules (`docs/design/paste-import.md` § 12):
 * the file's header and footer replace the paper type's (unless the teacher keeps the
 * preset); an edge the file does not have keeps the preset's; page 1's own rows are
 * `firstPage`, a blank page 1 is `showOnFirstPage: false`; the masthead is `bands` on a
 * classroom or LQ worksheet and fills the cover's lines on a mock; whatever has no
 * place is a leftover the teacher copies.
 */
import type { CoverText } from '@/model/cover';
import { newId } from '@/model/factories';
import type { DocumentType } from '@/model/newWorksheet';
import { emptyBiText, rt } from '@/model/text';
import type { Band, BandField, BiText, HeaderFooter, LanguageMode, TextFormat } from '@/model/types';
import { cjkShare } from './normalize';
import { CHROME_ZONES, pieceText, rowText, type ChromeLeftover, type ChromePiece, type ChromeRow, type DetectedChrome, type PageChrome } from './pageChrome';

export interface ChromePlanOptions {
  documentType: DocumentType;
  /** The new paper's language. */
  language: LanguageMode;
  /** What the imported questions add up to: a stated full marks must agree to stay live. */
  totalMarks: number;
  /** Keep the paper type's own header and footer instead of the file's. */
  keepPreset?: boolean;
}

/** The cover lines a mock's masthead fills (`createWorksheetFrom`'s `coverDetails`). */
export interface CoverFill {
  school?: CoverText;
  examName?: CoverText;
  paperName?: CoverText;
  timeAllowed?: CoverText;
}

export interface ChromePlan {
  /** Absent: the paper type's own stays. */
  header?: HeaderFooter;
  footer?: HeaderFooter;
  /** The masthead (`Worksheet.bands`). */
  bands?: Band[];
  cover?: CoverFill;
  /** Shown in the review to copy and retype: never applied. */
  leftovers: ChromeLeftover[];
}

const HAN = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

/**
 * Text on the side its script reads as; text with no letters, or on a side the paper
 * does not print, goes on both (identical sides print once in EN+中).
 */
export function chromeText(text: string, language: LanguageMode): BiText {
  if (!text) return emptyBiText();
  const prints = language === 'bilingual' ? ['en', 'zh'] : [language];
  const side = HAN.test(text) && (!LATIN.test(text) || cjkShare(text) >= 0.5) ? 'zh' : LATIN.test(text) ? 'en' : undefined;
  if (!side || !prints.includes(side)) return { en: rt(text), zh: rt(text) };
  return side === 'en' ? { en: rt(text), zh: [] } : { en: [], zh: rt(text) };
}

function formatOf(piece: ChromePiece): TextFormat | undefined {
  const format: TextFormat = {
    ...(piece.bold ? { bold: true } : {}),
    ...(piece.italic ? { italic: true } : {}),
    ...(piece.underline ? { underline: true } : {}),
    ...(piece.size ? { fontSize: piece.size } : {}),
  };
  return Object.keys(format).length ? format : undefined;
}

/** One piece as a band field. A full marks figure the questions do not add up to stays text. */
function fieldOf(piece: ChromePiece, options: ChromePlanOptions, leftovers: ChromeLeftover[], where: ChromeLeftover['where']): BandField {
  const format = formatOf(piece);
  const fmt = format ? { format } : {};
  const t = (s: string) => chromeText(s, options.language);
  switch (piece.kind) {
    case 'text':
      return { kind: 'text', id: newId(), text: t(piece.text), ...fmt };
    case 'pageNumber':
      return {
        kind: 'pageNumber',
        id: newId(),
        pattern: piece.pattern,
        ...(piece.prefix ? { prefix: t(piece.prefix) } : {}),
        ...(piece.suffix ? { suffix: t(piece.suffix) } : {}),
        ...fmt,
      };
    case 'fillIn': {
      // Both sides spelled out: an absent prefix would print the default "Name:".
      const prefix = t(piece.prefix);
      return { kind: 'fillIn', id: newId(), prefix, suffix: piece.suffix ? t(piece.suffix) : emptyBiText(), widthCh: piece.widthCh, ...fmt };
    }
    case 'totalMarks':
      if (piece.marks !== options.totalMarks) {
        leftovers.push({ where, text: pieceText(piece), reason: 'marksDiffer', marks: { stated: piece.marks, counted: options.totalMarks } });
        return { kind: 'text', id: newId(), text: t(pieceText(piece)), ...fmt };
      }
      return { kind: 'totalMarks', id: newId(), prefix: t(piece.prefix), suffix: t(piece.suffix), ...fmt };
  }
}

function bandOf(row: ChromeRow, options: ChromePlanOptions, leftovers: ChromeLeftover[], where: ChromeLeftover['where']): Band {
  const zones = { left: [] as BandField[], center: [] as BandField[], right: [] as BandField[] };
  for (const zone of CHROME_ZONES) zones[zone] = row[zone].map((piece) => fieldOf(piece, options, leftovers, where));
  return { id: newId(), zones, ...(row.rule ? { rule: true } : {}) };
}

/** A header or footer from the running rows and page 1's own. */
function edgeOf(
  running: DetectedChrome | undefined,
  first: DetectedChrome | undefined,
  options: ChromePlanOptions,
  leftovers: ChromeLeftover[],
  where: 'header' | 'footer',
): HeaderFooter | undefined {
  if (!running?.rows.length && !first) return undefined;
  const out: HeaderFooter = {
    enabled: true,
    rule: running?.rule ?? false,
    showOnFirstPage: true,
    bands: (running?.rows ?? []).map((row) => bandOf(row, options, leftovers, where)),
  };
  if (first && !first.rows.length) out.showOnFirstPage = false;
  else if (first) out.firstPage = { bands: first.rows.map((row) => bandOf(row, options, leftovers, where)), ...(first.rule ? { rule: true } : {}) };
  return out;
}

const COVER_SLOTS: Array<[keyof CoverFill, RegExp]> = [
  ['school', /school|college|academy|secondary|書院|中學|學校|學院|小學/i],
  ['timeAllowed', /^\s*(time|duration)\b|\b\d+\s*(hours?|minutes?|mins?)\b|\d{1,2}[:.]\d{2}\s*(am|pm)|時間|小時|分鐘|限時/i],
  ['examName', /exam|examination|mock|test|assessment|quiz|term|uniform|測驗|考試|模擬|評估|統測/i],
  ['paperName', /paper|economics|卷|經濟/i],
];

/** The masthead's text on a mock's cover lines, where one fits; the rest left over. */
function coverOf(rows: readonly ChromeRow[], options: ChromePlanOptions, leftovers: ChromeLeftover[]): CoverFill {
  const cover: CoverFill = {};
  const side = (text: string): CoverText => {
    const b = chromeText(text, options.language);
    return { ...(b.en.length ? { en: text } : {}), ...(b.zh.length ? { zh: text } : {}) };
  };
  for (const row of rows) {
    const rest: ChromePiece[] = [];
    for (const piece of CHROME_ZONES.flatMap((z) => row[z])) {
      const slot = piece.kind === 'text' ? COVER_SLOTS.find(([key, re]) => cover[key] === undefined && re.test(piece.text))?.[0] : undefined;
      if (slot && piece.kind === 'text') cover[slot] = side(piece.text);
      else rest.push(piece);
    }
    if (rest.length) leftovers.push({ where: 'masthead', text: rest.map(pieceText).join('\t'), reason: 'noCoverPlace' });
  }
  return cover;
}

/** What the new paper takes from the file's chrome, for `documentType`. */
export function planChrome(chrome: PageChrome | undefined, options: ChromePlanOptions): ChromePlan {
  const leftovers: ChromeLeftover[] = [...(chrome?.unsupported ?? [])];
  if (!chrome) return { leftovers };
  const plan: ChromePlan = { leftovers };
  const booklet = options.documentType === 'lqMock';
  if (!options.keepPreset) {
    if (booklet) {
      // The booklet's header carries its page furniture and is never offered for text.
      for (const rows of [chrome.header?.rows, chrome.firstPageHeader?.rows]) {
        const text = (rows ?? []).map(rowText).filter(Boolean).join('\n');
        if (text && !leftovers.some((l) => l.reason === 'noHeader' && l.text === text)) leftovers.push({ where: 'header', text, reason: 'noHeader' });
      }
    } else {
      const header = edgeOf(chrome.header, chrome.firstPageHeader, options, leftovers, 'header');
      if (header) plan.header = header;
    }
    const footer = edgeOf(chrome.footer, chrome.firstPageFooter, options, leftovers, 'footer');
    if (footer) plan.footer = footer;
  }
  if (chrome.masthead?.length) {
    if (options.documentType === 'paper1' || booklet) plan.cover = coverOf(chrome.masthead, options, leftovers);
    else plan.bands = chrome.masthead.map((row) => bandOf(row, options, leftovers, 'masthead'));
  }
  return plan;
}
