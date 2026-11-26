import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { MENTOR_MODEL } from '@/ai/providers';
import type { ProviderConfig } from '@/ai/types';
import { readLocally } from '@/components/studio/chat/intent';
import { buildStudioRead, routeStudioRead } from '@/questionStudio/jevRead';
import type { DraftBrief } from '@/questionStudio/understand';

/**
 * k-0567 (u-5sy9): Jev's studio read alone, on the 80 invented messages, through Mentor dev's
 * `/ai/decide` (feature `studio.read`). Keeps Jev's raw answers so the cut-offs can be set
 * offline; the end-to-end run through the real studio path is `studioRouterE2e.eval.ts`.
 *
 *   K0567_ROUTER=1 MENTOR_BASE=http://localhost:3567/api/app/v1/ai npx vitest run --config vitest.eval.config.ts evals/studioRouter.eval.ts
 *
 * Needs `MENTOR_TOKEN` in /root/.config/hosted-ai-dev/env (a dev account's app token).
 */

export interface Row {
  id: string;
  set: 'main' | 'holdout';
  lang: string;
  page: 'en' | 'zh';
  text: string;
  recent: number[];
  chip?: number;
  want: { kind: string; drafts?: number[]; how?: string; parts?: string[] };
  partsOk?: string[] | null;
}
export const FX = JSON.parse(readFileSync(path.join(__dirname, 'studioRouter/turns.json'), 'utf8')) as { pages: Record<string, DraftBrief[]>; rows: Row[] };

export function mentorConfig(): ProviderConfig {
  const env = Object.fromEntries(
    readFileSync('/root/.config/hosted-ai-dev/env', 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  );
  return { provider: 'mentor', apiKey: env.MENTOR_TOKEN, model: MENTOR_MODEL, baseUrl: process.env.MENTOR_BASE ?? 'http://localhost:3567/api/app/v1/ai' };
}

const OUT = process.env.K0567_OUT ?? '/tmp/k0567/router';

describe.skipIf(!process.env.K0567_ROUTER)('k-0567 studio read on Jev', () => {
  it('80 messages', async () => {
    clearDialectCache();
    const client = createClient(mentorConfig());
    const out: unknown[] = [];
    for (const row of FX.rows) {
      const drafts = FX.pages[row.page];
      const input = { text: row.text, drafts, recent: row.recent };
      const local = readLocally(row.text, drafts, { ...(row.chip !== undefined ? { chip: row.chip } : {}), recent: row.recent });
      const t0 = Date.now();
      try {
        const res = await client.decide!(buildStudioRead(input, new AbortController().signal));
        const wall = Date.now() - t0;
        out.push({ id: row.id, wall, ms: res?.ms, model: res?.model, charged: res?.charged, usage: res?.usage, answers: res?.answers, route: res ? routeStudioRead(res, input) : null, local });
      } catch (error) {
        out.push({ id: row.id, wall: Date.now() - t0, error: String(error), local });
      }
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, 'jev-raw.json'), JSON.stringify(out, null, 1));
    expect(out.length).toBe(80);
  }, 900_000);
});
