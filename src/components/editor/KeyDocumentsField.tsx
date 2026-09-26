'use client';

import { useState } from 'react';
import type { WorksheetSummary } from '@/storage';
import { IconButton } from '@/components/ui';
import { Field } from '@/components/ui/Dialog';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from '@/components/ui/icons';
import { movePick, type KeyDocumentPick } from './exportSession';

/** More saved documents than this, and the list gets a search box. */
export const KEY_DOCUMENTS_SEARCH_FROM = 6;

/** The saved documents a combined key may add: newest first, matching `search` by name. */
export function keyDocumentChoices(documents: WorksheetSummary[], search: string): WorksheetSummary[] {
  const needle = search.trim().toLowerCase();
  const sorted = [...documents].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return needle ? sorted.filter((doc) => doc.title.toLowerCase().includes(needle)) : sorted;
}

const shortDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * "Also include": other saved documents whose answer keys join this one's in one file —
 * Paper 2's marking scheme exported from Paper 1. Ticked order is file order; the order
 * list moves them. Export-time only: nothing here is stored on either document.
 */
export function KeyDocumentsField({
  documents,
  picked,
  onChange,
  currentTitle,
}: {
  /** Saved documents other than this one. */
  documents: WorksheetSummary[];
  picked: KeyDocumentPick[];
  onChange: (picked: KeyDocumentPick[]) => void;
  currentTitle: string;
}) {
  const [search, setSearch] = useState('');
  const choices = keyDocumentChoices(documents, search);
  const position = (id: string) => picked.findIndex((pick) => pick.id === id);

  const toggle = (doc: WorksheetSummary, on: boolean) =>
    onChange(
      on
        ? [...picked.filter((pick) => pick.id !== doc.id), { id: doc.id, title: doc.title }]
        : picked.filter((pick) => pick.id !== doc.id),
    );

  return (
    <Field
      label="Also include"
      hint="Their answer keys follow this one’s in the same file, each from a new page."
    >
      {documents.length > KEY_DOCUMENTS_SEARCH_FROM && (
        <label className="block">
          <span className="sr-only">Search saved documents</span>
          <input
            type="search"
            value={search}
            placeholder="Search by name"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search) {
                event.stopPropagation();
                setSearch('');
              }
            }}
            className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </label>
      )}
      <ul
        aria-label="Saved documents"
        className="scroll-slim max-h-[9.75rem] divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface"
      >
        {choices.map((doc) => {
          const at = position(doc.id);
          return (
            <li key={doc.id}>
              <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-xs text-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover">
                <input
                  type="checkbox"
                  checked={at >= 0}
                  onChange={(event) => toggle(doc, event.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate" title={doc.title}>
                  {doc.title}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] text-ink-subtle">
                  {shortDate(doc.updatedAt)}
                </span>
              </label>
            </li>
          );
        })}
        {choices.length === 0 && (
          <li className="px-2.5 py-2 text-xs text-ink-muted">No saved document matches “{search.trim()}”.</li>
        )}
      </ul>

      {picked.length > 0 && (
        <div className="pt-1">
          <p id="key-order" className="pb-0.5 text-[11px] text-ink-muted">
            Order in the file
          </p>
          <ol aria-labelledby="key-order" className="text-xs">
            <li className="flex h-7 items-center gap-2 text-ink-muted">
              <span className="w-4 shrink-0 text-right tabular-nums">1</span>
              <span className="min-w-0 flex-1 truncate">
                {currentTitle} <span className="text-ink-subtle">(this document)</span>
              </span>
            </li>
            {picked.map((pick, index) => (
              <li key={pick.id} className="flex h-7 items-center gap-2 text-ink">
                <span className="w-4 shrink-0 text-right tabular-nums text-ink-muted">{index + 2}</span>
                <span className="min-w-0 flex-1 truncate" title={pick.title}>
                  {pick.title}
                </span>
                <IconButton
                  label={`Move ${pick.title} up`}
                  disabled={index === 0}
                  onClick={() => onChange(movePick(picked, index, -1))}
                >
                  <ChevronUpIcon size={14} />
                </IconButton>
                <IconButton
                  label={`Move ${pick.title} down`}
                  disabled={index === picked.length - 1}
                  onClick={() => onChange(movePick(picked, index, 1))}
                >
                  <ChevronDownIcon size={14} />
                </IconButton>
                <IconButton
                  label={`Leave out ${pick.title}`}
                  onClick={() => onChange(picked.filter((other) => other.id !== pick.id))}
                >
                  <CloseIcon size={13} />
                </IconButton>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Field>
  );
}
