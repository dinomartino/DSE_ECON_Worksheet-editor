'use client';

import type { ImportFinding } from '@/importCheck/types';
import { IMPORT_CHECK_MESSAGES } from '@/importCheck/messages';
import { findingMessage, fixLabel } from '@/importCheck/text';
import { useMessages } from '@/i18n/language';
import { Button, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';

/**
 * The import check in the import review (k-0494, user u-ywqa): what the import got wrong,
 * question by question, each with its fix's preview and Apply / Skip, and Apply all safe
 * fixes. A fix changes the import before Save (the preview shows it at once) and ⌘Z
 * takes it back like any other fix of the review. Interface only: data-print-hide is
 * moot in a dialog, but the strip never reaches a paper.
 */
export function ImportCheckPanel({
  findings,
  number,
  safe,
  stale,
  ai,
  onApply,
  onSkip,
  onApplySafe,
  onGo,
  onAskAi,
  onClose,
}: {
  findings: readonly ImportFinding[];
  /** The printed number of a checked question (its index → "12"). */
  number: (q: number) => number | string;
  safe: number;
  stale: number;
  ai: { busy: boolean; note?: string; progress?: string; available: boolean };
  onApply: (finding: ImportFinding) => void;
  onSkip: (finding: ImportFinding) => void;
  onApplySafe: () => void;
  onGo: (finding: ImportFinding) => void;
  onAskAi: () => void;
  onClose: () => void;
}) {
  const m = useMessages(IMPORT_CHECK_MESSAGES);
  return (
    <section
      data-import-check
      data-print-hide
      aria-label={m.checkImport}
      className="flex max-h-[38%] min-h-0 shrink-0 flex-col border-b border-line bg-surface"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2">
        <p className="mr-1 text-[13px] text-ink" role="status">
          <span className="font-semibold">{m.checkImport}</span>
          <span className="text-ink-muted"> · </span>
          <span className={findings.length ? 'font-medium text-warn-ink' : 'text-ink-muted'}>
            {findings.length ? m.findingsN(findings.length, safe) : m.noFindings}
          </span>
          {stale > 0 && <span className="text-ink-muted"> · {m.staleN(stale)}</span>}
        </p>
        {safe > 0 && (
          <Button size="sm" variant="primary" onClick={onApplySafe}>
            {m.applyAllSafe(safe)}
          </Button>
        )}
        <Button size="sm" variant="subtle" title={m.askAiTitle} disabled={ai.busy || !ai.available} onClick={onAskAi}>
          ✦ {ai.busy ? (ai.progress ?? m.checking) : m.askAi}
        </Button>
        {ai.note && <span className="text-xs text-ink-muted">{ai.note}</span>}
        <span className="flex-1" />
        <span className="hidden text-xs text-ink-subtle sm:inline">{m.reviewNote}</span>
        <IconButton label={m.close} onClick={onClose}>
          <CloseIcon size={14} />
        </IconButton>
      </div>
      {findings.length > 0 && (
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
          {findings.map((f) => {
            const label = fixLabel(m, f);
            return (
              <li key={f.id} data-finding={f.kind} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2">
                <button
                  type="button"
                  onClick={() => onGo(f)}
                  className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="text-[12px] font-semibold text-ink">
                    {m.where(Number(number(f.q)) || f.q + 1, f.place)}
                    {f.from === 'ai' && <span className="ml-1.5 rounded bg-accent-soft px-1 text-[10px] font-medium text-accent-ink">AI</span>}
                  </span>
                  <span className="block text-[12.5px] text-ink">{findingMessage(m, f)}</span>
                  {(f.before !== undefined || f.after !== undefined) && (
                    <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[11.5px]">
                      {f.before !== undefined && (
                        <>
                          <span className="text-ink-subtle">{m.before}</span>
                          <span className="line-clamp-2 whitespace-pre-wrap text-ink-muted line-through decoration-danger-ink/50">{f.before || m.removed}</span>
                        </>
                      )}
                      {f.after !== undefined && (
                        <>
                          <span className="text-ink-subtle">{m.after}</span>
                          <span className="line-clamp-2 whitespace-pre-wrap text-accent-ink">{f.after || m.removed}</span>
                        </>
                      )}
                    </span>
                  )}
                  {f.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URL from the file, never optimised
                    <img src={f.image} alt="" className="mt-1 max-h-16 max-w-[160px] rounded border border-line object-contain" />
                  )}
                  {!label && <span className="mt-0.5 block text-[11.5px] text-ink-subtle">{m.noFix}</span>}
                </button>
                <span className="flex shrink-0 items-center gap-1">
                  {label && (
                    <Button size="sm" variant={f.safe ? 'ghostAccent' : 'default'} onClick={() => onApply(f)}>
                      {label}
                    </Button>
                  )}
                  <Button size="sm" variant="subtle" onClick={() => onSkip(f)}>
                    {m.skip}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
