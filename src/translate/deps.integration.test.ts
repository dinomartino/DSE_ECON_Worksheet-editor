import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SlotGroup, TextSlot } from '@/model/textSlots';
import type { RunProgress } from './types';

/**
 * createRunDeps with nothing mocked: the real Settings store, secrets, resolveAiConfig,
 * createClient and glossary. Only `fetch` is scripted — a 429 asking for a short wait,
 * then the answer — so the client's rate-limit wait must surface as 'waiting'.
 */

class FakeStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

async function fresh(settings: object) {
  vi.resetModules();
  const local = new FakeStorage();
  local.setItem('econgen.settings.ai', JSON.stringify({ v: 1, ...settings }));
  vi.stubGlobal('window', {
    localStorage: local,
    sessionStorage: new FakeStorage(),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return {
    ...(await import('@/platform/secrets')),
    ...(await import('./deps')),
    ...(await import('./plan')),
    ...(await import('./run')),
  };
}

const group: SlotGroup = { kind: 'question', id: 'q1', label: 'Question 1' };
const slot = (path: string, en: string): TextSlot => ({
  path, text: { en: [{ text: en }], zh: [] }, kind: 'part', role: 'print', group,
  questionId: 'q1', flowId: 'q1', blockIds: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('createRunDeps with the real settings and client', () => {
  it('reports the configuration a run cannot start without', async () => {
    const m = await fresh({ provider: 'deepseek' });
    expect(await m.createRunDeps({ glossary: false })).toEqual({ ok: false, provider: 'deepseek', reason: 'noKey' });
  });

  it('shows the rate-limit wait as waiting, then translates', async () => {
    const m = await fresh({ provider: 'deepseek' });
    await m.writeSecret('ai:deepseek', 'sk-deepseek-12345678', { remember: false });
    const calls: Array<{ url: string; auth: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.authorization ?? headers.Authorization });
      if (calls.length === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '0.05' } });
      const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
      const payload = JSON.parse(body.messages[body.messages.length - 1].content) as { groups: Array<{ items: Array<{ key: string }> }> };
      const items = payload.groups.flatMap((g) => g.items).map((item) => ({ key: item.key, text: '解釋你的答案。' }));
      const content = JSON.stringify({ items });
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200 });
    });

    const result = await m.createRunDeps();
    if (!result.ok) throw new Error(`expected deps, got ${result.reason}`);
    expect(result.config).toMatchObject({ provider: 'deepseek', apiKey: 'sk-deepseek-12345678' });
    expect(result.deps.glossary?.entries.length).toBeGreaterThan(0);

    const plan = m.planFromSlots('ws', [slot('p1', 'Explain your answer.')], { kind: 'paper' },
      m.defaultTranslateOptions({ language: 'bilingual', version: 'student' }, true));
    const progress: RunProgress[] = [];
    const outcome = await m.runTranslation(plan, result.deps, new AbortController().signal, (p) => progress.push({ ...p }));

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('api.deepseek.com');
    expect(calls[1].auth).toBe('Bearer sk-deepseek-12345678');
    expect(progress.map((p) => p.phase)).toContain('waiting');
    expect(progress.find((p) => p.phase === 'waiting')?.waitMs).toBe(50);
    expect(progress.at(-1)?.phase).not.toBe('waiting');
    expect([...outcome.results.values()].map((r) => [r.status, r.defaultAccepted, r.runs?.map((x) => x.text).join('')])).toEqual([
      ['ready', true, '解釋你的答案。'],
    ]);
  });
});
