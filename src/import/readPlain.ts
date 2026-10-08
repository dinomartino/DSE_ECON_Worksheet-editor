import type { InlineRun } from '@/model/types';
import { tidyText } from './normalize';
import type { ImageRef } from './types';

/** A run as a reader emits it: highlight is read for answer detection, then dropped. */
export type RawRun = InlineRun & { highlight?: boolean };

/** One line as a reader emits it, before labels and marks are split off. */
export interface RawLine {
  /** The whole line, leading TABs included. */
  runs: RawRun[];
  /** From list numbering (mso-list, `<ol>`), not typed. */
  listLabel?: string;
  listDepth?: number;
  /** Indent level from paragraph margins (HTML). */
  marginDepth?: number;
  cells?: RawRun[][];
  image?: ImageRef;
  pageBreak?: boolean;
}

/** `text/plain`: one line per line. A form feed marks a page break; Word's soft break (`\v`) is a line. */
export function readPlain(text: string): RawLine[] {
  const out: RawLine[] = [];
  let pageBreak = false;
  for (const piece of tidyText(text).split(/\r\n|\r|\n|\v|\u2028|\u2029/)) {
    const parts = piece.split('\f');
    for (let k = 0; k < parts.length; k++) {
      if (k > 0) pageBreak = true;
      const line = parts[k];
      if (k < parts.length - 1 && line.trim() === '') continue;
      out.push({ runs: line ? [{ text: line }] : [], ...(pageBreak ? { pageBreak } : {}) });
      pageBreak = false;
    }
  }
  return out;
}
