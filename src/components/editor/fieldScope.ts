'use client';

import { createContext, useContext } from 'react';
import type { LanguageMode } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The language and read-only state a field shows, when it is not the open worksheet's: a
 * saved graph (Graphs 圖表庫) is edited outside any worksheet. Absent, fields read the
 * worksheet store, so the editor is unchanged.
 */
export interface FieldScope {
  language: LanguageMode;
  readOnly: boolean;
}

export const FieldScopeContext = createContext<FieldScope | null>(null);

export function useFieldScope(): FieldScope {
  const scope = useContext(FieldScopeContext);
  const language = useWorksheetStore((s) => s.mode.language);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  return scope ?? { language, readOnly };
}
