'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMessages } from '@/i18n/language';
import { sourceLabel } from '@/pastpapers/pack';
import { usePastPaperBank } from '@/pastpapers/bank';
import { useStudio, liveBank } from '@/questionStudio/live';
import { loadReference, searchRows } from '@/questionStudio/references';
import { MAX_EXAMPLES } from '@/questionStudio/types';
import { QUESTION_STUDIO_MESSAGES } from './messages';

/**
 * Pick any past-paper question to write like without leaving the studio (k-0514): type a
 * few words (a concept, a year, a paper), see the matching questions from the bank's index,
 * press one. It becomes an example; no key point is asked for (the AI picks it).
 */
export function ReferencePicker({ disabled }: { disabled?: boolean }) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const examples = useStudio((s) => s.form.examples);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const manifest = usePastPaperBank((s) => s.manifest);
  useEffect(() => {
    void usePastPaperBank.getState().open().catch(() => undefined);
  }, []);
  const rows = useMemo(() => (manifest?.search ? searchRows(manifest.search, query, 8) : []), [manifest, query]);
  if (!manifest?.search?.length) return null;
  const full = examples.length >= MAX_EXAMPLES;
  return (
    <div className="flex flex-col gap-1.5" data-studio-ref-picker>
      <label htmlFor="studio-ref-search" className="text-[12px] text-ink-muted">
        {m.searchRef}
      </label>
      <input
        id="studio-ref-search"
        type="search"
        value={query}
        disabled={disabled}
        placeholder={m.searchRefPlaceholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setNote(null);
        }}
        className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
      />
      {query.trim() !== '' && rows.length === 0 && <p className="text-[11.5px] text-ink-subtle">{m.searchRefNone}</p>}
      {query.trim() !== '' && rows.length > 0 && (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {rows.map((row) => {
            const used = examples.some((e) => e.id === (row.source.tag || ''));
            const words = (row.en || row.zh).replace(/\s+/g, ' ');
            return (
              <li key={row.source.tag} className="flex items-start gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5" data-studio-ref-row>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">{sourceLabel(row.source).en}</span>
                  <span className="line-clamp-2 text-[11.5px] leading-snug text-ink-muted">{words}</span>
                </span>
                <button
                  type="button"
                  disabled={disabled || used || full}
                  onClick={async () => {
                    const source = await loadReference(row, liveBank);
                    if (!source) return setNote(m.searchRefUnreadable);
                    useStudio.getState().addExample(source);
                  }}
                  className="shrink-0 cursor-pointer rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] font-medium text-ink-muted hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {used ? m.searchRefAdded : m.searchRefAdd}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="text-[11.5px] text-warn-ink">{note}</p>}
    </div>
  );
}
