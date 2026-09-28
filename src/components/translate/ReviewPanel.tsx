import type { Glossary } from '@/glossary/types';
import { plain } from '@/model/text';
import { Button, Eyebrow, Segmented } from '@/components/ui';
import { Collapsible } from '@/components/ui/Collapsible';
import * as copy from './copy';
import { ReviewRow } from './ReviewRow';
import { Attribution } from './SetupPanel';
import type { TranslateController } from './translateController';
import {
  filterCounts,
  finishedCount,
  insertCount,
  isTicked,
  pendingKeys,
  reviewGroups,
  unattemptedCount,
  type ReviewFilter,
  type TranslateSession,
} from './translateSession';

/**
 * Review is read-mostly: ticks and notes, no text inputs, no in-dialog rewriting. A wrong
 * row is unticked, or inserted and corrected on the page (the rejected dock is not rebuilt).
 */
export function ReviewPanel({
  session,
  actions,
  glossary,
}: {
  session: TranslateSession;
  actions: TranslateController;
  glossary: Glossary | null;
}) {
  const run = session.run;
  if (!run) return null;
  if (session.nothingInserted) {
    return (
      <div className="px-5 py-4">
        <p className="text-[13px] text-ink">{copy.NOTHING_INSERTED}</p>
      </div>
    );
  }
  const counts = filterCounts(run);
  const groups = reviewGroups(run, session.filter);
  const selectable = [...run.results.keys()];
  const filters: Array<{ value: ReviewFilter; label: string }> = [{ value: 'all', label: copy.filterAll(counts.all) }];
  if (counts.look > 0) filters.push({ value: 'look', label: copy.filterLook(counts.look) });
  if (counts.failed > 0) filters.push({ value: 'failed', label: copy.filterFailed(counts.failed) });
  const copies = run.plan.copies;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-5 py-2">
        <span className="text-xs text-ink-muted">{copy.SHOW}</span>
        <Segmented label={copy.SHOW} value={session.filter} options={filters} onChange={actions.setFilter} />
        <span className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
          {copy.SELECT}
          <Button size="sm" variant="subtle" onClick={() => actions.tick(selectable, true)}>
            {copy.SELECT_ALL}
          </Button>
          <Button size="sm" variant="subtle" onClick={() => actions.tick(selectable, false)}>
            {copy.SELECT_NONE}
          </Button>
        </span>
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {run.stopped && (
          <p className="pb-2 text-xs text-ink-muted">
            {copy.stoppedNote(finishedCount(run), run.plan.jobs.size)}
          </p>
        )}
        {groups.length === 0 && <p className="py-2 text-xs text-ink-muted">{copy.NO_ROWS}</p>}
        {groups.map((group) => (
          <section key={group.key} className="pb-2">
            <Eyebrow className="block pt-2">{group.label}</Eyebrow>
            <ul className="divide-y divide-line">
              {group.items.map((item) => (
                <ReviewRow
                  key={item.key}
                  item={item}
                  groupLabel={group.label}
                  ticked={isTicked(session, item.key)}
                  onTick={(value) => actions.tick([item.key], value)}
                  glossary={glossary}
                />
              ))}
            </ul>
          </section>
        ))}
        {copies.length > 0 && session.filter === 'all' && (
          <div className="-mx-3 mt-1">
            <Collapsible
              title={copy.copiesGroup(copies.length)}
              actions={
                <input
                  type="checkbox"
                  aria-label={copy.copiesGroup(copies.length)}
                  checked={session.acceptCopies}
                  onChange={actions.toggleCopies}
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                />
              }
            >
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                {copies.map((write, i) => (
                  <li key={`${write.path}-${i}`}>{plain(write.next)}</li>
                ))}
              </ul>
            </Collapsible>
          </div>
        )}
      </div>
    </>
  );
}

/** The footer's question when closing would throw away finished translations. */
export function DiscardQuestion({ n, actions }: { n: number; actions: TranslateController }) {
  return (
    <>
      <span className="mr-auto text-[13px] text-ink">{copy.discardQuestion(n)}</span>
      <Button onClick={actions.keepGoing}>{copy.KEEP_REVIEWING}</Button>
      <Button variant="danger" onClick={actions.discard}>
        {copy.DISCARD}
      </Button>
    </>
  );
}

export function ReviewFooter({
  session,
  actions,
  configured,
}: {
  session: TranslateSession;
  actions: TranslateController;
  /** A provider is set up, so the rest can be sent. */
  configured: boolean;
}) {
  const run = session.run;
  if (!run || session.nothingInserted) return <Button onClick={actions.close}>{copy.CLOSE}</Button>;
  if (session.confirm?.kind === 'discard') return <DiscardQuestion n={finishedCount(run)} actions={actions} />;
  const pending = pendingKeys(run).length;
  const unattempted = unattemptedCount(run);
  const n = insertCount(session);
  return (
    <>
      <Attribution short>
        <span> · {copy.REVIEW_HINT}</span>
      </Attribution>
      <Button onClick={actions.back}>{copy.BACK}</Button>
      {configured && pending > 0 && (
        <Button onClick={actions.retry}>{unattempted > 0 ? copy.translateRest(pending) : copy.RETRY_FAILED}</Button>
      )}
      <Button variant="primary" disabled={n === 0} onClick={actions.insert}>
        {copy.insertButton(n)}
      </Button>
    </>
  );
}
