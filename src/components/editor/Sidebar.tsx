'use client';

import { useEffect, useRef, useState } from 'react';
import { computeNumbering } from '@/model/numbering';
import { useWorksheetStore } from '@/store/worksheetStore';
import { BankTab } from '@/components/bank/BankTab';
import { useBankSession } from '@/components/bank/bankSession';
import { Inspector } from './Inspector';
import { AnswerKeyLayoutPanel } from './AnswerKeyLayoutPanel';
import { ANSWER_KEY_LAYOUT_MESSAGES } from './AnswerKeyLayoutPanel.messages';
import type { PageComposition } from '@/components/preview/pagination';
import { Outline } from './Outline';
import { useMessages } from '@/i18n/language';
import { ViewLanguageProvider } from '@/settings/paperLanguage';
import { SIDEBAR_MESSAGES } from './shell.messages';
import { LAYOUT_KIND_MESSAGES } from './layoutKind.messages';

/**
 * The right sidebar: one panel, one thing at a time. **Content** is the outline,
 * **Edit** is the selection; each gets the full column height. Once-per-document
 * settings live in `DocumentSettings`. The tab follows the selection — selecting a
 * question *is* the request to edit it; closing the editor returns to Content.
 * **題庫 Bank** is sticky: while it is open a selection only moves the insert anchor;
 * leaving is a click on Content or Edit.
 *
 * In the Marking scheme view the third tab is **Layout 版面** instead of the bank (nothing
 * is inserted into a key): the key's style and switches. A tab of its own, not Edit's
 * empty state, because a click on the key selects a question and Edit must then show
 * that question's answers and scheme; layout stays one click away. Entering the view
 * opens it; leaving returns to Content.
 */

type Tab = 'content' | 'edit' | 'bank' | 'layout';

export function Sidebar({
  pages,
  onOpenSettings,
}: {
  /**
   * How the flow landed on sheets, from the paginator. Passed through rather than read
   * from the store because a page is *measured*, not modelled — it is transient view
   * state, and putting it in the undo-tracked document would make repagination an edit.
   */
  pages: PageComposition[];
  onOpenSettings: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const language = useWorksheetStore((s) => s.mode.language);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const selectedElementId = useWorksheetStore((s) => s.selectedElementId);
  const numbering = computeNumbering(worksheet);
  const m = useMessages(SIDEBAR_MESSAGES);
  const kinds = useMessages(LAYOUT_KIND_MESSAGES);

  const keyView = useWorksheetStore((s) => s.documentView === 'answerKey');
  const lm = useMessages(ANSWER_KEY_LAYOUT_MESSAGES);
  const [tab, setTab] = useState<Tab>(keyView ? 'layout' : 'content');
  const tabOrder: readonly Tab[] = ['content', 'edit', keyView ? 'layout' : 'bank'];

  // The view's own tab follows the view: opened on entering it, closed on leaving.
  const lastKeyView = useRef(keyView);
  useEffect(() => {
    if (keyView === lastKeyView.current) return;
    lastKeyView.current = keyView;
    setTab((current) => (keyView ? 'layout' : current === 'layout' ? 'content' : current));
  }, [keyView]);

  // Every layout kind has a panel now (§ the sidebar is an inspector), so any
  // selected element pulls the tab over — the panel's contract is learnable only if
  // it never dead-ends: whatever you select, Edit describes it.
  const panelElement = worksheet.layout.find((element) => element.id === selectedElementId);
  const panelElementId = panelElement?.id;

  // Follow the selection. Tracked against the previous id rather than firing on every
  // render, so a user who deliberately clicks back to Content while a question is still
  // selected is not yanked to Edit again on the next keystroke.
  const selectionKey = selectedQuestionId ?? panelElementId;
  const lastSelection = useRef(selectionKey);
  useEffect(() => {
    if (selectionKey === lastSelection.current) return;
    lastSelection.current = selectionKey;
    // The bank tab stays put: a click on the page is where the next insert lands. In the
    // Marking scheme view a cleared selection returns to Layout, the view's resting place.
    setTab((current) =>
      current === 'bank' ? current : selectionKey ? 'edit' : lastKeyView.current ? 'layout' : 'content',
    );
  }, [selectionKey]);

  // "From 題庫…" (the add rail, the empty page): an event, subscribed rather than rendered.
  useEffect(
    () =>
      useBankSession.subscribe((state, previous) => {
        if (state.openRequest !== previous.openRequest && !lastKeyView.current) setTab('bank');
      }),
    [],
  );

  const selected = worksheet.questions.find((question) => question.id === selectedQuestionId);

  const totalQuestions = worksheet.questions.length;

  const editLabel = selected
    ? m.question(String(numbering.byQuestionId.get(selected.id)?.number ?? ''))
    : panelElement
      ? kinds[panelElement.kind]
      : m.edit;

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'content', label: m.content, count: totalQuestions },
    { id: 'edit', label: editLabel },
    keyView ? { id: 'layout', label: lm.tab } : { id: 'bank', label: m.bank },
  ];

  return (
    <aside className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      {/* Two tabs in the toolbar's own dialect: words with a short accent underline
          naming the active one — no icons, no count chip, one control language. The
          underline is one bar that slides between the halves, so the selection travels
          rather than blinking from tab to tab. */}
      <div role="tablist" aria-label={m.sidebar} className="relative flex shrink-0 border-b border-line px-2">
        {tabs.map((entry) => {
          const active = tab === entry.id;
          const dim = entry.id === 'edit' && !selected && !panelElementId;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1 px-3 py-2.5 text-[13px] font-medium transition-[color,opacity] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                active ? 'text-ink' : 'text-ink-muted hover:text-ink'
              } ${dim && !active ? 'opacity-60' : ''}`}
            >
              <span className="truncate">{entry.label}</span>
              {entry.count !== undefined && (
                <span className="text-[11px] tabular-nums text-ink-subtle">{entry.count}</span>
              )}
            </button>
          );
        })}
        {/* One tab's width (the tablist's `px-2` taken off, divided by three), inset like
            the old per-tab bar; each 100% of translation moves it exactly one tab over. */}
        <span
          aria-hidden
          style={{ transform: `translateX(${Math.max(0, tabOrder.indexOf(tab)) * 100}%)` }}
          className="pointer-events-none absolute bottom-0 left-2 w-[calc((100%-1rem)/3)] px-4 transition-transform duration-200 ease-out-soft"
        >
          <span className="block h-0.5 rounded-full bg-accent" />
        </span>
      </div>

      {/* One region, full height. Both panels are mounted-on-demand rather than hidden,
          so the outline's scroll position is not silently preserved against a document
          that changed underneath it while the editor was showing. Keyed by tab so the
          incoming panel fades in. Opacity only: a lingering transform here would become
          the containing block for the fixed popovers and canvases the panels open. */}
      {/* Topic names in the panels follow the document's language (`useViewLanguage`). */}
      <ViewLanguageProvider value={language}>
        <div key={tab} className="flex min-h-0 flex-1 animate-fade-in flex-col">
          {tab === 'content' ? (
            <Outline numbering={numbering} pages={pages} onOpenSettings={onOpenSettings} />
          ) : tab === 'layout' ? (
            <AnswerKeyLayoutPanel />
          ) : tab === 'bank' ? (
            <BankTab />
          ) : (
            <Inspector numbering={numbering} onShowContent={() => setTab('content')} />
          )}
        </div>
      </ViewLanguageProvider>
    </aside>
  );
}
