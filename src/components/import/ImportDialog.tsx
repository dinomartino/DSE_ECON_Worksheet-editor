'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { analyseLines, hasChrome, type ChromeLeftover, type FileRole, type ImageRef, type PageChrome } from '@/import';
import { planChrome } from '@/import/chromePlan';
import { imageBlockFromFile } from '@/export/imageImport';
import { addToBank, addedRoots, bankChoices, nextBankName, type BankChoice } from '@/library/bankDocs';
import type { DocumentType } from '@/model/newWorksheet';
import type { LanguageMode, Question, Worksheet } from '@/model/types';
import { paperLanguage, paperSide } from '@/settings/paperLanguage';
import { isDesktop } from '@/platform';
import { readyOcrEngine, type OcrEngine } from '@/platform/ocr';
import { worksheetStore, worksheetTitle } from '@/storage';
import { notify } from '@/store/notices';
import { Button } from '@/components/ui';
import { Dialog, NoticeInsetSpacer } from '@/components/ui/Dialog';
import { useDialogNotices } from '@/components/ui/NoticeLayer';
import { CheckCircleIcon, WarningIcon } from '@/components/ui/icons';
import { undoChord } from '@/components/ui/undoChord';
import { kindText } from '@/components/start/startKinds';
import type { Messages } from '@/i18n/catalogue';
import { useMessages, useUiLanguage } from '@/i18n/language';
import {
  createImportedDocument,
  createImportedDocuments,
  defaultDocumentType,
  groupPictures,
  importedMarks,
  importLanguageMode,
  importName,
  misfit,
  readPaperFile,
  readPictureFiles,
  startLanguage,
  type FileOutcome,
  type PaperFile,
} from './fileImport';
import {
  NO_LINKS,
  answerSource,
  answerSummary,
  examineFile,
  kept,
  linkedAnswers,
  needsLinking,
  paperRead,
  paperReview,
  paperState,
  papersOf,
  type AnswerChoice,
  type BatchFile,
  type Links,
  type PaperReview,
  type PaperState,
} from './importBatch';
import { papersDoneNotice } from './doneNotice';
import { LinkStep } from './LinkStep';
import { IMPORT_MESSAGES } from './messages';
import { materialize, previewBase, type PreviewCache } from './previewDoc';
import { problemText } from './problemText';
import type { ScanProgress } from './scanImport';
import { ReviewStep, undoFix } from './ReviewStep';
import { SaveAsStep, type Destination } from './SaveAsStep';
import { SaveManyStep, type PaperToSave } from './SaveManyStep';

export { flagText } from './ReviewStep';

/**
 * Import from Word or PDF (`docs/design/paste-import.md` § 6, § 11): the chosen files are
 * read, papers linked to their answers when there are several (or one holds only answers),
 * each paper reviewed with its answers applied, then saved. A fix is a `Pin` and re-solves
 * at once. Save as makes new papers (one `insertQuestionBatch` each) or adds to 題庫
 * (`addToBank`, duplicates skipped). Nothing is written before Save.
 */

type Text = Messages<typeof IMPORT_MESSAGES>;

/** A chosen or dropped file; read once the dialog is up. Pictures chosen together are one paper. */
export interface ImportFile {
  name: string;
  read: () => Promise<ArrayBuffer>;
}

/** Scanned pages being read: which file, which page. */
type Scanning = ScanProgress & { file: number };

export interface ImportDialogProps {
  files: ImportFile[];
  onClose: () => void;
  /** Choose other files (the start screen's chooser); the dialog is replaced. */
  onChooseAnother: () => void;
  /** Open a document in the editor (the start screen's open). */
  onOpenDocument: (worksheet: Worksheet, language?: LanguageMode) => void;
  /** New papers were saved (file them where the teacher is). */
  onCreated: (ids: string[]) => void;
  /** Questions were added to a bank: show them there (`roots`: those added, in the files' order). */
  onAddedToBank: (bankId: string, roots: string[]) => void;
}

const NEW_BANK = '';

