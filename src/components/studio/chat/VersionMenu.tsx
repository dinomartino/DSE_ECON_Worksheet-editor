'use client';

import { useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import type { StudioDraft, VersionMade } from '@/questionStudio/types';
import { keyCheckOf } from '@/questionStudio/keyCheck';
import { hasWarning } from '@/questionStudio/validate';
import { useDismiss } from '../dismiss';
import { QUESTION_STUDIO_MESSAGES } from '../messages';
import { Chip } from '../parts';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import type { ChatDraft } from './chatTypes';
import { KeyCheckChip } from './KeyCheckChip';
import { currentNumber, madeOf, versionsOf } from './versions';

type ChatMessages = Messages<typeof STUDIO_CHAT_MESSAGES>;

/** Who made a version, in a few words: 「AI 擬題」, 「AI 修改：「更難」」, 「你修改」. */
export function madeWords(made: VersionMade, m: ChatMessages): string {
  if (made.by === 'you') return m.madeYou;
  if (made.how === 'write') return m.madeWrite;
  if (made.how === 'another') return m.madeAnother;
  if (made.how === 'harder') return m.madeHarder;
  if (made.how === 'easier') return m.madeEasier;
  return m.madeChange(made.said ?? '');
}

const timeOf = (iso: string): string => {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * The draft's versions as a drop list on its top bar (k-0530, u-hyt5): the button names the
 * one shown, 「第 3 版（你修改）▾」; the list is newest first, each row with its number, who
 * made it, when, and its checks; the shown one is ticked. Picking one shows it (Add, the page
 * and the AI's next turn use it); nothing is deleted. Click away or Esc closes it.
 */
export function VersionMenu({ draft, disabled = false, onShow }: { draft: ChatDraft; disabled?: boolean; onShow: (versionId: string) => void }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [list, button], button);
  const versions = versionsOf(draft);
  if (versions.length < 2) return null;
  const shown = currentNumber(draft);
  const shownMade = madeOf(draft.entry.draft, shown);
  const chipOf = (v: StudioDraft) =>
    hasWarning(v) ? <Chip tone="fail">!</Chip> : v.status === 'ok' ? <Chip tone="ok">{q.statusOk}</Chip> : <Chip tone="look">{q.statusLook}</Chip>;

  return (
    <span className="relative" data-version-menu>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        data-version-button={shown}
      >
        {m.versionButton(shown, shownMade.by === 'you' ? m.whoYou : m.whoAi)}
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div
          ref={list}
          role="listbox"
          aria-label={m.versionListLabel}
          className="absolute left-0 top-[calc(100%+4px)] z-30 w-[320px] rounded-xl border border-line bg-surface p-1.5 shadow-lg"
          data-version-list
        >
          {versions.map(({ no, version, current }) => {
            const made = madeOf(version, no);
            return (
              <button
                key={version.id}
                type="button"
                role="option"
                aria-selected={current}
                onClick={() => {
                  setOpen(false);
                  if (!current) onShow(version.id);
                  button.current?.focus();
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${current ? 'bg-accent-soft' : ''}`}
                data-version-row={no}
              >
                <span className="w-4 shrink-0 text-accent-ink">{current ? '✓' : ''}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {m.versionNo(no)} · {madeWords(made, m)}
                  </span>
                  {timeOf(made.at) && <span className="block text-[11px] text-ink-subtle">{timeOf(made.at)}</span>}
                </span>
                <KeyCheckChip check={keyCheckOf(version)} m={m} quiet />
                {chipOf(version)}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
