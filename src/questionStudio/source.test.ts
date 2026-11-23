import { describe, expect, it } from 'vitest';
import { createImageBlock, createMcqQuestion, createParagraphBlock, createStructuredQuestion, createTableBlock } from '@/model/factories';
import type { BiText, McqQuestion } from '@/model/types';
import { blocksText, corpusDocOf, corpusDocOfDraft, corpusDocOfSource, isCombinationSource, sourceFromQuestion } from './source';

const bi = (en: string, zh = ''): BiText => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });

function question(): McqQuestion {
  const q = createMcqQuestion();
  const table = createTableBlock(2, 2);
  table.rows[0].cells[0].text = bi('Price', '價格');
  table.rows[0].cells[1].text = bi('Quantity', '數量');
  table.rows[1].cells[0].text = bi('$5');
  table.rows[1].cells[1].text = bi('200');
  return {
    ...q,
    blocks: [createParagraphBlock(bi('A tea shop sells milk tea.', '一間茶店售賣奶茶。')), table],
    statements: [bi('Demand is elastic.', '需求富有彈性。'), bi('Revenue falls.', '收入下降。')],
    options: q.options.map((o, i) => ({ ...o, text: bi(`Option ${i}`, `選項${i}`) })),
    answerIndex: 2,
  };
}

describe('sourceFromQuestion', () => {
  it('reads the stem, table rows, statements, options and key as plain text per side', () => {
    const s = sourceFromQuestion(question(), { label: 'Past paper X', id: 'bank/x' });
    expect(s.id).toBe('bank/x');
    expect(s.label).toBe('Past paper X');
    expect(s.stem.en).toBe('A tea shop sells milk tea.\nPrice | Quantity\n$5 | 200');
    expect(s.stem.zh).toBe('一間茶店售賣奶茶。\n價格 | 數量');
    expect(s.statements).toEqual([{ en: 'Demand is elastic.', zh: '需求富有彈性。' }, { en: 'Revenue falls.', zh: '收入下降。' }]);
    expect(s.options.map((o) => o.en)).toEqual(['Option 0', 'Option 1', 'Option 2', 'Option 3']);
    expect(s.answerIndex).toBe(2);
    expect(s.hasFigure).toBe(false);
    expect(isCombinationSource(s)).toBe(true);
  });

  it('notes a picture or diagram the words cannot carry', () => {
    const q = question();
    q.blocks.push(createImageBlock('data:image/png;base64,AAAA', 100, 80));
    expect(sourceFromQuestion(q, { label: 'x' }).hasFigure).toBe(true);
    const o = question();
    o.options[1] = { ...o.options[1], blocks: [createImageBlock('data:image/png;base64,AAAA', 10, 10)] };
    expect(sourceFromQuestion(o, { label: 'x' }).hasFigure).toBe(true);
  });

  it('carries the shared passage, and falls back to the question id', () => {
    const s = sourceFromQuestion(question(), { label: 'x', passage: [createParagraphBlock(bi('Read the passage.', '細閱短文。'))] });
    expect(s.passage).toEqual({ en: 'Read the passage.', zh: '細閱短文。' });
    expect(s.id).toMatch(/.+/);
  });

  it('a question with no usable key has answerIndex -1', () => {
    expect(sourceFromQuestion({ ...question(), answerIndex: 9 }, { label: 'x' }).answerIndex).toBe(-1);
  });
});

describe('blocksText', () => {
  it('skips empty lines and lists a source label', () => {
    const { text } = blocksText([createParagraphBlock(bi('')), createParagraphBlock(bi('Hello'))]);
    expect(text).toEqual({ en: 'Hello', zh: '' });
  });
});

describe('corpus docs', () => {
  it('a question as printed: stem, statements and options, not the explanation', () => {
    const q = { ...question(), explanation: bi('Secret explanation.') };
    const doc = corpusDocOf(q, 'paper');
    expect(doc.kind).toBe('paper');
    expect(doc.en).toContain('A tea shop sells milk tea.');
    expect(doc.en).toContain('Option 2');
    expect(doc.en).not.toContain('Secret explanation');
    expect(doc.zh).toContain('選項2');
  });

  it('works for any question type (through the registry), not only MC', () => {
    const q = createStructuredQuestion();
    q.blocks = [createParagraphBlock(bi('Explain the law of demand.', '解釋需求定律。'))];
    expect(corpusDocOf(q, 'mine').en).toContain('Explain the law of demand.');
  });

  it('an example and a draft as docs, without bold marks', () => {
    const s = sourceFromQuestion(question(), { label: 'x', id: 'e1' });
    expect(corpusDocOfSource(s)).toMatchObject({ id: 'e1', kind: 'example' });
    expect(corpusDocOfSource(s).en).toContain('Demand is elastic.');
    const d = corpusDocOfDraft('d1', { stem: { en: 'Which is **NOT** true?', zh: '' }, statements: [], options: [{ en: 'A', zh: '' }] });
    expect(d).toEqual({ id: 'd1', kind: 'draft', en: 'Which is NOT true? A', zh: '' });
  });
});
