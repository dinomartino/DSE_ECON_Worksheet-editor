'use client';

import { useEffect, useMemo, useState } from 'react';
import { SetIcon } from '@/components/ui/icons';
import { useNotices } from '@/components/ui/NoticeLayer';
import { useMessages } from '@/i18n/language';
import { paperSetOf, setRoleOf, withSetName, type SetRole } from '@/model/paperSet';
import { detailDrift, withDetails, type DetailsPatch } from '@/model/setDetails';
import { SetDetailsDialog } from '@/components/start/SetDetailsDialog';
import { SET_DETAILS_MESSAGES } from '@/components/start/SetDetailsDialog.messages';
import { WarningIcon } from '@/components/ui/icons';
import type { Worksheet } from '@/model/types';
import {
  changeSetMembers,
  compareMembers,
  onStoreChange,
  summaryRole,
  summarySet,
  worksheetStore,
  worksheetTitle,
  type WorksheetSummary,
} from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { whileSyncPaused } from '@/sync/syncPause';
import { PAPER_SET_STRIP_MESSAGES } from './PaperSetStrip.messages';

/** One paper in the strip. */
export interface StripPaper {
  id: string;
  title: string;
  role?: SetRole;
  current: boolean;
  /** No question in it yet: a new mock set's placeholder, waiting to be filled in (k-0311). */
  blank: boolean;
}

/**
 * The papers the strip lists: the open paper as the editor holds it (its unsaved name and
 * shape win over its index row), then every other row of the same set, in set order. The
 * newest member's set name heads it, as on the start screen.
 */
export function stripPapers(
  worksheet: Worksheet,
  rows: readonly WorksheetSummary[],
): { name: string; papers: StripPaper[] } | undefined {
  const set = paperSetOf(worksheet);
  if (!set) return undefined;
  const others = rows.filter((row) => row.id !== worksheet.id && summarySet(row)?.id === set.id);
  const self: WorksheetSummary = {
    id: worksheet.id,
    title: worksheetTitle(worksheet),
    updatedAt: worksheet.updatedAt,
    ...(setRoleOf(worksheet) ? { paper: setRoleOf(worksheet) } : {}),
    questionCount: worksheet.questions.length,
  };
  let name = set.name;
  let newest = worksheet.updatedAt ?? '';
  for (const row of others) {
    if ((row.updatedAt ?? '') > newest) {
      newest = row.updatedAt ?? '';
      name = summarySet(row)?.name ?? name;
    }
  }
  const papers = [self, ...others].sort(compareMembers).map((row) => ({
    id: row.id,
    title: row.title,
    ...(summaryRole(row) ? { role: summaryRole(row) } : {}),
    current: row.id === worksheet.id,
    blank: row.questionCount === 0,
  }));
  return { name, papers };
}

/**
 * "S6 Mock 2026-27 · Set · [Paper 1] [Paper 2]": under the toolbar while the open paper is in
 * a set (k-0299), so the teacher can see it is linked, and to what, without going home. A
 * partner opens in place: the open paper's edits are saved first (`openDocument`). Chrome
 * only (`data-print-hide`); one line, so it fits a MacBook or an iPad in landscape, and the
 * chips scroll sideways rather than wrap when a set has many papers.
 */
