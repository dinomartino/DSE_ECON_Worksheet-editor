/**
 * Translation quality eval (§ AI translation): the real client and pipeline against live
 * providers. `npm run eval:translate`; keys come from the environment (EVAL_GEMINI_KEY,
 * EVAL_DEEPSEEK_KEY, …) and a provider without one is skipped. No key is ever printed.
 * The report goes to EVAL_REPORT_DIR (default: the OS temp dir) and is never committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClient } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import { parseItemsPayload } from '@/ai/schema';
import type { AiClient, CompletionRequest, ProviderId, ProviderPreset } from '@/ai/types';
import { loadGlossary } from '@/glossary/load';
import type { Glossary } from '@/glossary/types';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { plain } from '@/model/text';
import type { SlotGroup, SlotKind, TextSlot } from '@/model/textSlots';
import type { RichText, Worksheet } from '@/model/types';
import { planFromSlots, planTranslation } from '@/translate/plan';
import { PROMPT_VERSION, wireFor } from '@/translate/prompt';
import { runTranslation } from '@/translate/run';
import { SIMPLIFIED_PAIRS } from '@/translate/simplified';
import type { Direction, RunOutcome, TranslateOptions, TranslationPlan } from '@/translate/types';
import { oneSided } from '@/translate/testKit';
import { decodeWire } from '@/translate/wire';
import { MCQS, STRUCTURED } from '../scripts/demo/content.mjs';

// ---- cases ----

interface Pair { kind: SlotKind; en: string; zh?: string }
interface Case { name: string; plan: (options: TranslateOptions) => TranslationPlan; references: Map<string, string> }

const OPTIONS: TranslateOptions = {
  directions: { toZh: true, toEn: true },
  includeTeacher: true,
  includeDiagramLabels: true,
  copySymbols: { toZh: false, toEn: false },
};

/** Hand-built slots for text that is not a worksheet: one group per case, in order. */
function pairSlots(pairs: readonly Pair[], label: string, source: 'en' | 'zh'): TextSlot[] {
  const group: SlotGroup = { kind: 'question', id: label, label };
  const runs = (text?: string): RichText => (text ? [{ text }] : []);
  return pairs.map((pair, i) => ({
    path: `${label}/${i}`, kind: pair.kind, role: 'print', group, questionId: label, flowId: label, blockIds: [],
    text: source === 'en' ? { en: runs(pair.en), zh: [] } : { en: [], zh: runs(pair.zh) },
  }));
}

function pairCase(name: string, pairs: readonly Pair[], source: 'en' | 'zh'): Case {
  const kept = pairs.filter((p) => source === 'en' || p.zh);
  const slots = pairSlots(kept, name, source);
  return {
    name,
    plan: (options) => planFromSlots(name, slots, { kind: 'paper' }, options),
    references: new Map(slots.map((slot, i) => [slot.path, (source === 'en' ? kept[i].zh : kept[i].en) ?? ''])),
  };
}

function worksheetCase(name: string, ws: Worksheet): Case {
  const english = oneSided(ws, 'en');
  return { name, plan: (options) => planTranslation(english, { kind: 'paper' }, options), references: new Map() };
}

const demoPairs: Pair[] = [
  ...MCQS.flatMap((q) => [
    { kind: 'stem' as const, en: q.stem[0], zh: q.stem[1] },
    ...q.options.map(([en, zh]) => ({ kind: 'option' as const, en, zh })),
  ]),
  { kind: 'stem', en: STRUCTURED.stem[0], zh: STRUCTURED.stem[1] },
  ...STRUCTURED.parts.flatMap((part) => [
    { kind: 'part' as const, en: part.text[0], zh: part.text[1] },
    { kind: 'schemePoint' as const, en: part.scheme[0], zh: part.scheme[1] },
  ]),
];

/** The two sample Paper 2 lines aligned in §H.2, as human references. */
const SAMPLE_PAPER2: Pair[] = [
  { kind: 'part', en: 'State the opportunity cost of the plan.', zh: '寫出該計劃的機會成本。' },
  { kind: 'part', en: 'Explain ONE reason why the market may under-provide parks.', zh: '解釋市場可能對公園供應不足的一個原因。' },
];

