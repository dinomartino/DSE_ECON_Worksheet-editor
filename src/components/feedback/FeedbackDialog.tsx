'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../../../package.json';
import { Button, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { useDialogNotices } from '@/components/ui/NoticeLayer';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import type { NoticeInput } from '@/store/notices';
import { isDesktop, openExternal } from '@/platform';
import type { LanguageMode } from '@/model/types';
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
import { FEEDBACK_MESSAGES } from './messages';

const INPUT =
  'rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

type Sent = { via: 'github' | 'mail'; truncated: boolean };

/** Where to press send. A cut-short link also asks for a paste, so that one stays until closed. */
export function sentNotice(sent: Sent, m: Messages<typeof FEEDBACK_MESSAGES>): NoticeInput {
  return {
    id: 'feedback-sent',
    tone: sent.truncated ? 'warning' : 'success',
    body: `${sent.via === 'github' ? m.sentGithub : m.sentMail}${sent.truncated ? m.truncated : ''}`,
  };
}

/**
 * Send a bug, idea or review: a prefilled GitHub issue, an email, or the clipboard.
 * `document` comes from `describeDocument` — a count, never the content.
 * Pass a stable `onClose`: `Dialog` re-focuses its panel when it changes.
 */
export function FeedbackDialog({
  onClose,
  language,
  document,
}: {
  onClose: () => void;
  language?: LanguageMode;
  document: string;
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

  const empty = message.trim() === '';
  const report = () => buildReport({ kind, message, email, details });

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      setError(m.copyFailed);
      return false;
    }
  };

  const open = async (via: Sent['via']) => {
    setError(undefined);
    const built = report();
    const link = via === 'github' ? githubIssueUrl(built) : mailtoUrl(built);
    // Too long for a link: the whole report goes to the clipboard for pasting.
    if (link.truncated && !(await copy(built.text))) return;
    try {
      await openExternal(link.url);
      setSent({ via, truncated: link.truncated });
      notices.notify(sentNotice({ via, truncated: link.truncated }, m));
    } catch {
      setError(via === 'github' ? m.noGithub : m.noMail);
    }
  };

  const copyAll = async () => {
    setError(undefined);
    if (!(await copy(report().text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            {copied ? m.copied : m.copyAll}
          </Button>
          {FEEDBACK_EMAIL && (
            <Button onClick={() => void open('mail')} disabled={empty}>
              {m.sendEmail}
            </Button>
          )}
          <Button
            variant={sent ? 'default' : 'primary'}
            onClick={() => void open('github')}
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
      <div className="space-y-5 px-5 py-5">
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
