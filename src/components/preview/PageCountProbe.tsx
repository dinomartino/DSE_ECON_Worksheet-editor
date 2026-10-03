'use client';

import { useCallback } from 'react';
import type { OutputMode, Worksheet } from '@/model/types';
import type { PageComposition } from './pagination';
import { Preview } from './Preview';

/**
 * How many sheets `worksheet` prints in `mode`, measured by a hidden, inert copy of the
 * page (pagination exists only as measurement). Reports body sheets, cover excluded, as
 * `onPagesChange` does. Mount only while a count in another mode is wanted.
 */
export function PageCountProbe({
  worksheet,
  mode,
  onCount,
}: {
  worksheet: Worksheet;
  mode: OutputMode;
  onCount: (bodySheets: number) => void;
}) {
  const report = useCallback((pages: PageComposition[]) => onCount(pages.length), [onCount]);
  return (
    <div
      aria-hidden
      inert
      data-print-hide
      className="pointer-events-none invisible fixed left-[-100000px] top-0 h-0 w-[1200px] overflow-hidden"
    >
      <Preview worksheet={worksheet} mode={mode} onPagesChange={report} measureOnly />
    </div>
  );
}
