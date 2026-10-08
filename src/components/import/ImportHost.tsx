'use client';

import { lazy, Suspense } from 'react';
import type { ImportDialogProps } from './ImportDialog';

/** The dialog, the readers and pdf.js load on first use, never with the start screen. */
const ImportDialog = lazy(() => import('./ImportDialog'));

export function LazyImportDialog(props: ImportDialogProps) {
  return (
    <Suspense fallback={null}>
      <ImportDialog {...props} />
    </Suspense>
  );
}
