'use client';

import { Button } from '@/components/ui';
import { SheetIcon } from '@/components/ui/icons';
import { TRASH_RETENTION_DAYS, type TrashedSummary } from '@/storage';
import { trashAgeLabel } from './dashboard';

/**
 * The Trash, in place of the dashboard. Rows only — no thumbnails: a trashed document
 * is being judged for keep-or-go, not recognised to open, and on desktop its file is
 * no longer where the thumbnail loader reads.
 */
export function TrashList({
  rows,
  onBack,
  onRestore,
  onPurge,
  onEmpty,
}: {
  rows: TrashedSummary[];
  onBack: () => void;
  onRestore: (row: TrashedSummary) => void;
  onPurge: (row: TrashedSummary) => void;
  onEmpty: () => void;
}) {
  return (
    // Fades in over the dashboard it replaces, so the swap reads as one view turning.
    <div className="mx-auto max-w-5xl animate-fade-in">
      <button
        type="button"
        onClick={onBack}
        className="cursor-pointer text-[12px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ← All documents
      </button>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
          Trash
        </h2>
        {rows.length > 0 && (
          <Button variant="danger" size="sm" onClick={onEmpty}>
            Empty Trash…
          </Button>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-subtle">
        Deleted documents are kept for {TRASH_RETENTION_DAYS} days, then removed for good.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink-muted">Trash is empty.</p>
      ) : (
        <ul className="zone-light mt-5 overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3.5 border-b border-line py-3 pl-4 pr-2 transition-colors duration-150 ease-out-soft last:border-b-0 hover:bg-surface-hover"
            >
              <span className="shrink-0 text-ink-subtle">
                <SheetIcon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium leading-tight text-ink">
                  {row.title}
                </span>
                <span className="mt-1 block truncate text-[11px] tabular-nums leading-tight text-ink-subtle">
                  {row.hasCover ? 'Mock exam paper' : 'Worksheet'} · {trashAgeLabel(row.deletedAt)}
                </span>
              </span>
              <Button variant="subtle" size="sm" onClick={() => onRestore(row)}>
                Restore
              </Button>
              <Button variant="danger" size="sm" onClick={() => onPurge(row)}>
                Delete forever…
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
