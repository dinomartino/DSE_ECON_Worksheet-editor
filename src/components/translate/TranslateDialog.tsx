'use client';

import type { ReactNode } from 'react';
import type { TermRow } from '@/translate/types';
import { Dialog } from '@/components/ui/Dialog';
import { CheckTermsFooter, CheckTermsPanel } from './CheckTermsPanel';
import * as copy from './copy';
import { ErrorFooter, ErrorPanel } from './ErrorPanel';
import { ReviewFooter, ReviewPanel } from './ReviewPanel';
import { RunningFooter, RunningPanel } from './RunningPanel';
import { SetupFooter, SetupPanel, type TranslateView } from './SetupPanel';
import type { TranslateController } from './translateController';
import type { TranslateSession } from './translateSession';

/** The body pads itself and scrolls its own pane; actions live in the footer. */
function Pane({ children }: { children: ReactNode }) {
  return <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>;
}

export function dialogDescription(session: TranslateSession, view: TranslateView): string {
  if (session.mode === 'check' && session.phase === 'setup') return copy.CHECK_DESCRIPTION;
  const run = session.run;
  if (session.phase !== 'review' || !run || session.nothingInserted) return copy.SETUP_DESCRIPTION;
  let toZh = false;
  let toEn = false;
  for (const key of run.results.keys()) {
    const direction = run.plan.jobs.get(key)?.direction;
    if (direction === 'toZh') toZh = true;
    if (direction === 'toEn') toEn = true;
  }
  const model = view.status.preset.models.find((m) => m.id === run.model)?.label ?? run.model;
  return copy.reviewSummary({ directions: copy.directionsLabel(toZh, toEn), texts: run.results.size, model, ms: run.ms });
}

/**
 * One Dialog, two modes (Translate, Check terms). Every screen is a function of the
 * session and the view, so each renders to static markup in a test. Escape, ✕ and the
 * scrim all go through `requestClose`, which asks before throwing away paid work.
 */
export function TranslateDialog({
  session,
  view,
  actions,
  termRows,
}: {
  session: TranslateSession;
  view: TranslateView;
  actions: TranslateController;
  /** Check terms rows; null while the glossary loads. */
  termRows: readonly TermRow[] | null;
}) {
  let body: ReactNode;
  let footer: ReactNode;
  if (session.mode === 'check' && session.phase === 'setup') {
    body = (
      <Pane>
        <CheckTermsPanel session={session} rows={termRows} glossaryFailed={view.glossaryFailed} actions={actions} />
      </Pane>
    );
    footer = <CheckTermsFooter session={session} rows={termRows} actions={actions} />;
  } else if (session.phase === 'running') {
    body = (
      <Pane>
        <RunningPanel session={session} provider={view.status.preset.label} />
      </Pane>
    );
    footer = <RunningFooter session={session} actions={actions} />;
  } else if (session.phase === 'review') {
    body = <ReviewPanel session={session} actions={actions} glossary={view.glossary} slotWhere={view.slotWhere} />;
    footer = <ReviewFooter session={session} actions={actions} configured={view.status.configured} />;
  } else if (session.phase === 'error' && session.error) {
    body = (
      <Pane>
        <ErrorPanel error={session.error} actions={actions} />
      </Pane>
    );
    footer = <ErrorFooter session={session} actions={actions} />;
  } else {
    body = (
      <Pane>
        <SetupPanel session={session} view={view} actions={actions} />
      </Pane>
    );
    footer = <SetupFooter session={session} view={view} actions={actions} />;
  }
  return (
    <Dialog
      title={copy.DIALOG_TITLE}
      description={dialogDescription(session, view)}
      onClose={actions.requestClose}
      width={760}
      height={640}
      scrollBody={false}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}
