'use client';

import { useCallback, useState } from 'react';
import type { OutputMode, Worksheet } from '@/model/types';
import { PageCountProbe } from '@/components/preview/PageCountProbe';
import { PaperHealthPanel } from './PaperHealthPanel';
import { hasCoverSheet } from './sheets';
import type { ExportCheckChoice } from './ExportDialog';

/** Whether two modes paginate alike: the same edition, cover, answer space and version. */
export function paginatesAlike(a: OutputMode, b: OutputMode): boolean {
  return (
    a.language === b.language &&
    a.version === b.version &&
    Boolean(a.omitCover) === Boolean(b.omitCover) &&
    Boolean(a.omitAnswerSpace) === Boolean(b.omitAnswerSpace) &&
    (a.variant ?? 'A') === (b.variant ?? 'A')
  );
}

const modeKey = (mode: OutputMode) =>
  [mode.language, mode.version, mode.omitCover, mode.omitAnswerSpace, mode.variant].join('|');

/**
 * The Export dialog's paper check for the edition chosen there. Its page count is that
 * edition's: the page's own count when the page shows it, else a hidden probe's.
 */
export function ExportPaperCheck({
  worksheet,
  shown,
  bodySheets,
  choice,
  onOpenAi,
}: {
  worksheet: Worksheet;
  /** The mode the page shows, which `bodySheets` was measured in. */
  shown: OutputMode;
  bodySheets?: number;
  choice: ExportCheckChoice;
  onOpenAi?: (finding: 'untranslated' | 'terminology') => void;
}) {
  const { mode, paper } = choice;
  const same = paginatesAlike(mode, shown);
  const key = modeKey(mode);
  const [measured, setMeasured] = useState<{ key: string; sheets: number }>();
  const onCount = useCallback((sheets: number) => setMeasured({ key, sheets }), [key]);
  const body = !paper ? undefined : same ? bodySheets : measured?.key === key ? measured.sheets : undefined;
  const pages = body ? body + (hasCoverSheet(worksheet, mode) ? 1 : 0) : undefined;
  return (
    <>
      <PaperHealthPanel
        worksheet={worksheet}
        language={mode.language}
        version={mode.version}
        pages={pages}
        onOpenAi={onOpenAi}
      />
      {paper && !same && <PageCountProbe key={key} worksheet={worksheet} mode={mode} onCount={onCount} />}
    </>
  );
}
