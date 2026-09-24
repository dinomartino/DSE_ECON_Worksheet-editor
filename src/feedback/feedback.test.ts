import { describe, expect, it } from 'vitest';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import {
  buildReport,
  describeDocument,
  describeSystem,
  FEEDBACK_EMAIL,
  GITHUB_URL_LIMIT,
  githubIssueUrl,
  MAILTO_URL_LIMIT,
  mailtoUrl,
  TRUNCATION_NOTE,
  type FeedbackInput,
} from './feedback';

const details = {
  appVersion: '0.2.0',
  platform: 'web' as const,
  system: 'macOS · Chrome 140',
  language: 'bilingual' as const,
  document: 'A document with 3 questions',
};

const input = (patch: Partial<FeedbackInput> = {}): FeedbackInput => ({
  kind: 'bug',
  message: 'Export fails\nClicked Export, nothing happened.',
  details,
  ...patch,
});

const params = (url: string) => new URL(url).searchParams;

describe('buildReport', () => {
  it('titles from the first line, prefixed by kind', () => {
    expect(buildReport(input()).title).toBe('[Bug] Export fails');
    expect(buildReport(input({ kind: 'idea', message: '  ' })).title).toBe('[Idea] Feedback');
  });

  it('caps a long title', () => {
    const title = buildReport(input({ message: 'x'.repeat(200) })).title;
    expect(Array.from(title).length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });

  it('carries the details and the optional email', () => {
    const report = buildReport(input({ email: 'teacher@example.com' }));
    for (const part of ['App: 0.2.0 (web)', 'macOS · Chrome 140', 'Language mode: Bilingual', 'A document with 3 questions']) {
      expect(report.body).toContain(part);
      expect(report.text).toContain(part);
    }
    expect(report.body).toContain('teacher@example.com');
    expect(buildReport(input()).body).not.toContain('Reply to');
  });

  it('labels by kind with labels that exist on the repo', () => {
    expect(buildReport(input({ kind: 'bug' })).labels).toEqual(['bug']);
    expect(buildReport(input({ kind: 'idea' })).labels).toEqual(['enhancement']);
    expect(buildReport(input({ kind: 'other' })).labels).toEqual([]);
  });
});

describe('describeDocument', () => {
  it('reports a count and none of the content', () => {
    const worksheet = buildAcceptanceWorksheet();
    const described = describeDocument(worksheet);
    expect(described).toBe(`A document with ${worksheet.questions.length} questions`);

    const report = buildReport(input({ details: { ...details, document: described } }));
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(worksheet);
    const authored = strings.filter((s) => s.trim().length >= 12);
    expect(authored.length).toBeGreaterThan(5);
    for (const text of authored) {
      expect(report.body).not.toContain(text);
      expect(report.text).not.toContain(text);
    }
  });

  it('says when nothing is open', () => {
    expect(describeDocument(undefined)).toBe('No document open');
  });
});

describe('describeSystem', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'macOS · Chrome 140'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 'Windows · Edge 140'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15', 'macOS · Safari 18'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Windows · Firefox 131'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)', 'macOS · WebKit'],
  ])('%s', (ua, expected) => {
    expect(describeSystem(ua)).toBe(expected);
  });
});

describe('githubIssueUrl', () => {
  it('prefills title, body and labels on the public repo', () => {
    const { url, truncated } = githubIssueUrl(buildReport(input()));
    expect(truncated).toBe(false);
    expect(url.startsWith('https://github.com/dinomartino/DSE_ECON_Worksheet-editor/issues/new?')).toBe(true);
    expect(params(url).get('title')).toBe('[Bug] Export fails');
    expect(params(url).get('labels')).toBe('bug');
    expect(params(url).get('body')).toContain('Clicked Export, nothing happened.');
    expect(url).not.toContain('+');
  });

  it('omits labels for Other', () => {
    expect(params(githubIssueUrl(buildReport(input({ kind: 'other' }))).url).has('labels')).toBe(false);
  });

  it('round-trips Chinese text and reserved characters', () => {
    const message = '匯出後，選擇題的答案跑掉了 & 50% = ? #1 a+b';
    const { url } = githubIssueUrl(buildReport(input({ message })));
    expect(url).toContain(encodeURIComponent('匯出'));
    expect(params(url).get('body')).toContain(message);
  });

  it('cuts a long message to fit, keeping the details', () => {
    const message = '市場失靈'.repeat(2000);
    const report = buildReport(input({ message }));
    const { url, truncated } = githubIssueUrl(report);
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(GITHUB_URL_LIMIT);
    expect(url.length).toBeGreaterThan(GITHUB_URL_LIMIT - 100);
    const body = params(url).get('body')!;
    expect(body).toContain(TRUNCATION_NOTE);
    expect(body).toContain('App: 0.2.0 (web)');
    expect(body.startsWith('市場失靈')).toBe(true);
    // The clipboard copy is the whole thing.
    expect(report.text).toContain(message);
  });

  it('never splits a surrogate pair', () => {
    const { url } = githubIssueUrl(buildReport(input({ message: '📈'.repeat(3000) })));
    expect(() => decodeURIComponent(url)).not.toThrow();
  });
});

describe('mailtoUrl', () => {
  it('addresses the feedback inbox with subject and body', () => {
    const { url, truncated } = mailtoUrl(buildReport(input({ message: '圖表 fails' })));
    expect(truncated).toBe(false);
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=`)).toBe(true);
    expect(url).not.toContain('+');
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Bug: 圖表 fails');
    expect(body).toContain('App: 0.2.0 (web)');
  });

  it('fits the mail limit', () => {
    const { url, truncated } = mailtoUrl(buildReport(input({ message: 'long '.repeat(2000) })));
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAILTO_URL_LIMIT);
  });
});
