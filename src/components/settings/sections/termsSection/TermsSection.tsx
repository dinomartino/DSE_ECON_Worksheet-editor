'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { escapeClears } from '@/components/bank/escapeClears';
import { Button, Segmented } from '@/components/ui';
import { loadGlossary } from '@/glossary/load';
import type { ChoosableTerm, Glossary, RelatedTerm, TermChoice } from '@/glossary/types';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { useSettings } from '@/settings/store';
import { TERM_SETTINGS } from '@/settings/termPreferences';
import { TERMS_MESSAGES } from './messages';
import { cleanPreferences, EMPTY_PREFERENCES, pick, resetTerm, selectedIn, setRelated, visibleTerms, type TermFilter } from './termRows';

/**
 * Settings → Translation terms: for each term the EDB glossary lists more than one way,
 * the renderings as chips, the default marked. A pick applies live to translation pins,
 * Check terms and its fixes; the other renderings still pass. Renderings and English keys
 * are data, shown as the glossary has them.
 */

const PAGE = 40;
type M = Messages<typeof TERMS_MESSAGES>;

/** The glossary under the stored preferences; the previous one stays while a change rebuilds. */
function useTermsGlossary(prefs: typeof EMPTY_PREFERENCES): { glossary: Glossary | null; failed: boolean } {
  const [state, setState] = useState<{ glossary: Glossary | null; failed: boolean }>({ glossary: null, failed: false });
  useEffect(() => {
    let live = true;
    loadGlossary(prefs).then(
      (glossary) => live && setState({ glossary, failed: false }),
      () => live && setState((s) => ({ glossary: s.glossary, failed: !s.glossary })),
    );
    return () => {
      live = false;
    };
  }, [prefs]);
  return state;
}

function Chip({
  display,
  selected,
  isDefault,
  onPick,
  m,
}: {
  display: string;
  selected: boolean;
  isDefault: boolean;
  onPick: () => void;
  m: M;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`inline-flex cursor-pointer items-baseline gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-hover'
      }`}
    >
      <span lang="zh-HK" className="text-[13px]">
        {display}
      </span>
      {isDefault && <span className={`text-[10px] ${selected ? 'text-accent-ink/80' : 'text-ink-subtle'}`}>{m.default}</span>}
    </button>
  );
}

function DerivedMark({ m }: { m: M }) {
  return (
    <span title={m.derivedTitle} className="ml-1.5 rounded-md bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn-ink">
      {m.derived}
    </span>
  );
}

function RelatedList({ related, m }: { related: readonly RelatedTerm[]; m: M }) {
  return (
    <ul className="mt-1.5 space-y-1.5">
      {related.map((r) => (
        <li key={r.entryId} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="basis-full text-ink-muted">{r.en}</span>
          <span lang="zh-HK" className="text-ink-subtle">
            {r.from.join(' / ')}
          </span>
          <span aria-hidden className="text-ink-subtle">
            →
          </span>
          <span lang="zh-HK" className="text-ink">
            {r.to.join(' / ')}
          </span>
          {r.to.some((d) => r.derived.includes(d)) && <DerivedMark m={m} />}
        </li>
      ))}
    </ul>
  );
}

/** "Also use it in N related terms?" under a changed row, with the terms it would change. */
function RelatedOffer({
  related,
  on,
  onChange,
  m,
}: {
  related: readonly RelatedTerm[];
  on: boolean;
  onChange: (on: boolean) => void;
  m: M;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg bg-surface-sunken px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink">{on ? m.relatedOn(related.length) : m.relatedOffer(related.length)}</span>
        {on && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="cursor-pointer text-[12px] text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {m.relatedShow}
          </button>
        )}
        <span className="ml-auto">
          {on ? (
            <Button size="sm" onClick={() => onChange(false)}>
              {m.relatedStop}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => onChange(true)}>
              {m.relatedApply}
            </Button>
          )}
        </span>
      </div>
      {(!on || open) && <RelatedList related={related} m={m} />}
    </div>
  );
}

const TermRow = memo(function TermRow({
  term,
  choice,
  relatedOn,
  related,
  follows,
  onPick,
  onReset,
  onRelated,
  m,
}: {
  term: ChoosableTerm;
  choice: string | undefined;
  relatedOn: boolean;
  related: readonly RelatedTerm[];
  /** In force because the row follows another term's choice. */
  follows: TermChoice | undefined;
  onPick: (term: ChoosableTerm, display: string) => void;
  onReset: (key: string) => void;
  onRelated: (key: string, on: boolean) => void;
  m: M;
}) {
  const changed = choice !== undefined;
  const senses = term.groups.length > 1 || term.groups.some((g) => g.sense !== undefined && g.sense > 0);
  return (
    <li className="border-b border-line py-2.5 last:border-b-0" data-term={term.en}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 text-[13px] font-medium text-ink">{term.en}</span>
        {changed && (
          <>
            <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">{m.changed}</span>
            <button
              type="button"
              onClick={() => onReset(term.en)}
              aria-label={m.resetTerm(term.en)}
              className="ml-auto shrink-0 cursor-pointer text-[12px] text-ink-muted transition-colors hover:text-ink"
            >
              {m.reset}
            </button>
          </>
        )}
      </div>
      {term.groups.map((group) => {
        const selected = selectedIn(group, choice);
        return (
          <div key={group.sense ?? 'all'} role="group" aria-label={term.en} className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {senses && group.sense !== undefined && (
              <span className="mr-0.5 text-[11px] text-ink-subtle">{m.sense(group.sense + 1)}</span>
            )}
            {group.options.map((o) => (
              <Chip
                key={o.display}
                display={o.display}
                selected={selected.includes(o.display)}
                isDefault={group.defaults.includes(o.display)}
                onPick={() => onPick(term, o.display)}
                m={m}
              />
            ))}
          </div>
        );
      })}
      {follows && !changed && follows.follows && (
        <p className="mt-1.5 text-[12px] text-ink-muted">
          {m.follows(follows.follows)}{' '}
          <span lang="zh-HK" className="text-ink">
            {follows.displays.join(' / ')}
          </span>
          {follows.displays.some((d) => follows.derived.includes(d)) && <DerivedMark m={m} />}
        </p>
      )}
      {changed && related.length > 0 && (
        <RelatedOffer related={related} on={relatedOn} onChange={(on) => onRelated(term.en, on)} m={m} />
      )}
    </li>
  );
});

