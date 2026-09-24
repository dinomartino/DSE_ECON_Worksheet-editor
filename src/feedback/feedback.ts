/**
 * In-app feedback: a report built entirely in the browser, handed to GitHub, a mail
 * client or the clipboard. No server and no token — anything in the bundle is public.
 * The report carries the app's context, never the document's content.
 */
import type { LanguageMode, Worksheet } from '@/model/types';

export const FEEDBACK_REPO = 'dinomartino/DSE_ECON_Worksheet-editor';
export const FEEDBACK_EMAIL = 'dseconmentor@gmail.com';

/**
 * Measured 2026-09 in Chrome, signed out: GitHub's sign-in page answers 500 from ~4,000
 * characters and drops `return_to` (the prefill) from ~5,000. Signed in goes further,
 * but a teacher's state is unknown, so the cap fits the signed-out path.
 */
export const GITHUB_URL_LIMIT = 3500;
/** Some mail clients (Outlook on Windows) drop a `mailto:` longer than ~2k. */
export const MAILTO_URL_LIMIT = 2000;

export const TRUNCATION_NOTE = '(continued — paste the rest from your clipboard)';

export type FeedbackKind = 'bug' | 'idea' | 'other';

export const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: 'Bug',
  idea: 'Idea',
  other: 'Other',
};

/** Existing labels on the repo. GitHub ignores them unless the reporter can triage. */
const KIND_LABELS: Record<FeedbackKind, string[]> = {
  bug: ['bug'],
  idea: ['enhancement'],
  other: [],
};

export interface FeedbackDetails {
  appVersion: string;
  platform: 'web' | 'desktop';
  /** "macOS · Chrome 140" — from the user agent. */
  system: string;
  language?: LanguageMode;
  /** From `describeDocument`: a count, never the content. */
  document: string;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  email?: string;
  details: FeedbackDetails;
}

export interface FeedbackReport {
  kind: FeedbackKind;
  title: string;
  /** Markdown, for the GitHub issue. */
  body: string;
  /** Plain text, for mail and the clipboard. */
  text: string;
  labels: string[];
  input: FeedbackInput;
}

export interface FeedbackLink {
  url: string;
  /** The message was cut to fit; the full report belongs on the clipboard. */
  truncated: boolean;
}

const LANGUAGE_LABEL: Record<LanguageMode, string> = {
  en: 'English',
  zh: 'Chinese',
  bilingual: 'Bilingual',
};

/** What the report says about the open document: its size, nothing it contains. */
export function describeDocument(worksheet: Worksheet | undefined): string {
  if (!worksheet) return 'No document open';
  const n = worksheet.questions.length;
  return `A document with ${n} question${n === 1 ? '' : 's'}`;
}

/** "macOS · Chrome 140" from a user-agent string; order matters (Edge says Chrome too). */
export function describeSystem(userAgent: string): string {
  const os = /Windows NT/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Android/.test(userAgent)
          ? 'Android'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'Unknown OS';
  const browsers: Array<[string, RegExp]> = [
    ['Edge', /Edg\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+)[^ ]* .*Safari/],
  ];
  for (const [name, pattern] of browsers) {
    const match = userAgent.match(pattern);
    if (match) return `${os} · ${name} ${match[1]}`;
  }
  // The desktop shell's WebKit view has no browser token.
  if (/AppleWebKit/.test(userAgent)) return `${os} · WebKit`;
  return os;
}

export function detailLines(details: FeedbackDetails): string[] {
  return [
    `App: ${details.appVersion} (${details.platform})`,
    `System: ${details.system}`,
    ...(details.language ? [`Language mode: ${LANGUAGE_LABEL[details.language]}`] : []),
    `Document: ${details.document}`,
  ];
}

function titleFor(kind: FeedbackKind, message: string): string {
  const first = message.trim().split('\n')[0].trim();
  const chars = Array.from(first);
  const summary = chars.length > 70 ? `${chars.slice(0, 70).join('').trimEnd()}…` : first;
  return `[${KIND_LABEL[kind]}] ${summary || 'Feedback'}`;
}

function markdownBody(input: FeedbackInput, message: string): string {
  const email = input.email?.trim();
  return [
    message,
    ...(email ? ['', `**Reply to:** ${email}`] : []),
    '',
    '---',
    '**Details** (attached by the app)',
    ...detailLines(input.details).map((line) => `- ${line}`),
  ].join('\n');
}

function plainText(input: FeedbackInput, message: string): string {
  const email = input.email?.trim();
  return [
    `${KIND_LABEL[input.kind]}: ${message}`,
    ...(email ? ['', `Reply to: ${email}`] : []),
    '',
    '---',
    ...detailLines(input.details),
  ].join('\n');
}

export function buildReport(input: FeedbackInput): FeedbackReport {
  const message = input.message.trim();
  return {
    kind: input.kind,
    title: titleFor(input.kind, message),
    body: markdownBody(input, message),
    text: plainText(input, message),
    labels: KIND_LABELS[input.kind],
    input,
  };
}

/**
 * The longest prefix of the message whose URL fits `limit`, found by bisection over
 * code points (encoding makes a CJK character nine bytes, so length is not linear).
 */
function fitMessage(
  message: string,
  limit: number,
  urlFor: (message: string) => string,
): FeedbackLink {
  const whole = urlFor(message);
  if (whole.length <= limit) return { url: whole, truncated: false };

  const chars = Array.from(message);
  const cut = (n: number) => `${chars.slice(0, n).join('').trimEnd()}\n\n${TRUNCATION_NOTE}`;
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (urlFor(cut(mid)).length <= limit) lo = mid;
    else hi = mid - 1;
  }
  return { url: urlFor(cut(lo)), truncated: true };
}

export function githubIssueUrl(report: FeedbackReport, limit = GITHUB_URL_LIMIT): FeedbackLink {
  const message = report.input.message.trim();
  return fitMessage(message, limit, (m) => {
    const params = new URLSearchParams({ title: report.title, body: markdownBody(report.input, m) });
    if (report.labels.length > 0) params.set('labels', report.labels.join(','));
    return `https://github.com/${FEEDBACK_REPO}/issues/new?${params.toString().replace(/\+/g, '%20')}`;
  });
}

export function mailtoUrl(report: FeedbackReport, limit = MAILTO_URL_LIMIT): FeedbackLink {
  const message = report.input.message.trim();
  return fitMessage(message, limit, (m) => {
    // mailto takes RFC 3986 escapes; URLSearchParams' `+` for space is wrong there.
    const subject = encodeURIComponent(`Econ worksheet editor — ${report.title}`);
    const body = encodeURIComponent(plainText(report.input, m).replace(/\n/g, '\r\n'));
    return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  });
}
