'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { bankHolds, copyToOneBank, updateBankCopy } from '@/library/bankDocs';
import { withoutLineage } from '@/model/lineage';
import type { Question } from '@/model/types';
import { worksheetStore, worksheetTitle } from '@/storage';
import { notify } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import type { MenuItem } from '@/components/ui/Menu';
import { useMessages } from '@/i18n/language';
import { BANK_ACTIONS_MESSAGES } from './BankActions.messages';

/**
 * The question-bank entries of a question row's menu: Copy to bank, Update bank copy,
 * Treat as a new question. Banks are looked up when the menu opens, never on render.
 *
 * Copy to bank never asks which bank (`copyToOneBank`): it copies at once and says so in
 * a notice. Only a bank holding another version of this question asks: update that copy,
 * or treat this one as a new question (and copy it). A bank never gets a second copy.
 */

type Named = { id: string; name: string };
type Panel = { kind: 'differs'; bank: Named } | { kind: 'treatNew'; thenCopy: boolean };

export function useBankActions(question: Question): {
  items: MenuItem[];
  onOpen: () => void;
  dialog: ReactNode;
} {
  const m = useMessages(BANK_ACTIONS_MESSAGES);
  const docId = useWorksheetStore((s) => s.worksheet.id);
  const commit = useWorksheetStore((s) => s.commit);
  /** Banks holding only another version of this question, once read. */
  const [updates, setUpdates] = useState<Named[]>([]);
  const [panel, setPanel] = useState<Panel>();
  const [busy, setBusy] = useState(false);

  const onOpen = useCallback(() => {
    void (async () => {
      const rows = (await worksheetStore.list()).filter((row) => row.kind === 'bank' && row.id !== docId);
      const differ: Named[] = [];
      for (const row of rows) {
        const bank = await worksheetStore.load(row.id).catch(() => undefined);
        if (bank?.kind === 'bank' && bankHolds(question, bank) === 'differs') differ.push({ id: row.id, name: row.title });
      }
      setUpdates(differ);
    })();
  }, [docId, question]);

  const fail = () => notify({ tone: 'error', body: m.saveFailed });

  const update = (bank: Named) => {
    setBusy(true);
    void updateBankCopy(question, bank.id)
      .then((ok) => notify({ tone: ok ? 'success' : 'info', body: ok ? m.updated(bank.name) : m.noCopy(bank.name) }))
      .catch(fail)
      .finally(() => {
        setBusy(false);
        setPanel(undefined);
      });
  };

  const copy = (q: Question) => {
    setBusy(true);
    const open = useWorksheetStore.getState().worksheet;
    void copyToOneBank(q, docId, {}, open.kind === 'bank' ? open : undefined)
      .then(({ kind, bank }) => {
        const name = worksheetTitle(bank);
        if (kind === 'differs') setPanel({ kind: 'differs', bank: { id: bank.id, name } });
        else notify({ tone: kind === 'copied' ? 'success' : 'info', body: kind === 'copied' ? m.copied(name) : m.alreadyHas(name) });
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const items: MenuItem[] = [
    { label: m.copyToBankMenu, onSelect: () => copy(question), disabled: busy, separated: true },
    ...updates.map((bank) => ({
      label: updates.length === 1 ? m.updateBankCopy : m.updateCopyIn(bank.name),
      onSelect: () => update(bank),
    })),
    ...(question.lineage ? [{ label: m.treatNewMenu, onSelect: () => setPanel({ kind: 'treatNew', thenCopy: false }) }] : []),
  ];

  const treatAsNew = (thenCopy: boolean) => {
    setPanel(undefined);
    // Its parts' roots go too (`withoutLineage`): the question is the root of its own copies now.
    commit((draft) => ({
      ...draft,
      questions: draft.questions.map((q) => (q.id === question.id ? withoutLineage(q) : q)),
    }));
    if (thenCopy) copy(withoutLineage(question));
  };

  const close = () => setPanel(undefined);

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
        title={panel.kind === 'differs' ? m.dialogCopy : m.dialogTreatNew}
        width={480}
        onClose={close}
        footer={
          <>
            <Button variant="subtle" onClick={close}>
              {m.cancel}
            </Button>
            {panel.kind === 'differs' ? (
              <>
                {question.lineage && (
                  <Button variant="default" onClick={() => setPanel({ kind: 'treatNew', thenCopy: true })} disabled={busy}>
                    {m.treatNewMenu}
                  </Button>
                )}
                <Button variant="primary" onClick={() => update(panel.bank)} disabled={busy}>
                  {m.updateBankCopy}
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => treatAsNew(panel.thenCopy)}>
                {panel.thenCopy ? m.treatAsNewCopy : m.treatAsNew}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-2 px-5 py-4 text-[13px] leading-relaxed text-ink">
          {panel.kind === 'treatNew' ? (
            <p>{m.treatNewText}</p>
          ) : (
            <>
              <p>{m.noteDiffers(panel.bank.name)}</p>
              {question.lineage && <p className="text-ink-muted">{m.noteOrNew}</p>}
            </>
          )}
        </div>
      </Dialog>
    </div>
  );

  return { items, onOpen, dialog };
}
