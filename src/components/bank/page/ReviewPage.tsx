'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Segmented } from '@/components/ui';
import { marksLabel, sourceLabel, typeLabel, sittingLabel, usedLabel } from '@/components/bank/BankRow';
import { refsOf, usedWith as usedWithTargets } from '@/library/history';
import { anySameStudents } from '@/library/cohort';
import type { BankGroup, BankRow } from '@/library/types';
import { isNewerThanBuild } from '@/model/migrations';
import { isPatternTag } from '@/model/patterns';
import { topicLabel, topicOf } from '@/model/topics';
import type { LanguageMode, VersionMode } from '@/model/types';
import { distinctVersions, patternLines, rowKey, type ClassChoice } from './bankPage';
import type { RailSection } from './bankScreen';
import { PaperPreview, SHEET_MAX_WIDTH } from './PaperPreview';
import { useOwningDocument } from './useOwningDocument';

export interface ReviewState {
  sections: RailSection[];
  /** The rail's groups in reading order (`railOrder`). */
  order: BankGroup[];
  /** The row on the stage (any copy of a group in `order`). */
  focused: BankRow | undefined;
  /** Its position in `order`. */
  index: number;
  picked: ReadonlySet<string>;
  railHidden: boolean;
  language: LanguageMode;
  version: VersionMode;
  /** The Filter's "not used with" students: their uses read amber. */
  usedWith?: ClassChoice;
}

/**
 * Level 2: one topic (or search results, or every question) as a review page. The list is
 * a rail of sub-topic sections on the sunken tone; the stage shows the focused question
 * at reading size on the desk tone, facts and actions under it, never beside it.
 */
