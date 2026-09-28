import { rt } from '@/model/text';
import type { TranslationWrite } from '@/model/textSlots';
import type { TranslateRequest } from '@/store/appDialogs';
import type { JobResult, PlanCounts, TranslationJob, TranslationPlan } from '@/translate/types';
import { EMPTY_SESSION, type RunRecord, type TranslateSession } from './translateSession';

/**
 * Hand-built plans, results and sessions for the dialog's tests: the engine and the walker
 * are stubs until their packages land, so nothing here comes from them.
 */

export const WS_ID = 'ws-1';
export const PAPER_REQUEST: TranslateRequest = { worksheetId: WS_ID, mode: 'translate', scope: { kind: 'paper' } };

export function counts(over: Partial<PlanCounts> = {}): PlanCounts {
  return {
    toZh: 0,
    toEn: 0,
    teacher: 0,
    diagramLabels: 0,
    symbols: { toZh: 0, toEn: 0 },
    copied: 0,
    replaceable: 0,
    contextLines: 0,
    chars: 0,
    requests: 0,
    ...over,
  };
}

export function job(key: string, en: string, over: Partial<TranslationJob> = {}): TranslationJob {
  const groupKey = over.groupKey ?? 'q:Q3';
  return {
    key,
    direction: 'toZh',
    kind: 'part',
    groupKey,
    where: `Question 3 · ${key}`,
    source: rt(en),
    slots: [{ path: `q:Q3/${key}`, side: 'zh', sourceSnapshot: rt(en), targetSnapshot: [] }],
    replacing: false,
    ...over,
  };
}

export function result(key: string, zh: string, over: Partial<JobResult> = {}): JobResult {
  return {
    key,
    status: 'ready',
    runs: rt(zh),
    issues: [],
    terms: [],
    fixes: [],
    passes: 1,
    defaultAccepted: true,
    ...over,
  };
}

export function fakePlan(jobs: TranslationJob[], copies: TranslationWrite[] = []): TranslationPlan {
  const groups = new Map<string, string[]>();
  for (const j of jobs) groups.set(j.groupKey, [...(groups.get(j.groupKey) ?? []), j.key]);
  const toZh = jobs.filter((j) => j.direction === 'toZh').length;
  return {
    worksheetId: WS_ID,
    scope: { kind: 'paper' },
    options: {
      directions: { toZh: true, toEn: true },
      includeTeacher: true,
      includeDiagramLabels: true,
      copySymbols: { toZh: false, toEn: false },
    },
    jobs: new Map(jobs.map((j) => [j.key, j])),
    copies,
    chunks: [
      {
        id: 'c1',
        direction: 'toZh',
        groups: [...groups].map(([groupKey, jobKeys]) => ({
          groupKey,
          where: groupKey === 'cover' ? 'Cover' : 'Question 3',
          context: [],
          jobKeys,
        })),
        sourceChars: 100,
      },
    ],
    counts: counts({ toZh, toEn: jobs.length - toZh, requests: 1 }),
  };
}

/** Four rows: ready, flagged with a term fix, a content risk (unticked), failed. */
export function reviewRun(): RunRecord {
  const jobs = [
    job('t1', 'The government imposes a per-unit tax.', { kind: 'stem', where: 'Question 3 · Stem' }),
    job('t2', 'Supply decreases, so the equilibrium price rises.', { where: 'Question 3 · (b)' }),
    job('t3', 'Explain why demand for salt is elastic demand.', { where: 'Question 3 · (c)' }),
    job('t4', 'P₁', { kind: 'diagramLabel', where: 'Question 3 · Figure 1 · label' }),
  ];
  const results = new Map<string, JobResult>([
    ['t1', result('t1', '政府向含糖飲品徵收從量稅。')],
    [
      't2',
      result('t2', '供應減少，令均衡價格上升。', {
        status: 'flagged',
        fixes: [{ from: '供給', to: '供應', how: 'autoFix' }],
      }),
    ],
    [
      't3',
      result('t3', '解釋為何食鹽的需求屬低彈性需求。', {
        status: 'flagged',
        defaultAccepted: false,
        terms: [
          {
            entryId: 7,
            en: 'elastic demand',
            source: { text: 'elastic demand', start: 32, end: 46 },
            state: 'missing',
            severity: 'warn',
            expected: '彈性需求',
            conflict: { form: '低彈性需求', meansEn: 'inelastic demand' },
          },
        ],
      }),
    ],
    [
      't4',
      result('t4', '', {
        status: 'failed',
        runs: undefined,
        defaultAccepted: false,
        issues: [{ code: 'scripts', severity: 'fail', message: 'lost the subscript' }],
      }),
    ],
  ]);
  return { plan: fakePlan(jobs), results, model: 'Gemini 3.5 Flash-Lite', ms: 11000, stopped: false };
}

export function seeded(over: Partial<TranslateSession> = {}): TranslateSession {
  return {
    ...EMPTY_SESSION,
    request: PAPER_REQUEST,
    options: {
      directions: { toZh: true, toEn: true },
      includeTeacher: true,
      includeDiagramLabels: true,
      copySymbols: { toZh: false, toEn: false },
    },
    ...over,
  };
}
