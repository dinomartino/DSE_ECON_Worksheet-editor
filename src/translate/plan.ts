import type { Side, TextSlot } from '@/model/textSlots';
import type { OutputMode, Worksheet } from '@/model/types';
import type { TranslateOptions, TranslateScope, TranslationPlan } from './types';

/**
 * Planning: which slots go, in which direction, deduped into jobs and packed into
 * single-direction chunks with same-group context. Pure; the editor mode never decides
 * direction.
 */

export function slotInScope(slot: TextSlot, scope: TranslateScope): boolean {
  // P-ENGINE replaces this body
  void slot;
  void scope;
  return false;
}

/** Both directions, diagram labels on; teacher text from the remembered setting; symbol
 *  copies on only for the side this edition prints alone. */
export function defaultTranslateOptions(
  mode: OutputMode,
  includeTeacherText: boolean,
  retranslate?: Side,
): TranslateOptions {
  return {
    directions: { toZh: true, toEn: true },
    includeTeacher: includeTeacherText,
    includeDiagramLabels: true,
    copySymbols: { toZh: mode.language === 'zh', toEn: mode.language === 'en' },
    ...(retranslate ? { retranslate } : {}),
  };
}

/** Pure core: testable with hand-built slots. */
export function planFromSlots(
  worksheetId: string,
  slots: readonly TextSlot[],
  scope: TranslateScope,
  options: TranslateOptions,
): TranslationPlan {
  // P-ENGINE replaces this body
  void slots;
  return {
    worksheetId,
    scope,
    options,
    jobs: new Map(),
    copies: [],
    chunks: [],
    counts: {
      toZh: 0,
      toEn: 0,
      teacher: 0,
      diagramLabels: 0,
      symbols: { toZh: 0, toEn: 0 },
      copied: 0,
      replaceable: 0,
      contextLines: 0,
      chars: 0,
      requests: 0,
    },
  };
}

/** = planFromSlots(ws.id, collectTexts(ws), …). */
export function planTranslation(ws: Worksheet, scope: TranslateScope, options: TranslateOptions): TranslationPlan {
  // P-ENGINE replaces this body
  return planFromSlots(ws.id, [], scope, options);
}
