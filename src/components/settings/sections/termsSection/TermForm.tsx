'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import type { TERMS_MESSAGES } from './messages';
import { saveTerm, type Prefs, type TermDraft, type TermError } from './termRows';

type M = Messages<typeof TERMS_MESSAGES>;

const INPUT =
  'h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

function Field({
  label,
  value,
  onChange,
  error,
  lang,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: ReactNode;
  lang?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-muted">{label}</span>
      <input
        value={value}
        lang={lang}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${INPUT} ${error ? 'border-danger' : ''}`}
      />
      {error && <span className="mt-1 block text-[11px] text-danger-ink">{error}</span>}
    </label>
  );
}

/**
 * Add a term the EDB glossary does not have, or edit one of the teacher's. English the
 * glossary already has is refused with a way to its row ("Show it").
 */
export function TermForm({
  m,
  prefs,
  initial,
  id,
  edbKeyFor,
  onSave,
  onCancel,
  onShow,
}: {
  m: M;
  prefs: Prefs;
  initial: TermDraft;
  /** The term being edited; absent for a new one. */
  id?: string;
  edbKeyFor: (english: string) => string | undefined;
  onSave: (next: Prefs) => void;
  onCancel: () => void;
  /** Search for an EDB term by its key. */
  onShow: (key: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<TermError>();
  const set = (field: keyof TermDraft) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(undefined);
  };
  const say = (field: TermError['field']) => {
    if (!error || error.field !== field) return undefined;
    if (error.kind === 'edb') {
      return (
        <>
          {m.inEdb(error.key)}{' '}
          <button type="button" onClick={() => onShow(error.key)} className="cursor-pointer font-medium text-ink underline underline-offset-2">
            {m.showIt}
          </button>
        </>
      );
    }
    if (error.kind === 'taken') return m.takenBy(error.other);
    return field === 'en' ? m.englishInvalid : field === 'abbreviation' ? m.abbreviationInvalid : m.chineseInvalid;
  };
  const submit = () => {
    const result = saveTerm(prefs, draft, edbKeyFor, id);
    if ('error' in result) setError(result.error);
    else onSave(result.prefs);
  };
  return (
    <form
      data-term-form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        // Escape leaves the form, not Settings.
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      className="mt-2 max-w-[720px] space-y-2.5 rounded-xl border border-line bg-surface-raised p-3"
    >
      <p className="text-[12px] font-medium text-ink">{id ? m.editTermTitle : m.addTermTitle}</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[2fr_1fr]">
        <Field label={m.fieldEnglish} value={draft.en} onChange={set('en')} error={say('en')} lang="en" autoFocus />
        <Field label={m.fieldAbbreviation} value={draft.abbreviation} onChange={set('abbreviation')} error={say('abbreviation')} lang="en" />
      </div>
      <Field label={m.fieldForms} value={draft.forms} onChange={set('forms')} error={say('forms')} lang="en" />
      <Field label={m.fieldChinese} value={draft.zh} onChange={set('zh')} error={say('zh')} lang="zh-HK" />
      <div className="flex justify-end gap-2 pt-0.5">
        <Button size="sm" onClick={onCancel}>
          {m.cancel}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {id ? m.save : m.add}
        </Button>
      </div>
    </form>
  );
}
