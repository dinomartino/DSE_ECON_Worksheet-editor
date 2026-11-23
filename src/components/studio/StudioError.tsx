'use client';

import { useEffect, useRef } from 'react';
import { errorActions, errorNote, runErrorAction, type RunControl } from '@/components/ai/errorActions';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { COPY_MESSAGES } from '@/components/translate/messages';
import type { AiErrorInfo } from '@/ai/types';
import { useMessages } from '@/i18n/language';
import { dismiss, notify } from '@/store/notices';

/** The notice a failed run raises; the same id replaces it, and a new run takes it down. */
export const STUDIO_ERROR_NOTICE = 'studio-error';

/**
 * A provider failure, as a notice (the app's rule: errors are raised with `notify`, never
 * drawn inline). The same words and buttons as the ✦ bars give: exactly the actions the
 * error names, and for Gemini the VPN note when it cannot be reached (decision 8). Try
 * again and Dismiss are the caller's. Draws nothing itself. Used by the Write tab and the
 * trial kit's run of the 30 briefs.
 */
export function RunErrorNotice({ error, onRetry, onDismiss }: { error: AiErrorInfo | undefined; onRetry: () => void; onDismiss: () => void }) {
  const copy = useMessages(COPY_MESSAGES);
  // The latest callbacks, without raising the notice again each time the caller re-renders.
  const handlers = useRef({ onRetry, onDismiss });
  useEffect(() => {
    handlers.current = { onRetry, onDismiss };
  });

  useEffect(() => {
    if (!error) {
      dismiss(STUDIO_ERROR_NOTICE);
      return;
    }
    const control: RunControl = { retry: () => handlers.current.onRetry(), dismiss: () => handlers.current.onDismiss() };
    const note = errorNote(error);
    notify({
      id: STUDIO_ERROR_NOTICE,
      tone: 'error',
      body: localizedErrorMessage(error),
      details: [...(note ? [note] : []), ...(error.detail ? [`${copy.technicalDetail}: ${error.detail.slice(0, 200)}`] : [])],
      actions: errorActions(error).map((action) => ({ label: action.label, primary: action.kind === 'retry', run: () => runErrorAction(action, error, control) })),
      onDismiss: control.dismiss,
    });
    return () => dismiss(STUDIO_ERROR_NOTICE);
  }, [error, copy]);

  return null;
}
