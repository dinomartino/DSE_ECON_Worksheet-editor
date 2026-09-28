import type { TermCheck } from '@/glossary/types';
import { plain } from '@/model/text';
import type { TermRow } from '@/translate/types';
import { Button, Eyebrow } from '@/components/ui';
import { Collapsible } from '@/components/ui/Collapsible';
import * as copy from './copy';
import { RichRuns } from './RichRuns';
import { Attribution, ModeSwitch } from './SetupPanel';
import type { TranslateController } from './translateController';
import {
  acceptedTermFixes,
  isTermTicked,
  termBucket,
  termKey,
  type TermBucket,
  type TranslateSession,
} from './translateSession';

export interface TermItem { row: TermRow; index: number; check: TermCheck }

export function termItems(rows: readonly TermRow[]): Record<TermBucket, TermItem[]> {
  const out: Record<TermBucket, TermItem[]> = { fix: [], lower: [], manual: [] };
  for (const row of rows) row.checks.forEach((check, index) => out[termBucket(check)].push({ row, index, check }));
  return out;
}

/** The Chinese with one fix applied (plain-text offsets), for the "→" preview. */
export function fixedPreview(row: TermRow, check: TermCheck): string {
  const text = plain(row.zh);
  if (!check.fix) return text;
  return text.slice(0, check.fix.start) + check.fix.to + text.slice(check.fix.end);
}

const isVariant = (check: TermItem['check']): boolean => check.fix?.kind === 'deny' && check.fix.denyKind === 'variant';

function FixList({
  session,
  items,
  actions,
}: {
  session: TranslateSession;
  items: TermItem[];
  actions: TranslateController;
}) {
  const groups = new Map<string, TermItem[]>();
  for (const item of items) {
    const label = item.row.slot?.group?.label ?? '';
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return (
    <>
      {[...groups].map(([label, group]) => (
        <section key={label}>
          {label && <Eyebrow className="block pb-1">{label}</Eyebrow>}
          <ul className="divide-y divide-line">
            {group.map(({ row, index, check }) => (
              <li key={termKey(row.path, index)}>
                <label className="flex cursor-pointer gap-3 rounded-md py-2 transition-colors duration-150 ease-out-soft hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={isTermTicked(session, row, index)}
                    onChange={(event) => actions.toggleTerm(termKey(row.path, index), event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="line-clamp-2 block text-xs text-ink-muted">
                      <RichRuns runs={row.en} lang="en" />
                    </span>
                    <span className="block text-[13px] text-ink">
                      <RichRuns runs={row.zh} lang="zh-HK" />
                    </span>
                    <span className="block text-[11px] text-ink-muted" lang="zh-HK">
                      {check.en} — EDB: {check.expected}
                      <span className="text-ok"> → {fixedPreview(row, check)}</span>
                    </span>
                    {isVariant(check) && (
                      <span className="block text-[11px] text-ink-muted">{copy.variantNote(check.fix?.to ?? check.expected)}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function CheckTermsFooter({
  session,
  rows,
  actions,
}: {
  session: TranslateSession;
  rows: readonly TermRow[] | null;
  actions: TranslateController;
}) {
  let n = 0;
  for (const indices of acceptedTermFixes(session, rows ?? []).values()) n += indices.size;
  return (
    <>
      <Attribution short />
      <Button onClick={actions.close}>{copy.CLOSE}</Button>
      {rows && rows.length > 0 && (
        <Button variant="primary" disabled={n === 0} onClick={() => actions.replaceTerms(rows)}>
          {copy.replaceButton(n)}
        </Button>
      )}
    </>
  );
}

const heading = (row: TermRow): string =>
  [row.slot?.group?.label, row.slot?.label].filter(Boolean).join(' · ');

/** Lower-rank fixes: collapsed and unticked by default. Exported for the dock guard. */
export function LowerRankList({
  session,
  items,
  actions,
}: {
  session: TranslateSession;
  items: TermItem[];
  actions: TranslateController;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map(({ row, index, check }) => (
        <li key={termKey(row.path, index)} className="flex items-center gap-3 text-xs text-ink">
          <span className="min-w-0 flex-1" lang="zh-HK">
            {copy.lowerRankLine(check.en, check.found?.text ?? '', check.expected)}
          </span>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-ink-muted">
            <input
              type="checkbox"
              checked={isTermTicked(session, row, index)}
              onChange={(event) => actions.toggleTerm(termKey(row.path, index), event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
            />
            <span lang="zh-HK">{copy.usePreferred(check.fix?.to ?? check.expected)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Findings with nothing to replace automatically: Show on page, or where they are. */
export function ManualList({ items, actions }: { items: TermItem[]; actions: TranslateController }) {
  return (
    <ul className="space-y-1.5">
      {items.map(({ row, index, check }) => (
        <li key={termKey(row.path, index)} className="flex items-center gap-3 text-xs">
          <span className="min-w-0 flex-1 text-ink" lang="zh-HK">
            {check.en}
            {check.found && ` → ${check.found.text}`} — EDB: {check.expected}
            {check.conflict && (
              <span className="block text-[11px] text-warn-ink">
                {copy.conflictChip(check.conflict.form, check.conflict.meansEn)}
              </span>
            )}
          </span>
          {row.slot?.target ? (
            <Button size="sm" variant="subtle" onClick={() => actions.showOnPage(row.slot)}>
              {copy.SHOW_ON_PAGE}
            </Button>
          ) : (
            <span className="shrink-0 text-ink-muted">{heading(row)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Check terms (keyless): the Chinese against the EDB glossary. Deterministic fixes are
 * checkboxes; nothing here is editable. Wrong forms are pre-ticked, variants and lower
 * ranks are not.
 */
export function CheckTermsPanel({
  session,
  rows,
  glossaryFailed,
  actions,
}: {
  session: TranslateSession;
  /** null while the glossary loads. */
  rows: readonly TermRow[] | null;
  glossaryFailed: boolean;
  actions: TranslateController;
}) {
  const items = rows ? termItems(rows) : null;
  return (
    <div className="space-y-4">
      <ModeSwitch mode={session.mode} onChange={actions.setMode} />
      {session.nothingInserted && <p className="text-[13px] text-warn-ink">{copy.NOTHING_REPLACED}</p>}
      {glossaryFailed ? (
        <p className="text-[13px] text-ink-muted">{copy.TERMS_UNAVAILABLE}</p>
      ) : !items ? (
        <p className="text-[13px] text-ink-muted">{copy.GLOSSARY_LOADING}</p>
      ) : rows!.length === 0 ? (
        <p className="text-[13px] text-ink">{copy.NO_TERM_FINDINGS}</p>
      ) : (
        <>
          <p className="text-xs text-ink-muted">
            {copy.checkSummary(
              items.fix.filter((item) => !isVariant(item.check)).length,
              items.fix.filter((item) => isVariant(item.check)).length,
              items.lower.length,
              items.manual.length,
            )}
          </p>
          <FixList session={session} items={items.fix} actions={actions} />
          {items.lower.length > 0 && (
            <div className="-mx-3">
              <Collapsible title={`${copy.LOWER_RANK_GROUP} (${items.lower.length})`}>
                <LowerRankList session={session} items={items.lower} actions={actions} />
              </Collapsible>
            </div>
          )}
          {items.manual.length > 0 && (
            <div className="-mx-3">
              <Collapsible title={`${copy.MANUAL_GROUP} (${items.manual.length})`}>
                <ManualList items={items.manual} actions={actions} />
              </Collapsible>
            </div>
          )}
        </>
      )}
    </div>
  );
}
