import { fileTitle } from '@/model/text';
import { activeVersion, versionLetter } from '@/model/versions';
import type { LanguageMode, OutputMode, Worksheet } from '@/model/types';

/**
 * The `.docx` file names, apart from the builders: the Export dialog suggests one in a
 * save picker before the heavy `.docx` module has loaded.
 */

const LANGUAGE_TAG: Record<OutputMode['language'], string> = {
  en: 'EN',
  zh: 'ZH',
  bilingual: 'Bilingual',
};

/**
 * `<name> (<Student|Teacher>) (<EN|ZH|Bilingual>).docx` per §7.1.
 *
 * The name comes from `documentName`, the same chain the file list reads. It used to
 * spell the fallback out again here, which meant a renamed document downloaded under
 * its old title — the list and the download disagreeing about what the file is called.
 */
export function docxFileName(worksheet: Worksheet, mode: OutputMode): string {
  const version = mode.version === 'teacher' ? 'Teacher' : 'Student';
  // A paper version is part of the paper's name: `<name>-B (Student) (EN).docx`.
  const variant = activeVersion(worksheet, mode);
  const suffix = variant === undefined ? '' : `-${versionLetter(variant)}`;
  return `${fileTitle(worksheet)}${suffix} (${version}) (${LANGUAGE_TAG[mode.language]}).docx`;
}

/** Names joined in a combined key's file name before the rest become "+ N more". */
export const COMBINED_KEY_NAMES_SHOWN = 3;

/**
 * `<name> (Answer key) (<EN|ZH|Bilingual>).docx` — never mistaken for either paper. A
 * combined key names its papers: `<name> + <name> (Answer key) (EN).docx`.
 */
export function answerKeyFileName(
  worksheet: Worksheet,
  language: LanguageMode,
  others: Worksheet[] = [],
): string {
  const names = [worksheet, ...others].map((document) => fileTitle(document));
  const joined =
    names.length > COMBINED_KEY_NAMES_SHOWN
      ? `${names.slice(0, COMBINED_KEY_NAMES_SHOWN - 1).join(' + ')} + ${names.length - COMBINED_KEY_NAMES_SHOWN + 1} more`
      : names.join(' + ');
  return `${joined} (Answer key) (${LANGUAGE_TAG[language]}).docx`;
}
