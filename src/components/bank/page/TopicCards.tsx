'use client';

import { topicOf } from '@/model/topics';
import { typeName, type Coverage } from './bankPage';
import type { ClassUsage } from './bankScreen';

/** Split-bar fills by registry position: the first type solid, the rest lighter steps of the accent. */
export const SPLIT_FILL = ['bg-accent', 'bg-split-2', 'bg-split-2/50'];

/**
 * Level 1 of the bank: a card per topic (A to J, EL1, EL2) with its count and a thin
 * split by question type, so coverage reads at a glance and one click opens the topic.
 * Untagged work comes first as the one amber strip.
 */
export function TopicCards({
  coverage,
  classUsage,
  onTopic,
  onUntagged,
  onAll,
  onClassGap,
}: {
  coverage: Coverage;
  classUsage?: ClassUsage;
  onTopic: (code: string) => void;
  onUntagged: () => void;
  onAll: () => void;
  onClassGap: (choice: ClassUsage['choice']) => void;
}) {
  const { bars, untagged, total } = coverage;
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {untagged > 0 && (
          <button
            type="button"
            onClick={onUntagged}
            className="cursor-pointer rounded-lg bg-warn-soft px-3.5 py-2.5 text-left text-[13px] font-semibold tabular-nums text-warn-ink transition-[filter] duration-150 ease-out-soft hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {untagged} {untagged === 1 ? 'question has' : 'questions have'} no topic
            <span className="font-normal"> · Tag {untagged === 1 ? 'it' : 'them'} now →</span>
          </button>
        )}
        {classUsage && (
          <button
            type="button"
            onClick={() => onClassGap(classUsage.choice)}
            title={`Show the questions ${classUsage.choice.label} has not used${classUsage.choice.detail ? ` (${classUsage.choice.detail})` : ''}`}
            className="cursor-pointer rounded-lg bg-surface-sunken px-3.5 py-2.5 text-left text-[13px] tabular-nums text-ink-muted transition-colors duration-150 ease-out-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {classUsage.label} has used {classUsage.used} of {classUsage.total} questions
          </button>
        )}
        <button
          type="button"
          onClick={onAll}
          className="ml-auto cursor-pointer rounded-md px-1 py-1 text-[13px] font-medium tabular-nums text-accent-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          All {total} {total === 1 ? 'question' : 'questions'} →
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-label="Topics">
        {bars.map((bar) => {
          const topic = topicOf(bar.code);
          const split = bar.byType.filter((part) => part.count > 0);
          const splitTitle = split.map((part) => `${part.count} ${typeName(part.typeId)}`).join(', ');
          return (
            <li key={bar.code} className="flex">
              <button
                type="button"
                onClick={() => onTopic(bar.code)}
                className="group flex w-full cursor-pointer flex-col gap-2 rounded-[10px] border border-line bg-surface-raised px-4 pb-3 pt-3.5 text-left shadow-[0_1px_0_var(--line)] transition-colors duration-150 ease-out-soft hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex items-baseline gap-2.5">
                  <span className="font-display min-w-[34px] shrink-0 text-[26px] leading-none text-ink">{bar.code}</span>
                  <span className="grid min-w-0 text-[13px] leading-[1.25] text-ink">
                    <span className="group-hover:text-accent-ink">{topic?.en}</span>
                    <small className="text-[12px] text-ink-subtle">{topic?.zh}</small>
                  </span>
                </span>
                <span className="mt-auto text-[13px] font-semibold tabular-nums text-ink">
                  {bar.total} <span className="font-normal text-ink-subtle">{bar.total === 1 ? 'question' : 'questions'}</span>
                </span>
                <span
                  className="flex h-[5px] overflow-hidden rounded-[3px] bg-surface-sunken"
                  title={splitTitle || undefined}
                  aria-label={splitTitle || 'No questions'}
                  role="img"
                >
                  {bar.total > 0 &&
                    bar.byType.map((part, index) =>
                      part.count > 0 ? (
                        <i
                          key={part.typeId}
                          className={`block ${SPLIT_FILL[Math.min(index, SPLIT_FILL.length - 1)]}`}
                          style={{ width: `${(part.count / sumOf(bar.byType)) * 100}%` }}
                        />
                      ) : null,
                    )}
                </span>
                {/* Amber for a thin topic only. An empty one is said by its count: early on
                    most topics are empty, and twelve amber lines would bury the one strip
                    that needs doing. */}
                {bar.total > 0 && bar.thin && (
                  <span className="text-[12px] tabular-nums text-warn-ink">Only {bar.total}. Worth adding more</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function sumOf(parts: readonly { count: number }[]): number {
  return parts.reduce((sum, part) => sum + part.count, 0) || 1;
}
