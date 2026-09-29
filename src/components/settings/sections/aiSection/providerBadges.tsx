import type { ProviderPreset } from '@/ai/types';
import { Pill } from '@/components/ui';

/** Settings' key status on a provider row: a saved key, or none needed. */
export type RowKeyStatus = 'saved' | 'keyless' | null;

/**
 * A provider row's right-hand badges, the same in Settings and the menu's SetupCard. With a
 * key status on a narrow row (an `@container`), the Hong Kong note shrinks to its dot and tooltip.
 */
export function ProviderBadges({ preset, keyStatus = null }: { preset: ProviderPreset; keyStatus?: RowKeyStatus }) {
  const hk = preset.hk.status === 'available';
  return (
    <>
      {preset.recommended && <Pill tone="accent">Recommended</Pill>}
      {hk && (
        <span title="Available in Hong Kong" className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          <span className={keyStatus ? '@max-[26rem]:sr-only' : undefined}>Available in Hong Kong</span>
        </span>
      )}
      {keyStatus === 'saved' && <Pill tone="ok">Key saved</Pill>}
      {keyStatus === 'keyless' && <Pill>No key needed</Pill>}
    </>
  );
}

/** The warn-ink note for a provider Hong Kong can't use officially; a muted one otherwise. */
export function HkNote({ preset, text = preset.hk.note }: { preset: ProviderPreset; text?: string }) {
  if (preset.hk.status === 'available') return null;
  const warn = preset.hk.status === 'notOfficial' || preset.hk.status === 'unavailable';
  return (
    <p className={warn ? 'rounded-md bg-warn-soft px-2 py-1.5 text-[11px] text-warn-ink' : 'text-[11px] text-ink-muted'}>
      {warn && '⚠ '}
      {text}
    </p>
  );
}
