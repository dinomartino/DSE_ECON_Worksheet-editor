import type { RunProgress } from '@/translate/types';
import { Button } from '@/components/ui';
import * as copy from './copy';
import type { TranslateController } from './translateController';
import { pendingKeys, type TranslateSession } from './translateSession';

export function phaseLine(progress: RunProgress | null, provider: string): string {
  switch (progress?.phase) {
    case 'checking':
      return copy.PHASE_CHECKING;
    case 'fixing':
      return copy.PHASE_FIXING;
    case 'waiting':
      return copy.waitingLine(provider, progress.waitMs ?? 0);
    default:
      return copy.PHASE_TRANSLATING;
  }
}

/** One request per direction for a typical paper: the bar moves in request steps. */
export function RunningPanel({ session, provider }: { session: TranslateSession; provider: string }) {
  const plan = session.run?.plan;
  const texts = session.run ? pendingKeys(session.run).length : 0;
  const progress = session.progress;
  const total = progress?.requestsTotal ?? plan?.chunks.length ?? 0;
  const done = progress?.requestsDone ?? 0;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="space-y-3 pt-2" role="status" aria-live="polite">
      <p className="text-[13px] font-medium text-ink">{copy.runningTitle(texts, provider)}</p>
      <div className="flex items-center gap-3">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-hover">
          {/* `scale` is transitioned (not width), so the bar moves without layout. */}
          <div
            className="h-full origin-left rounded-full bg-accent transition-[scale] duration-150 ease-out-soft"
            style={{ scale: `${Math.max(fraction, 0.02)} 1` }}
          />
        </div>
        {total > 0 && <span className="shrink-0 text-xs tabular-nums text-ink-muted">{copy.requestsLine(done, total)}</span>}
      </div>
      <p className="text-xs text-ink-muted">{phaseLine(progress, provider)}</p>
    </div>
  );
}

export function RunningFooter({ session, actions }: { session: TranslateSession; actions: TranslateController }) {
  if (session.confirm?.kind === 'stop') {
    return (
      <>
        <span className="mr-auto text-[13px] text-ink">{copy.STOP_QUESTION}</span>
        <Button onClick={actions.keepGoing}>{copy.KEEP_GOING}</Button>
        <Button variant="primary" onClick={actions.stop}>
          {copy.STOP}
        </Button>
      </>
    );
  }
  return <Button onClick={actions.stop}>{copy.STOP}</Button>;
}
