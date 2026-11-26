import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import type { AiClient } from '@/ai/types';
import { createChatStore } from '@/components/studio/chat/chatStore';
import type { AiTurn, Chat, ChatDraft } from '@/components/studio/chat/chatTypes';
import { liveEngine, resetStudioRead, type StudioEngine } from '@/components/studio/chat/engine';
import { okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import type { Refinement, StudioRequest } from '@/questionStudio/types';
import type { DraftBrief } from '@/questionStudio/understand';
import { FX, mentorConfig, type Row } from './studioRouter.eval';

/**
 * k-0567 (u-5sy9): the 80 invented messages through the real studio path — `chatStore.send`
 * with the live engine on Mentor dev — once as today (no pre-router) and once with Jev's read
 * first. The reads are live (Jev on `/ai/decide`, the main model on `/ai/generate`); the write
 * and the edit that follow are stubbed (they are the same in both arms), so the run measures
 * what the pre-router changes: what the studio does, the credits of reading, and the time until
 * it starts doing it.
 *
 *   K0567_E2E=main|jev npx vitest run --config vitest.eval.config.ts evals/studioRouterE2e.eval.ts
 */

const ARM = process.env.K0567_E2E ?? 'jev';
const OUT = process.env.K0567_OUT ?? '/tmp/k0567/router';
const preset = presetFor('mentor')!;

/** A chat with the page's three drafts, the last reply having written `recent`. */
export function seeded(row: Row, page: DraftBrief[], opts: { diagram?: boolean } = {}): Chat {
  const at = '2026-11-26T00:00:00.000Z';
  const request: StudioRequest = { keyPoint: 'C.ped', points: [], examples: [], strict: false, count: 1, level: 'same', shape: 'any', sides: row.page === 'zh' ? ['zh'] : ['en'], note: '' };
  const drafts: ChatDraft[] = page.map((b) => {
    const d = studioDraft(`seed${b.no}`);
    const bi = (s: string) => (row.page === 'zh' ? { en: '', zh: s } : { en: s, zh: '' });
    const draft = {
      ...d,
      draft: { kind: 'mcq' as const, stem: bi(b.stem), statements: b.statements.map(bi), options: b.options.map(bi), answerIndex: 'ABCD'.indexOf(b.answer), explanation: bi(b.explanation ?? '') },
      ...(b.diagram && opts.diagram !== false ? { diagram: { block: { type: 'diagram' } } as never } : {}),
    };
    return { id: `draft${b.no}`, no: b.no, entry: { draft, request }, older: [], state: b.state, turnId: 'seedAi' };
  });
  return {
    v: 1,
    id: `chat-${row.id}`,
    createdAt: at,
    updatedAt: at,
    refs: [],
    turns: [
      { id: 'seedUser', role: 'user', text: row.page === 'zh' ? '出三題關於彈性的題目' : 'Three questions on elasticity', refs: [] },
      { id: 'seedAi', role: 'ai', steps: [], notes: [], draftIds: row.recent.map((n) => `draft${n}`) },
    ],
    drafts,
    picks: [{ code: 'C.ped', reason: '' }],
    settings: { count: 1, level: 'same', language: row.page === 'zh' ? 'zh' : 'en' },
    lastText: 'seed',
  } as Chat;
}

/** The client, counting what each message cost. */
function metered(client: AiClient) {
  const m = { credits: 0, decide: 0, generate: 0, decideMs: 0, generateMs: 0 };
  const wrapped: AiClient = {
    ...client,
    complete: async (req) => {
      const t = Date.now();
      const res = await client.complete(req);
      m.generate += 1;
      m.generateMs += Date.now() - t;
      m.credits += res.charged ?? 0;
      return res;
    },
    ...(client.decide
      ? {
          decide: async (req) => {
            const t = Date.now();
            try {
              const res = await client.decide!(req);
              m.credits += res?.charged ?? 0;
              return res;
            } finally {
              m.decide += 1;
              m.decideMs += Date.now() - t;
            }
          },
        }
      : {}),
  };
  return { m, wrapped };
}

describe.skipIf(!process.env.K0567_E2E)('k-0567 the studio path, end to end', () => {
  it(`arm ${ARM}`, async () => {
    clearDialectCache();
    resetStudioRead();
    const base = createClient(mentorConfig());
    const out: unknown[] = [];
    const only = process.env.K0567_ONLY?.split(',');
    const rows = only ? FX.rows.filter((r) => only.includes(r.id)) : FX.rows;
    for (const row of rows) {
      const page = FX.pages[row.page];
      const { m, wrapped } = metered(base);
      const did: { writes: StudioRequest[]; refines: Array<{ no: number; refinement: Refinement }> } = { writes: [], refines: [] };
      const chat = seeded(row, page);
      let acted = 0;
      const engine: StudioEngine = {
        ...(ARM === 'jev' ? { read: liveEngine.read } : {}),
        pick: liveEngine.pick,
        write: async (request) => {
          acted ||= Date.now();
          did.writes.push(request);
          return okOutcome([studioDraft('new1')]);
        },
        refine: async (_request, target, refinement) => {
          acted ||= Date.now();
          did.refines.push({ no: chat.drafts.find((d) => d.entry.draft.id === target.id)?.no ?? -1, refinement });
          return okOutcome([studioDraft(`${target.id}-v2`)]);
        },
      };
      const env: StudioEnv = {
        resolve: async () => ({ ok: true, deps: { client: wrapped, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 10, mine: 0 } }),
        references: async () => [],
      };
      const store = createChatStore({ env, engine, storage: { load: () => [chat], save: () => undefined }, language: () => (row.page === 'zh' ? 'zh' : 'en') });
      store.getState().openChat(chat.id);
      const t0 = Date.now();
      await store.getState().send(row.text, row.chip !== undefined ? `draft${row.chip}` : undefined);
      const done = Date.now();
      const now = store.getState().chats.find((c) => c.id === chat.id)!;
      const last = [...now.turns].reverse().find((t): t is AiTurn => t.role === 'ai')!;
      const understand = last.steps.find((s) => s.kind === 'understand');
      let kind: string;
      let drafts: number[] = [];
      if (last.ask?.kind === 'which') {
        kind = 'unsure';
        drafts = last.ask.options;
      } else if (did.writes.length) kind = 'new';
      else if (did.refines.length) {
        kind = did.refines[0].refinement.kind === 'another' ? 'another' : 'edit';
        drafts = did.refines.map((r) => r.no);
      } else if (last.notes.some((n) => n.kind === 'reply' || n.kind === 'noReply')) {
        kind = 'ask';
        drafts = last.draftIds.map((id) => now.drafts.find((d) => d.id === id)?.no ?? -1);
      } else kind = last.error ? `error:${last.error.kind}` : 'none';
      const refinement = did.refines[0]?.refinement;
      out.push({
        id: row.id,
        set: row.set,
        lang: row.lang,
        want: row.want,
        partsOk: row.partsOk,
        kind,
        drafts,
        how: refinement ? (refinement.kind === 'change' ? 'change' : refinement.kind) : undefined,
        parts: refinement?.kind === 'change' ? (refinement as { parts?: string[] }).parts ?? [] : undefined,
        by: understand && understand.kind === 'understand' ? understand.by : 'computer',
        credits: m.credits,
        decideCalls: m.decide,
        generateCalls: m.generate,
        decideMs: m.decideMs,
        generateMs: m.generateMs,
        msToAct: (acted || done) - t0,
      });
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, `e2e-${ARM}${only ? '-some' : ''}.json`), JSON.stringify(out, null, 1));
    expect(out).toHaveLength(rows.length);
  }, 3_600_000);
});

/** The live browser check's saved chats (`scripts/studio-router-verify.mjs`): the same drafts, no stand-in diagram. */
describe.skipIf(!process.env.K0567_SEED)('k-0567 seed chats for the live check', () => {
  it('writes them', () => {
    const chats = (['en', 'zh'] as const).map((page) => ({
      ...seeded({ id: `live-${page}`, set: 'main', lang: page, page, text: '', recent: [1, 2, 3], want: { kind: 'new' } }, FX.pages[page], { diagram: false }),
      updatedAt: page === 'en' ? '2026-11-26T00:00:01.000Z' : '2026-11-26T00:00:00.000Z',
    }));
    writeFileSync(process.env.K0567_SEED as string, JSON.stringify(chats));
  });
});
