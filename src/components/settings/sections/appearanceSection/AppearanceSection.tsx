'use client';

import { APPEARANCE_SETTINGS, type ThemePreference } from '@/settings/appearance';
import { useSettings } from '@/settings/store';

/**
 * Settings → Appearance: System, Light or Dark, applied live. Each choice shows a small
 * picture of the editor in that scheme. The pictures take literal colours (the tokens
 * flip with the scheme they are meant to preview); the sheet in each stays white.
 */

const OPTIONS: { value: ThemePreference; label: string; note: string }[] = [
  { value: 'system', label: 'System', note: 'Follows your computer' },
  { value: 'light', label: 'Light', note: 'Warm cream' },
  { value: 'dark', label: 'Dark', note: 'Deep warm grey' },
];

const SCHEMES = {
  light: { desk: 'oklch(85% 0.016 85)', bar: 'oklch(94.5% 0.014 85)', panel: 'oklch(98.8% 0.006 85)', ink: 'oklch(27% 0.012 75)' },
  dark: { desk: 'oklch(15% 0.006 100)', bar: 'oklch(19% 0.008 100)', panel: 'oklch(23% 0.008 100)', ink: 'oklch(93% 0.006 95)' },
} as const;

function Miniature({ scheme }: { scheme: keyof typeof SCHEMES }) {
  const c = SCHEMES[scheme];
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: c.desk }}>
      <div className="flex h-3 items-center gap-1 px-1.5" style={{ background: c.bar }}>
        <span className="h-1 w-5 rounded-full opacity-70" style={{ background: c.ink }} />
      </div>
      <div className="flex flex-1 gap-1.5 p-1.5">
        <div className="w-1/3 space-y-1 rounded-sm p-1" style={{ background: c.panel }}>
          <span className="block h-1 w-4/5 rounded-full opacity-60" style={{ background: c.ink }} />
          <span className="block h-1 w-3/5 rounded-full opacity-40" style={{ background: c.ink }} />
        </div>
        <div className="flex-1 space-y-1 rounded-sm bg-[#ffffff] p-1.5 shadow-sm">
          <span className="block h-1 w-3/4 rounded-full bg-[#111111] opacity-70" />
          <span className="block h-1 w-1/2 rounded-full bg-[#111111] opacity-40" />
          <span className="block h-1 w-2/3 rounded-full bg-[#111111] opacity-40" />
        </div>
      </div>
    </div>
  );
}

function Preview({ value }: { value: ThemePreference }) {
  if (value !== 'system') return <Miniature scheme={value} />;
  return (
    <>
      <Miniature scheme="light" />
      <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        <Miniature scheme="dark" />
      </div>
    </>
  );
}

export default function AppearanceSection() {
  const [{ theme }, update] = useSettings(APPEARANCE_SETTINGS);
  return (
    <div role="radiogroup" aria-label="Colour scheme" className="grid grid-cols-3 gap-3">
      {OPTIONS.map((option) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => update({ theme: option.value })}
            className={`group cursor-pointer rounded-xl border p-2 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover'
            }`}
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
              <Preview value={option.value} />
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
              <span className={`text-xs font-medium ${active ? 'text-accent-ink' : 'text-ink'}`}>{option.label}</span>
            </div>
            <p className="mt-0.5 pl-5 text-[11px] text-ink-muted">{option.note}</p>
          </button>
        );
      })}
    </div>
  );
}
