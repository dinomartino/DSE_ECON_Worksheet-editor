'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import pkg from '../../../package.json';
import { Button, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
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

const PLACEHOLDER: Record<FeedbackKind, string> = {
  bug: 'What did you do, what happened, what did you expect?',
  idea: 'What would help, and where would you use it?',
  other: 'A review, a question, anything else.',
};

const INPUT =
  'rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

type Sent = { via: 'github' | 'mail'; truncated: boolean };

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
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Sent | undefined>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | undefined>();
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
      setError('Copy failed — the browser blocked clipboard access.');
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
    } catch {
      setError(via === 'github' ? 'Could not open GitHub.' : 'Could not open your mail app.');
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
      title="Send feedback"
      description="A bug, an idea or a review. Your worksheet itself is never attached."
      width={540}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={() => void copyAll()} disabled={empty}>
            {copied ? 'Copied' : 'Copy to clipboard'}
          </Button>
          {FEEDBACK_EMAIL && (
            <Button onClick={() => void open('mail')} disabled={empty}>
              Send by email
            </Button>
          )}
          <Button
            variant={sent ? 'default' : 'primary'}
            onClick={() => void open('github')}
            disabled={empty}
          >
            Open on GitHub
          </Button>
          {sent && (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 px-5 py-5">
        <Field label="Kind">
          <Segmented
            label="Kind of feedback"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bug', label: 'Bug' },
              { value: 'idea', label: 'Idea' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Message</span>
          <textarea
            ref={messageRef}
            required
            rows={6}
            value={message}
            placeholder={PLACEHOLDER[kind]}
            onChange={(event) => setMessage(event.target.value)}
            className={`${INPUT} scroll-slim resize-y py-2 leading-relaxed`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">
            Email <span className="font-normal text-ink-muted">— optional, so we can reply</span>
          </span>
          <input
            type="email"
            value={email}
            placeholder="you@school.edu.hk"
            onChange={(event) => setEmail(event.target.value)}
            className={`${INPUT} h-9`}
          />
        </label>

        <details className="group rounded-lg bg-surface-sunken px-3 py-2 text-[12px] text-ink-muted">
          <summary className="cursor-pointer select-none font-medium text-ink-muted transition-colors duration-150 ease-out-soft hover:text-ink">
            Details we attach
            <span className="font-normal text-ink-subtle">
              {' '}
              — version {details.appVersion}, {details.platform}, {details.system}
            </span>
          </summary>
          <ul className="mt-1.5 animate-slide-down-in space-y-0.5 pl-1">
            {detailLines(details).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>

        <p className="text-[11px] leading-relaxed text-ink-subtle">
          GitHub opens a public issue and needs a free account
          {FEEDBACK_EMAIL ? '; email goes privately to the developer.' : '.'}
        </p>

        {sent && (
          <p role="status" className="animate-slide-up-in rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
            {sent.via === 'github'
              ? 'Press Submit on the GitHub page to send it.'
              : 'Press Send in your mail app to send it.'}
            {sent.truncated &&
              ' The message was too long for the link — the full report is on your clipboard, paste the rest in.'}
          </p>
        )}

        {error && (
          <p role="alert" className="animate-slide-up-in rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
