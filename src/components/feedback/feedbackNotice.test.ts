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

  it('a cut-short link asks for a paste, and stays until closed', () => {
    const notice = sentNotice({ via: 'mail', truncated: true }, m);
    expect(notice.tone).toBe('warning');
    expect(notice.body).toBe(`${m.sentMail}${m.truncated}`);
    expect(autoHides(notice)).toBe(false);
  });
});
