'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { bankCopyDiffers, copyToBank, updateBankCopy } from '@/library/bankDocs';
import type { Question } from '@/model/types';
import { worksheetStore, worksheetTitle, type WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import type { MenuItem } from '@/components/ui/Menu';

/**
 * The question-bank entries of a question row's menu: Copy to bank, Update bank copy,
 * Treat as a new question. Banks are looked up when the menu opens, never on render.
 */

type Bank = { id: string; name: string };
type Panel = { kind: 'pick' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

const NEW_BANK = '';

export function useBankActions(question: Question): {
  items: MenuItem[];
  onOpen: () => void;
  dialog: ReactNode;
} {
  const docId = useWorksheetStore((s) => s.worksheet.id);
  const commit = useWorksheetStore((s) => s.commit);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [updates, setUpdates] = useState<Bank[]>([]);
  const [panel, setPanel] = useState<Panel>();
  const [target, setTarget] = useState(NEW_BANK);
  const [busy, setBusy] = useState(false);

  const onOpen = useCallback(() => {
    void (async () => {
      const rows: WorksheetSummary[] = (await worksheetStore.list()).filter(
        (row) => row.kind === 'bank' && row.id !== docId,
      );
      setBanks(rows.map((row) => ({ id: row.id, name: row.title })));
      const differing: Bank[] = [];
      for (const row of rows) {
        const bank = await worksheetStore.load(row.id).catch(() => undefined);
        if (bank?.kind === 'bank' && bankCopyDiffers(question, bank)) {
          differing.push({ id: row.id, name: worksheetTitle(bank) });
        }
      }
      setUpdates(differing);
    })();
  }, [docId, question]);

  const fail = (error: unknown) =>
    setPanel({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the bank.' });

  const items: MenuItem[] = [
    {
      label: 'Copy to bank…',
      onSelect: () => {
        setTarget(banks[0]?.id ?? NEW_BANK);
        setPanel({ kind: 'pick' });
      },
      separated: true,
    },
    ...updates.map((bank) => ({
      label: updates.length === 1 ? 'Update bank copy' : `Update copy in ${bank.name}`,
      onSelect: () => {
        void updateBankCopy(question, bank.id)
          .then((ok) =>
            setPanel({
              kind: 'done',
              text: ok ? `Updated the copy in ${bank.name}.` : `${bank.name} has no copy of this question.`,
            }),
          )
          .catch(fail);
      },
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
  const copy = () => {
    setBusy(true);
    copyToBank([question], docId, target === NEW_BANK ? undefined : target)
      .then((saved) => setPanel({ kind: 'done', text: `Copied to ${worksheetTitle(saved)}.` }))
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const dialog = panel && (
    // The dialog is portal-free, so its clicks would bubble into the row and select it.
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
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
              <Button variant="primary" onClick={copy} disabled={busy}>
                Copy
              </Button>
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
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs text-ink-muted">
                A copy is added to the bank. This worksheet is not changed.
              </legend>
              {banks.map((bank) => (
                <BankChoice key={bank.id} id={bank.id} label={bank.name} target={target} onPick={setTarget} />
              ))}
              <BankChoice id={NEW_BANK} label="New bank" target={target} onPick={setTarget} />
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

function BankChoice({
  id,
  label,
  target,
  onPick,
}: {
  id: string;
  label: string;
  target: string;
  onPick: (id: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
      <input type="radio" name="bank" checked={target === id} onChange={() => onPick(id)} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}
