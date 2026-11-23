'use client';

import { useEffect, useMemo } from 'react';
import { errorActions, errorNote, runErrorAction, type RunControl } from '@/components/ai/errorActions';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { COPY_MESSAGES } from '@/components/translate/messages';
import { useMessages } from '@/i18n/language';
import { useStudio } from '@/questionStudio/live';
import { dismiss, notify } from '@/store/notices';

/** The notice a failed run raises; the same id replaces it, and a new run takes it down. */
export const STUDIO_ERROR_NOTICE = 'studio-error';

/**
 * A provider failure, as a notice (the app's rule: errors are raised with `notify`, never
 * drawn inline). The same words and buttons as the ✦ bars give: exactly the actions the
 * error names, and for Gemini the VPN note when it cannot be reached (decision 8). Try
 * again runs the last Write or change again. Draws nothing itself.
 */
export function StudioError() {
  const phase = useStudio((s) => s.phase);
  const copy = useMessages(COPY_MESSAGES);
  const control: RunControl = useMemo(() => ({ retry: () => void useStudio.getState().retry(), dismiss: () => useStudio.getState().dismissError() }), []);
  const error = phase.kind === 'error' ? phase.error : undefined;

  useEffect(() => {
    if (!error) {
      dismiss(STUDIO_ERROR_NOTICE);
      return;
    }
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
  }, [error, copy, control]);

  return null;
}
