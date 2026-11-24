/**
 * Not a unit test: the "after" half of the k-0534 before/after sheet. Each case of
 * `scripts/k0534-proof-cases.mjs` goes through the real studio engine (`writeDrafts`: write →
 * diagram → blind solve) on its recorded replies, in English and in 中文, and the follow-up
 * case through `refine`. Writes SVGs and `after.json` to K0534_OUT.
 * `scripts/k0534-before-after.mjs` runs this and the old-code half, then draws the sheet.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { evaluateReply } from '@/diagramGen/run';
import { diagramSvg } from '@/render/diagram';
import { REQUEST } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import { refine, writeDrafts } from '@/questionStudio/run';
import type { StudioDeps, StudioDraft } from '@/questionStudio/types';
import { narrationFindings } from '@/questionStudio/validate';
import { scriptedClient } from '@/translate/testKit';
import { CASES } from './k0534-proof-cases.mjs';

type Side = 'en' | 'zh';
type Bi<T> = { en: T; zh: T };
interface Case {
  id: string;
  before: Bi<string>;
  after: Bi<string>;
  options: Bi<string[]>;
  answer: number;
  explanation: Bi<string>;
  figure: string;
  old: Record<string, unknown>;
  reply: Record<string, unknown>;
  followUp?: { note: string; reply: Record<string, unknown>; rekeyed: { answer: number; explanation: Bi<string> } };
}

const OUT = process.env.K0534_OUT ?? path.resolve('out-k0534');
const preset = presetFor('gemini');
const deps = (client: StudioDeps['client']): StudioDeps => ({ client, preset, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3, diagrams: true });
const ctl = () => new AbortController().signal;

const writeReply = (c: Case, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    questions: [
      {
        stem: c.after,
        statements: [],
        options: c.options.en.map((en, i) => ({ en, zh: c.options.zh[i] })),
        answer: c.answer,
        explanation: c.explanation,
        angle: c.id,
        figure: c.figure,
        changes: [],
        ...over,
      },
    ],
  });
/** The blind solve answering every question with `answer` (recorded: it reads the figure in words). */
const solveAs = (answer: number) => (req: CompletionRequest) => {
  const { questions } = JSON.parse(req.turns.at(-1)!.content) as { questions: Array<{ id: string }> };
  return JSON.stringify({ answers: questions.map((q) => ({ id: q.id, working: 'read off the figure', answer, ambiguous: false })) });
};

const svgOf = (d: StudioDraft, side: Side) =>
  d.diagram?.block ? diagramSvg(d.diagram.block.diagram, { widthPx: d.diagram.block.widthPx, heightPx: d.diagram.block.heightPx, language: side, scale: 2, answers: 'show' }) : '';

const summary = (d: StudioDraft, requests: CompletionRequest[]) => ({
  stem: d.draft.stem,
  options: d.draft.options,
  answer: d.draft.answerIndex,
  status: d.status,
  checks: d.checks.map((c) => ({ id: c.id, state: c.state, findings: c.findings.map((f) => f.id) })),
  diagram: d.diagram ? { status: d.diagram.status, issues: d.diagram.issues.map((i) => `${i.level}: ${i.text}`), solved: d.diagram.solved ?? null, words: d.diagram.figureWords ?? '' } : null,
  requests: requests.map((r) => (JSON.parse(r.turns[0].content) as { task?: string }).task ?? '?'),
});

it('runs every case through the studio engine', async () => {
  mkdirSync(OUT, { recursive: true });
  const after: Record<string, unknown> = {};
  for (const c of CASES as Case[]) {
    for (const side of ['en', 'zh'] as Side[]) {
      const client = scriptedClient([writeReply(c), JSON.stringify(c.reply), solveAs(c.answer)]);
      const out = await writeDrafts({ ...REQUEST, sides: [side], count: 1 }, deps(client), { signal: ctl() });
      if (!out.ok) throw new Error(`${c.id} ${side}: ${out.error.kind}`);
      const d = out.drafts[0];
      writeFileSync(path.join(OUT, `after-${c.id}.${side}.svg`), svgOf(d, side));
      // What the new checks say about the old reply and the old narrated stem.
      const mcq = { stem: c.before[side], statements: [], options: c.options[side], answer: c.answer };
      const oldChecked = evaluateReply(JSON.stringify(c.old), { sides: [side], key: `Correct answer: ${'ABCD'[c.answer]}`, mcq });
      const narrated = narrationFindings({ kind: 'mcq', stem: { en: c.before.en, zh: c.before.zh }, statements: [], options: [], answerIndex: 0, explanation: { en: '', zh: '' } }, [side]);
      after[`${c.id}.${side}`] = {
        ...summary(d, client.requests),
        oldCaught: [...narrated.map((f) => `shape.narrates: "${f.params?.words}"`), ...(oldChecked?.issues ?? []).filter((i) => i.level === 'error').map((i) => `${i.code}: ${i.text}`)],
      };

      if (c.followUp) {
        const f = c.followUp;
        const fc = scriptedClient([JSON.stringify(f.reply), writeReply(c, { answer: f.rekeyed.answer, explanation: f.rekeyed.explanation }), solveAs(f.rekeyed.answer)]);
        const changed = await refine({ ...REQUEST, sides: [side] }, d, { kind: 'change', text: f.note }, [], deps(fc), { signal: ctl() });
        if (!changed.ok) throw new Error(`${c.id} follow-up: ${changed.error.kind}`);
        writeFileSync(path.join(OUT, `followup-${c.id}.${side}.svg`), svgOf(changed.drafts[0], side));
        after[`followup-${c.id}.${side}`] = { note: f.note, ...summary(changed.drafts[0], fc.requests), rewriteNote: (JSON.parse(fc.requests[1]?.turns[0].content ?? '{}') as { rewrite?: { note?: string } }).rewrite?.note ?? '' };
      }
    }
  }
  writeFileSync(path.join(OUT, 'after.json'), JSON.stringify(after, null, 2));
});
