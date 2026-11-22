import { resolveMessages, type Messages } from '@/i18n/catalogue';
import type { UiLanguage } from '@/settings/language';
import { IMPORT_CHECK_MESSAGES } from './messages';
import type { ImportFinding } from './types';

/** A finding and its fix button in words (k-0494). `lang`: 'en' | 'zh' for tests and the probe. */
type M = Messages<typeof IMPORT_CHECK_MESSAGES>;

export const checkMessages = (lang: UiLanguage | 'en' | 'zh'): M => resolveMessages(IMPORT_CHECK_MESSAGES, lang === 'zh' ? 'zh-HK' : lang === 'en' ? 'en' : lang);

const n = (v: string | number | undefined) => Number(v ?? 0);
const s = (v: string | number | undefined) => String(v ?? '');

export function findingMessage(m: M, f: ImportFinding): string {
  const p = f.params;
  switch (f.kind) {
    case 'junk':
      return m.junk(s(p.text));
    case 'marksInText':
      return m.marksInText(n(p.marks), Boolean(p.set));
    case 'marksTotal':
      return m.marksTotal(n(p.file), n(p.paper));
    case 'marksMissing':
      return m.marksMissing(n(p.marks));
    case 'spaceMissing':
      return m.spaceMissing(n(p.lines));
    case 'lostText':
      return m.lostText(s(p.text));
    case 'lostDrawing':
      return m.lostDrawing(n(p.count), s(p.what));
    case 'lostPicture':
      return m.lostPicture;
    case 'pictureMoved':
      return m.pictureMoved(n(p.from) + 1);
    case 'pictureSize':
      return m.pictureSize(n(p.width), n(p.max));
    case 'optionCount':
      return m.optionCount(n(p.count));
    case 'optionsMerged':
      return m.optionsMerged(n(p.count));
    case 'mcAsWritten':
      return m.mcAsWritten;
    case 'questionMerged':
      return m.questionMerged(n(p.number));
    case 'partMerged':
      return m.partMerged(s(p.label));
    case 'language':
      return m.language(s(p.to));
    case 'garbled':
      return m.garbled(n(p.count));
    case 'emptyBlock':
      return m.emptyBlock;
    case 'split':
      return m.split;
    case 'tableAsText':
      return m.tableAsText(n(p.rows));
    case 'tableChanged':
      return m.tableChanged(s(p.paper), s(p.file));
    case 'ai':
      return m.aiFinding(s(p.text));
  }
}

export function fixLabel(m: M, f: ImportFinding): string | undefined {
  if (!f.fix) return undefined;
  switch (f.kind) {
    case 'junk':
    case 'emptyBlock':
      return m.fixRemove;
    case 'marksInText':
      return m.fixMarksText;
    case 'marksMissing':
      return m.fixMarks(n(f.params.marks));
    case 'optionsMerged':
      return m.fixSplit;
    case 'spaceMissing':
      return m.fixSpace(n(f.params.lines));
    case 'lostPicture':
      return m.fixPutBack;
    case 'lostText':
      return 'pins' in f.fix ? m.fixKeepText : m.fixPutBack;
    case 'pictureMoved':
      return m.fixMove;
    case 'pictureSize':
      return m.fixFit;
    case 'language':
      return m.fixSide(s(f.params.to));
    case 'garbled':
      return m.fixSymbols;
    case 'split':
      return m.fixJoin;
    case 'tableAsText':
      return m.fixTable;
    case 'tableChanged':
      return m.fixTableFile;
    case 'questionMerged':
      return m.fixNewQuestion;
    case 'partMerged':
      return m.fixPart;
    case 'mcAsWritten':
      return m.fixMakeMc;
    default:
      return m.fixApply;
  }
}

/** The finding's line in a language, for the probe and tests. */
export const findingText = (lang: 'en' | 'zh', f: ImportFinding): string => findingMessage(checkMessages(lang), f);

export const whereText = (m: M, f: ImportFinding, number: number): string => m.where(number, f.place);
