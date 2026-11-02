'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { SetIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { looksLikeSameExam, suggestedSetName } from '@/model/paperSet';
import { canJoinASet, compareMembers, summaryRole, type SetGroup, type WorksheetSummary } from '@/storage';
import { SET_MESSAGES } from './sets.messages';

/**
 * The start screen's paper-set dialogs (k-0299): Make a set…, Add to set…, Add papers… and
 * Rename set…. Each only asks; the screen writes every member (`storage/paperSets.ts`).
 * Everything is a button or a box: no step needs a drag (MacBook trackpad, iPad touch).
 */

const INPUT =
  'h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

/**
 * The exam papers free to join a set, beside `anchors` (the papers already going in): ones
 * whose name pairs with an anchor's ("S6 Mock Paper 1" with "… Paper 2") first and pre-ticked,
 * then the rest in set order. Only a suggestion; the teacher ticks.
 */
export function setCandidates(
  summaries: readonly WorksheetSummary[],
  anchors: readonly WorksheetSummary[],
): { rows: WorksheetSummary[]; suggested: Set<string> } {
  const taken = new Set(anchors.map((row) => row.id));
  const free = summaries.filter((row) => !taken.has(row.id) && canJoinASet(row));
  const suggested = new Set(
    free.filter((row) => anchors.some((anchor) => looksLikeSameExam(anchor.title, row.title))).map((row) => row.id),
  );
  const rows = [...free].sort(
    (a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)) || compareMembers(a, b),
  );
  return { rows, suggested };
}

function RoleTag({ summary }: { summary: WorksheetSummary }) {
  const sm = useMessages(SET_MESSAGES);
  const role = summaryRole(summary);
  return (
    <span className="shrink-0 text-[11px] font-semibold text-ink-muted">
      {role === 'paper1' ? sm.paper1 : role === 'paper2' ? sm.paper2 : sm.examPaper}
    </span>
  );
}

