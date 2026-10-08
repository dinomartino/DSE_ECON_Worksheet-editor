/**
 * Empty pastes and scans. A scanned PDF copies nothing (or only images); Live Text OCR
 * copies text with tell-tale damage. Either way the UI says so instead of guessing.
 */
import { cjkShare, matchKey } from './normalize';
import type { SourceLine } from './types';

/** Signs of OCR, each worth one point per line. */
const OCR_SIGNS: Array<(line: SourceLine) => boolean> = [
  // Full-width punctuation pressed against Latin text: "（1） and （2）", "trip？".
  (l) => /[（）：，？；][A-Za-z0-9]|[A-Za-z0-9][（）：，？；]/.test(l.raw) && cjkShare(l.raw) < 0.3,
  // A label whose letter was lost: "（）", "()".
  (l) => /^\s*[(（]\s*[)）]/.test(l.raw),
  // Words run together or split by the scan.
  (l) => /\b(ofthe|tothe|inthe|andthe|Goon)\b|[a-z]{3,}[A-Z]\b/.test(l.raw),
  // Margin boilerplate printed only on exam booklets, which teachers have as scans.
  (l) => /寫於邊界以外|answers written in the margins/i.test(l.raw),
  // OCR reading "1." as "1：", or "(4分)" missing its digit.
  (l) => /^\s*\d{1,2}\s*：\s*$/.test(l.raw) || /[(（]\s*分\s*[)）]/.test(l.raw),
];

export function ocrScore(lines: readonly SourceLine[]): { points: number; ratio: number } {
  const body = lines.filter((l) => l.raw.trim());
  const points = body.reduce((n, l) => n + OCR_SIGNS.filter((sign) => sign(l)).length, 0);
  return { points, ratio: body.length ? points / body.length : 0 };
}

/** A Word or HTML paste (TABs, markup) is never OCR, even with full-width brackets typed by hand. */
export function pasteKind(lines: readonly SourceLine[], source: 'plain' | 'html'): 'ok' | 'empty' | 'scan' {
  const text = lines.some((l) => matchKey(l.raw) !== '' || l.cells?.length);
  if (!text) return lines.some((l) => l.image) ? 'scan' : 'empty';
  const body = lines.filter((l) => l.raw.trim());
  if (source === 'html' || body.filter((l) => l.raw.includes('\t')).length > body.length * 0.1) return 'ok';
  const { points, ratio } = ocrScore(lines);
  return points >= 3 && ratio >= 0.04 ? 'scan' : 'ok';
}
