'use client';

import { Button } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import type { TERMS_MESSAGES } from './messages';
import type { ImportItem, ImportPreview } from './termsImport';

type M = Messages<typeof TERMS_MESSAGES>;

function reason(m: M, item: ImportItem): string {
  switch (item.reason) {
    case 'noChinese':
      return m.reasonNoChinese;
    case 'badChosen':
      return m.reasonBadChosen;
    case 'namesEdb':
      return m.reasonNamesEdb(item.detail ?? '');
    case 'repeat':
      return m.reasonRepeat(item.detail ?? '');
    default:
      return m.reasonNoEnglish;
  }
}

const TONE: Record<Exclude<ImportItem['kind'], 'same'>, string> = {
  add: 'bg-ok-soft text-ok',
  conflict: 'bg-warn-soft text-warn-ink',
  invalid: 'bg-danger-soft text-danger-ink',
};

/** What a CSV would do, before anything changes: new, different and unusable rows; Merge or Replace. */
export function ImportPanel({
  m,
  name,
  preview,
  onApply,
  onCancel,
}: {
  m: M;
  name: string;
  preview: ImportPreview;
  onApply: (mode: 'merge' | 'replace') => void;
  onCancel: () => void;
}) {
  const { add, same, conflict, invalid } = preview.counts;
  const shown = preview.items.filter((i) => i.kind !== 'same');
  const label = { add: m.importAdd, conflict: m.importConflict, invalid: m.importInvalid };
  const usable = add + conflict + same > 0;
  return (
    <section data-import-preview aria-label={m.importTitle(name)} className="mt-2 rounded-xl border border-line bg-surface-raised p-3">
      <p className="text-[12px] font-medium text-ink">{m.importTitle(name)}</p>
      <p className="mt-0.5 text-[12px] text-ink-muted">{m.importCounts(add, same, conflict, invalid)}</p>
      {shown.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
          {shown.map((item) => (
            <li key={item.line} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${TONE[item.kind as keyof typeof TONE]}`}>
                {label[item.kind as keyof typeof label]}
              </span>
              <span className="text-ink-subtle tabular-nums">{m.importLine(item.line)}</span>
              {item.english && <span className="text-ink">{item.english}</span>}
              {item.kind === 'invalid' ? (
                <span className="text-ink-muted">{reason(m, item)}</span>
              ) : (
                <span lang="zh-HK" className="text-ink-muted">
                  {item.term ? item.term.zh.join(' / ') : [...(item.own ?? []), ...(item.chosen && !item.own?.includes(item.chosen) ? [item.chosen] : [])].join(' / ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-40">
          <Button size="sm" variant="primary" disabled={!usable} onClick={() => onApply('merge')}>
            {m.merge}
          </Button>
          <p className="mt-1 text-[11px] text-ink-muted">{m.mergeHint}</p>
        </div>
        <div className="min-w-0 flex-1 basis-40">
          <Button size="sm" disabled={!usable} onClick={() => onApply('replace')}>
            {m.replace}
          </Button>
          <p className="mt-1 text-[11px] text-ink-muted">{m.replaceHint}</p>
        </div>
        <Button size="sm" variant="subtle" onClick={onCancel}>
          {m.cancel}
        </Button>
      </div>
    </section>
  );
}
