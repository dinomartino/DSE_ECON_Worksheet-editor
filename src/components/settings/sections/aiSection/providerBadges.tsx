import type { ProviderPreset } from '@/ai/types';
import { Pill } from '@/components/ui';

/** A provider row's right-hand badges, the same in Settings and the menu's SetupCard. */
export function ProviderBadges({ preset }: { preset: ProviderPreset }) {
  return (
    <>
      {preset.recommended && <Pill tone="accent">Recommended</Pill>}
      {preset.hk.status === 'available' && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          Available in Hong Kong
        </span>
      )}
    </>
  );
}

/** The warn-ink note for a provider Hong Kong can't use officially; a muted one otherwise. */
export function HkNote({ preset }: { preset: ProviderPreset }) {
  if (preset.hk.status === 'available') return null;
  const warn = preset.hk.status === 'notOfficial' || preset.hk.status === 'unavailable';
  return (
    <p className={warn ? 'rounded-md bg-warn-soft px-2 py-1.5 text-[11px] text-warn-ink' : 'text-[11px] text-ink-muted'}>
      {warn && '⚠ '}
      {preset.hk.note}
    </p>
  );
}
