import type { ProviderPreset } from '@/ai/types';
import { Pill } from '@/components/ui';
import { providerCopy } from '@/components/ai/providerCopy';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { AI_SECTION_MESSAGES } from './messages';

/** Settings' key status on a provider row: a saved key, or none needed. */
export type RowKeyStatus = 'saved' | 'keyless' | null;

/**
 * A provider row's right-hand badges, the same in Settings and the menu's SetupCard. With a
 * key status on a narrow row (an `@container`), the Hong Kong note shrinks to its dot and tooltip.
 */
export function ProviderBadges({ preset, keyStatus = null }: { preset: ProviderPreset; keyStatus?: RowKeyStatus }) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const hk = preset.hk.status === 'available';
  return (
    <>
      {preset.recommended && <Pill tone="accent">{m.recommended}</Pill>}
      {hk && (
        <span title={m.availableInHk} className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          <span className={keyStatus ? '@max-[26rem]:sr-only' : undefined}>{m.availableInHk}</span>
        </span>
      )}
      {keyStatus === 'saved' && <Pill tone="ok">{m.keySaved}</Pill>}
      {keyStatus === 'keyless' && <Pill>{m.noKeyNeeded}</Pill>}
    </>
  );
}

/** The warn-ink note for a provider Hong Kong can't use officially; a muted one otherwise. */
export function HkNote({ preset, text }: { preset: ProviderPreset; text?: string }) {
  const lang = useUiLanguage();
  const note = text ?? providerCopy(preset, lang).hkNote;
  if (preset.hk.status === 'available') return null;
  const warn = preset.hk.status === 'notOfficial' || preset.hk.status === 'unavailable';
  return (
    <p className={warn ? 'rounded-md bg-warn-soft px-2 py-1.5 text-[11px] text-warn-ink' : 'text-[11px] text-ink-muted'}>
      {warn && '⚠ '}
      {note}
    </p>
  );
}
