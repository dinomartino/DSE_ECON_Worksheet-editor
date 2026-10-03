import { zonesOf, type ZoneName } from './bands';
import { bandFieldPrintText, type BandSegmentContext } from './bandSegments';
import { defaultHeader, firstPageHeaderFooter, headerFooterOf, versionRowStandsAlone } from './page';
import type { HeaderFooter, LanguageMode, OutputMode, Worksheet } from './types';
import { versionHeaderText } from './versions';

/**
 * The running header's derived marks: the Teacher version's marker and a versioned paper's
 * "Version B" row (`versionHeaderText`). Shared so the preview and the `.docx` place them
 * alike. Printed text, identical in every language.
 */

export const TEACHER_HEADER_MARK = 'Teacher Version / 教師版';
/** Joins the marker to authored text on the same row. */
export const TEACHER_HEADER_JOIN = '  —  ';

/** `alone`: the marker by itself at the right, in the blank last row or (no `bandId`) a row of its own. */
export interface TeacherMarkPlacement {
  bandId?: string;
  zone: ZoneName;
  alone: boolean;
}

/** Appended to the rightmost printing zone of the running header's last row; a disabled
 *  header lends it no rows. */
export function teacherMarkPlacement(
  header: HeaderFooter,
  context: BandSegmentContext,
  language: LanguageMode,
): TeacherMarkPlacement {
  const bands = header.enabled ? (header.bands ?? []) : [];
  const last = bands[bands.length - 1];
  if (!last) return { zone: 'right', alone: true };
  const sides = language === 'bilingual' ? (['en', 'zh'] as const) : [language];
  const prints = (zone: ZoneName) =>
    zonesOf(last)[zone].some((field) => {
      const text = bandFieldPrintText(field, context, language);
      return sides.some((side) => text[side].length > 0);
    });
  const zone = (['right', 'center', 'left'] as const).find(prints);
  return zone ? { bandId: last.id, zone, alone: false } : { bandId: last.id, zone: 'right', alone: true };
}

/** Page 1 carries the derived marks when it prints the running rows, or when the header
 *  prints nothing of its own anywhere and the version row stands alone. */
export function derivedMarksOnPageOne(header: HeaderFooter, versioned: boolean): boolean {
  return (versioned && versionRowStandsAlone(header)) || !firstPageHeaderFooter(header).differs;
}

/** Page 1's header already names the version, so the label above question 1 would repeat it. */
export function versionInPageOneHeader(worksheet: Worksheet, mode: OutputMode): boolean {
  if (versionHeaderText(worksheet, mode) === undefined) return false;
  return derivedMarksOnPageOne(headerFooterOf(worksheet.header, defaultHeader), true);
}