/** The app's downsizer for the readers: a picture this browser cannot draw stays a slot. */
async function prepareImage(blob: Blob): Promise<ImageRef | null> {
  const type = blob.type || 'image/png';
  const block = await imageBlockFromFile(new File([blob], `figure.${type.split('/')[1] ?? 'png'}`, { type }), 420, { decodedOnly: true }).catch(() => null);
  if (!block) return null;
  return {
    src: block.src,
    widthPx: block.widthPx,
    heightPx: block.heightPx,
    ...(block.naturalWidthPx && block.naturalHeightPx ? { naturalWidthPx: block.naturalWidthPx, naturalHeightPx: block.naturalHeightPx } : {}),
  };
}

const isTyping = () => {
  const active = document.activeElement;
  return active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || (active instanceof HTMLElement && active.isContentEditable);
};

type Step = 'reading' | 'link' | 'review' | 'saveAs';

/** The file's header, footer and title block, when it has any. */
const chromeOf = (file: BatchFile | undefined): PageChrome | undefined =>
  file?.outcome.kind === 'ok' && hasChrome(file.outcome.chrome) ? file.outcome.chrome : undefined;

/** What a mock's cover leaves over from the file's chrome (the cover is chosen in Save as). */
function notOnCover(chrome: PageChrome | undefined, type: Destination, result: PaperReview, keepPreset: boolean): ChromeLeftover[] {
  if (!chrome || (type !== 'paper1' && type !== 'lqMock')) return [];
  const plan = planChrome(chrome, { documentType: type, language: importLanguageMode(result.analysis, paperLanguage()), totalMarks: importedMarks(result.batch), keepPreset });
  return plan.leftovers.filter((l) => l.reason === 'noCoverPlace' || l.reason === 'noHeader');
}

/** Questions with an answer or a scheme, for Save as. */
function answered(result: PaperReview): number {
  return result.analysis.outline.questions.filter(
    (q) => q.answer || q.scheme || q.parts.some((p) => p.scheme || p.subParts.some((s) => s.scheme)),
  ).length;
}

