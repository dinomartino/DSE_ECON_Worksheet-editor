import { describe, expect, it } from 'vitest';
import type { AiErrorInfo } from '@/ai/types';
import type { ReviewItem } from '@/assist/types';
import { errorActions, errorNote } from './errorActions';
import { markTones } from './pageMarks';

const error = (over: Partial<AiErrorInfo>): AiErrorInfo => ({
  kind: 'quota',
  provider: 'gemini',
  message: 'Out of quota',
  fatal: true,
  actions: [],
  ...over,
});
const labels = (e: AiErrorInfo) => errorActions(e).map((a) => a.label);

describe('errorActions', () => {
  it('region: Try again first (primary), then the Hong Kong providers and Settings, with the VPN note', () => {
    const region = error({ kind: 'region', actions: ['retry', 'switchProvider', 'openSettings'] });
    expect(labels(region)).toEqual(['Try again', 'Use DeepSeek', 'Use Qwen', 'Open Settings']);
    expect(errorActions(region)[0]).toMatchObject({ kind: 'retry' });
    expect(errorNote(region)).toBe('Keep the VPN on while you use Gemini. DeepSeek and Qwen work in Hong Kong without a VPN.');
    expect(labels(error({ kind: 'region', provider: 'deepseek', actions: [] }))).toEqual(['Use Qwen', 'Open Settings']);
  });

  it('shows only the actions the error names', () => {
    expect(labels(error({ actions: ['useFallbackModel', 'retry'] }))).toEqual(['Switch to Gemini 3.5 Flash-Lite', 'Try again']);
    expect(labels(error({ kind: 'badKey', actions: ['openKeyPage', 'openSettings'] }))).toEqual(['Get a new key', 'Open Settings']);
    expect(labels(error({ kind: 'model', actions: ['chooseModel'] }))).toEqual(['Choose a model…']);
    expect(labels(error({ actions: [] }))).toEqual([]);
    expect(errorNote(error({}))).toBeUndefined();
  });
});

describe('markTones', () => {
  it('one mark per page text, the strongest tone winning; failed items mark nothing', () => {
    const item = (id: string, tone: ReviewItem['tone'], targetKey?: string): ReviewItem => ({ id, tone, where: '', notes: [], ...(targetKey ? { targetKey } : {}) });
    const marks = markTones([
      item('a', 'inserted', 'k1'),
      item('b', 'look', 'k1'),
      item('c', 'inserted', 'k2'),
      item('d', 'failed', 'k3'),
      item('e', 'finding', 'k4'),
      item('f', 'look'),
    ]);
    expect([...marks]).toEqual([['k1', 'look'], ['k2', 'inserted'], ['k4', 'finding']]);
  });
});
