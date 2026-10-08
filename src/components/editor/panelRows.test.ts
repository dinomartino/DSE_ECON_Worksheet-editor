import { describe, expect, it } from 'vitest';
import { bi } from '@/model/text';
import { biExcerpt, excerptOfBlocks } from './panelRows';

describe('the Edit panel names paper text in the document language', () => {
  it('reads the document side, the other only when it is empty', () => {
    expect(biExcerpt(bi('Demand rises', '需求上升'), 'zh')).toBe('需求上升');
    expect(biExcerpt(bi('Demand rises', '需求上升'), 'bilingual')).toBe('Demand rises');
    expect(biExcerpt(bi('Demand rises', ''), 'zh')).toBe('Demand rises');
    expect(excerptOfBlocks([{ id: 'p', kind: 'paragraph', text: bi('Explain.', '解釋。') }], 'zh')).toBe('解釋。');
  });
});
