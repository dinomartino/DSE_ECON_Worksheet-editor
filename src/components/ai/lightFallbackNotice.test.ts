import { afterEach, describe, expect, it } from 'vitest';
import { reportLightFallback, clearLightRefusals } from '@/ai/lightJobs';
import { dismiss, useNoticeStore } from '@/store/notices';
import { resetLightFallbackNotice, startLightFallbackNotice } from './lightFallbackNotice';

afterEach(() => {
  for (const n of useNoticeStore.getState().notices) dismiss(n.id);
  resetLightFallbackNotice();
  clearLightRefusals();
});

describe('the Flash-Lite fallback notice (u-zso2)', () => {
  it('shows one small notice the first time Google refuses Flash-Lite, and no more that session', () => {
    const stop = startLightFallbackNotice();
    reportLightFallback('gemini-3.5-flash-lite', 'AIzaKEY1');
    reportLightFallback('gemini-3.5-flash-lite', 'AIzaKEY2');
    const shown = useNoticeStore.getState().notices.filter((n) => n.id === 'gemini-light-fallback');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ tone: 'info', body: expect.stringContaining('Gemini Flash-Lite') });
    dismiss('gemini-light-fallback');
    reportLightFallback('gemini-3.5-flash-lite', 'AIzaKEY3');
    expect(useNoticeStore.getState().notices).toHaveLength(0);
    stop();
  });

  it('is silent once stopped', () => {
    startLightFallbackNotice()();
    reportLightFallback('gemini-3.5-flash-lite', 'AIzaKEY1');
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });
});

describe('the Flash-Lite fallback notice while Settings is open', () => {
  it('goes to the dialog that asked for it, and back to the app once it closes', async () => {
    const { routeLightFallbackNotice } = await import('./lightFallbackNotice');
    const stop = startLightFallbackNotice();
    const inDialog: unknown[] = [];
    const release = routeLightFallbackNotice((input) => inDialog.push(input));
    reportLightFallback('gemini-3.5-flash-lite', 'AIzaKEY1');
    expect(inDialog).toHaveLength(1);
    expect(useNoticeStore.getState().notices).toHaveLength(0);
    release();
    resetLightFallbackNotice();
    reportLightFallback('gemini-3.5-flash-lite', 'AIzaKEY1');
    expect(useNoticeStore.getState().notices).toHaveLength(1);
    stop();
  });
});