export default function TermsSection() {
  const m = useMessages(TERMS_MESSAGES);
  const [stored, update] = useSettings(TERM_SETTINGS);
  const { glossary, failed } = useTermsGlossary(stored);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TermFilter>('all');
  const [limit, setLimit] = useState(PAGE);

  const terms = useMemo(() => glossary?.choosable ?? NO_TERMS, [glossary]);
  const byKey = useMemo(() => new Map(terms.map((t) => [t.en, t])), [terms]);
  // Rows the data can honour; a stale stored row is ignored here and dropped on the next write.
  const prefs = useMemo(() => (glossary ? cleanPreferences(stored, byKey) : EMPTY_PREFERENCES), [glossary, stored, byKey]);
  const changedCount = Object.keys(prefs.choices).length;
  const { common, rest } = useMemo(() => visibleTerms(terms, prefs, filter, query), [terms, prefs, filter, query]);

  // A new search or filter starts from the first page.
  const search = (q: string) => {
    setQuery(q);
    setLimit(PAGE);
  };
  const show = (f: TermFilter) => {
    setFilter(f);
    setLimit(PAGE);
  };

  const write = (next: typeof prefs) => update({ choices: next.choices, related: next.related });
  const onPick = (term: ChoosableTerm, display: string) => write(pick(prefs, term, display));
  const onReset = (key: string) => write(resetTerm(prefs, key));
  const onRelated = (key: string, on: boolean) => write(setRelated(prefs, key, on));

  if (!glossary) return <p className={`text-xs ${failed ? 'text-danger-ink' : 'text-ink-subtle'}`}>{failed ? m.loadFailed : m.loading}</p>;

  const row = (term: ChoosableTerm) => {
    const choice = prefs.choices[term.en];
    const entry = glossary.entries[term.entryId];
    return (
      <TermRow
        key={term.entryId}
        term={term}
        choice={choice}
        relatedOn={!!prefs.related[term.en]}
        related={choice === undefined ? NONE : glossary.related(term.en, choice)}
        follows={entry.choice?.source === 'related' ? entry.choice : undefined}
        onPick={onPick}
        onReset={onReset}
        onRelated={onRelated}
        m={m}
      />
    );
  };
  const restShown = rest.slice(0, Math.max(0, limit - common.length));
  const left = rest.length - restShown.length;
  const empty = !common.length && !rest.length;

  return (
    <div>
      <p className="-mt-2 mb-3 text-[12px] text-ink-muted">{m.explain}</p>
      <div className="sticky -top-px z-10 -mx-1 flex flex-wrap items-center gap-2 bg-surface px-1 pb-2 pt-1">
        <input
          type="search"
          value={query}
          placeholder={m.search}
          aria-label={m.search}
          onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => void escapeClears(event, query, () => search(''))}
          className="h-8 min-w-0 flex-1 basis-48 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <Segmented<TermFilter>
          label={m.filterLabel}
          value={filter}
          onChange={show}
          options={[
            { value: 'all', label: m.filterAll(terms.length) },
            { value: 'changed', label: m.filterChanged(changedCount) },
          ]}
        />
        <Button size="sm" disabled={!changedCount} onClick={() => write(EMPTY_PREFERENCES)}>
          {m.resetAll}
        </Button>
      </div>
      {empty && (
        <p className="py-6 text-center text-xs text-ink-muted">{query.trim() ? m.noMatch(query.trim()) : m.noneChanged}</p>
      )}
      {common.length > 0 && (
        <section aria-label={m.common}>
          <h4 className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{m.common}</h4>
          <ul>{common.map(row)}</ul>
        </section>
      )}
      {restShown.length > 0 && (
        <section aria-label={m.allTerms}>
          <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{m.allTerms}</h4>
          <ul>{restShown.map(row)}</ul>
        </section>
      )}
      {left > 0 && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" onClick={() => setLimit((n) => n + PAGE * 2)}>
            {m.showMore(left)}
          </Button>
        </div>
      )}
    </div>
  );
}

const NONE: readonly RelatedTerm[] = [];
const NO_TERMS: readonly ChoosableTerm[] = [];
