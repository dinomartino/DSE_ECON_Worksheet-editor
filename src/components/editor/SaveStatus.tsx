'use client';

import { useEffect, useState } from 'react';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useUiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { SAVE_STATUS_MESSAGES } from './shell.messages';

/** Still dirty this long after the last edit: autosave (1.2s debounce) should have landed. */
export const STALLED_AFTER_MS = 6000;

export type SaveState = 'saved' | 'saving' | 'stalled' | 'readOnly';

export interface SaveStatusView {
  state: SaveState;
  /** Always read by screen readers; shown as a word only when `visible`. */
  word: string;
  /** The tooltip: the whole sentence. */
  detail: string;
  /** Routine states are a dot; only what needs the teacher's attention takes a word. */
  visible: boolean;
}

/** The toolbar's save status, as a pure function of the store. */
export function saveStatusView({
  readOnly,
  dirty,
  stalled,
  lastSavedAt,
  lang = uiLanguage(),
}: {
  readOnly: boolean;
  dirty: boolean;
  stalled: boolean;
  lastSavedAt?: string;
  lang?: UiLanguage;
}): SaveStatusView {
  const m = resolveMessages(SAVE_STATUS_MESSAGES, lang);
  if (readOnly)
    return {
      state: 'readOnly',
      word: m.readOnly,
      detail: m.readOnlyDetail,
      visible: true,
    };
  if (dirty && stalled)
    return {
      state: 'stalled',
      word: m.notSaved,
      detail: m.notSavedDetail,
      visible: true,
    };
  if (dirty) return { state: 'saving', word: m.saving, detail: m.savingDetail, visible: false };
  const time = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  return { state: 'saved', word: m.saved, detail: m.savedDetail(time), visible: false };
}

const DOT: Record<SaveState, string> = {
  saved: 'bg-ok',
  saving: 'bg-ink-subtle motion-safe:animate-pulse',
  stalled: 'bg-warn-ink',
  readOnly: 'bg-ink-subtle',
};

/**
 * A dot for the routine cycle (Saving, then Saved), with the words in its tooltip and for
 * screen readers. The bar's width goes to the document name instead. A word appears only
 * when something is off: read-only, or edits that autosave has not written.
 */
export function SaveStatus() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const dirty = useWorksheetStore((s) => s.dirty);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const lastSavedAt = useWorksheetStore((s) => s.lastSavedAt);

  // Stalled on one worksheet value: each edit makes a new one, restarting the clock the
  // way it restarts autosave's debounce.
  const [stalledOn, setStalledOn] = useState<Worksheet | undefined>();
  useEffect(() => {
    if (!dirty || readOnly) return;
    const timer = setTimeout(() => setStalledOn(worksheet), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [worksheet, dirty, readOnly]);
  const stalled = stalledOn === worksheet;

  const lang = useUiLanguage();
  const view = saveStatusView({ readOnly, dirty, stalled, lastSavedAt, lang });
  return (
    <span
      data-print-hide
      data-save-state={view.state}
      title={view.detail}
      className={`flex h-6 shrink-0 items-center gap-1.5 px-1 ${view.state === 'stalled' ? 'text-warn-ink' : ''}`}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[view.state]}`} />
      <span className={view.visible ? undefined : 'sr-only'}>{view.word}</span>
    </span>
  );
}
