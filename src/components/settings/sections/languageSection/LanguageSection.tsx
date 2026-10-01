'use client';

import { useMessages } from '@/i18n/language';
import { LANGUAGE_SETTINGS, type UiLanguage } from '@/settings/language';
import { useSettings } from '@/settings/store';
import { LANGUAGE_MESSAGES } from './messages';

/**
 * Settings → Language 語言: English or 繁體中文, applied live. Each choice is named and
 * sampled in its own language, so it reads the same in either interface.
 */

const OPTIONS: { value: UiLanguage; label: string; sample: string }[] = [
  { value: 'en', label: 'English', sample: 'New worksheet · Question bank · Export' }, // i18n-ignore: a language is named in itself
  { value: 'zh-HK', label: '繁體中文', sample: '新增工作紙 · 題庫 · 匯出' },
];

export default function LanguageSection() {
  const [{ ui }, update] = useSettings(LANGUAGE_SETTINGS);
  const m = useMessages(LANGUAGE_MESSAGES);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={m.group} className="grid grid-cols-2 gap-3">
        {OPTIONS.map((option) => {
          const active = option.value === ui;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              lang={option.value}
              onClick={() => update({ ui: option.value })}
              className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${
                    active ? 'border-accent bg-accent' : 'border-line-strong'
                  }`}
                >
                  {active && <span className="size-1.5 rounded-full bg-on-accent" />}
                </span>
                <span className={`text-[13px] font-medium ${active ? 'text-accent-ink' : 'text-ink'}`}>{option.label}</span>
              </span>
              <span className="mt-1 block pl-5 text-[11px] text-ink-muted">{option.sample}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-muted">{m.unchanged}</p>
    </div>
  );
}
