'use client';

import { useEffect, useState } from 'react';
import type { AiErrorInfo } from '@/ai/types';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { aiReport, aiTiming, type AiRun, type AiTone } from '@/importCheck/aiSummary';
import type { ImportFinding } from '@/importCheck/types';
import { IMPORT_CHECK_MESSAGES } from '@/importCheck/messages';
import { findingMessage, fixLabel } from '@/importCheck/text';
import { useMessages, useUiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
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
  onStopAi,
  onClose,
}: {
  findings: readonly ImportFinding[];
  /** The printed number of a checked question (its index → "12"). */
  number: (q: number) => number | string;
  safe: number;
  stale: number;
  /** The AI check's run and the provider it would go to (Settings → AI). */
  ai: { run: AiRun; provider: string; configured: boolean };
  onApply: (finding: ImportFinding) => void;
  onSkip: (finding: ImportFinding) => void;
  onApplySafe: () => void;
  onGo: (finding: ImportFinding) => void;
  onAskAi: () => void;
  onStopAi: () => void;
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
        <span className="flex-1" />
        <span className="hidden text-xs text-ink-subtle sm:inline">{m.reviewNote}</span>
        <IconButton label={m.close} onClick={onClose}>
          <CloseIcon size={14} />
        </IconButton>
      </div>
      <AiCheckRow {...ai} onAsk={onAskAi} onStop={onStopAi} />
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

const TONE: Record<AiTone, string> = {
  ok: 'text-ok',
  found: 'text-warn-ink',
  warn: 'text-warn-ink',
  failed: 'text-danger-ink',
};

const timeOf = (lang: UiLanguage) => (at: number) =>
  new Date(at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'zh-HK', { hour: '2-digit', minute: '2-digit' });

/** A clock that ticks once a second while `on`, so a long run visibly moves. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    // The first tick comes within a second; until then a stale clock reads 0:00 (clamped).
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [on]);
  return now;
}

/**
 * The AI check's own row (k-0501, user u-2ywo): always in the panel, never only a button.
 * Not run yet (and where it would send), connecting, checking (a bar, how many, how long,
 * Stop), then what came of it: a headline in its tone and a few lines of what was checked
 * and found — also when it found nothing, and when it failed and why.
 */
export function AiCheckRow({
  run,
  provider,
  configured,
  onAsk,
  onStop,
  now: fixedNow,
}: {
  run: AiRun;
  provider: string;
  configured: boolean;
  onAsk: () => void;
  onStop: () => void;
  /** Tests pin the clock. */
  now?: number;
}) {
  const m = useMessages(IMPORT_CHECK_MESSAGES);
  const lang = useUiLanguage();
  const busy = run.state === 'connecting' || run.state === 'running';
  const ticking = useNow(busy && fixedNow === undefined);
  const now = fixedNow ?? ticking;
  const why = (error: AiErrorInfo) => localizedErrorMessage(error, lang);
  const report = run.state === 'done' || run.state === 'failed' ? aiReport(m, run, timeOf(lang), why) : undefined;
  const share = run.state === 'running' && run.total ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div data-ai-check={run.state} className="shrink-0 border-t border-line bg-surface-sunken px-4 py-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink">✦ {m.aiCheck}</span>
        <span className="text-ink-subtle">·</span>
        {run.state === 'idle' && <span className="min-w-0 flex-1 text-[12px] text-ink-muted">{configured ? m.aiIdle(provider) : m.aiIdleNoProvider}</span>}
        {run.state === 'connecting' && <span className="min-w-0 flex-1 text-[12px] text-ink">{m.aiConnecting(provider)}</span>}
        {run.state === 'running' && (
          <span className="min-w-0 flex-1 text-[12px] text-ink">
            {m.aiSending(run.total, run.batches, provider)}
            <span className="text-ink-muted"> · {m.aiProgress(run.done, run.total)}</span>
          </span>
        )}
        {report && <span className={`min-w-0 flex-1 text-[12.5px] font-medium ${TONE[report.tone]}`}>{report.tone === 'ok' ? '✓ ' : ''}{report.headline}</span>}
        {busy ? (
          <Button size="sm" variant="subtle" onClick={onStop}>
            {m.aiStop}
          </Button>
        ) : (
          <Button size="sm" variant={run.state === 'idle' ? 'default' : 'subtle'} onClick={onAsk} data-ai-ask>
            ✦ {run.state === 'idle' ? m.aiRun : m.aiRunAgain}
          </Button>
        )}
      </div>
      {busy && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <span
              className={`block h-full rounded-full bg-accent transition-[width] duration-500 ease-out-soft ${run.state === 'connecting' || share === 0 ? 'w-1/12 animate-pulse' : ''}`}
              style={run.state === 'running' && share > 0 ? { width: `${share}%` } : undefined}
            />
          </span>
          {run.state === 'running' && <span className="shrink-0 text-[11.5px] tabular-nums text-ink-muted">{aiTiming(m, run, now)}</span>}
        </div>
      )}
      {report && report.lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11.5px] text-ink-muted">
          {report.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
