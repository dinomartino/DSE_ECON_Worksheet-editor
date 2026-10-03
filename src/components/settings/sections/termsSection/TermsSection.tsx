'use client';

import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import { escapeClears } from '@/components/bank/escapeClears';
import { Button, IconButton, Segmented } from '@/components/ui';
import { CloseIcon, PencilIcon, PlusIcon } from '@/components/ui/icons';
import { loadGlossary } from '@/glossary/load';
import type { ChoosableTerm, Glossary, RelatedTerm, TermChoice } from '@/glossary/types';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { isDesktop } from '@/platform';
import { useSettings } from '@/settings/store';
import { parseTermsCsv } from '@/settings/termsCsv';
import { TERM_SETTINGS } from '@/settings/termPreferences';
import { ImportPanel } from './ImportPanel';
import { TERMS_MESSAGES } from './messages';
import { TermForm } from './TermForm';
import { exportTermsCsv, pickTermsCsv, readTermsFile } from './termsFiles';
import { applyImport, previewImport, type ImportPreview } from './termsImport';
import {
  addOwn,
  cleanPreferences,
  customRow,
  deleteOwn,
  deleteTerm,
  draftOf,
  editOwn,
  EMPTY_PREFERENCES,
  emptyDraft,
  filterCounts,
  full,
  pick,
  resetChoices,
  resetTerm,
  selectedIn,
  setRelated,
  visibleTerms,
  withOwn,
  type Prefs,
  type RenderingError,
  type TermFilter,
} from './termRows';

/**
 * Settings → Translation terms: every EDB term with its renderings as chips, the default
 * marked, plus the teacher's own renderings ("Yours") and the terms they added. A pick
 * applies live to translation pins, Check terms and its fixes; the other renderings still
 * pass. Renderings and English keys are data, shown as the glossary or the teacher has them.
 */

const PAGE = 40;
type M = Messages<typeof TERMS_MESSAGES>;

