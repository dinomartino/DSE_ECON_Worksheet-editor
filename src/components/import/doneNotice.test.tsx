import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveMessages } from '@/i18n/catalogue';
import { APP_STACK_CLASS, NoticeStackView } from '@/components/ui/NoticeLayer';
import { autoHides, type Notice } from '@/store/notices';
import { papersDoneNotice } from './doneNotice';
import { IMPORT_MESSAGES } from './messages';

const en = resolveMessages(IMPORT_MESSAGES, 'en');
const zh = resolveMessages(IMPORT_MESSAGES, 'zh-HK');
const LONG = 'DBS Economics G11 Enhancement Class (2025-26) Assessment';
const papers = (n: number) => Array.from({ length: n }, (_, k) => ({ name: `${LONG} ${k + 1}`, kind: 'Classroom worksheet', questions: 20 + k }));
const draw = (input: ReturnType<typeof papersDoneNotice>) =>
  renderToStaticMarkup(<NoticeStackView notices={[{ ...input, id: 'n', scope: 'app', dismissible: true, rev: 1 } as Notice]} className={APP_STACK_CLASS} />);
const rows = (markup: string) => markup.match(/<li data-notice-row[\s\S]*?<\/li>/g) ?? [];

describe('the import done notice', () => {
  it('a short headline, one truncating row per paper, and Open only on the papers not open', () => {
    const opened: number[] = [];
    const notice = papersDoneNotice(en, papers(2), (k) => opened.push(k));
    expect(notice.body).toBe('Imported 2 papers');
    const markup = draw(notice);
    const [first, second] = rows(markup);
    expect(rows(markup)).toHaveLength(2);
    for (const row of [first, second]) {
      expect(row).toContain(`title="${LONG}`);
      expect(row).toMatch(/class="min-w-0 truncate"/);
      expect(row).toContain('Classroom worksheet · ');
    }
    // The tail that tells the two apart stays visible.
    expect(first).toContain('> Assessment 1</span>');
    expect(second).toContain('> Assessment 2</span>');
    expect(first).toContain('Open now');
    expect(first).not.toContain('<button');
    expect(second).toMatch(/<button[^>]*>Open<\/button>/);
    // No full-width button repeating the name.
    expect(markup).not.toContain(`Open ${LONG}`);
    notice.rows![1].action!.run();
    expect(opened).toEqual([1]);
  });

  it('lists four and counts the rest', () => {
    const notice = papersDoneNotice(zh, papers(6), () => {});
    expect(notice.body).toBe('已匯入 6 份試卷');
    const markup = draw(notice);
    expect(rows(markup)).toHaveLength(4);
    expect(markup.match(/>開啟<\/button>/g)).toHaveLength(3);
    expect(markup).toContain('另有 2 份在主畫面');
  });

  it('one paper: the row, no Open link and no tag (it is on screen)', () => {
    const notice = papersDoneNotice(en, papers(1), () => {}, 2);
    expect(notice.body).toBe('Imported 1 paper');
    const markup = draw(notice);
    expect(rows(markup)).toHaveLength(1);
    expect(markup).not.toContain('<button type="button" class="shrink-0');
    expect(markup).not.toContain('Open now');
    expect(markup).toContain('2 MC have no answer yet');
    expect(autoHides({ ...notice })).toBe(true);
  });
});
