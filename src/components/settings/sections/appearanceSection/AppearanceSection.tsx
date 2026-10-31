'use client';

import type { TextKey } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { APPEARANCE_SETTINGS, THEME_PREFERENCES, type ThemeId, type ThemePreference } from '@/settings/appearance';
import { useSettings } from '@/settings/store';
import { APPEARANCE_MESSAGES } from './messages';

/**
 * Settings → Appearance: System or one of the themes, applied live. Each choice shows a
 * small picture of the editor drawn with that theme's own tokens: the picture sits under
 * its own `data-theme`, so it can never drift from the token file. The sheet in each
 * stays white with black lines, as the paper does in every theme.
 */

type Key = TextKey<typeof APPEARANCE_MESSAGES>;
const NOTE: Record<ThemePreference, Key> = {
  system: 'systemNote',
  light: 'lightNote',
  dark: 'darkNote',
  midnight: 'midnightNote',
  contrast: 'contrastNote',
  sepia: 'sepiaNote',
  bright: 'brightNote',
  poster: 'posterNote',
};

function Miniature({ theme }: { theme: ThemeId }) {
  const m = useMessages(APPEARANCE_MESSAGES);
  return (
    <div data-theme={theme} className="absolute inset-0 flex flex-col bg-desk" style={{ fontFamily: 'var(--ui-font)' }}>
      <div className="zone-dark flex h-3.5 items-center gap-1 border-b border-line bg-surface px-1.5">
        <span className="h-1 w-5 rounded-full bg-ink opacity-70" />
        <span className="ml-auto h-1.5 w-4 rounded-sm bg-cta" />
      </div>
      <div className="flex flex-1 gap-1.5 p-1.5">
        <div className="zone-light flex w-[38%] flex-col gap-1 rounded-md border border-line bg-surface p-1 shadow-sm">
          <span className="text-[9px] font-semibold leading-none text-ink">{m.sampleText}</span>
          <span className="block h-1 w-4/5 rounded-full bg-ink-muted" />
          <span className="block h-2 w-full rounded-sm bg-accent-soft" />
          <span className="block h-1 w-3/5 rounded-full bg-ink-subtle" />
          <span className="mt-auto block h-1.5 w-1/2 rounded-sm bg-accent" />
        </div>
        <div className="flex-1 space-y-1 rounded-[2px] bg-[#ffffff] p-1.5" style={{ boxShadow: 'var(--sheet-shadow)' }}>
          <span className="block h-1 w-3/4 rounded-full bg-[#111111] opacity-70" />
          <span className="block h-1 w-1/2 rounded-full bg-[#111111] opacity-40" />
          <span className="block h-1 w-2/3 rounded-full bg-[#111111] opacity-40" />
        </div>
      </div>
    </div>
  );
}

function Preview({ value }: { value: ThemePreference }) {
  if (value !== 'system') return <Miniature theme={value} />;
  return (
    <>
      <Miniature theme="light" />
      <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        <Miniature theme="dark" />
      </div>
    </>
  );
}

export default function AppearanceSection() {
  const [{ theme }, update] = useSettings(APPEARANCE_SETTINGS);
  const m = useMessages(APPEARANCE_MESSAGES);
  return (
    <div className="@container">
      <div role="radiogroup" aria-label={m.group} className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
        {THEME_PREFERENCES.map((value) => {
          const active = value === theme;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => update({ theme: value })}
              className={`group cursor-pointer rounded-xl border p-2 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover'
              }`}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
                <Preview value={value} />
              </div>
              <div className="mt-2 flex items-center gap-1.5 px-0.5">
                <span
                  aria-hidden
                  className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${
                    active ? 'border-accent bg-accent' : 'border-line-strong'
                  }`}
                >
                  {active && <span className="size-1.5 rounded-full bg-on-accent" />}
                </span>
                <span className={`text-xs font-medium ${active ? 'text-accent-ink' : 'text-ink'}`}>{m[value]}</span>
              </div>
              <p className="mt-0.5 pl-5 text-[11px] text-ink-muted">{m[NOTE[value]]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