export default function ImportDialog({ files: chosen, onClose, onChooseAnother, onOpenDocument, onCreated, onAddedToBank }: ImportDialogProps) {
  const m = useMessages(IMPORT_MESSAGES);
  const lang = useUiLanguage();
  const notices = useDialogNotices();
  const [files] = useState<PaperFile[]>(() => groupPictures(chosen));
  const [read, setRead] = useState<Array<BatchFile | undefined>>(() => files.map(() => undefined));
  const [scanning, setScanning] = useState<Scanning>();
  // Stops the scanned pages being read now (that file only).
  const stop = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step>('reading');
  const [links, setLinks] = useState<Links>(NO_LINKS);
  const [at, setAt] = useState(0);
  const [states, setStates] = useState<Record<string, PaperState>>({});
  const [banks, setBanks] = useState<BankChoice[]>([]);
  const [bankTarget, setBankTarget] = useState(NEW_BANK);
  const [busy, setBusy] = useState(false);
  // Save as: one paper (the gallery) or several (a row each), or 題庫 only.
  const [destination, setDestination] = useState<Destination>();
  const [names, setNames] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<Record<string, DocumentType>>({});
  const [bankOnly, setBankOnly] = useState(false);
  // Per paper: keep the paper type's header and footer rather than the file's.
  const [keepPreset, setKeepPreset] = useState<Record<string, boolean>>({});
  const [base] = useState(() => previewBase());
  const [cache] = useState<PreviewCache>(() => new Map());

  // Read the files one by one. pdf.js and the readers load here, never with the start screen.
  // Scanned pages are read by the desktop app's text recognition, page by page.
  useEffect(() => {
    let live = true;
    let engine: Promise<OcrEngine | undefined> | undefined;
    void (async () => {
      const out: BatchFile[] = [];
      for (const [k, file] of files.entries()) {
        const controller = new AbortController();
        stop.current = controller;
        const scan = {
          engine: () => (engine ??= readyOcrEngine()),
          signal: controller.signal,
          onProgress: (p: ScanProgress) => live && setScanning({ ...p, file: k }),
          prepareImage,
        };
        const outcome: FileOutcome = await (file.pictures
          ? readPictureFiles(file.pictures, scan)
          : file.read().then((bytes) => readPaperFile(file.name, bytes, { prepareImage, scan }))
        ).catch((): FileOutcome => ({ kind: 'problem', problem: 'unreadable' }));
        if (!live) return;
        setScanning(undefined);
        out.push(examineFile(`f${k}`, file.name, outcome));
        setRead((list) => list.map((x, n) => (n === k ? out[k] : x)));
      }
      if (!live) return;
      stop.current = null;
      setStep(needsLinking(out) ? 'link' : 'review');
    })();
    return () => {
      live = false;
      stop.current?.abort();
    };
    // Once per batch: the dialog is replaced for other files.
  }, [files]);

  // The banks 題庫 only can write.
  useEffect(() => {
    let live = true;
    void worksheetStore
      .list()
      .then((rows) => {
        if (!live) return;
        const choices = bankChoices(rows.filter((row) => row.kind === 'bank'));
        setBanks(choices);
        setBankTarget(choices[0]?.id ?? NEW_BANK);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const batchFiles = useMemo(() => (step === 'reading' ? [] : read.filter((f): f is BatchFile => Boolean(f))), [read, step]);
  const answers = useMemo(() => linkedAnswers(batchFiles, links), [batchFiles, links]);
  const papers = useMemo(() => papersOf(batchFiles, links), [batchFiles, links]);
  const single = files.length === 1 ? batchFiles[0] : undefined;
  const problem = single && single.outcome.kind === 'problem' && step !== 'link' ? single.outcome : undefined;

  /** Each file's question count and its review's first state (language from the setting), worked out once. */
  const facts = useMemo(() => {
    const counts: Record<string, number> = {};
    const initial: Record<string, PaperState> = {};
    for (const file of batchFiles) {
      if (file.outcome.kind !== 'ok') continue;
      const paper = paperRead(file);
      counts[file.id] = analyseLines(paper).outline.questions.length;
      initial[file.id] = paperState(startLanguage(paper, paperSide()));
    }
    return { counts, initial };
  }, [batchFiles]);

  const stateOf = useCallback((id: string) => states[id] ?? facts.initial[id] ?? paperState('auto'), [states, facts]);
  const reviewOf = useCallback(
    (paper: BatchFile, state: PaperState) => {
      const source = answerSource(paper, answers[paper.id] ?? 'none', batchFiles);
      const result = paperReview(paperRead(paper), state, source?.sheet);
      return { result, source };
    },
    [answers, batchFiles],
  );

  const paper = papers[Math.min(at, papers.length - 1)];
  const state = paper ? stateOf(paper.id) : undefined;
  const current = useMemo(() => (paper && state && step !== 'reading' ? reviewOf(paper, state) : undefined), [paper, state, step, reviewOf]);
  const summary = useMemo(() => (current?.source ? answerSummary(current.result, current.source.sheet) : undefined), [current]);

  const update = useCallback(
    (fn: (s: PaperState) => PaperState) => {
      if (!paper) return;
      setStates((all) => ({ ...all, [paper.id]: fn(all[paper.id] ?? facts.initial[paper.id] ?? paperState('auto')) }));
    },
    [paper, facts],
  );

  // ⌘Z takes back the paper's last fix, and never reaches anything behind the dialog.
  const latest = useRef({ step, update });
  useLayoutEffect(() => {
    latest.current = { step, update };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = undoChord(event);
      if (!action || isTyping()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'undo' && latest.current.step === 'review') latest.current.update(undoFix);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Text read from a scan (by this app, or a PDF's own OCR layer) is reviewed with a warning.
  const ocr = step === 'review' && paper?.outcome.kind === 'ok' && paper.outcome.ocr ? (paper.outcome.read.source === 'ocr' ? m.ocrRead : m.scanOcr) : undefined;
  useEffect(() => {
    if (ocr) notices.notify({ id: 'import-kind', tone: 'warning', body: ocr });
    else notices.dismiss('import-kind');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocr, paper?.id]);

  // ---- link ----

  const setRole = (id: string, role: FileRole) => setLinks((l) => ({ ...l, roles: { ...l.roles, [id]: role } }));
  const setAnswers = (id: string, choice: AnswerChoice) => setLinks((l) => ({ ...l, answers: { ...l.answers, [id]: choice } }));
  const removeFile = (id: string) => setLinks((l) => ({ ...l, removed: [...l.removed, id] }));

  // ---- Save as ----

  /** Every paper's result as Save writes it: computed when Save as opens. */
  const all = useMemo(
    () => (step === 'saveAs' ? papers.map((p) => ({ paper: p, ...reviewOf(p, stateOf(p.id)) })) : []),
    [step, papers, reviewOf, stateOf],
  );
  const toSave: PaperToSave[] = all.map(({ paper: p, result }) => {
    const suggested = defaultDocumentType(result.analysis);
    const type = types[p.id] ?? suggested;
    const fit = misfit(type, result.analysis);
    return {
      id: p.id,
      fileName: p.name,
      name: names[p.id] ?? importName(p.outcome.kind === 'ok' ? p.outcome.title : undefined, p.name),
      type,
      suggested,
      questions: result.batch.builds.length,
      answered: answered(result),
      ...(fit ? { misfit: fit } : {}),
      notOnCover: notOnCover(chromeOf(p), type, result, Boolean(keepPreset[p.id])),
    };
  });

  const finishBank = (questions: Question[], hasLead: boolean) => {
    const to = bankTarget === NEW_BANK ? { name: nextBankName(banks.map((b) => b.name)) } : bankTarget;
    setBusy(true);
    addToBank(questions, to, { openDocId: '' })
      .then(({ bank, copied, already }) => {
        const bankName = worksheetTitle(bank);
        const meta = copied === 0 ? m.bankHasAll : [m.bankUntagged, ...(already.length > 0 ? [m.skippedDuplicates(already.length)] : [])].join(' · ');
        notify({
          tone: copied === 0 ? 'info' : 'success',
          body: copied === 0 ? m.bankHadAll : m.addedToBank(copied),
          rows: [{ label: bankName, meta }],
          ...(copied > 0 && hasLead ? { details: [m.stimulusNotInBank] } : {}),
        });
        onClose();
        if (copied > 0) onAddedToBank(bank.id, addedRoots(questions, already));
      })
      .catch(() => {
        setBusy(false);
        notices.notify({ id: 'import-result', tone: 'error', body: m.bankFailed });
      });
  };

  const saveOne = () => {
    const one = all[0];
    const row = toSave[0];
    if (!one || !row || row.questions === 0 || busy) return;
    const chosen: Destination = destination ?? row.suggested;
    if (chosen === 'bank') {
      finishBank(one.result.batch.builds.map(materialize).filter((q): q is Question => q !== undefined), Boolean(one.result.batch.lead));
      return;
    }
    const languageMode = importLanguageMode(one.result.analysis, paperLanguage());
    const name = row.name.trim() || importName(undefined, row.fileName);
    const chrome = chromeOf(one.paper);
    const report = createImportedDocument(
      one.result.batch,
      { documentType: chosen, name, language: languageMode, ...(chrome ? { chrome, keepPreset: Boolean(keepPreset[one.paper.id]) } : {}) },
      (worksheet) => onOpenDocument(worksheet, languageMode),
      (w) => worksheetStore.save(w),
    );
    if (!report.ok) {
      notices.notify({ id: 'import-result', tone: 'error', body: m.saveFailed });
      return;
    }
    onCreated([report.committed.id]);
    const noAnswer = one.result.analysis.flags.filter((f) => f.kind === 'noAnswer').length;
    notify(papersDoneNotice(m, [{ name, kind: kindText(chosen, lang).title, questions: report.questionIds.length }], () => {}, noAnswer));
    onClose();
  };

  /**
   * Several papers: each made as one is (`createImportedDocument`), the later ones first
   * through the store alone and written one after another, then the first opened.
   */
  const saveMany = async () => {
    if (busy || all.length === 0) return;
    const rows = toSave.map((row, k) => ({ row, result: all[k].result, paper: all[k].paper })).filter(({ row }) => row.questions > 0);
    if (bankOnly) {
      finishBank(
        rows.flatMap(({ result }) => result.batch.builds.map(materialize).filter((q): q is Question => q !== undefined)),
        rows.some(({ result }) => Boolean(result.batch.lead)),
      );
      return;
    }
    if (rows.length === 0) return;
    setBusy(true);
    const papersToMake = rows.map(({ row, result, paper: p }) => {
      const chrome = chromeOf(p);
      return {
        batch: result.batch,
        documentType: row.type,
        name: row.name.trim() || importName(undefined, row.fileName),
        language: importLanguageMode(result.analysis, paperLanguage()),
        ...(chrome ? { chrome, keepPreset: Boolean(keepPreset[p.id]) } : {}),
      };
    });
    const made: Awaited<ReturnType<typeof createImportedDocuments>> = [];
    try {
      await createImportedDocuments(papersToMake, (worksheet) => onOpenDocument(worksheet, papersToMake[0].language), (w) => worksheetStore.save(w), made);
    } catch {
      setBusy(false);
      if (made.length) onCreated(made.map((d) => d.worksheet.id));
      notices.notify({ id: 'import-result', tone: 'error', body: m.saveFailed });
      return;
    }
    const docs = [...made].sort((a, b) => a.index - b.index).map((d) => ({ ...papersToMake[d.index], id: d.worksheet.id, questions: d.questions }));
    onCreated(docs.map((d) => d.id));
    notify(
      papersDoneNotice(
        m,
        docs.map((d) => ({ name: d.name, kind: kindText(d.documentType, lang).title, questions: d.questions })),
        (k) => {
          const d = docs[k];
          void worksheetStore.load(d.id).then((worksheet) => {
            if (worksheet) onOpenDocument(worksheet, d.language);
          });
        },
      ),
    );
    onClose();
  };

  const save = () => (papers.length > 1 ? void saveMany() : saveOne());

  // ---- render ----

  const several = files.length > 1 || step === 'link' || needsLinking(batchFiles);
  const builds = current?.result.batch.builds.length ?? 0;
  const lastPaper = at >= papers.length - 1;
  const skipped = current?.result.batch.skipped.length ?? 0;
  const reason = step === 'review' && current ? (builds === 0 ? m.nothingToImport : skipped > 0 ? m.leftOut(skipped) : undefined) : undefined;
  const oneDestination: Destination = destination ?? toSave[0]?.suggested ?? 'classroom';

  const footer =
    step === 'reading' || problem ? (
      <>
        {problem && (
          <Button variant="subtle" className="mr-auto" onClick={onChooseAnother}>
            {m.chooseAnother}
          </Button>
        )}
        {!problem && scanning && (
          <Button variant="subtle" className="mr-auto" onClick={() => stop.current?.abort()}>
            {m.stopReading}
          </Button>
        )}
        <Button variant={problem ? 'primary' : 'subtle'} onClick={onClose}>
          {problem ? m.close : m.cancel}
        </Button>
      </>
    ) : step === 'link' ? (
      <>
        <Button variant="subtle" onClick={onChooseAnother}>
          {m.chooseOthers}
        </Button>
        <span className="flex-1" />
        <Button variant="subtle" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={papers.length === 0}
          onClick={() => {
            setAt(0);
            setStep('review');
          }}
        >
          {m.reviewPapers(papers.length)} →
        </Button>
      </>
    ) : step === 'review' ? (
      <>
        {!several ? (
          <Button variant="subtle" onClick={onChooseAnother}>
            {m.chooseAnother}
          </Button>
        ) : at > 0 ? (
          <Button variant="subtle" onClick={() => setAt(at - 1)}>
            ← {m.previousPaper}
          </Button>
        ) : (
          <Button variant="subtle" onClick={() => setStep('link')}>
            ← {m.backToLinks}
          </Button>
        )}
        <span title={reason} className={`min-w-0 flex-1 truncate text-xs ${builds === 0 ? 'text-warn-ink' : 'text-ink-subtle'}`}>
          {reason}
        </span>
        <Button variant="subtle" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button variant="primary" disabled={builds === 0} onClick={() => (lastPaper ? setStep('saveAs') : setAt(at + 1))}>
          {lastPaper ? m.saveAs : `${m.nextPaper} →`}
        </Button>
      </>
    ) : (
      <>
        <Button variant="subtle" onClick={() => setStep('review')}>
          ← {m.backToReview}
        </Button>
        <span className="flex-1" />
        <Button variant="subtle" onClick={onClose}>
          {m.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={busy || toSave.every((p) => p.questions === 0) || (papers.length > 1 ? !bankOnly && toSave.some((p) => p.questions > 0 && !p.name.trim()) : oneDestination !== 'bank' && !toSave[0]?.name.trim())}
          onClick={save}
        >
          {busy ? m.busy : (papers.length > 1 ? bankOnly : oneDestination === 'bank') ? m.addToBank : papers.length > 1 ? m.saveAll(toSave.filter((p) => p.questions > 0).length) : m.saveAndOpen}
        </Button>
      </>
    );

  const pagesOf = (f?: BatchFile) => f?.outcome.pages;
  const description =
    step === 'reading'
      ? files.length > 1
        ? m.readingMany(Math.min(read.filter(Boolean).length + 1, files.length), files.length)
        : files[0]?.name
      : step === 'link'
        ? m.linkTitle
        : step === 'review' && paper
          ? papers.length > 1
            ? `${m.paperOf(at + 1, papers.length)} · ${paper.name}`
            : pagesOf(paper)
              ? `${paper.name} · ${m.pages(pagesOf(paper)!)}`
              : paper.name
          : step === 'saveAs'
            ? m.saveAsTitle
            : (single?.name ?? m.linkTitle);

  return (
    <Dialog title={m.title} description={description} size="large" scrollBody={false} onClose={onClose} footer={footer} noticeScope={notices.scope}>
      {step === 'reading' ? (
        files.length > 1 ? (
          <ReadingMany text={m} files={files} read={read} scanning={scanning} />
        ) : scanning ? (
          <ScanStep text={m} name={files[0]?.name ?? ''} scanning={scanning} pictures={files[0]?.pictures?.length} />
        ) : (
          <ReadingStep text={m} name={files[0]?.name ?? ''} />
        )
      ) : problem ? (
        <ProblemStep text={m} problem={problem} />
      ) : step === 'link' ? (
        <LinkStep
          text={m}
          files={kept(batchFiles, links)}
          links={links}
          answers={answers}
          counts={facts.counts}
          onRole={setRole}
          onAnswers={setAnswers}
          onRemove={removeFile}
          end={<NoticeInsetSpacer />}
        />
      ) : step === 'saveAs' ? (
        papers.length > 1 ? (
          <SaveManyStep
            text={m}
            papers={toSave}
            bankOnly={bankOnly}
            onBankOnly={setBankOnly}
            onName={(id, name) => setNames((n) => ({ ...n, [id]: name }))}
            onType={(id, type) => setTypes((t) => ({ ...t, [id]: type }))}
            banks={banks}
            bankTarget={bankTarget}
            newBankName={nextBankName(banks.map((b) => b.name))}
            onBankTarget={setBankTarget}
            onSubmit={save}
            end={<NoticeInsetSpacer />}
          />
        ) : (
          <SaveAsStep
            text={m}
            destination={oneDestination}
            suggested={toSave[0]?.suggested ?? 'classroom'}
            onDestination={setDestination}
            name={toSave[0]?.name ?? ''}
            onName={(name) => paper && setNames((n) => ({ ...n, [paper.id]: name }))}
            banks={banks}
            bankTarget={bankTarget}
            newBankName={nextBankName(banks.map((b) => b.name))}
            onBankTarget={setBankTarget}
            questions={toSave[0]?.questions ?? 0}
            mc={all[0]?.result.analysis.outline.questions.filter((q) => q.kind === 'mc').length ?? 0}
            language={all[0] ? importLanguageMode(all[0].result.analysis, paperLanguage()) : 'en'}
            misfit={oneDestination !== 'bank' && all[0] ? misfit(oneDestination, all[0].result.analysis) : undefined}
            notOnCover={all[0] ? notOnCover(chromeOf(all[0].paper), oneDestination, all[0].result, Boolean(keepPreset[all[0].paper.id])) : undefined}
            onSubmit={save}
          />
        )
      ) : current && state ? (
        <ReviewStep
          key={paper?.id}
          text={m}
          result={current.result}
          state={state}
          update={update}
          {...(current.source && summary ? { answers: { name: current.source.name, summary } } : {})}
          base={base}
          cache={cache}
          notify={notices.notify}
          {...(paper && chromeOf(paper)
            ? {
                chrome: {
                  value: chromeOf(paper)!,
                  language: importLanguageMode(current.result.analysis, paperLanguage()),
                  keepPreset: Boolean(keepPreset[paper.id]),
                  onKeepPreset: (keep: boolean) => setKeepPreset((all) => ({ ...all, [paper.id]: keep })),
                },
              }
            : {})}
        />
      ) : null}
    </Dialog>
  );
}

/** The file is being read: big PDFs take seconds, and pdf.js loads on first use. */
function ReadingStep({ text: m, name }: { text: Text; name: string }) {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span aria-hidden className="h-6 w-6 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
      <p className="max-w-[60ch] break-all text-[14px] font-medium text-ink">{m.reading(name)}</p>
      <p className="text-[12px] text-ink-muted">{m.readingHint}</p>
    </div>
  );
}

/** Scanned pages, read one at a time by text recognition; the footer can stop it. */
export function ScanStep({ text: m, name, scanning, pictures }: { text: Text; name: string; scanning: Scanning; pictures?: number }) {
  const done = Math.max(0, Math.min(1, (scanning.page - 1) / Math.max(1, scanning.pages)));
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-ink">{m.scanTitle}</p>
      <p className="max-w-[60ch] break-all text-[12.5px] text-ink-muted">{pictures && pictures > 1 ? `${name} · ${m.pictureCount(pictures)}` : name}</p>
      <div
        role="progressbar"
        aria-label={m.scanTitle}
        aria-valuemin={0}
        aria-valuemax={scanning.pages}
        aria-valuenow={scanning.page - 1}
        className="mt-2 h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-surface-sunken"
      >
        <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out-soft" style={{ width: `${Math.max(4, done * 100)}%` }} />
      </div>
      <p className="text-[13px] font-medium tabular-nums text-ink">{m.scanPage(scanning.page, scanning.pages)}</p>
      <p className="text-[12px] text-ink-muted">{m.scanHint}</p>
    </div>
  );
}

/** Several files, read one after another: each row says where it is. */
function ReadingMany({ text: m, files, read, scanning }: { text: Text; files: PaperFile[]; read: Array<BatchFile | undefined>; scanning?: Scanning }) {
  const next = read.findIndex((f) => !f);
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <ul className="w-full max-w-[520px] divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {files.map((file, k) => {
          const done = read[k];
          const failed = done?.outcome.kind === 'problem';
          return (
            <li key={k} className="flex items-center gap-3 px-4 py-2.5">
              <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  failed ? (
                    <WarningIcon size={15} className="text-warn-ink" />
                  ) : (
                    <CheckCircleIcon size={15} className="text-ok" />
                  )
                ) : k === next ? (
                  <span className="h-4 w-4 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={file.name}>
                {file.name}
              </span>
              <span className={`shrink-0 text-[11.5px] tabular-nums ${failed ? 'text-warn-ink' : 'text-ink-muted'}`}>
                {done ? (failed ? m.fileProblem : m.fileRead) : k === next ? (scanning?.file === k ? m.scanPage(scanning.page, scanning.pages) : '…') : m.fileWaiting}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] text-ink-muted">{m.readingHint}</p>
    </div>
  );
}

/** Why the file cannot be imported, in a teacher's words; the footer has the ways back. */
export function ProblemStep({ text: m, problem }: { text: Text; problem: Extract<FileOutcome, { kind: 'problem' }> }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div role="alert" className="max-w-[520px] rounded-xl border border-line bg-surface-sunken px-6 py-5">
        <p className="text-[15px] font-semibold text-ink">{m.problemTitle}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{problemText(m, problem, isDesktop())}</p>
      </div>
    </div>
  );
}