/** Ticks over exam papers; `fixed` rows are listed first, ticked and locked (this paper). */
function PaperChecklist({
  label,
  fixed = [],
  rows,
  picked,
  suggested,
  onChange,
}: {
  /** What the list is, for a screen reader. */
  label: string;
  fixed?: WorksheetSummary[];
  rows: WorksheetSummary[];
  picked: ReadonlySet<string>;
  suggested: ReadonlySet<string>;
  onChange: (picked: Set<string>) => void;
}) {
  const sm = useMessages(SET_MESSAGES);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };
  return (
    <ul aria-label={label} className="scroll-slim max-h-[14rem] divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
      {fixed.map((row) => (
        <li key={row.id}>
          <label className="flex items-center gap-2.5 px-2.5 py-2 text-[12.5px] text-ink-muted">
            <input type="checkbox" checked disabled className="h-4 w-4 shrink-0 rounded border-line accent-[var(--accent)]" />
            <span className="min-w-0 flex-1 truncate" title={row.title}>
              {row.title} <span className="text-ink-subtle">{sm.thisPaper}</span>
            </span>
            <RoleTag summary={row} />
          </label>
        </li>
      ))}
      {rows.map((row) => (
        <li key={row.id}>
          <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2 text-[12.5px] text-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover">
            <input
              type="checkbox"
              checked={picked.has(row.id)}
              onChange={(event) => toggle(row.id, event.target.checked)}
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[var(--accent)]"
            />
            <span className="min-w-0 flex-1 truncate" title={row.title}>
              {row.title}
            </span>
            {suggested.has(row.id) && <span className="shrink-0 text-[11px] text-ink-subtle">{sm.looksLikePair}</span>}
            <RoleTag summary={row} />
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Make a set from one exam paper: a name, and which other papers sit it. */
export function MakeSetDialog({
  summary,
  summaries,
  onClose,
  onDone,
}: {
  summary: WorksheetSummary;
  summaries: readonly WorksheetSummary[];
  onClose: () => void;
  onDone: (name: string, ids: string[]) => void;
}) {
  const sm = useMessages(SET_MESSAGES);
  const [name, setName] = useState(() => suggestedSetName(summary.title));
  const [{ rows, suggested }] = useState(() => setCandidates(summaries, [summary]));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggested));
  const trimmed = name.trim();
  const formId = 'make-set-form';
  return (
    <Dialog
      title={sm.makeTitle}
      description={sm.makeDescription}
      width={460}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {sm.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed}>
            {sm.make}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4 px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onDone(trimmed, [summary.id, ...rows.filter((row) => picked.has(row.id)).map((row) => row.id)]);
        }}
      >
        <Field label={sm.setName}>
          <input
            type="text"
            value={name}
            autoFocus
            aria-label={sm.setName}
            placeholder={sm.setNamePlaceholder}
            onChange={(event) => setName(event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label={sm.withPapers}>
          <PaperChecklist label={sm.withPapers} fixed={[summary]} rows={rows} picked={picked} suggested={suggested} onChange={setPicked} />
          {rows.length === 0 && <p className="pt-1 text-[11.5px] leading-snug text-ink-subtle">{sm.noOtherPapers}</p>}
        </Field>
      </form>
    </Dialog>
  );
}

/** Add one paper to an existing set: pick the set. */
export function AddToSetDialog({
  summary,
  groups,
  onClose,
  onDone,
}: {
  summary: WorksheetSummary;
  groups: SetGroup[];
  onClose: () => void;
  onDone: (group: SetGroup) => void;
}) {
  const sm = useMessages(SET_MESSAGES);
  // The set whose papers pair with this one's name first: most likely where it belongs.
  const fits = (group: SetGroup) => group.members.some((row) => looksLikeSameExam(row.title, summary.title));
  const ordered = [...groups].sort(
    (a, b) => Number(fits(b)) - Number(fits(a)) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  );
  return (
    <Dialog
      title={sm.addToSetTitle(summary.title)}
      description={sm.addToSetDescription}
      width={440}
      onClose={onClose}
      footer={
        <Button variant="subtle" onClick={onClose}>
          {sm.cancel}
        </Button>
      }
    >
      <ul className="px-3 py-3">
        {ordered.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => onDone(group)}
              className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="mt-0.5 text-ink-subtle">
                <SetIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{group.name.trim() || sm.untitledSet}</span>
                <span className="block truncate text-[11.5px] text-ink-subtle">
                  {group.members.map((row) => row.title).join(' · ')}
                </span>
              </span>
              {fits(group) && <span className="shrink-0 pt-0.5 text-[11px] text-ink-subtle">{sm.looksLikePair}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Add papers to a set from its frame's ⋯: tick exam papers in no set. */
export function AddPapersDialog({
  group,
  summaries,
  onClose,
  onDone,
}: {
  group: SetGroup;
  summaries: readonly WorksheetSummary[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const sm = useMessages(SET_MESSAGES);
  const [{ rows, suggested }] = useState(() => setCandidates(summaries, group.members));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggested));
  const name = group.name.trim() || sm.untitledSet;
  return (
    <Dialog
      title={sm.addPapersTitle(name)}
      description={sm.addPapersDescription}
      width={460}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {sm.cancel}
          </Button>
          <Button variant="primary" disabled={picked.size === 0} onClick={() => onDone([...picked])}>
            {sm.add}
          </Button>
        </>
      }
    >
      <div className="px-5 py-5">
        {rows.length > 0 ? (
          <PaperChecklist label={sm.withPapers} rows={rows} picked={picked} suggested={suggested} onChange={setPicked} />
        ) : (
          <p className="text-[12.5px] leading-relaxed text-ink-muted">{sm.noOtherPapers}</p>
        )}
      </div>
    </Dialog>
  );
}

/** Rename a set: every member takes the name. */
export function RenameSetDialog({
  group,
  onClose,
  onDone,
}: {
  group: SetGroup;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const sm = useMessages(SET_MESSAGES);
  const [name, setName] = useState(group.name);
  const trimmed = name.trim();
  const formId = 'rename-set-form';
  return (
    <Dialog
      title={sm.renameSetTitle}
      description={sm.renameSetDescription}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {sm.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed}>
            {sm.rename}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onDone(trimmed);
        }}
      >
        <input
          type="text"
          value={name}
          autoFocus
          aria-label={sm.setName}
          placeholder={sm.setNamePlaceholder}
          onChange={(event) => setName(event.target.value)}
          className={INPUT}
        />
      </form>
    </Dialog>
  );
}
