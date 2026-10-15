import type { RichText } from '@/model/types';

/**
 * How wide a line of text prints, in twips, without a browser: per-glyph advances in ems,
 * Times New Roman's and Arial's own (Word applies no kerning by default, so the advance
 * sum is the line). Used where a layout must be decided once, in the IR, for every backend.
 *
 * A Latin face other than Times measures as Arial, the wider of the two, so an estimate
 * errs towards "too long". CJK and fullwidth forms take a full em in every face.
 */

const TIMES: Record<string, string> = {
  '0.18': "'’‘",
  '0.2': '|',
  '0.25': ' .,',
  '0.278': ':;/\\ijlt',
  '0.333': '!()[]-`frI',
  '0.389': 'sJ',
  '0.408': '"“”',
  '0.444': '?acez',
  '0.469': '^',
  '0.48': '{}',
  '0.5': '0123456789$#*_bdghknopquvxy–',
  '0.541': '~',
  '0.556': 'FPS',
  '0.564': '+<=>×',
  '0.611': 'ELTZ',
  '0.667': 'BCR',
  '0.722': 'ADGHKNOQUVXYw',
  '0.778': '&m',
  '0.833': '%',
  '0.889': 'M',
  '0.921': '@',
  '0.944': 'W',
  '1': '—',
};

const ARIAL: Record<string, string> = {
  '0.191': "'’‘",
  '0.222': 'ijl',
  '0.26': '|',
  '0.278': ' .,:;!/\\ftI',
  '0.333': '()[]-`r',
  '0.334': '{}',
  '0.355': '"“”',
  '0.389': '*',
  '0.469': '^',
  '0.5': 'ckvxyzsJ',
  '0.556': '0123456789$#_?abdeghnopqu–L',
  '0.584': '+<=>~×',
  '0.611': 'FTZ',
  '0.667': '&ABEKPSVXY',
  '0.722': 'CDHNRUw',
  '0.778': 'GOQ',
  '0.833': 'mM',
  '0.889': '%',
  '0.944': 'W',
  '1': '—',
  '1.015': '@',
};

function table(groups: Record<string, string>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [em, chars] of Object.entries(groups)) for (const char of chars) map.set(char, Number(em));
  return map;
}

const TIMES_EM = table(TIMES);
const ARIAL_EM = table(ARIAL);

/** A glyph this table does not list: wider than most, so an unknown errs long. */
const UNLISTED_EM = 0.6;

/** Bold sets wider: Times bold runs ~5% over regular, Arial bold ~7%. */
const BOLD_FACTOR = 1.07;
/** A super- or subscript prints at about two thirds of the size. */
const SCRIPT_FACTOR = 0.65;

/** Ideographs, kana, Hangul and fullwidth forms: a full em (the ranges `displayWidth` counts double). */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** Whether a Latin face measures as Times (else as Arial). */
function isTimes(latinFont: string): boolean {
  return /times/i.test(latinFont);
}

/** One line of runs (no `\n` in it), in twips, at `fontSize` points unless a run says otherwise. */
export function lineWidthTwips(runs: RichText, fontSize: number, latinFont: string): number {
  let twips = 0;
  for (const run of runs) {
    const ems = isTimes(run.fonts?.latin ?? latinFont) ? TIMES_EM : ARIAL_EM;
    const size =
      (run.fontSize ?? fontSize) * (run.vertAlign ? SCRIPT_FACTOR : 1) * (run.bold ? BOLD_FACTOR : 1);
    for (const char of run.text) {
      const em = isWide(char.codePointAt(0) ?? 0) ? 1 : (ems.get(char) ?? UNLISTED_EM);
      twips += em * size * 20;
    }
  }
  return twips;
}

/** Runs split at their hard breaks (`\n` is run text, § Newline is run text), one entry per line. */
export function splitRunLines(runs: RichText): RichText[] {
  const lines: RichText[] = [[]];
  for (const run of runs) {
    run.text.split('\n').forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ ...run, text: piece });
    });
  }
  return lines;
}
