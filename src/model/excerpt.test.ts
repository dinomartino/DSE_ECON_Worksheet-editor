import { describe, expect, it } from 'vitest';
import { biTextExcerpt, blocksExcerpt, questionExcerpt } from './excerpt';
import { createMcqQuestion, newId } from './factories';
import { bi } from './text';
import type { ContentBlock, Question } from './types';

const para = (en: string, zh: string): ContentBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });
const withStem = (...blocks: ContentBlock[]): Question => ({ ...createMcqQuestion(), blocks });

describe('excerpt', () => {
  it('prefers the asked-for language and falls back to the other', () => {
    expect(biTextExcerpt(bi('Price', '價格'), 'en')).toBe('Price');
    expect(biTextExcerpt(bi('Price', '價格'), 'zh')).toBe('價格');
    expect(biTextExcerpt(bi('', '價格'), 'en')).toBe('價格');
    expect(biTextExcerpt(bi('Price', ''), 'zh')).toBe('Price');
    expect(biTextExcerpt(bi('Price', '價格'), 'bilingual')).toBe('Price');
    expect(biTextExcerpt(undefined)).toBe('');
  });

  it('reads the first paragraph, skipping other blocks', () => {
    const table: ContentBlock = { kind: 'table', id: newId(), rows: [] } as unknown as ContentBlock;
    expect(blocksExcerpt([table, para('First', '一'), para('Second', '二')], 'zh')).toBe('一');
    expect(blocksExcerpt([table])).toBe('');
  });

  it('gives a question’s stem, whole or clipped at a word', () => {
    const q = withStem(para('The government imposes a per-unit tax on cigarettes.', '政府徵收從量稅。'));
    expect(questionExcerpt(q, 'en')).toBe('The government imposes a per-unit tax on cigarettes.');
    expect(questionExcerpt(q, 'zh')).toBe('政府徵收從量稅。');
    expect(questionExcerpt(q, 'en', 30)).toBe('The government imposes a…');
    expect(questionExcerpt(q, 'zh', 30)).toBe('政府徵收從量稅。');
    expect(questionExcerpt(withStem())).toBe('');
  });
});
