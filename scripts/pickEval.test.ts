import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClient } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import { parseManifest, parseTopic, type TopicEntry } from '@/pastpapers/pack';
import { keyPointsOfCode } from '@/questionStudio/frequency';
import { buildPickRequest, parsePicks } from '@/questionStudio/pick';
import { TYPED_CASES } from '@/questionStudio/pickRequests';
import { referenceOf } from '@/questionStudio/references';
import type { SourceQuestion } from '@/questionStudio/types';

/**
 * Step 1's accuracy on real requests (k-0514). Skipped unless `PICK_EVAL` is set; it reads a
 * copy of the public question bank, so nothing here runs in CI.
 * In `scripts/` (k-0611), so `npx vitest run src` never collects it: live mode calls Gemini
 * and must only ever run when named.
 *
 *   PICK_EVAL_DIR=<dir with manifest.json and topics/*.json>
 *   PICK_EVAL=dump   writes <dir>/cases.json (each case's exact request: system + user turn)
 *   PICK_EVAL=score  reads <dir>/answers.json ({ [caseId]: replyText }) and prints the hit rate
 *   PICK_EVAL=live   asks Gemini (GEMINI_API_KEY, optional GEMINI_MODEL) and prints the hit rate
 *
 * Cases: HKDSE multiple-choice questions whose bank topic maps to exactly one syllabus key
 * point (the question alone is the request; right = that key point), and the typed requests
 * of `pickRequests.ts`.
 */
const MODE = process.env.PICK_EVAL;
const DIR = process.env.PICK_EVAL_DIR ?? '/tmp/k0514eval';
const PER_TOPIC = 1;
const MAX_REFERENCES = 40;

interface Case {
  id: string;
  kind: 'reference' | 'typed';
  ok: string[];
  text: string;
  examples: SourceQuestion[];
}

function buildCases(): Case[] {
  const manifest = parseManifest(JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')));
  if ('error' in manifest) throw new Error('bad manifest');
  const cases: Case[] = [];
  const topics = manifest.topics.filter((t: TopicEntry) => new Set((t.syllabus ?? []).flatMap(keyPointsOfCode)).size === 1);
  const spread = topics.length > MAX_REFERENCES ? Math.ceil(topics.length / MAX_REFERENCES) : 1;
  topics.forEach((entry, index) => {
    if (index % spread !== 0 || cases.length >= MAX_REFERENCES) return;
    const data = parseTopic(JSON.parse(readFileSync(join(DIR, entry.file), 'utf8')), entry);
    const ok = [...new Set((entry.syllabus ?? []).flatMap(keyPointsOfCode))];
    // Newest HKDSE multiple-choice questions with no picture (the stand-in model reads words).
    const picks = (data?.items ?? [])
      .filter((item) => item.source.exam === 'HKDSE' && item.source.year !== undefined)
      .sort((a, b) => (b.source.year ?? 0) - (a.source.year ?? 0))
      .flatMap((item) => (item.question.type === 'mcq' && !item.question.blocks.some((b) => b.kind === 'image' || b.kind === 'diagram') ? [referenceOf(item, false)] : []))
      .filter((s): s is SourceQuestion => s !== undefined && !s.hasFigure)
      .slice(0, PER_TOPIC);
    for (const example of picks) cases.push({ id: `ref:${entry.id}:${example.id}`, kind: 'reference', ok, text: '', examples: [example] });
  });
  TYPED_CASES.forEach((t, i) => cases.push({ id: `typed:${i}${t.vague ? ':vague' : ''}`, kind: 'typed', ok: [...t.ok], text: t.text, examples: [] }));
  return cases;
}

const preset = presetFor('gemini');
const requestOf = (c: Case) => buildPickRequest({ text: c.text, examples: c.examples }, preset, new AbortController().signal);

function report(results: Array<{ c: Case; got: string[] }>) {
  const line = (label: string, rows: typeof results) => {
    const first = rows.filter((r) => r.c.ok.includes(r.got[0])).length;
    const any = rows.filter((r) => r.got.some((g) => r.c.ok.includes(g))).length;
    return `${label}: first pick right ${first}/${rows.length} (${Math.round((100 * first) / Math.max(1, rows.length))}%), a pick right ${any}/${rows.length}`;
  };
  const out = [
    line('reference only', results.filter((r) => r.c.kind === 'reference')),
    line('typed, specific', results.filter((r) => r.c.kind === 'typed' && !r.c.id.endsWith(':vague'))),
    line('typed, vague', results.filter((r) => r.c.id.endsWith(':vague'))),
    line('all', results),
    ...results.filter((r) => !r.c.ok.includes(r.got[0])).map((r) => `  miss ${r.c.id}: got ${r.got.join(',') || '(none)'}, wanted ${r.c.ok.join('/')}`),
  ].join('\n');
  console.log(out);
  return out;
}

describe.skipIf(!MODE)('step 1 on real requests', () => {
  it('runs', async () => {
    const cases = buildCases();
    if (MODE === 'dump') {
      writeFileSync(join(DIR, 'cases.json'), JSON.stringify(cases.map((c) => ({ id: c.id, kind: c.kind, ok: c.ok, request: { system: requestOf(c).system, user: requestOf(c).turns[0].content } })), null, 1));
      expect(cases.length).toBeGreaterThan(30);
      return;
    }
    const got = new Map<string, string[]>();
    if (MODE === 'score') {
      const answers = JSON.parse(readFileSync(join(DIR, 'answers.json'), 'utf8')) as Record<string, string>;
      for (const c of cases) got.set(c.id, (parsePicks(answers[c.id] ?? '') ?? []).map((p) => p.code));
    } else {
      const client = createClient({ provider: 'gemini', apiKey: process.env.GEMINI_API_KEY ?? '', model: process.env.GEMINI_MODEL ?? '', baseUrl: '' });
      for (const c of cases) {
        const res = await client.complete(requestOf(c));
        got.set(c.id, (parsePicks(res.text) ?? []).map((p) => p.code));
      }
    }
    writeFileSync(join(DIR, 'result.txt'), report(cases.map((c) => ({ c, got: got.get(c.id) ?? [] }))));
  }, 600_000);
});