/** Every CONVENTIONS row, a duration and a Chinese count: correct output must pass clean. */
const CONVENTION_SET: Pair[] = [
  { kind: 'part', en: 'Country A exports rice to Country B.', zh: '甲國向乙國出口米。' },
  { kind: 'part', en: 'Student A says the price will rise.', zh: '學生甲說價格會上升。' },
  { kind: 'instructions', en: 'Answer ALL questions in Section B.', zh: '乙部須回答全部試題。' },
  { kind: 'part', en: 'A ticket costs HK$500 and a meal US$20.', zh: '一張門票500港元，一頓飯20美元。' },
  { kind: 'part', en: 'With the aid of an AD-AS diagram, explain the effect on real GDP.', zh: '以一幅總供需圖輔助，解釋對實質本地生產總值的影響。' },
  { kind: 'coverLine', en: 'Time allowed: 1 hour 30 minutes', zh: '時限：1小時30分鐘' },
  { kind: 'instructions', en: 'Answer any 2 questions.', zh: '任答兩題。' },
  { kind: 'coverLine', en: 'S.6 MOCK EXAMINATION 2026 – 2027', zh: '2026 – 2027 年度中六模擬考試' },
  { kind: 'coverLine', en: 'PAPER 1', zh: '卷一' },
  { kind: 'coverLine', en: 'ECON', zh: '經濟' },
];

const DOCUMENT_TYPES: DocumentType[] = ['classroom', 'paper1', 'lqWorksheet', 'lqMock'];

function cases(): Case[] {
  const corpus = JSON.parse(readFileSync('src/test/corpus/v1-published.json', 'utf8')) as Worksheet;
  return [
    ...DOCUMENT_TYPES.map((type) => worksheetCase(`preset:${type}`, createWorksheetFrom({ documentType: type }))),
    worksheetCase('corpus:v1 (English only)', corpus),
    pairCase('demo:toZh', demoPairs, 'en'),
    pairCase('demo:toEn', demoPairs, 'zh'),
    pairCase('sample-paper2', SAMPLE_PAPER2, 'en'),
    pairCase('conventions', CONVENTION_SET, 'en'),
  ];
}

// ---- providers and toggles ----

const PROVIDERS: ReadonlyArray<{ id: ProviderId; env: string }> = [
  { id: 'gemini', env: 'EVAL_GEMINI_KEY' },
  { id: 'deepseek', env: 'EVAL_DEEPSEEK_KEY' },
  { id: 'qwen', env: 'EVAL_QWEN_KEY' },
  { id: 'openrouter', env: 'EVAL_OPENROUTER_KEY' },
  { id: 'openai', env: 'EVAL_OPENAI_KEY' },
  { id: 'anthropic', env: 'EVAL_ANTHROPIC_KEY' },
];

/** A/B switches. Thinking level follows the model entry: compare with EVAL_<ID>_MODEL. */
interface Toggle { name: string; denyHints: boolean; fewShot: boolean }
const TOGGLES: Toggle[] = process.env.EVAL_AB
  ? [
      { name: 'baseline', denyHints: true, fewShot: true },
      { name: 'no-deny-hints', denyHints: false, fewShot: true },
      { name: 'no-few-shot', denyHints: true, fewShot: false },
    ]
  : [{ name: 'baseline', denyHints: true, fewShot: true }];

/** The real client, recording raw replies so pass-1 compliance can be measured. */
function recording(client: AiClient, fewShot: boolean) {
  const replies: Array<{ task: string; text: string }> = [];
  const wrapped: AiClient = {
    listModels: (signal) => client.listModels(signal),
    async complete(req: CompletionRequest) {
      const turns = fewShot ? req.turns : req.turns.slice(-1);
      const result = await client.complete({ ...req, turns });
      replies.push({ task: JSON.parse(req.turns[req.turns.length - 1].content).task, text: result.text });
      return result;
    },
  };
  return { client: wrapped, replies };
}

// ---- metrics ----