/** A glossary for these preferences; the previous one stays while a change rebuilds. */
function useGlossaryFor(prefs: Prefs): { glossary: Glossary | null; failed: boolean } {
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

const INPUT =
  'h-8 min-w-0 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';
const LINK = 'cursor-pointer text-[12px] text-ink-muted transition-colors hover:text-ink';

function Chip({ display, selected, mark, onPick }: { display: string; selected: boolean; mark?: string; onPick: () => void }) {
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
      {mark && <span className={`text-[10px] ${selected ? 'text-accent-ink/80' : 'text-ink-subtle'}`}>{mark}</span>}
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
function RelatedOffer({ related, on, onChange, m }: { related: readonly RelatedTerm[]; on: boolean; onChange: (on: boolean) => void; m: M }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg bg-surface-sunken px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink">{on ? m.relatedOn(related.length) : m.relatedOffer(related.length)}</span>
        {on && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${LINK} underline-offset-2 hover:underline`}>
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

const RENDERING_ERROR: Record<RenderingError, 'renderingInvalid' | 'renderingDuplicate' | 'renderingTooMany'> = {
  invalid: 'renderingInvalid',
  duplicate: 'renderingDuplicate',
  tooMany: 'renderingTooMany',
};

/** One line to type a rendering: Add my own, or Edit one of yours. */
function RenderingInput({
  m,
  initial = '',
  action,
  onSubmit,
  onCancel,
}: {
  m: M;
  initial?: string;
  action: string;
  /** Returns an error to show, or nothing when it was saved. */
  onSubmit: (text: string) => RenderingError | undefined;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<RenderingError>();
  return (
    <form
      className="mt-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(onSubmit(text));
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          lang="zh-HK"
          value={text}
          placeholder={m.ownPlaceholder}
          aria-label={m.ownPlaceholder}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setError(undefined);
          }}
          className={`${INPUT} w-56 ${error ? 'border-danger' : ''}`}
        />
        <Button size="sm" variant="primary" type="submit">
          {action}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {m.cancel}
        </Button>
      </div>
      {error && <p className="mt-1 text-[11px] text-danger-ink">{m[RENDERING_ERROR[error]]}</p>}
    </form>
  );
}

interface RowActions {
  onPick: (term: ChoosableTerm, display: string) => void;
  onReset: (key: string) => void;
  onRelated: (key: string, on: boolean) => void;
  onAddOwn: (term: ChoosableTerm, text: string) => RenderingError | undefined;
  onEditOwn: (term: ChoosableTerm, old: string, text: string) => RenderingError | undefined;
  onDeleteOwn: (key: string, display: string) => void;
  onEditTerm: (id: string) => void;
  onDeleteTerm: (id: string) => void;
}

const TermRow = memo(function TermRow({
  term,
  choice,
  relatedOn,
  related,
  follows,
  editing,
  actions,
  m,
}: {
  term: ChoosableTerm;
  choice: string | undefined;
  relatedOn: boolean;
  related: readonly RelatedTerm[];
  /** In force because the row follows another term's choice. */
  follows: TermChoice | undefined;
  /** This row's term form is open in its place. */
  editing: boolean;
  actions: RowActions;
  m: M;
}) {
  const [typing, setTyping] = useState<{ old?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const changed = choice !== undefined;
  const custom = term.custom;
  const senses = term.groups.length > 1 || term.groups.some((g) => g.sense !== undefined && g.sense > 0);
  if (editing) return null;
  return (
    <li className="border-b border-line py-2.5 last:border-b-0" data-term={term.en}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 text-[13px] font-medium text-ink">{term.en}</span>
        {custom && <span className="shrink-0 rounded-md bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-ok">{m.yourTerm}</span>}
        {changed && <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">{m.changed}</span>}
        <span className="ml-auto flex shrink-0 items-baseline gap-3">
          {changed && (
            <button type="button" onClick={() => actions.onReset(term.en)} aria-label={m.resetTerm(term.en)} className={LINK}>
              {m.reset}
            </button>
          )}
          {custom && !asking && (
            <>
              <button type="button" onClick={() => actions.onEditTerm(custom.id)} className={LINK}>
                {m.edit}
              </button>
              <button type="button" onClick={() => setAsking(true)} className={LINK}>
                {m.delete}
              </button>
            </>
          )}
        </span>
      </div>
      {custom && (custom.abbreviation || custom.forms) && (
        <p className="mt-0.5 text-[11px] text-ink-subtle">
          {[custom.abbreviation && `${m.abbreviationShort}: ${custom.abbreviation}`, custom.forms && `${m.formsShort}: ${custom.forms.join(', ')}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {asking && custom && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-3 py-2">
          <span className="text-[12px] text-danger-ink">{m.deleteTermAsk}</span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setAsking(false)}>
              {m.cancel}
            </Button>
            <Button size="sm" variant="danger" onClick={() => actions.onDeleteTerm(custom.id)}>
              {m.delete}
            </Button>
          </span>
        </div>
      )}
      {term.groups.map((group) => {
        const selected = selectedIn(group, choice);
        return (
          <div key={group.sense ?? 'all'} role="group" aria-label={term.en} className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {senses && group.sense !== undefined && <span className="mr-0.5 text-[11px] text-ink-subtle">{m.sense(group.sense + 1)}</span>}
            {group.options.map((o) => (
              <span key={o.display} className="inline-flex items-center">
                <Chip
                  display={o.display}
                  selected={selected.includes(o.display)}
                  mark={o.own ? m.yours : custom ? (o.rank === 1 ? m.preferred : undefined) : group.defaults.includes(o.display) ? m.default : undefined}
                  onPick={() => actions.onPick(term, o.display)}
                />
                {o.own && (
                  <>
                    <IconButton label={m.editOwn(o.display)} onClick={() => setTyping({ old: o.display })} className="ml-0.5 !h-6 !w-6">
                      <PencilIcon className="size-3" />
                    </IconButton>
                    <IconButton label={m.deleteOwn(o.display)} onClick={() => actions.onDeleteOwn(term.en, o.display)} className="!h-6 !w-6">
                      <CloseIcon className="size-3" />
                    </IconButton>
                  </>
                )}
              </span>
            ))}
          </div>
        );
      })}
      {!custom &&
        (typing ? (
          <RenderingInput
            key={typing.old ?? 'new'}
            m={m}
            initial={typing.old}
            action={typing.old ? m.save : m.add}
            onCancel={() => setTyping(null)}
            onSubmit={(text) => {
              const error = typing.old ? actions.onEditOwn(term, typing.old, text) : actions.onAddOwn(term, text);
              if (!error) setTyping(null);
              return error;
            }}
          />
        ) : (
          <button type="button" onClick={() => setTyping({})} className={`${LINK} mt-1.5 inline-flex items-center gap-1`}>
            <PlusIcon className="size-3" />
            {m.addOwn}
          </button>
        ))}
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
        <RelatedOffer related={related} on={relatedOn} onChange={(on) => actions.onRelated(term.en, on)} m={m} />
      )}
    </li>
  );
});

