import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from '@/ai/client';
import { MENTOR_MODEL, PRESETS, presetFor } from '@/ai/providers';
import type { ProviderConfig } from '@/ai/types';
import { liveEngine } from '@/components/studio/chat/engine';
import { firstVersion } from '@/components/studio/chat/versions';
import type { Chat } from '@/components/studio/chat/chatTypes';
import { loadGlossary } from '@/glossary/load';
import type { McqQuestion } from '@/model/types';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import { withFigures } from '@/questionStudio/figures';
import { sourceFromQuestion } from '@/questionStudio/source';
import type { StudioRequest } from '@/questionStudio/types';

/**
 * A live run of the studio chat on one past-paper reference (k-0554): the same engine calls
 * the chat makes for a new request with the teacher's own reference (step 1 pick, step 2
 * write with diagrams, checks, blind solve), against Mentor. Writes the outcome and a chat
 * the studio can open (`scripts/k0554-shot.mjs` seeds it) to EVAL_OUT.
 *
 *   EVAL_MENTOR_API=http://localhost:3124/api/app/v1 EVAL_MENTOR_TOKEN=… PASTPAPER_BANK=<clone>
 *   EVAL_REF=CE1990/P2/Q47 EVAL_COUNT=2 EVAL_OUT=Outbox/k-0554/live-after
 *   npx vitest run --config vitest.eval.config.ts evals/refTopic.eval.ts
 *
 * Real calls cost credits (about 10 a question with a diagram).
 */

const BANK = process.env.PASTPAPER_BANK;
const REF = process.env.EVAL_REF ?? 'CE1990/P2/Q47';

function findQuestion(tag: string): { question: McqQuestion; label: string; keyPoint?: string } {
  const dir = path.join(BANK!, 'topics');
  const manifest = JSON.parse(readFileSync(path.join(BANK!, 'manifest.json'), 'utf8')) as { topics: Array<{ file: string }> };
  for (const topic of manifest.topics) {
    const doc = JSON.parse(readFileSync(path.join(BANK!, topic.file.startsWith('topics/') ? topic.file : path.join('topics', topic.file)), 'utf8')) as { questions: McqQuestion[] };
    const question = doc.questions.find((q) => q.tags?.includes(tag));
    if (question) {
      const label = question.provenance?.en.map((r) => r.text).join('') ?? tag;
      return { question, label, keyPoint: question.tags?.find((t) => /^[A-J]\.[a-z-]+$/.test(t)) };
    }
  }
  void dir;
  throw new Error(`no ${tag} in ${BANK}`);
}

describe.skipIf(!process.env.EVAL_MENTOR_TOKEN || !BANK)('studio on one reference, live (k-0554)', () => {
  it('picks, writes and checks', async () => {
    clearDialectCache();
    const config: ProviderConfig = {
      provider: 'mentor',
      apiKey: process.env.EVAL_MENTOR_TOKEN ?? '',
      model: MENTOR_MODEL,
      baseUrl: process.env.EVAL_MENTOR_API ? `${process.env.EVAL_MENTOR_API.replace(/\/+$/, '').replace(/\/ai$/, '')}/ai` : PRESETS.mentor.baseUrl,
    };
    const preset = presetFor(config.provider);
    const client = createClient(config);
    const glossary = await loadGlossary();
    const { question, label, keyPoint } = findQuestion(REF);
    const source = sourceFromQuestion(question, { id: REF, label });
    // Node has no canvas: the pictures go one by one (the browser sends a set as one picture).
    const [withPics] = await withFigures([source], 'en', async () => undefined);
    const text = process.env.EVAL_TEXT ?? '';
    const count = Number(process.env.EVAL_COUNT ?? 2);
    const signal = new AbortController().signal;
    const deps = { client, preset, glossary, corpus: EMPTY_CORPUS, diagrams: true };

    const picked = await liveEngine.pick({ text, examples: [withPics], tagged: keyPoint ? { [REF]: keyPoint } : {} }, deps, signal);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    const request: StudioRequest = {
      keyPoint: picked.picks[0]?.code ?? '',
      ...(picked.picks[1] ? { alsoKeyPoints: [picked.picks[1].code] } : {}),
      ...(picked.concept ? { concept: picked.concept } : {}),
      points: [],
      examples: [withPics],
      strict: true,
      count,
      level: 'same',
      shape: 'any',
      sides: ['en'],
      note: text,
    } as StudioRequest;
    const outcome = await liveEngine.write(request, deps, { signal }, []);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const out = path.resolve(process.env.EVAL_OUT ?? '/tmp/k0554-live');
    mkdirSync(out, { recursive: true });
    const at = new Date().toISOString();
    const summary = {
      ref: REF,
      label,
      picks: picked.picks,
      concept: (picked as { concept?: unknown }).concept ?? null,
      usage: { pick: picked.usage, write: outcome.usage },
      drafts: outcome.drafts.map((d, i) => ({
        no: i + 1,
        stem: d.draft.stem.en,
        options: d.draft.options.map((o) => o.en),
        answer: 'ABCD'[d.draft.answerIndex],
        figures: d.figureSet?.map((f) => `${f.at}: ${f.note}`) ?? (d.figure ? [d.figure] : []),
        checks: d.checks.map((c) => `${c.id}:${c.state}${c.findings.length ? ` [${c.findings.map((f) => f.id).join(', ')}]` : ''}`),
        status: d.status,
      })),
    };
    writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    const stripped = { ...source };
    const chat: Chat = {
      v: 1,
      id: `k0554-${Date.now()}`,
      createdAt: at,
      updatedAt: at,
      refs: [{ source: stripped, ...(keyPoint ? { keyPoint } : {}), who: 'you' }],
      turns: [
        { id: 't1', role: 'user', text, refs: [label] },
        { id: 't2', role: 'ai', steps: [{ kind: 'read', state: 'done', labels: [label] }, { kind: 'pick', state: 'done', picks: picked.picks, by: 'ai' }, { kind: 'write', state: 'done', count }, { kind: 'check', state: 'done' }], notes: [{ kind: 'written', ok: outcome.drafts.filter((d) => d.status === 'ok').length, look: outcome.drafts.filter((d) => d.status === 'look').length, failed: outcome.drafts.filter((d) => d.status === 'failed').length }], draftIds: outcome.drafts.map((_, i) => `cd${i + 1}`) },
      ],
      drafts: outcome.drafts.map((d, i) => ({ id: `cd${i + 1}`, no: i + 1, entry: { draft: firstVersion(d, at), request: { ...request, examples: [stripped] } }, older: [], state: 'open', turnId: 't2' })),
      picks: picked.picks,
      settings: { count: 3, level: 'same', language: 'en' },
      lastText: text,
    };
    writeFileSync(path.join(out, 'chat.json'), JSON.stringify(chat));
    console.log(JSON.stringify(summary, null, 2));
  });
});