const AMERICAN = /\b(labor|specialization|specialize|analyze|favor|behavior|center|organization|subsidize|maximize|minimize)\b/gi;

interface Metrics {
  items: number; failed: number; pass2: number;
  coreTerms: number; okBefore: number; okAfter: number; notPreferred: number; conflicts: number;
  simplifiedLeaks: number; simplifiedConverted: number; derivedLeaks: number;
  capitals: number; capitalsKept: number; numbersLost: number; symbolsLost: number;
  americanSpellings: number; ms: number; tokens: { input: number; output: number };
  samples: Array<{ key: string; source: string; output: string; reference?: string; status: string; chips: string[] }>;
}

function zero(): Metrics {
  return {
    items: 0, failed: 0, pass2: 0, coreTerms: 0, okBefore: 0, okAfter: 0, notPreferred: 0, conflicts: 0,
    simplifiedLeaks: 0, simplifiedConverted: 0, derivedLeaks: 0, capitals: 0, capitalsKept: 0, numbersLost: 0,
    symbolsLost: 0, americanSpellings: 0, ms: 0, tokens: { input: 0, output: 0 }, samples: [],
  };
}

function targetOf(direction: Direction) {
  return direction === 'toZh' ? 'zh' : 'en';
}

function score(plan: TranslationPlan, outcome: RunOutcome, replies: Array<{ task: string; text: string }>,
  glossary: Glossary, references: Map<string, string>): Metrics {
  const m: Metrics = { ...zero(), items: plan.jobs.size, ms: outcome.ms,
    tokens: { input: outcome.usage?.input ?? 0, output: outcome.usage?.output ?? 0 } };
  const firstPass = new Map<string, string>();
  for (const reply of replies) {
    if (reply.task !== 'translate') continue;
    for (const item of parseItemsPayload(reply.text) ?? []) if (!firstPass.has(item.key)) firstPass.set(item.key, item.text);
  }
  const core = (checks: ReturnType<Glossary['checkEnToZh']>) => checks.filter((c) => c.severity !== 'info');
  for (const [key, job] of plan.jobs) {
    const result = outcome.results.get(key);
    if (!result) continue;
    const source = plain(job.source);
    const output = result.runs ? plain(result.runs) : '';
    if (result.status === 'failed') m.failed += 1;
    if (result.passes === 2) m.pass2 += 1;
    if (result.issues.some((i) => i.code === 'derived')) m.derivedLeaks += 1;
    if (result.issues.some((i) => i.code === 'numbers')) m.numbersLost += 1;
    if (result.issues.some((i) => i.code === 'symbols')) m.symbolsLost += 1;
    m.simplifiedConverted += result.fixes.filter((f) => f.how === 'simplified').length;
    m.simplifiedLeaks += [...output].filter((ch) => SIMPLIFIED_PAIRS.has(ch)).length;
    if (job.direction === 'toZh') {
      const after = core(glossary.checkEnToZh(source, output));
      m.coreTerms += after.length;
      m.okAfter += after.filter((c) => c.state === 'ok' || c.state === 'ok-abbr').length;
      m.notPreferred += after.filter((c) => c.state === 'not-preferred').length;
      m.conflicts += after.filter((c) => c.conflict).length;
      const raw = firstPass.get(key);
      const decoded = raw === undefined ? null : decodeWire(raw, wireFor(job).codec, targetOf(job.direction), job.kind, job.aroundValue);
      const before = decoded?.ok ? core(glossary.checkEnToZh(source, plain(decoded.runs))) : [];
      m.okBefore += before.filter((c) => c.state === 'ok' || c.state === 'ok-abbr').length;
      if (wireFor(job).codec.emphasis.capitals > 0) {
        m.capitals += 1;
        if (result.status !== 'failed' && !result.issues.some((i) => i.code === 'emphasis')) m.capitalsKept += 1;
      }
    } else {
      m.americanSpellings += output.match(AMERICAN)?.length ?? 0;
    }
    const chips = [...result.issues.map((i) => i.code), ...result.terms.map((t) => `${t.state}:${t.en}`)];
    const reference = job.slots.map((slot) => references.get(slot.path)).find(Boolean);
    m.samples.push({ key, source, output, ...(reference ? { reference } : {}), status: result.status, chips });
  }
  return m;
}

