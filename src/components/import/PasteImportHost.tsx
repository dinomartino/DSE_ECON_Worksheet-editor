'use client';

import { lazy, Suspense } from 'react';
import type { PasteImportProps } from './PasteImportDialog';
import { usePasteImport } from './pasteImportStore';

/** The dialog and the engine load on first use, not with the editor or 題庫. */
const PasteImportDialog = lazy(() => import('./PasteImportDialog'));

export function LazyPasteImportDialog(props: PasteImportProps) {
  return (
    <Suspense fallback={null}>
      <PasteImportDialog {...props} />
    </Suspense>
  );
}

/** The editor's Paste questions dialog, opened from the add rail (`usePasteImport`). */
export function PasteImportHost() {
  const open = usePasteImport((s) => s.open);
  const close = usePasteImport((s) => s.close);
  return open ? <LazyPasteImportDialog target="paper" onClose={close} /> : null;
}
