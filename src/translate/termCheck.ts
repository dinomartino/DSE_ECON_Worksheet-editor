import type { Glossary } from '@/glossary/types';
import type { TermSummary } from '@/model/paperHealth';
import type { TextPath, TranslationWrite } from '@/model/textSlots';
import type { Worksheet } from '@/model/types';
import type { TermRow, TranslateScope } from './types';

/**
 * Check terms (keyless): every printed slot with both sides present, checked EN→ZH
 * against the glossary. `TermSummary` is declared in `paperHealth.ts`, so the paper check
 * imports nothing from here.
 */

export function buildTermCheck(ws: Worksheet, glossary: Glossary, scope: TranslateScope): TermRow[] {
  // P-ENGINE replaces this body
  void ws;
  void glossary;
  void scope;
  return [];
}

/** One write per row with any accepted index into `row.checks`: side 'zh',
 *  sourceSnapshot = row.en, targetSnapshot = row.zh, next = row.zh with the accepted
 *  `fix` spans (plain-text offsets, mapped to runs) replaced right to left via
 *  `replaceRichTextRange`. Checks without a `fix` are ignored. */
export function termFixWrites(
  rows: readonly TermRow[],
  accepted: ReadonlyMap<TextPath, ReadonlySet<number>>,
): TranslationWrite[] {
  // P-ENGINE replaces this body
  void rows;
  void accepted;
  return [];
}

export function termSummary(ws: Worksheet, glossary: Glossary): TermSummary {
  // P-ENGINE replaces this body
  void ws;
  void glossary;
  return { warn: 0, questionIds: [], outsideQuestions: 0 };
}