// ---- the ship gate and the report ----

const compliance = (m: Metrics) => (m.coreTerms ? m.okAfter / m.coreTerms : 1);
const gatePasses = (m: Metrics) => m.failed === 0 && m.simplifiedLeaks === 0 && m.derivedLeaks === 0 && compliance(m) >= 0.98;

function sum(all: Metrics[]): Metrics {
  return all.reduce((acc, m) => {
    for (const key of Object.keys(m) as Array<keyof Metrics>) {
      if (typeof m[key] === 'number') (acc[key] as number) += m[key] as number;
    }
    acc.tokens.input += m.tokens.input;
    acc.tokens.output += m.tokens.output;
    return acc;
  }, zero());
}

function writeReport(name: string, report: unknown): string {
  const dir = process.env.EVAL_REPORT_DIR ?? path.join(tmpdir(), 'econgen-eval');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

// ---- runs ----

describe('eval harness', () => {
  it('builds every case without a key', () => {
    for (const c of cases()) {
      const plan = c.plan(OPTIONS);
      expect(plan.jobs.size, c.name).toBeGreaterThanOrEqual(1);
    }
  });

  // The Gemini native API parses fields before it checks the key: a dummy key must map to badKey.
  it.skipIf(!process.env.EVAL_NETWORK)('a dummy Gemini key maps to badKey, not a payload error', async () => {
    const preset = presetFor('gemini');
    const client = createClient({ provider: 'gemini', apiKey: 'AIza-dummy-key-for-payload-check', model: preset.models[0].id, baseUrl: preset.baseUrl });
    const plan = pairCase('dummy', CONVENTION_SET.slice(0, 1), 'en').plan(OPTIONS);
    const glossary = await loadGlossary();
    const outcome = await runTranslation(plan, { client, preset, model: preset.models[0].id, glossary }, new AbortController().signal, () => {});
    expect(outcome.fatal?.kind).toBe('badKey');
  });
});

for (const { id, env } of PROVIDERS) {
  const key = process.env[env];
  describe.skipIf(!key)(`provider ${id}`, () => {
    for (const toggle of TOGGLES) {
      it(`${toggle.name}: runs every case and reports`, async () => {
        const base = presetFor(id);
        const preset: ProviderPreset = { ...base, denyHintsInPrompt: toggle.denyHints };
        const model = process.env[`EVAL_${id.toUpperCase()}_MODEL`] ?? base.models[0].id;
        const baseUrl = process.env[`EVAL_${id.toUpperCase()}_BASE_URL`] ?? base.baseUrl;
        const glossary = await loadGlossary();
        const perCase: Array<{ name: string; metrics: Metrics }> = [];
        for (const c of cases()) {
          const plan = c.plan(OPTIONS);
          if (plan.jobs.size === 0) continue;
          const { client, replies } = recording(createClient({ provider: id, apiKey: key!, model, baseUrl }), toggle.fewShot);
          const outcome = await runTranslation(plan, { client, preset, model, glossary }, new AbortController().signal, () => {});
          if (outcome.fatal) throw new Error(`${c.name}: ${outcome.fatal.kind} — ${outcome.fatal.message}`);
          perCase.push({ name: c.name, metrics: score(plan, outcome, replies, glossary, c.references) });
        }
        const total = sum(perCase.map((p) => p.metrics));
        const summary = {
          provider: id, model, promptVersion: PROMPT_VERSION, toggle: toggle.name,
          compliance: compliance(total), gate: gatePasses(total), totals: { ...total, samples: undefined },
        };
        const file = writeReport(`${id}-${toggle.name}`, { ...summary, cases: perCase });
        console.log(JSON.stringify({ ...summary, report: file }, null, 2));
        if (process.env.EVAL_GATE) expect(gatePasses(total), `ship gate failed; see ${file}`).toBe(true);
      });
    }
  });
}
