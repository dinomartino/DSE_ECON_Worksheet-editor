'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../../../package.json';
import { Button, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { useDialogNotices } from '@/components/ui/NoticeLayer';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import type { NoticeInput } from '@/store/notices';
import { isDesktop, openExternal, readDroppedFile, revealFile, subscribeToFileDrops } from '@/platform';
import type { LanguageMode, OutputMode, Worksheet } from '@/model/types';
import { makeAnonymisedCopy, saveAnonymisedCopy, type AnonymisedCopy } from '@/feedback/anonymisedCopy';
import {
  buildReport,
  describeSystem,
  detailLines,
  FEEDBACK_EMAIL,
  githubIssueUrl,
  mailtoUrl,
  type FeedbackDetails,
  type FeedbackKind,
} from '@/feedback/feedback';
import {
  clipboardPlan,
  copyScreenshot,
  imageFromClipboard,
  keyboardOs,
  pasteChord,
  prepareScreenshot,
  releaseScreenshot,
  screenshotProblem,
  screenshotType,
  type Screenshot,
} from '@/feedback/screenshot';
import { AnonymisedCopyPreview } from './AnonymisedCopyPreview';
import { FEEDBACK_MESSAGES } from './messages';
import { ScreenshotField } from './ScreenshotField';

const INPUT =
  'rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

type Sent = {
  via: 'github' | 'mail';
  truncated: boolean;
  /** A screenshot was attached: whether it made it onto the clipboard. */
  screenshot?: 'copied' | 'failed';
  /** The paste chord the notice names ("⌘V"). */
  chord?: string;
  /** The anonymised copy's file name, to drag in after the page opens. */
  anonymisedCopy?: string;
};

/**
 * Where to press send. A cut-short link also asks for a paste, so that one stays until
 * closed. A copied screenshot says where to paste it and stays, with the screenshot (and,
 * when the link was cut short, the full text) a click away for a second paste.
 */
export function sentNotice(
  sent: Sent,
  m: Messages<typeof FEEDBACK_MESSAGES>,
  again: { copyScreenshot?: () => void; copyText?: () => void } = {},
): NoticeInput {
  const chord = sent.chord ?? 'Ctrl+V';
  const copy = sent.anonymisedCopy ? m.sentAnon(sent.anonymisedCopy) : '';
  if (sent.screenshot === 'copied') {
    return {
      id: 'feedback-sent',
      tone: 'success',
      body: `${sent.via === 'github' ? m.sentGithubShot(chord) : m.sentMailShot(chord)}${copy}${sent.truncated ? m.truncatedShot : ''}`,
      actions: [
        ...(sent.truncated && again.copyText
          ? [{ label: m.copyFullText, run: again.copyText, primary: true, keepOpen: true }]
          : []),
        ...(again.copyScreenshot ? [{ label: m.copyScreenshot, run: again.copyScreenshot, keepOpen: true }] : []),
      ],
    };
  }
  return {
    id: 'feedback-sent',
    tone: sent.truncated || sent.screenshot === 'failed' ? 'warning' : 'success',
    body: `${sent.via === 'github' ? m.sentGithub : m.sentMail}${copy}${sent.truncated ? m.truncated : ''}${
      sent.screenshot === 'failed' ? m.screenshotCopyFailed : ''
    }`,
  };
}

/**
 * Send a bug, idea or review: a prefilled GitHub issue, an email, or the clipboard.
 * `document` comes from `describeDocument` — a count, never the content. `worksheet`, the
 * open document, only offers an anonymised copy (`anonymise.ts`), previewed before it is
 * saved; the report then names the file for the teacher to drag in.
 * Pass a stable `onClose`: `Dialog` re-focuses its panel when it changes.
 */
export function FeedbackDialog({
  onClose,
  language,
  document,
  worksheet,
}: {
  onClose: () => void;
  language?: LanguageMode;
  document: string;
  worksheet?: Worksheet;
}) {
  const m = useMessages(FEEDBACK_MESSAGES);
  const placeholder: Record<FeedbackKind, string> = { bug: m.placeholderBug, idea: m.placeholderIdea, other: m.placeholderOther };
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Sent | undefined>();
  const [copied, setCopied] = useState(false);
  // What happened after a click floats over the dialog's foot, never lengthening it.
  const notices = useDialogNotices();
  const setError = (message: string | undefined) => {
    if (message === undefined) notices.dismiss('feedback-error');
    else notices.notify({ id: 'feedback-error', tone: 'error', body: message });
  };
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // After Dialog's own effect, which focuses the panel.
  useEffect(() => messageRef.current?.focus(), []);

  const details = useMemo<FeedbackDetails>(
    () => ({
      appVersion: pkg.version,
      platform: isDesktop() ? 'desktop' : 'web',
      system: describeSystem(typeof navigator === 'undefined' ? '' : navigator.userAgent),
      language,
      document,
    }),
    [language, document],
  );

  const os = useMemo(() => keyboardOs(typeof navigator === 'undefined' ? '' : navigator.userAgent), []);
  const chord = pasteChord(os);
  const [screenshot, setScreenshot] = useState<Screenshot | undefined>();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  // The thumbnail's object URL lives as long as the image does.
  useEffect(() => () => releaseScreenshot(screenshot), [screenshot]);

  // The anonymised copy: `anonCopy` while its preview is open, `attached` once it is saved.
  const [anonCopy, setAnonCopy] = useState<AnonymisedCopy | undefined>();
  const [attached, setAttached] = useState<string | undefined>();
  // Desktop: where it was saved, so the file is a click from being dragged in.
  const [attachedPath, setAttachedPath] = useState<string | undefined>();
  const [preparing, setPreparing] = useState(false);
  const closePreview = useCallback(() => setAnonCopy(undefined), []);
  const previewMode = useMemo<OutputMode>(() => ({ language: language ?? 'en', version: 'teacher' }), [language]);

  const empty = message.trim() === '';
  const report = () =>
    buildReport({
      kind,
      message,
      email,
      details,
      ...(screenshot ? { screenshotPaste: chord } : {}),
      ...(attached ? { anonymisedCopy: attached } : {}),
    });

  /** Make the copy (on this device, once) and open its preview. Nothing is saved yet. */
  const prepareCopy = () => {
    if (!worksheet) return;
    setError(undefined);
    setPreparing(true);
    // A frame first, so "Preparing…" shows before a document with large pictures is scrambled.
    setTimeout(() => {
      try {
        setAnonCopy(makeAnonymisedCopy(worksheet));
      } catch {
        setError(m.anonFailed);
      } finally {
        setPreparing(false);
      }
    }, 30);
  };

  /** Save exactly the previewed text. A cancelled save sheet keeps the preview open. */
  const saveCopy = async () => {
    if (!anonCopy) return;
    try {
      const saved = await saveAnonymisedCopy(anonCopy);
      if (!saved) return;
      const name = saved.name ?? anonCopy.fileName;
      setAttached(name);
      setAttachedPath(saved.path);
      // The report dialog comes back with the file named in its row; a notice raised here
      // would close with the preview.
      setAnonCopy(undefined);
    } catch {
      setError(m.anonSaveFailed);
    }
  };

  /** Take the teacher's image: checked, then decoded and kept as PNG. */
  const attach = useCallback(
    async (file: Blob & { name?: string }) => {
      const problem = screenshotProblem(file);
      if (problem) {
        notices.notify({
          id: 'feedback-error',
          tone: 'error',
          body: problem === 'tooLarge' ? m.screenshotTooLarge : m.screenshotNotImage,
        });
        return;
      }
      notices.dismiss('feedback-error');
      setReading(true);
      try {
        const type = screenshotType(file);
        setScreenshot(await prepareScreenshot(file.type ? file : new Blob([file], { type })));
      } catch {
        notices.notify({ id: 'feedback-error', tone: 'error', body: m.screenshotUnreadable });
      } finally {
        setReading(false);
      }
    },
    [m, notices],
  );

  // Paste anywhere in the dialog. Text pasted into a field stays text: an image is taken
  // only when the clipboard has no text to go with it, or the paste is outside a field.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const image = imageFromClipboard(event.clipboardData);
      if (!image) return;
      const inField = event.target instanceof Element && event.target.closest('textarea, input');
      if (inField && event.clipboardData?.types.includes('text/plain')) return;
      event.preventDefault();
      void attach(image);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [attach]);

  // Desktop: a file dropped from Finder or Explorer arrives as the shell's own event, never
  // as an HTML5 drop (`subscribeToFileDrops`). The start screen stands aside meanwhile.
  useEffect(() => {
    if (!isDesktop()) return;
    return subscribeToFileDrops((event) => {
      if (event.type === 'enter') setDragging(true);
      else if (event.type === 'leave') setDragging(false);
      else if (event.type === 'drop') {
        setDragging(false);
        const path = event.paths[0];
        if (!path) return;
        const name = path.split(/[\\/]/).pop() ?? path;
        const type = screenshotType({ name });
        if (!type) {
          notices.notify({ id: 'feedback-error', tone: 'error', body: m.screenshotNotImage });
          return;
        }
        void readDroppedFile(path).then(
          (bytes) => attach(Object.assign(new Blob([bytes as BlobPart], { type }), { name })),
          () => notices.notify({ id: 'feedback-error', tone: 'error', body: m.screenshotTooLarge }),
        );
      }
    });
  }, [attach, m, notices]);

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      setError(m.copyFailed);
      return false;
    }
  };

  /** A second click's copy, from a notice or the thumbnail. Started inside the click. */
  const copyShot = (shot: Screenshot | undefined = screenshot) => {
    if (!shot) return;
    copyScreenshot(shot).then(
      () => notices.notify({ id: 'feedback-copied', tone: 'success', body: m.screenshotCopied(chord) }),
      () => setError(m.screenshotCopyFailed.trim()),
    );
  };

  /*
   * One clipboard for up to two things (`clipboardPlan`): with a screenshot, the image goes
   * on it now and the text rides the link; a link cut short offers the full text after.
   * The first write starts inside the click, before any await, or WebKit refuses it, and
   * is awaited before the link opens, since the page must still have focus to write.
   */
  const open = (via: Sent['via']) => {
    setError(undefined);
    const built = report();
    const shot = screenshot;
    const link = via === 'github' ? githubIssueUrl(built) : mailtoUrl(built);
    const plan = clipboardPlan(via, shot !== undefined, link.truncated);
    const first =
      plan.now === 'image' && shot
        ? copyScreenshot(shot).then(
            () => true,
            () => false,
          )
        : plan.now === 'text'
          ? copy(built.text)
          : Promise.resolve(true);
    void (async () => {
      const copied = await first;
      if (plan.now === 'text' && !copied) return;
      // The screenshot did not copy: the text, if cut short, still needs the clipboard.
      if (plan.now === 'image' && !copied && link.truncated && !(await copy(built.text))) return;
      try {
        await openExternal(link.url);
        const outcome: Sent = {
          via,
          truncated: link.truncated,
          chord,
          ...(shot ? { screenshot: copied ? 'copied' : 'failed' } : {}),
          ...(attached ? { anonymisedCopy: attached } : {}),
        };
        setSent(outcome);
        notices.notify(
          sentNotice(outcome, m, {
            copyScreenshot: () => copyShot(shot),
            copyText: () => void copy(built.text),
          }),
        );
      } catch {
        setError(via === 'github' ? m.noGithub : m.noMail);
      }
    })();
  };

  const copyAll = async () => {
    setError(undefined);
    const shot = screenshot;
    const plan = clipboardPlan('copy', shot !== undefined, false);
    if (!(await copy(report().text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (plan.offer === 'image' && shot) {
      notices.notify({
        id: 'feedback-copied',
        tone: 'success',
        body: m.copiedTextShot,
        actions: [{ label: m.copyScreenshot, run: () => copyShot(shot), primary: true }],
      });
    }
  };

  // A file dragged over the dialog (web): the dialog takes it, the page under it never sees it.
  const dragProps = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void attach(file);
    },
  };

  if (anonCopy) {
    return (
      <AnonymisedCopyPreview
        m={m}
        copy={anonCopy}
        mode={previewMode}
        noticeScope={notices.scope}
        onSave={saveCopy}
        onCancel={closePreview}
      />
    );
  }

  return (
    <Dialog
      noticeScope={notices.scope}
      title={m.title}
      description={m.description}
      width={540}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={() => void copyAll()} disabled={empty}>
            {copied ? m.copied : screenshot ? m.copyText : m.copyAll}
          </Button>
          {FEEDBACK_EMAIL && (
            <Button onClick={() => open('mail')} disabled={empty}>
              {m.sendEmail}
            </Button>
          )}
          <Button
            variant={sent ? 'default' : 'primary'}
            onClick={() => open('github')}
            disabled={empty}
          >
            {m.openGithub}
          </Button>
          {sent && (
            <Button variant="primary" onClick={onClose}>
              {m.done}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 px-5 py-5" {...dragProps}>
        <Field label={m.kind}>
          <Segmented
            label={m.kindOfFeedback}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bug', label: m.bug },
              { value: 'idea', label: m.idea },
              { value: 'other', label: m.other },
            ]}
          />
        </Field>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">{m.message}</span>
          <textarea
            ref={messageRef}
            required
            rows={6}
            value={message}
            placeholder={placeholder[kind]}
            onChange={(event) => setMessage(event.target.value)}
            className={`${INPUT} scroll-slim resize-y py-2 leading-relaxed`}
          />
        </label>

        <ScreenshotField
          m={m}
          os={os}
          screenshot={screenshot}
          reading={reading}
          dragging={dragging}
          onChoose={(file) => void attach(file)}
          onCopy={() => copyShot()}
          onRemove={() => setScreenshot(undefined)}
        />

        {worksheet && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">
              {m.anonCopy} <span className="font-normal text-ink-muted">{m.anonOptional}</span>
            </span>
            {attached ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-muted">{m.anonSaved(attached)}</span>
                {attachedPath && (
                  <Button size="sm" onClick={() => void revealFile(attachedPath).catch(() => undefined)}>
                    {m.anonShowFile}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="subtle"
                  aria-label={m.anonLeaveOutLabel}
                  title={m.anonLeaveOutLabel}
                  onClick={() => setAttached(undefined)}
                >
                  {m.anonLeaveOut}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-3 py-2">
                <span className="text-[13px] text-ink-muted">{preparing ? m.anonPreparing : m.anonZone}</span>
                <Button size="sm" disabled={preparing} onClick={prepareCopy}>
                  {m.anonAttach}
                </Button>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-ink-subtle">{m.anonHint}</p>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">
            {m.email} <span className="font-normal text-ink-muted">{m.emailOptional}</span>
          </span>
          <input
            type="email"
            value={email}
            placeholder="you@school.edu.hk" // i18n-ignore: email example
            onChange={(event) => setEmail(event.target.value)}
            className={`${INPUT} h-9`}
          />
        </label>

        <details className="group rounded-lg bg-surface-sunken px-3 py-2 text-[12px] text-ink-muted">
          <summary className="cursor-pointer select-none font-medium text-ink-muted transition-colors duration-150 ease-out-soft hover:text-ink">
            {m.details}
            <span className="font-normal text-ink-subtle">
              {' '}
              {m.detailsSummary(details.appVersion, details.platform, details.system)}
            </span>
          </summary>
          <ul className="mt-1.5 animate-slide-down-in space-y-0.5 pl-1">
            {detailLines(details).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>

        <p className="text-[11px] leading-relaxed text-ink-subtle">
          {m.githubNote(!!FEEDBACK_EMAIL)}
        </p>

      </div>
    </Dialog>
  );
}
