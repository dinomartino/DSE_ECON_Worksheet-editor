import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { KeyCheckChip, keyCheckWords } from '@/components/studio/chat/KeyCheckChip';
import { STUDIO_CHAT_MESSAGES } from '@/components/studio/chat/chat.messages';
import { keyCheckOf } from './keyCheck';
import type { DraftDiagram } from './types';

const block = {} as NonNullable<DraftDiagram['block']>;
const mk = (diagram: Partial<DraftDiagram> | undefined, answerIndex = 1) =>
  ({ draft: { answerIndex }, ...(diagram ? { diagram: { status: 'ok', block, placement: 'question', issues: [], ...diagram } } : {}) }) as never;

describe('keyCheckOf (k-0540)', () => {
  it('says nothing without a figure with the question or a worked-out key', () => {
    expect(keyCheckOf(mk(undefined))).toBeNull();
    expect(keyCheckOf(mk({ block: null }))).toBeNull();
    expect(keyCheckOf(mk({ placement: 'answer', solved: { labels: ['Q1'], option: 1, why: '' } }))).toBeNull();
    expect(keyCheckOf(mk({}))).toBeNull();
  });
  it('passes when the diagram gives the keyed option, and reads the key as it is now', () => {
    const solved = { labels: ['Q1'], option: 1, why: '' };
    expect(keyCheckOf(mk({ solved }))).toEqual({ state: 'ok' });
    expect(keyCheckOf(mk({ solved }, 2))).toEqual({ state: 'differs', gives: 'B' });
  });
  it('differs with no letter when no option says the answer', () => {
    expect(keyCheckOf(mk({ solved: { labels: [], option: -1, why: '' } }))).toEqual({ state: 'differs', gives: '' });
  });
  it('asks to check again after a hand edit of the diagram, even if it once passed', () => {
    expect(keyCheckOf(mk({ edited: true, solved: { labels: ['Q1'], option: 1, why: '' } }))).toEqual({ state: 'again' });
  });
});

describe('KeyCheckChip', () => {
  const en = (k: Parameters<typeof keyCheckWords>[0]) => keyCheckWords(k, Object.fromEntries(Object.entries(STUDIO_CHAT_MESSAGES).map(([n, v]) => [n, (v as { en: unknown }).en])) as never);
  it('is quiet on a pass when asked, loud otherwise, in both languages', () => {
    const m = Object.fromEntries(Object.entries(STUDIO_CHAT_MESSAGES).map(([n, v]) => [n, (v as { en: unknown }).en])) as never;
    expect(renderToStaticMarkup(createElement(KeyCheckChip, { check: { state: 'ok' }, m, quiet: true }))).toBe('');
    expect(renderToStaticMarkup(createElement(KeyCheckChip, { check: { state: 'differs', gives: 'C' }, m, quiet: true }))).toContain('data-key-check="differs"');
    expect(en({ state: 'again' }).label).toContain('Check the key again');
    const zh = (STUDIO_CHAT_MESSAGES.keyDiffers.zh as (g: string) => string)('C');
    expect(zh).toContain('C');
  });
});
