'use client';

import { topicDisplay } from '@/model/topics';
import { barPx, typeName, type Coverage } from './bankPage';
import { SPLIT_FILL } from './TopicCards';

const FULL = 44;

/**
 * Level 1's coverage strip: a bar per topic (A to J, EL1, EL2), question types stacked in
 * registry order, one scale across topics, and the types' legend. The shape at a glance
 * only: the cards below carry the counts, the untagged strip and the keyboard path, so the
 * strip is decoration for assistive tech and no Tab stop. A click on a bar still opens it.
 */
export function CoverageBar({ coverage, onTopic }: { coverage: Coverage; onTopic: (code: string) => void }) {
  const { bars, max, typeIds } = coverage;
  return (
    <section aria-hidden className="shrink-0 border-b border-line bg-surface px-7 pb-2.5 pt-3">
      <div className="mx-auto flex w-full max-w-[1280px] items-end gap-5">
        <p className="w-16 shrink-0 self-start pt-0.5 text-[12px] font-semibold text-ink">Coverage</p>
        <ul className="grid min-w-0 flex-1 grid-flow-col auto-cols-fr gap-2">
          {bars.map((bar) => {
            const name = topicDisplay(bar.code);
            const parts = bar.byType.filter((part) => part.count > 0);
            const detail = parts.map((part) => `${part.count} ${typeName(part.typeId)}`).join(', ');
            const label = `${bar.code} ${name}, ${bar.total} ${bar.total === 1 ? 'question' : 'questions'}`;
            return (
              <li key={bar.code} className="flex">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onTopic(bar.code)}
                  title={detail ? `${label} (${detail})` : label}
                  className="group flex w-full cursor-pointer flex-col items-center justify-end gap-1 rounded-sm px-0.5"
                >
                  <span
                    className="flex w-full max-w-[34px] flex-col-reverse border-b border-line-strong"
                    style={{ height: FULL }}
                  >
                    {bar.byType.map((part, index) => (
                      <span
                        key={part.typeId}
                        className={`block w-full shrink-0 group-hover:opacity-80 ${SPLIT_FILL[Math.min(index, SPLIT_FILL.length - 1)]}`}
                        style={{ height: barPx(part.count, max, FULL) }}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] leading-none text-ink-muted group-hover:text-accent-ink">{bar.code}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex ml-auto shrink-0 flex-col items-start gap-1.5 self-start pl-2 text-[12px]">
          {typeIds.length > 1 && (
            <p className="flex flex-col gap-0.5 text-ink-subtle">
              {typeIds.map((typeId, index) => (
                <span key={typeId} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-[2px] ${SPLIT_FILL[Math.min(index, SPLIT_FILL.length - 1)]}`} />
                  {typeName(typeId)}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
