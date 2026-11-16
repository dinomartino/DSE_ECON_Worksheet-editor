'use client';

import { useEffect, useState } from 'react';
import { useMessages } from '@/i18n/language';
import { PAST_PAPER_SETTINGS_MESSAGES } from '@/components/pastpapers/messages';
import { BUILT_IN_SOURCE, PAST_PAPER_SETTINGS, sourceAddress, type PastPaperMode } from '@/pastpapers/config';
import { pastPaperCache } from '@/pastpapers/bank';
import { useSettings } from '@/settings/store';

/**
 * Settings → Past paper bank (k-0443): the one switch for this computer. Built-in reads the
 * address this build ships with; Off hides the bank everywhere in the app; Another address
 * points it at a local export or a mirror. Below, what is kept on this computer and a way
 * to drop it.
 */
export default function PastPapersSection() {
  const m = useMessages(PAST_PAPER_SETTINGS_MESSAGES);
  const [settings, update] = useSettings(PAST_PAPER_SETTINGS);
  const [draft, setDraft] = useState(settings.url);
  const [usage, setUsage] = useState<{ bytes: number; files: number } | undefined>();
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let live = true;
    void pastPaperCache()
      .usage()
      .then((next) => live && setUsage(next));
    return () => {
      live = false;
    };
  }, [cleared]);

  const host = (() => {
    try {
      return new URL(BUILT_IN_SOURCE).host;
    } catch {
      return BUILT_IN_SOURCE;
    }
  })();
  const valid = draft.trim() === '' || sourceAddress(draft) !== undefined;
  const choices: { id: PastPaperMode; label: string; note: string }[] = [
    { id: 'builtIn', label: m.builtIn, note: m.builtInNote(host) },
    { id: 'off', label: m.off, note: m.offNote },
    { id: 'custom', label: m.custom, note: m.customNote },
  ];

  return (
    <div className="space-y-6 text-[13px] text-ink">
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold text-ink-muted">{m.source}</legend>
        <div role="radiogroup" className="space-y-2">
          {choices.map((choice) => (
            <label key={choice.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input
                type="radio"
                name="pastpaper-mode"
                checked={settings.mode === choice.id}
                onChange={() => update({ mode: choice.id })}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block font-medium">{choice.label}</span>
                <span className="block text-[12px] leading-relaxed text-ink-muted">{choice.note}</span>
              </span>
            </label>
          ))}
        </div>
        {settings.mode === 'custom' && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[12px] text-ink-muted">{m.address}</span>
            <input
              type="text"
              value={draft}
              spellCheck={false}
              placeholder="http://localhost:3000/pastpaper-bank/" // i18n-ignore: an example address
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => valid && update({ url: draft.trim() })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && valid) update({ url: draft.trim() });
              }}
              aria-invalid={!valid}
              className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-[12px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-danger"
            />
            {!valid && <span className="mt-1 block text-[12px] text-danger">{m.invalid}</span>}
          </label>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">{m.sent}</p>
      </fieldset>

      <section>
        <h3 className="mb-1 text-[12px] font-semibold text-ink-muted">{m.kept}</h3>
        <p className="text-[12.5px] text-ink-muted">
          {cleared ? m.cleared : usage && usage.files > 0 ? m.keptSize((usage.bytes / 1_000_000).toFixed(1), usage.files) : m.keptNone}
        </p>
        {usage && usage.files > 0 && (
          <button
            type="button"
            onClick={() => void pastPaperCache().clear().then(() => setCleared((c) => !c))}
            className="mt-2 cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {m.clearKept}
          </button>
        )}
      </section>
    </div>
  );
}
