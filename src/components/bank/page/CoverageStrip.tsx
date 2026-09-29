'use client';

import type { BankStatus } from '@/library/types';
import { topicOf } from '@/model/topics';
import { bankCountLabel, typeName, type Coverage, type TopicPick } from './bankPage';

/**
 * The bank page's dashboard: one bar per topic (A–J, EL1, EL2), question types stacked in
 * registry order, all bars to one scale. Thin topics get an amber floor rule. Counts are
 * on hover (the bar's title) — the strip is read by shape, not by number.
 */
export function CoverageStrip({
  coverage,
  status,
  topic,
  onTopic,
}: {
  coverage: Coverage;
  status: BankStatus;
  topic: TopicPick;
  onTopic: (topic: TopicPick) => void;
}) {
  const { bars, untagged, total, typeIds } = coverage;
  // Nothing tagged yet: one grey Untagged bar beside the empty topics, and the way to fix it.
  const noTags = total > 0 && untagged === total;
  const scale = Math.max(coverage.max, noTags ? untagged : 0, 1);
  const scanning = status.state === 'scanning';
  const selectedCoarse = topic === 'all' || topic === 'untagged' ? undefined : (topicOf(topic)?.parent ?? topic);
  return (
    <div className="flex items-end gap-x-8 border-b border-line pb-3" aria-label="Coverage by topic">
      {/* The Topics column's width, so the bars stand over the list below them. */}
      <div className="w-48 shrink-0 self-start">
        <p className="text-[12px] font-semibold text-ink">Coverage</p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-subtle">
          {scanning ? (
            <span role="status">
              Reading your worksheets
              {status.total > 0 && (
                <span className="tabular-nums">
                  {' '}
                  · {status.done} of {status.total}
                </span>
              )}
            </span>
          ) : (
            <span className="tabular-nums">{bankCountLabel(coverage)}</span>
          )}
        </p>
      </div>
      <div className="grid h-[70px] min-w-0 flex-1 grid-flow-col auto-cols-fr items-end gap-1.5">
        {bars.map((bar) => {
          const on = selectedCoarse === bar.code;
          const counts = bar.byType.filter((part) => part.count > 0).map((part) => `${part.count} ${typeName(part.typeId)}`);
          const title = `${bar.code} · ${topicOf(bar.code)?.en ?? ''}: ${
            bar.total === 0 ? 'no questions' : `${bar.total} question${bar.total === 1 ? '' : 's'} (${counts.join(', ')})`
          }${bar.thin ? ' · thin' : ''}`;
          return (
            <button
              key={bar.code}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={on}
              onClick={() => onTopic(on ? 'all' : bar.code)}
              className="group flex h-full min-w-0 cursor-pointer flex-col items-stretch justify-end gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span
                className="flex h-[52px] flex-col-reverse overflow-hidden"
                style={bar.thin ? { boxShadow: 'inset 0 -1.5px 0 var(--warn-ink)' } : { boxShadow: 'inset 0 -1px 0 var(--line)' }}
              >
                {bar.byType.map((part, index) => (
                  <span
                    key={part.typeId}
                    className={`block shrink-0 transition-[height,opacity] duration-200 ease-out-soft group-hover:opacity-85 ${
                      index === 0 ? 'bg-accent' : 'bg-accent/35'
                    }`}
                    style={{ height: `${(part.count / scale) * 52}px` }}
                  />
                ))}
              </span>
              <span
                className={`text-center text-[10.5px] leading-none tabular-nums ${
                  on ? 'font-bold text-accent-ink' : 'text-ink-muted group-hover:text-ink'
                }`}
              >
                {bar.code}
              </span>
            </button>
          );
        })}
        {noTags && (
          <button
            type="button"
            title={`${untagged} untagged question${untagged === 1 ? '' : 's'}`}
            onClick={() => onTopic('untagged')}
            className="group flex h-full min-w-0 cursor-pointer flex-col items-stretch justify-end gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="block h-[52px] bg-ink-subtle/35" />
            <span className="text-center text-[10.5px] leading-none text-ink-muted">Untagged</span>
          </button>
        )}
      </div>
      <div className="-ml-3 flex w-[112px] shrink-0 flex-col gap-1 self-start text-[11px] text-ink-muted">
        {typeIds.map((typeId, index) => (
          <span key={typeId} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-[2px] ${index === 0 ? 'bg-accent' : 'bg-accent/35'}`} />
            {typeName(typeId)}
          </span>
        ))}
        {noTags ? (
          <button
            type="button"
            onClick={() => onTopic('untagged')}
            className="mt-0.5 cursor-pointer text-left font-semibold text-warn-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Tag your questions
          </button>
        ) : (
          untagged > 0 && (
            <button
              type="button"
              onClick={() => onTopic('untagged')}
              className="mt-0.5 cursor-pointer text-left font-semibold tabular-nums text-warn-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {untagged} untagged → Tag
            </button>
          )
        )}
      </div>
    </div>
  );
}
