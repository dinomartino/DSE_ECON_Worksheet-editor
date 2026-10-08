'use client';

import { useId, type ReactNode } from 'react';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { LANGUAGE_SETTINGS, type UiLanguage } from '@/settings/language';
import { useSettings } from '@/settings/store';
import { LANGUAGE_MESSAGES } from './messages';

/**
 * Settings → Language 語言, two separate choices applied live: the interface (each named
 * and sampled in its own language, so it reads the same in either interface) and the
 * language a new paper starts in, named as the editor's own EN / 中文 / EN+中 switch.
 */

const INTERFACE: { value: UiLanguage; label: string; sample: string }[] = [
  { value: 'en', label: 'English', sample: 'New worksheet · Question bank · Export' }, // i18n-ignore: a language is named in itself
  { value: 'zh-HK', label: '繁體中文', sample: '新增工作紙 · 題庫 · 匯出' },
];

function Choice({ active, label, sample, lang, onPick }: {
  active: boolean;
  label: string;
  sample: string;
  lang?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      lang={lang}
      onClick={onPick}
      className={`min-w-0 cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
        <span className={`text-[13px] font-medium ${active ? 'text-accent-ink' : 'text-ink'}`}>{label}</span>
      </span>
      <span className="mt-1 block pl-5 text-[11px] text-ink-muted">{sample}</span>
    </button>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h4 id={id} className="text-[13px] font-medium text-ink">{title}</h4>
      <p className="mb-2.5 mt-0.5 text-[11px] text-ink-muted">{note}</p>
      {children}
    </section>
  );
}

export default function LanguageSection() {
  const [{ ui, paper }, update] = useSettings(LANGUAGE_SETTINGS);
  const m = useMessages(LANGUAGE_MESSAGES);
  const papers: { value: LanguageMode; label: string; sample: string }[] = [
    { value: 'en', label: 'EN', sample: m.paperEn },
    { value: 'zh', label: '中文', sample: m.paperZh },
    { value: 'bilingual', label: 'EN+中', sample: m.paperBoth },
  ];
  return (
    <div className="space-y-6">
      <Group title={m.interface} note={m.interfaceNote}>
        <div role="radiogroup" aria-label={m.group} className="grid grid-cols-2 gap-3">
          {INTERFACE.map((option) => (
            <Choice
              key={option.value}
              active={option.value === ui}
              label={option.label}
              sample={option.sample}
              lang={option.value}
              onPick={() => update({ ui: option.value })}
            />
          ))}
        </div>
      </Group>
      <Group title={m.papers} note={m.papersNote}>
        <div role="radiogroup" aria-label={m.papersGroup} className="grid grid-cols-3 gap-3">
          {papers.map((option) => (
            <Choice
              key={option.value}
              active={option.value === paper}
              label={option.label}
              sample={option.sample}
              onPick={() => update({ paper: option.value })}
            />
          ))}
        </div>
      </Group>
    </div>
  );
}