export default function TermsSection() {
  const m = useMessages(TERMS_MESSAGES);
  const [stored, update] = useSettings(TERM_SETTINGS);
  const storedFull = useMemo(() => full(stored), [stored]);
  // Rows come from the defaults (stable), the teacher's parts from storage (instant);
  // related terms and follow-through from the glossary built with them.
  const { glossary: base, failed } = useGlossaryFor(EMPTY_PREFERENCES);
  const { glossary } = useGlossaryFor(storedFull);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TermFilter>('choices');
  const [limit, setLimit] = useState(PAGE);
  const [form, setForm] = useState<{ id?: string } | null>(null);
  const [importing, setImporting] = useState<{ name: string; preview: ImportPreview } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const fileInput = useRef<HTMLInputElement>(null);

  const edbRows = useMemo(() => (base ? base.terms.filter((t) => !t.custom) : NO_TERMS), [base]);
  const edbByKey = useMemo(() => new Map(edbRows.map((t) => [t.en, t])), [edbRows]);
  const rows = useMemo(
    () => [
      ...edbRows.map((t) => (storedFull.own[t.en] ? withOwn(t, storedFull.own[t.en]) : t)),
      ...Object.entries(storedFull.terms).map(([id, term]) => customRow(id, term)),
    ],
    [edbRows, storedFull],
  );
  const byKey = useMemo(() => new Map(rows.filter((t) => !t.custom).map((t) => [t.en, t])), [rows]);
  // Rows the data can honour; a stale stored row is ignored here and dropped on the next write.
  const prefs = useMemo(() => (base ? cleanPreferences(storedFull, byKey) : EMPTY_PREFERENCES), [base, storedFull, byKey]);
  const counts = useMemo(() => filterCounts(rows, prefs), [rows, prefs]);
  const changedCount = Object.keys(prefs.choices).length;
  const { common, rest } = useMemo(() => visibleTerms(rows, prefs, filter, query), [rows, prefs, filter, query]);

  const write = (next: Prefs) => update({ choices: next.choices, related: next.related, own: next.own, terms: next.terms });
  const search = (q: string) => {
    setQuery(q);
    setLimit(PAGE);
  };
  const show = (f: TermFilter) => {
    setFilter(f);
    setLimit(PAGE);
  };
  const outcome = (next: Prefs | { error: RenderingError }) => {
    if ('error' in next) return next.error;
    write(next);
    return undefined;
  };
  const actions: RowActions = {
    onPick: (term, display) => write(pick(prefs, term, display)),
    onReset: (key) => write(resetTerm(prefs, key)),
    onRelated: (key, on) => write(setRelated(prefs, key, on)),
    onAddOwn: (term, text) => outcome(addOwn(prefs, term, text)),
    onEditOwn: (term, old, text) => outcome(editOwn(prefs, term, old, text)),
    onDeleteOwn: (key, display) => write(deleteOwn(prefs, key, display)),
    onEditTerm: (id) => setForm({ id }),
    onDeleteTerm: (id) => write(deleteTerm(prefs, id)),
  };

  const exportCsv = async () => {
    setNotice(undefined);
    try {
      const saved = await exportTermsCsv(prefs);
      if (saved) setNotice({ text: m.exported });
    } catch {
      setNotice({ text: m.exportFailed, error: true });
    }
  };
  const readCsv = (name: string, text: string) => {
    if (!base) return;
    const parsed = parseTermsCsv(text);
    if ('error' in parsed) {
      setNotice({ text: m.importNoHeader, error: true });
      return;
    }
    setForm(null);
    setImporting({ name, preview: previewImport(parsed.rows, edbByKey, base.edbKeyFor, prefs) });
  };
  const importCsv = async () => {
    setNotice(undefined);
    if (!isDesktop()) {
      fileInput.current?.click();
      return;
    }
    try {
      const picked = await pickTermsCsv();
      if (picked) readCsv(picked.name, picked.text);
    } catch {
      setNotice({ text: m.importFailed, error: true });
    }
  };

  if (!base) return <p className={`text-xs ${failed ? 'text-danger-ink' : 'text-ink-subtle'}`}>{failed ? m.loadFailed : m.loading}</p>;

  const row = (term: ChoosableTerm) => {
    const choice = term.custom ? undefined : prefs.choices[term.en];
    const entry = term.custom ? undefined : glossary?.entries[term.entryId];
    const editing = !!term.custom && form?.id === term.custom.id;
    return (
      <Fragment key={term.custom?.id ?? term.entryId}>
        <TermRow
          term={term}
          choice={choice}
          relatedOn={!!prefs.related[term.en]}
          related={choice === undefined || !glossary ? NONE : glossary.related(term.en, choice)}
          follows={entry?.choice?.source === 'related' ? entry.choice : undefined}
          editing={editing}
          actions={actions}
          m={m}
        />
        {editing && term.custom && (
          <li className="py-1">
            <TermForm
              m={m}
              prefs={prefs}
              id={term.custom.id}
              initial={draftOf(prefs.terms[term.custom.id])}
              edbKeyFor={base.edbKeyFor}
              onSave={(next) => {
                write(next);
                setForm(null);
              }}
              onCancel={() => setForm(null)}
              onShow={(key) => {
                setForm(null);
                show('all');
                search(key);
              }}
            />
          </li>
        )}
      </Fragment>
    );
  };
  const restShown = rest.slice(0, Math.max(0, limit - common.length));
  const left = rest.length - restShown.length;
  const empty = !common.length && !rest.length;

  return (
    <div>
      <p className="-mt-2 mb-3 max-w-[640px] text-[12px] text-ink-muted">{m.explain}</p>
      <div className="sticky -top-px z-10 -mx-1 space-y-1.5 bg-surface px-1 pb-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            placeholder={m.search}
            aria-label={m.search}
            onChange={(event) => search(event.target.value)}
            onKeyDown={(event) => void escapeClears(event, query, () => search(''))}
            className={`${INPUT} max-w-[440px] flex-1 basis-44`}
          />
          {/* Right-aligned over Export / Import, so the widened search does not stretch. */}
          <span className="ml-auto">
            <Segmented<TermFilter>
              label={m.filterLabel}
              value={filter}
              onChange={show}
              options={[
                { value: 'choices', label: m.filterChoices(counts.choices) },
                { value: 'all', label: m.filterAll(counts.all) },
                { value: 'mine', label: m.filterMine(counts.mine) },
              ]}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setImporting(null);
              setForm(form && !form.id ? null : {});
            }}
          >
            <PlusIcon className="size-3.5" />
            {m.addTerm}
          </Button>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="subtle" onClick={() => void exportCsv()}>
              {m.exportCsv}
            </Button>
            <Button size="sm" variant="subtle" onClick={() => void importCsv()}>
              {m.importCsv}
            </Button>
            <Button size="sm" variant="subtle" disabled={!changedCount} title={m.resetAllTitle} onClick={() => write(resetChoices(prefs))}>
              {m.resetAll}
            </Button>
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              readTermsFile(file).then(
                (picked) => readCsv(picked.name, picked.text),
                () => setNotice({ text: m.importFailed, error: true }),
              );
            }}
          />
        </div>
      </div>
      {notice && (
        <p role="status" className={`mt-1 text-[12px] ${notice.error ? 'text-danger-ink' : 'text-ok'}`}>
          {notice.text}
        </p>
      )}
      {form && !form.id && (
        <TermForm
          m={m}
          prefs={prefs}
          initial={emptyDraft()}
          edbKeyFor={base.edbKeyFor}
          onSave={(next) => {
            write(next);
            setForm(null);
            show('mine');
            search('');
          }}
          onCancel={() => setForm(null)}
          onShow={(key) => {
            setForm(null);
            show('all');
            search(key);
          }}
        />
      )}
      {importing && (
        <ImportPanel
          m={m}
          name={importing.name}
          preview={importing.preview}
          onCancel={() => setImporting(null)}
          onApply={(mode) => {
            const n = importing.preview.items.filter((i) => i.kind !== 'invalid' && (mode === 'replace' || i.kind !== 'same')).length;
            write(applyImport(importing.preview, prefs, mode));
            setImporting(null);
            setNotice({ text: m.imported(n) });
            show('mine');
          }}
        />
      )}
      {empty && <p className="py-6 text-center text-xs text-ink-muted">{query.trim() ? m.noMatch(query.trim()) : m.noneChanged}</p>}
      {common.length > 0 && (
        <section aria-label={m.common}>
          <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{m.common}</h4>
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
