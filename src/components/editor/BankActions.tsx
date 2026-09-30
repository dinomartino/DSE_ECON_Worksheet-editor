'use client';

import { useCallback, useState, type ReactNode } from 'react';
import {
  bankChoices,
  bankHolds,
  copyToBank,
  nextBankName,
  updateBankCopy,
  type BankChoice,
} from '@/library/bankDocs';
import type { Question } from '@/model/types';
import { worksheetStore, worksheetTitle, type WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import type { MenuItem } from '@/components/ui/Menu';

/**
 * The question-bank entries of a question row's menu: Copy to bank, Update bank copy,
 * Treat as a new question. Banks are looked up when the menu opens, never on render.
 *
 * A bank never gets a second copy of a question it holds (`copyToBank` checks too): the
 * picker says which banks have it, and one with another version offers "Update bank
 * copy" in place of Copy. A new bank is named here, as a new worksheet is.
 */

type Holds = ReturnType<typeof bankHolds>;
type Panel = { kind: 'pick' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

const NEW_BANK = '';
const NAME_REQUIRED = 'Give it a name first.';

export function useBankActions(question: Question): {
  items: MenuItem[];
  onOpen: () => void;
  dialog: ReactNode;
} {
  const docId = useWorksheetStore((s) => s.worksheet.id);
  const commit = useWorksheetStore((s) => s.commit);
  const [banks, setBanks] = useState<BankChoice[]>([]);
  /** What each bank holds of this question, once read. */
  const [holds, setHolds] = useState<ReadonlyMap<string, Holds>>(new Map());
  const [panel, setPanel] = useState<Panel>();
  const [target, setTarget] = useState(NEW_BANK);
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const onOpen = useCallback(() => {
    void (async () => {
      const rows: WorksheetSummary[] = (await worksheetStore.list()).filter(
        (row) => row.kind === 'bank' && row.id !== docId,
      );
      setBanks(bankChoices(rows));
      const read = new Map<string, Holds>();
      for (const row of rows) {
        const bank = await worksheetStore.load(row.id).catch(() => undefined);
        if (bank?.kind === 'bank') read.set(row.id, bankHolds(question, bank));
      }
      setHolds(read);
    })();
  }, [docId, question]);

  const nameOf = (id: string) => banks.find((bank) => bank.id === id)?.name ?? 'the bank';
  const updates = banks.filter((bank) => holds.get(bank.id) === 'differs');

  const fail = (error: unknown) =>
    setPanel({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the bank.' });

  const update = (bank: Pick<BankChoice, 'id' | 'name'>) => {
    setBusy(true);
    void updateBankCopy(question, bank.id)
      .then((ok) =>
        setPanel({
          kind: 'done',
          text: ok ? `Updated the copy in ${bank.name}.` : `${bank.name} has no copy of this question.`,
        }),
      )
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const items: MenuItem[] = [
    {
      label: 'Copy to bank…',
      onSelect: () => {
        // The first bank without this question; when every bank has it, the first (which says so).
        const open = banks.find((bank) => (holds.get(bank.id) ?? 'none') === 'none');
        setTarget(open?.id ?? banks[0]?.id ?? NEW_BANK);
        setName(nextBankName(banks.map((bank) => bank.name)));
        setNameMissing(false);
        setPanel({ kind: 'pick' });
      },
      separated: true,
    },
    ...updates.map((bank) => ({
      label: updates.length === 1 ? 'Update bank copy' : `Update copy in ${bank.name}`,
      onSelect: () => update(bank),
    })),
    ...(question.lineage
      ? [
          {
            label: 'Treat as a new question',
            onSelect: () =>
              commit((draft) => ({
                ...draft,
                questions: draft.questions.map((q) => {
                  if (q.id !== question.id) return q;
                  const { lineage: _dropped, ...rest } = q;
                  void _dropped;
                  return rest as Question;
                }),
              })),
          },
        ]
      : []),
  ];

  const close = () => setPanel(undefined);
  const chosen: Holds = target === NEW_BANK ? 'none' : (holds.get(target) ?? 'none');
  const copy = () => {
    const newName = name.trim();
    if (target === NEW_BANK && !newName) {
      setNameMissing(true);
      return;
    }
    setBusy(true);
    copyToBank([question], docId, target === NEW_BANK ? { name: newName } : target)
      .then(({ bank, copied }) =>
        setPanel({
          kind: 'done',
          text:
            copied > 0
              ? `Copied to ${worksheetTitle(bank)}.`
              : `${worksheetTitle(bank)} already has this question. Nothing was copied.`,
        }),
      )
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const note =
    chosen === 'same'
      ? `${nameOf(target)} already has this question.`
      : chosen === 'differs'
        ? `${nameOf(target)} has another version of this question. Update it to match this one.`
        : undefined;

  const dialog = panel && (
    // The dialog is portal-free, so its clicks and keys would bubble into the row. Esc goes
    // on to the dialog's own window listener, which closes it.
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
    >
      <Dialog
        title={panel.kind === 'pick' ? 'Copy to bank' : panel.kind === 'done' ? 'Question bank' : 'Could not save'}
        width={400}
        onClose={close}
        footer={
          panel.kind === 'pick' ? (
            <>
              <Button variant="subtle" onClick={close}>
                Cancel
              </Button>
              {chosen === 'differs' ? (
                <Button variant="primary" onClick={() => update({ id: target, name: nameOf(target) })} disabled={busy}>
                  Update bank copy
                </Button>
              ) : (
                <Button variant="primary" onClick={copy} disabled={busy || chosen === 'same'}>
                  Copy
                </Button>
              )}
            </>
          ) : (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          )
        }
      >
        <div className="px-5 py-4 text-[13px] text-ink">
          {panel.kind === 'pick' ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 text-xs text-ink-muted">
                A copy is added to the bank. This worksheet is not changed.
              </legend>
              {banks.map((bank) => (
                <BankOption
                  key={bank.id}
                  id={bank.id}
                  label={bank.name}
                  detail={[bank.detail, holdsText(holds.get(bank.id))].filter(Boolean).join(' · ')}
                  target={target}
                  onPick={setTarget}
                />
              ))}
              <BankOption id={NEW_BANK} label="New bank" target={target} onPick={setTarget} />
              {target === NEW_BANK && (
                <div className="ml-8 mt-1 space-y-1">
                  <input
                    type="text"
                    autoFocus
                    value={name}
                    aria-label="New bank name"
                    aria-invalid={nameMissing}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (event.target.value.trim()) setNameMissing(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        copy();
                      }
                    }}
                    className={`h-8 w-full rounded-lg border bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft focus:ring-2 ${
                      nameMissing ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line focus:border-accent focus:ring-accent/25'
                    }`}
                  />
                  {nameMissing ? (
                    <p role="alert" className="text-xs text-danger-ink">
                      {NAME_REQUIRED}
                    </p>
                  ) : (
                    <p className="text-[11px] text-ink-subtle">What it is called in your list. It does not print.</p>
                  )}
                </div>
              )}
              {note && (
                <p role="status" className="mt-2 text-xs text-ink-muted">
                  {note}
                </p>
              )}
            </fieldset>
          ) : (
            <p role="status">{panel.text}</p>
          )}
        </div>
      </Dialog>
    </div>
  );

  return { items, onOpen, dialog };
}

/** A bank's line in the picker, beside its name. */
function holdsText(holds: Holds | undefined): string | undefined {
  if (holds === 'same') return 'has this question';
  if (holds === 'differs') return 'has another version';
  return undefined;
}

function BankOption({
  id,
  label,
  detail,
  target,
  onPick,
}: {
  id: string;
  label: string;
  detail?: string;
  target: string;
  onPick: (id: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
      <input type="radio" name="bank" checked={target === id} onChange={() => onPick(id)} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="shrink-0 text-[11.5px] tabular-nums text-ink-subtle">{detail}</span>}
    </label>
  );
}
