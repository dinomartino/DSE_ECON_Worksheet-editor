import { describe, expect, it } from 'vitest';
import { resolveMessages } from '@/i18n/catalogue';
import { autoHides } from '@/store/notices';
import { sentNotice } from './FeedbackDialog';
import { FEEDBACK_MESSAGES } from './messages';

describe('Feedback: the sent notice', () => {
  const m = resolveMessages(FEEDBACK_MESSAGES, 'en');

  it('a whole report is a success that fades', () => {
    const notice = sentNotice({ via: 'github', truncated: false }, m);
    expect(notice).toMatchObject({ tone: 'success', body: m.sentGithub });
    expect(autoHides(notice)).toBe(true);
  });

  it('a copied screenshot says where to paste it, and stays with a copy-again button', () => {
    const copyScreenshot = () => undefined;
    const notice = sentNotice({ via: 'github', truncated: false, screenshot: 'copied', chord: '⌘V' }, m, {
      copyScreenshot,
      copyText: () => undefined,
    });
    expect(notice).toMatchObject({ tone: 'success', body: m.sentGithubShot('⌘V') });
    expect(notice.body).toContain('⌘V');
    expect(notice.actions?.map((action) => action.label)).toEqual([m.copyScreenshot]);
    expect(notice.actions?.[0].run).toBe(copyScreenshot);
    expect(autoHides(notice)).toBe(false);
  });

  it('a screenshot and a cut-short link: the full text is the next copy', () => {
    const notice = sentNotice({ via: 'mail', truncated: true, screenshot: 'copied', chord: 'Ctrl+V' }, m, {
      copyScreenshot: () => undefined,
      copyText: () => undefined,
    });
    expect(notice.body).toBe(`${m.sentMailShot('Ctrl+V')}${m.truncatedShot}`);
    expect(notice.actions?.map((action) => [action.label, action.primary === true])).toEqual([
      [m.copyFullText, true],
      [m.copyScreenshot, false],
    ]);
  });

  it('a screenshot that would not copy says so, and stays', () => {
    const notice = sentNotice({ via: 'github', truncated: false, screenshot: 'failed', chord: '⌘V' }, m);
    expect(notice.tone).toBe('warning');
    expect(notice.body).toBe(`${m.sentGithub}${m.screenshotCopyFailed}`);
    expect(autoHides(notice)).toBe(false);
  });

  it('a cut-short link asks for a paste, and stays until closed', () => {
    const notice = sentNotice({ via: 'mail', truncated: true }, m);
    expect(notice.tone).toBe('warning');
    expect(notice.body).toBe(`${m.sentMail}${m.truncated}`);
    expect(autoHides(notice)).toBe(false);
  });
});
