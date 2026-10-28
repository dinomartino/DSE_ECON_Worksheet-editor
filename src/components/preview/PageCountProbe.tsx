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

/**
 * How the paper's flow lands on sheets in `mode`, from the same hidden copy: the marking
 * scheme reads it to give each of its pages the watermark state its questions have on the
 * paper (§ `keySheetWatermarks`). Mount only while the paper's pages differ.
 */
export function PaperSheetsProbe({
  worksheet,
  mode,
  onSheets,
}: {
  worksheet: Worksheet;
  mode: OutputMode;
  onSheets: (pages: PageComposition[]) => void;
}) {
  return (
    <div
      aria-hidden
      inert
      data-print-hide
      className="pointer-events-none invisible fixed left-[-100000px] top-0 h-0 w-[1200px] overflow-hidden"
    >
      <Preview worksheet={worksheet} mode={mode} onPagesChange={onSheets} measureOnly />
    </div>
  );
}