export function PaperSetStrip({ onOpenDocument }: { onOpenDocument: (worksheet: Worksheet) => void }) {
  const m = useMessages(PAPER_SET_STRIP_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setId = paperSetOf(worksheet)?.id;
  const [rows, setRows] = useState<WorksheetSummary[]>([]);
  const notices = useNotices();

  // The index, read when the set changes and again when another document is written (a
  // partner renamed, trashed, or brought in by sync). The open paper's own autosaves are not
  // a reason to re-read: the strip takes that paper from the editor.
  useEffect(() => {
    if (!setId) return;
    let live = true;
    const read = () =>
      void worksheetStore
        .list()
        .then((list) => {
          if (live) setRows(list);
        })
        .catch(() => undefined);
    read();
    const stop = onStoreChange((change) => {
      if (change.docId !== useWorksheetStore.getState().worksheet.id) read();
    });
    return () => {
      live = false;
      stop();
    };
  }, [setId]);

  const shown = useMemo(() => stripPapers(worksheet, rows), [worksheet, rows]);

  // The other papers themselves, for Set details and its drift check (step B): read when the
  // list of members or any of their rows changes, never on the open paper's own keystrokes.
  const [partners, setPartners] = useState<Worksheet[]>([]);
  const partnerKey = (shown?.papers ?? [])
    .filter((paper) => !paper.current)
    .map((paper) => `${paper.id}@${rows.find((row) => row.id === paper.id)?.updatedAt ?? ''}`)
    .join(',');
  useEffect(() => {
    let live = true;
    const ids = partnerKey ? partnerKey.split(',').map((key) => key.split('@')[0]) : [];
    void Promise.all(ids.map((id) => worksheetStore.load(id).catch(() => undefined))).then((docs) => {
      if (live) setPartners(docs.filter((doc): doc is Worksheet => !!doc));
    });
    return () => {
      live = false;
    };
  }, [partnerKey]);
  const members = useMemo(() => [worksheet, ...partners], [worksheet, partners]);
  const drifting = useMemo(() => partners.length > 0 && detailDrift(members).length > 0, [members, partners]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dm = useMessages(SET_DETAILS_MESSAGES);

  if (!shown) return null;

  /** The open paper through the editor (one undo step); the others saved as they are stored. */
  const applyDetails = async (name: string, patch: DetailsPatch) => {
    setDetailsOpen(false);
    const setIdNow = paperSetOf(worksheet)?.id;
    if (!setIdNow) return;
    const change = (paper: Worksheet) => withSetName(withDetails(paper, patch), setIdNow, name);
    const store = useWorksheetStore.getState();
    const next = change(store.worksheet);
    if (next !== store.worksheet) {
      store.updateWorksheet({ cover: next.cover, satOn: next.satOn, classes: next.classes, paperSet: next.paperSet });
    }
    const result = await whileSyncPaused(() =>
      changeSetMembers(
        worksheetStore,
        partners.map((paper) => paper.id),
        change,
      ),
    ).catch(() => ({ failed: partners.map((paper) => paper.id) }));
    if (result.failed.length > 0) notices.notify({ id: 'paper-set-details', tone: 'error', body: m.detailsFailed(result.failed.length) });
    else notices.notify({ id: 'paper-set-details', tone: 'success', body: dm.applied(partners.length + 1) });
  };

  const open = async (id: string) => {
    try {
      const loaded = await whileSyncPaused(async () => {
        const doc = await worksheetStore.load(id);
        if (doc) onOpenDocument(doc);
        return doc;
      });
      if (!loaded) throw new Error('missing');
    } catch {
      notices.notify({ id: 'paper-set-open', tone: 'error', body: m.couldNotOpen });
    }
  };
  return (
    <>
      <PaperSetBar
        name={shown.name}
        papers={shown.papers}
        onOpen={(id) => void open(id)}
        drifting={drifting}
        onDetails={() => setDetailsOpen(true)}
      />
      {detailsOpen && (
        <SetDetailsDialog
          name={shown.name}
          papers={members}
          onClose={() => setDetailsOpen(false)}
          onApply={(name, patch) => void applyDetails(name, patch)}
        />
      )}
    </>
  );
}

/** The strip itself, with no store of its own, so it can be rendered in a test. */
export function PaperSetBar({
  name: setName,
  papers,
  onOpen,
  drifting = false,
  onDetails,
}: {
  name: string;
  papers: StripPaper[];
  onOpen: (id: string) => void;
  /** The papers disagree on a shared detail (`detailDrift`): the details button says so. */
  drifting?: boolean;
  /** Set details…; absent shows no button. */
  onDetails?: () => void;
}) {
  const m = useMessages(PAPER_SET_STRIP_MESSAGES);
  const dm = useMessages(SET_DETAILS_MESSAGES);
  const roleLabel = (role: SetRole | undefined) =>
    role === 'paper1' ? m.paper1 : role === 'paper2' ? m.paper2 : m.examPaper;
  // A role printed twice (two Paper 1s, after an older build's duplicate) would not tell the
  // chips apart, so then each chip also carries its paper's name.
  const roles = papers.map((paper) => paper.role ?? 'none');
  const ambiguous = new Set(roles.filter((role, index) => roles.indexOf(role) !== index));

  const name = setName.trim() || m.untitledSet;
  return (
    <div
      data-print-hide
      data-paper-set-strip
      className="zone-dark flex min-w-0 items-center gap-2 border-b border-line bg-surface px-4 py-1.5 text-[12px]"
    >
      <span className="shrink-0 text-ink-muted">
        <SetIcon size={15} />
      </span>
      <span className="min-w-0 max-w-[40%] shrink truncate" title={name}>
        <span className="font-semibold text-ink">{name}</span>
        <span className="text-ink-subtle"> · {m.set}</span>
      </span>
      <span aria-hidden className="h-4 w-px shrink-0 bg-line" />
      <nav aria-label={m.papersInSet} className="scroll-slim min-w-0 flex-1 overflow-x-auto">
        <ul className="flex items-center gap-1 whitespace-nowrap">
          {papers.map((paper) => {
            const label = roleLabel(paper.role);
            const withTitle = ambiguous.has(paper.role ?? 'none');
            return (
              <li key={paper.id}>
                {paper.current ? (
                  <span
                    aria-current="page"
                    title={m.thisPaper(paper.title)}
                    className="inline-flex h-6 items-center gap-1.5 rounded-md bg-surface-hover px-2 font-semibold text-ink ring-1 ring-inset ring-line-strong"
                  >
                    {label}
                    {withTitle && <span className="max-w-[14rem] truncate font-normal text-ink-muted">{paper.title}</span>}
                  </span>
                ) : (
                  <button
                    type="button"
                    title={paper.blank ? m.openBlank(paper.title) : m.open(paper.title)}
                    aria-label={paper.blank ? m.openBlank(paper.title) : m.open(paper.title)}
                    onClick={() => onOpen(paper.id)}
                    className="inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {label}
                    {withTitle && <span className="max-w-[14rem] truncate">{paper.title}</span>}
                    {paper.blank && (
                      <span className="rounded border border-dashed border-line-strong px-1 text-[10.5px] leading-[14px] text-ink-subtle">
                        {m.blank}
                      </span>
                    )}
                  </button>
                )}
              </li>
            );
          })}
          {papers.length === 1 && <li className="pl-1 text-[11.5px] text-ink-subtle">{m.onlyThis}</li>}
        </ul>
      </nav>
      {onDetails && (
        <button
          type="button"
          data-set-details-open
          onClick={onDetails}
          title={drifting ? `${dm.detailsDiffer} · ${dm.open}` : dm.open}
          className={`inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            drifting ? 'bg-warn-soft font-medium text-warn-ink hover:brightness-95' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
          }`}
        >
          {drifting && <WarningIcon size={13} />}
          {drifting ? dm.detailsDiffer : dm.open}
        </button>
      )}
    </div>
  );
}