export function ReviewPage({
  state,
  fullGroup,
  empty,
  onFocus,
  onStep,
  onPick,
  onRailHidden,
  onLanguage,
  onVersion,
  onEditTopics,
  onOpen,
}: {
  state: ReviewState;
  /** The focused question across the whole bank: versions and uses are never filtered. */
  fullGroup: BankGroup | undefined;
  /** Shown instead of the stage when the list is empty. */
  empty: ReactNode;
  onFocus: (row: BankRow) => void;
  onStep: (delta: number) => void;
  onPick: (row: BankRow) => void;
  onRailHidden: (hidden: boolean) => void;
  onLanguage: (language: LanguageMode) => void;
  onVersion: (version: VersionMode) => void;
  /** Offered only once the owning document has loaded and this build may write it. */
  onEditTopics?: (row: BankRow) => void;
  onOpen: (row: BankRow) => void;
}) {
  const { order, focused, railHidden } = state;
  return (
    <div
      className={`grid min-h-0 flex-1 ${railHidden ? 'grid-cols-[52px_minmax(0,1fr)]' : 'grid-cols-[300px_minmax(0,1fr)]'}`}
    >
      {railHidden ? (
        <NumberStrip state={state} onFocus={onFocus} onShow={() => onRailHidden(false)} />
      ) : (
        <Rail state={state} onFocus={onFocus} onPick={onPick} onHide={() => onRailHidden(true)} />
      )}
      {order.length === 0 || !focused ? (
        <div className="flex min-h-0 items-start justify-center overflow-y-auto bg-surface px-8 py-16">
          <div className="max-w-md text-[13px] leading-relaxed text-ink-muted">{empty}</div>
        </div>
      ) : (
        <Stage
          state={state}
          row={focused}
          fullGroup={fullGroup}
          onStep={onStep}
          onFocus={onFocus}
          onLanguage={onLanguage}
          onVersion={onVersion}
          onEditTopics={onEditTopics}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------ */
/* The rail                                                                             */
/* ------------------------------------------------------------------------------------ */

function Rail({
  state,
  onFocus,
  onPick,
  onHide,
}: {
  state: ReviewState;
  onFocus: (row: BankRow) => void;
  onPick: (row: BankRow) => void;
  onHide: () => void;
}) {
  const { sections, order, focused, picked, usedWith } = state;
  const listRef = useRef<HTMLDivElement>(null);
  const focusedRoot = focused?.rootId;

  // Keep the focused row in view as ↑ ↓ move it.
  useEffect(() => {
    if (!focusedRoot) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-rail-root="${CSS.escape(focusedRoot)}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [focusedRoot]);

  const pickedHere = order.filter((group) => picked.has(rowKey(group.rows[0]))).length;
  return (
    <aside aria-label="Questions" className="flex min-h-0 flex-col border-r border-line bg-surface-sunken">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 text-[12px] tabular-nums text-ink-muted">
        <span className="truncate">
          {order.length} {order.length === 1 ? 'question' : 'questions'}
          {picked.size > 0 && ` · ${pickedHere === picked.size ? picked.size : `${pickedHere} of ${picked.size}`} selected`}
        </span>
        <button
          type="button"
          onClick={onHide}
          className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ‹ Hide list
        </button>
      </div>
      <div ref={listRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-3" role="list">
        {sections.map((section) => (
          <section key={section.key} aria-label={section.label}>
            <h3 className="sticky top-0 z-[1] flex justify-between gap-2 bg-surface-sunken px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              <span className="truncate" title={section.label}>
                {section.label}
              </span>
              <span className="tabular-nums">{section.groups.length}</span>
            </h3>
            {(section.parts ?? [{ key: '', label: '', groups: section.groups }]).map((part) => (
              <div key={part.key} data-rail-part={part.key || undefined}>
                {part.key && (
                  <h4
                    className={`flex justify-between gap-2 px-3.5 pb-0.5 pt-1.5 text-[11.5px] ${part.pattern ? 'font-medium text-ink-muted' : 'text-ink-subtle'}`}
                    title={part.pattern ? `${part.label} · ${part.kind} 題型` : undefined}
                  >
                    <span className="min-w-0 truncate">
                      {part.label}
                      {part.kind && <span className="ml-1.5 text-[10.5px] font-normal text-ink-subtle">{part.kind}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-subtle">{part.groups.length}</span>
                  </h4>
                )}
                {part.groups.map((group) => {
                  const lead = group.rows[0];
                  const on = focusedRoot === group.rootId;
                  const used = usedWith ? usedWithTargets(group, [usedWith.target]) : undefined;
                  return (
                    <div
                      key={group.rootId}
                      role="listitem"
                      data-rail-root={group.rootId}
                      onClick={() => onFocus(lead)}
                      className={`relative grid cursor-pointer grid-cols-[16px_minmax(0,1fr)] gap-2 px-3.5 py-[7px] transition-colors duration-100 ${
                        on ? 'bg-surface' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 bg-accent ${on ? 'opacity-100' : 'opacity-0'}`} />
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        aria-label={`Select “${lead.excerpt.en || lead.excerpt.zh || 'question'}”`}
                        checked={picked.has(rowKey(lead))}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => onPick(lead)}
                        className="mt-[3px] h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                      />
                      <div className="min-w-0">
                        <p className={`truncate text-[13px] leading-[1.4] ${on ? 'text-ink' : 'text-ink'}`} title={lead.excerpt.en || lead.excerpt.zh}>
                          {lead.excerpt.en || lead.excerpt.zh || <span className="text-ink-subtle">Untitled question</span>}
                        </p>
                        <p className="truncate text-[11px] tabular-nums text-ink-subtle">
                          {typeLabel(lead.typeId)} · {marksLabel(lead.marks)}
                          {lead.hasDiagram && ' · diagram'}
                          {used && <span className="text-warn-ink"> · {usedLabel(used)}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

/** The rail folded: question numbers only, the focused one marked, picks dotted. */
function NumberStrip({ state, onFocus, onShow }: { state: ReviewState; onFocus: (row: BankRow) => void; onShow: () => void }) {
  const { order, focused, picked } = state;
  const listRef = useRef<HTMLDivElement>(null);
  const focusedRoot = focused?.rootId;
  useEffect(() => {
    if (!focusedRoot) return;
    listRef.current?.querySelector<HTMLElement>(`[data-rail-root="${CSS.escape(focusedRoot)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedRoot]);
  return (
    <aside aria-label="Questions" className="flex min-h-0 flex-col border-r border-line bg-surface-sunken">
      <button
        type="button"
        onClick={onShow}
        title="Show list"
        aria-label="Show list"
        className="shrink-0 cursor-pointer border-b border-line py-2.5 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        ›
      </button>
      <div ref={listRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto py-1.5">
        {order.map((group, index) => {
          const on = group.rootId === focusedRoot;
          const lead = group.rows[0];
          return (
            <button
              key={group.rootId}
              type="button"
              data-rail-root={group.rootId}
              onClick={() => onFocus(lead)}
              title={lead.excerpt.en || lead.excerpt.zh}
              className={`relative flex w-full cursor-pointer items-center justify-center gap-1 py-1.5 text-[12px] tabular-nums transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                on ? 'bg-surface font-semibold text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 bg-accent ${on ? 'opacity-100' : 'opacity-0'}`} />
              {index + 1}
              {picked.has(rowKey(lead)) && <span aria-label="selected" className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------------------ */
/* The stage                                                                            */
/* ------------------------------------------------------------------------------------ */

function Stage({
  state,
  row,
  fullGroup,
  onStep,
  onFocus,
  onLanguage,
  onVersion,
  onEditTopics,
  onOpen,
}: {
  state: ReviewState;
  row: BankRow;
  fullGroup: BankGroup | undefined;
  onStep: (delta: number) => void;
  onFocus: (row: BankRow) => void;
  onLanguage: (language: LanguageMode) => void;
  onVersion: (version: VersionMode) => void;
  onEditTopics?: (row: BankRow) => void;
  onOpen: (row: BankRow) => void;
}) {
  const { order, index, language, version, usedWith } = state;
  const { worksheet, failed } = useOwningDocument(row);
  const topicTags = row.tags.filter((tag) => !isPatternTag(tag));
  const patterns = patternLines(row.tags);
  const shown = shownLanguage(row, language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = rowKey(row);
  // A new question starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [key]);

  return (
    <section aria-label="Question" className="flex min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-4 whitespace-nowrap border-b border-line px-[22px] py-1">
        <span className="text-[13px] tabular-nums text-ink-muted" aria-live="polite">
          Question <b className="font-semibold text-ink">{index + 1}</b> of {order.length}
        </span>
        <Segmented<LanguageMode>
          label="Preview language"
          value={language}
          onChange={onLanguage}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'zh', label: '中文' },
            { value: 'bilingual', label: 'EN+中' },
          ]}
        />
        <Segmented<VersionMode>
          label="Preview version"
          value={version}
          onChange={onVersion}
          options={[
            { value: 'student', label: 'Student' },
            { value: 'teacher', label: 'Teacher' },
          ]}
        />
        <span className="flex-1" />
        <span className="hidden text-[12px] text-ink-subtle xl:inline">↑ ↓ to move · Space to select · O to open in worksheet</span>
      </div>

      {/* The stage is the one place the desk tone appears: the paper sits on it, and the
          facts under the paper share it. Lists stay on the light surfaces. */}
      <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-[var(--chrome-sunken)]">
        <div className="px-4 pt-[22px]">
          <div className="mx-auto flex items-start justify-center gap-3" style={{ maxWidth: SHEET_MAX_WIDTH + 2 * 46 }}>
            <NavButton label="Previous question" disabled={index <= 0} onClick={() => onStep(-1)}>
              ‹
            </NavButton>
            <div className="min-w-0 flex-1" style={{ maxWidth: SHEET_MAX_WIDTH }}>
              <PaperPreview worksheet={worksheet} questionId={row.questionId} language={shown} version={version} failed={failed} />
              {shown !== language && (
                <p className="mt-2 text-center text-[12px] text-ink-muted">
                  {language === 'zh' ? 'No 中文 text yet. Showing English.' : language === 'en' ? 'No English text yet. Showing 中文.' : 'One language only. Showing what there is.'}
                </p>
              )}
            </div>
            <NavButton label="Next question" disabled={index >= order.length - 1} onClick={() => onStep(1)}>
              ›
            </NavButton>
          </div>
        </div>

        <div className="mx-auto grid grid-cols-1 gap-x-6 gap-y-4 px-[22px] pb-8 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" style={{ maxWidth: SHEET_MAX_WIDTH + 44 }}>
          <Facts>
            <dt className="text-ink-subtle">Topics</dt>
            <dd className="min-w-0">
              {topicTags.length === 0 ? (
                <span className="text-ink-subtle">None yet</span>
              ) : (
                <span title={topicTags.map((tag) => (topicOf(tag) ? `${tag} ${topicLabel(tag, 'en')}` : tag)).join('\n')}>
                  {topicTags.join(' · ')}
                </span>
              )}
              {onEditTopics && worksheet && !isNewerThanBuild(worksheet) && (
                <button
                  type="button"
                  onClick={() => onEditTopics(row)}
                  className="ml-2 cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {row.tags.length === 0 ? 'Add' : 'Edit'}
                </button>
              )}
            </dd>
            {patterns.length > 0 && (
              <>
                <dt className="text-ink-subtle">題型</dt>
                <dd className="min-w-0" data-fact-patterns>
                  {patterns.map((ref, i) => (
                    <span key={`${ref.topic} ${ref.name}`} title={`${ref.topic} · ${ref.name}`}>
                      {i > 0 && ' · '}
                      {ref.name}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-ink-subtle">Lives in</dt>
            <dd className="min-w-0 truncate" title={sourceLabel(row)}>
              {sourceLabel(row)}
              {row.docKind === 'bank' && <span className="text-ink-subtle"> · bank</span>}
            </dd>
          </Facts>
          <Facts>
            <dt className="text-ink-subtle">Used in</dt>
            <dd className="min-w-0">
              <UsedIn group={fullGroup} usedWith={usedWith} />
            </dd>
            <dt className="text-ink-subtle">Versions</dt>
            <dd className="min-w-0">
              <Versions group={fullGroup} row={row} onFocus={onFocus} />
            </dd>
          </Facts>
          <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
            <Button size="sm" onClick={() => onOpen(row)} title="Open this question in its worksheet (O)">
              Open in worksheet
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-[70px_minmax(0,1fr)] content-start gap-x-2.5 gap-y-1 text-[12.5px] tabular-nums text-ink">{children}</dl>;
}

/**
 * Each paper holding a copy: who sat it and when, then the paper and question number on
 * their own line (up to two lines, so a long title stays readable in the narrow column).
 * A draft names no class.
 */
function UsedIn({ group, usedWith }: { group: BankGroup | undefined; usedWith?: ClassChoice }) {
  const uses = group?.usedIn ?? [];
  if (uses.length === 0) return <span className="text-ink-subtle">No paper yet</span>;
  return (
    <ul className="space-y-1">
      {uses.slice(0, 3).map((use) => {
        const amber = usedWith && anySameStudents(refsOf(use), [usedWith.target]);
        const where = `${use.docTitle}${use.number !== undefined ? ` · Q${use.number}` : ''}`;
        return (
          <li key={use.docId} className={amber ? 'text-warn-ink' : ''} title={`${sittingLabel(use)} · ${where}`} data-used-in>
            <span className={`block truncate ${amber ? '' : use.classes?.length ? 'text-ink' : 'text-ink-subtle'}`}>{sittingLabel(use)}</span>
            <span className={`line-clamp-2 break-words leading-snug ${amber ? '' : 'text-ink-muted'}`}>{where}</span>
          </li>
        );
      })}
      {uses.length > 3 && <li className="text-ink-subtle">and {uses.length - 3} more</li>}
    </ul>
  );
}

/** The count, and (when edited copies differ) each version as a line that previews it. */
function Versions({ group, row, onFocus }: { group: BankGroup | undefined; row: BankRow; onFocus: (row: BankRow) => void }) {
  if (!group || group.versions <= 1) return <span>1</span>;
  const versions = distinctVersions(group);
  return (
    <span className="grid">
      <span>{group.versions}</span>
      {versions.map((version) => {
        const on = version.contentKey === row.contentKey;
        return (
          <button
            key={rowKey(version)}
            type="button"
            onClick={() => onFocus(version)}
            disabled={on}
            className="cursor-pointer truncate text-left text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:text-ink disabled:no-underline"
          >
            {sourceLabel(version)}
            {on && <span className="text-ink-subtle"> · showing</span>}
          </button>
        );
      })}
    </span>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="sticky top-[140px] mt-[60px] grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-surface text-[15px] leading-none text-ink transition-[background-color,opacity] duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** The language drawn: the one asked for when the question has it, else what it has. */
export function shownLanguage(row: Pick<BankRow, 'languages'>, language: LanguageMode): LanguageMode {
  const hasEn = row.languages.includes('en');
  const hasZh = row.languages.includes('zh');
  if (language === 'bilingual') return hasEn && hasZh ? 'bilingual' : hasZh ? 'zh' : 'en';
  if (language === 'zh') return hasZh || !hasEn ? 'zh' : 'en';
  return hasEn || !hasZh ? 'en' : 'zh';
}
