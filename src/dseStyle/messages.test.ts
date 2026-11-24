import { describe, expect, it } from 'vitest';
import { findingText, type FindingMessages } from '@/components/studio/findings';
import { STUDIO_FINDING_MESSAGES } from '@/components/studio/findings.messages';
import { resolveMessages } from '@/i18n/catalogue';
import { STYLE_FINDING_IDS, type StyleFinding } from './check';
import { DSE_STYLE_MESSAGES, styleFindingText } from './messages';

const PARAMS: Record<string, string | number> = { side: 'zh', example: '10,000', length: 52, british: 'labour' };

describe('the words for the HKDSE style findings', () => {
  it('give every finding a sentence in both languages, values in place', () => {
    for (const lang of ['en', 'zh-HK'] as const) {
      const m = resolveMessages(DSE_STYLE_MESSAGES, lang);
      for (const id of STYLE_FINDING_IDS) {
        const text = styleFindingText({ id, params: PARAMS } as StyleFinding, m);
        expect(text, `${id} ${lang}`).toBeTruthy();
        expect(text).not.toMatch(/undefined|NaN|\*\*/);
      }
    }
    expect(styleFindingText({ id: 'style.thousandsComma', params: { example: '1,500' } }, resolveMessages(DSE_STYLE_MESSAGES, 'en'))).toContain('1,500');
    expect(styleFindingText({ id: 'lint.uneven' }, resolveMessages(DSE_STYLE_MESSAGES, 'en'))).toBeNull();
  });

  it('read the same in the Question studio, never as an unknown code', () => {
    for (const lang of ['en', 'zh-HK'] as const) {
      const studio = resolveMessages(STUDIO_FINDING_MESSAGES, lang) as FindingMessages;
      const own = resolveMessages(DSE_STYLE_MESSAGES, lang);
      for (const id of STYLE_FINDING_IDS) {
        const f = { id, params: PARAMS };
        expect(findingText(f, studio)).toBe(styleFindingText(f, own));
      }
    }
  });
});
