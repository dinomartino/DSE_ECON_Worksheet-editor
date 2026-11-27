import type { SceneDef, ScenePartDef, ScenePointDef, SceneRegionDef } from './sceneCatalogue';
import { WORDS, type StageFacts, type StateFacts } from './sceneKit';
import type { DiagramIssue, SceneAsk, SceneStage, SpecScene, SpecText } from './types';

/**
 * The import quota scene (k-0589, audit k-0583 task C; 5 HKDSE papers, DSE2016–2022 P1 and
 * DSE2021 P2 Q9(b)): a small open economy at the world price Pw, domestic D and S, and S with the
 * quota: S up to Pw, flat along Pw for the quota, then S moved right by the quota (the editor's
 * `importQuota` relation, the kinked supply of DSE2022 Q44, so a drag keeps the kink at Pw). The
 * price with the quota is where D meets it; the gap between S and D there is the quota (the brace
 * form of DSE2016 Q42 and DSE2019 Q43, building on task A's bracket), and the rectangle between
 * that price and Pw over the gap is the quota rent.
 *
 * A second state: the quota raised or cut (two kinked supplies, S₁ → S₂: DSE2017 Q42), or demand
 * rising or falling while it stays (DSE2021 P2 Q9(b), the template import-quota-demand). A
 * one-state figure takes the change from the question's words ("doubles the import quota",
 * "abolishes the quota"): each state's market is worked out here, with the same change on other
 * slopes and sizes for the statement check. `importQuotaDraft.ts` draws it.
 */

export const IMPORT_QUOTA_STAGES = ['lowered', 'raised', 'demandRise', 'demandFall'] as const;
export type ImportQuotaStage = (typeof IMPORT_QUOTA_STAGES)[number];
export const isImportQuotaStage = (stage: string | undefined): stage is ImportQuotaStage => (IMPORT_QUOTA_STAGES as readonly string[]).includes(stage ?? '');

/** The scene's stage, or why it cannot be drawn. */
export function importQuotaError(scene: Pick<SpecScene, 'type' | 'stage' | 'labels'>): string | null {
  if (scene.type !== 'importQuota') return null;
  const stage = scene.stage ?? 'none';
  if (stage !== 'none' && !isImportQuotaStage(stage)) return `stage "${stage}" is not an import quota change: use "none", ${IMPORT_QUOTA_STAGES.join(', ')}.`;
  if (!drawn(scene, 'S') && !drawn(scene, 'Sq')) return 'An import quota figure needs a supply: label S (domestic supply) or Sq (S with the quota), or both.';
  return null;
}

/** S, Sq and Pw are left off the figure when the question labels them "" (the brace form has no kinked S; DSE2017 has no separate S). */
export function drawn(scene: Pick<SpecScene, 'labels'>, part: 'S' | 'Sq' | 'Pw'): boolean {
  return !scene.labels.some((l) => l.part.trim() === part && !l.label.trim());
}

const curve = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'curve', label, what, place });
const y = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'yTick', label, what, place });
const x = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'xTick', label, what, place });
const bracket = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'bracket', label, what, place });
const pt = (id: string, on: string, at: string): ScenePointDef => ({ id, on, at });
const w = (en: string, zh: string): SpecText => ({ en, zh });

export const QUOTA_WORDS = {
  quota: w('Import quota', '進口配額'),
};

/** The import quota's catalogue entry for its stage and the parts it draws. */
export function importQuotaDef(scene: Pick<SpecScene, 'stage' | 'labels'>): SceneDef {
  const stage = isImportQuotaStage(scene.stage) ? scene.stage : 'none';
  const lines = stage === 'lowered' || stage === 'raised';
  const demand = stage === 'demandRise' || stage === 'demandFall';
  const two = lines || demand;
  const hasS = drawn(scene, 'S');
  const hasSq = drawn(scene, 'Sq');
  const hasPw = drawn(scene, 'Pw');
  const parts: ScenePartDef[] = [curve('D', demand ? 'D_1' : 'D', `domestic demand${demand ? ' before' : ''}`, 'downward-sloping')];
  if (demand) parts.push(curve('D2', 'D_2', `domestic demand after (D ${stage === 'demandRise' ? 'moved right' : 'moved left'})`, `{D} shifted ${stage === 'demandRise' ? 'right' : 'left'}`));
  // S, Sq and Pw stay parts even when left off: their "" label is what leaves them off.
  parts.push(curve('S', lines ? 'S_d' : 'S', 'domestic supply (no imports); label "" to leave it off (a figure of the kinked supplies alone)', 'upward-sloping'));
  {
    parts.push(curve('Sq', lines ? 'S_1' : 'S_q', `supply with the quota${lines ? ' before' : ''}: S up to Pw, flat along Pw for the quota, then S moved right by it; label "" to leave it off (the brace form)`, 'follows {S} up to the world price, along it for the quota, then {S} shifted right by the quota'));
    if (lines) parts.push(curve('Sq2', 'S_2', `supply with the quota after (the quota ${stage === 'raised' ? 'enlarged: a longer flat step' : 'cut: a shorter flat step'})`, `{Sq} with a ${stage === 'raised' ? 'longer' : 'shorter'} flat step`));
  }
  parts.push(y('Pw', 'P_w', 'world price (a horizontal line below where D meets S); label "" to leave the line off', 'a horizontal price line below where {D} meets {S}'));
  parts.push(y('Pq', two ? 'P_1' : 'P_q', `domestic price with the quota${two ? ' before' : ''}: where D meets the kinked supply, above Pw`, 'where {D} meets {Sq}: the price at which the gap between {S} and {D} equals the quota'));
  if (two) parts.push(y('Pq2', 'P_2', `domestic price with the quota after`, lines ? 'where {D} meets {Sq2}' : 'where {D2} meets {Sq}'));
  parts.push(y('P0', 'P_0', 'the price with no trade (where D meets S)', 'where {D} meets {S}'), x('Q0', 'Q_0', 'the quantity with no trade', 'where {D} meets {S}'));
  if (hasPw || hasSq) parts.push(x('Qsw', two ? 'Q_s0' : 'Q_1', 'domestic output at the world price (free trade)', 'where {S} meets the {Pw} line'));
  if (hasS) parts.push(x('Qs', two ? 'Q_s1' : 'Q_2', `domestic output with the quota${two ? ' before' : ''}`, 'where {S} meets the {Pq} line'));
  parts.push(x('Qd', two ? 'Q_d1' : 'Q_3', `quantity demanded (and transacted) with the quota${two ? ' before' : ''}`, 'where {D} meets the {Pq} line'));
  if (hasPw || hasSq) parts.push(x('Qdw', two ? 'Q_d0' : 'Q_4', 'quantity demanded at the world price (free trade)', 'where {D} meets the {Pw} line'));
  if (two) {
    if (hasS) parts.push(x('Qs2', 'Q_s2', 'domestic output with the quota after', 'where {S} meets the {Pq2} line'));
    parts.push(x('Qd2', 'Q_d2', 'quantity demanded with the quota after', lines ? 'where {D} meets the {Pq2} line' : 'where {D2} meets the {Pq2} line'));
  }
  // The brackets print only when labelled ("Import quota" prints the EDB words in both languages).
  if (hasS) parts.push(bracket('quota', 'Import quota', `the import quota as the gap between S and D at the price with the quota (the brace form)${two ? ', before' : ''}`, 'from {S} to {D} at the {Pq} line'));
  if (hasS && two) parts.push(bracket('quota2', 'Import quota', 'the gap between S and D at the price after', `from {S} to ${lines ? '{D}' : '{D2}'} at the {Pq2} line`));
  if (hasSq) parts.push(bracket('step', 'Q_A', 'the quota as the flat step of the kinked supply along Pw', 'along the flat part of {Sq} at the world price'));

  // Regions: a partition, only on the full figure (S and Pw drawn).
  const regions: SceneRegionDef[] = [];
  const measures: SceneDef['measures'] = {};
  const measureWords: SceneDef['measureWords'] = { quotaRent: WORDS.quotaRent };
  if (hasS && hasPw && !two) {
    regions.push(
      { id: 'psGain', what: 'gain in PS: Pq to Pw left of S, 0 to Qs', words: WORDS.psGain, shape: 'the area between the {Pq} and {Pw} lines, left of {S}' },
      { id: 'dwlProduction', what: 'DWL in production: between S and Pw, Qsw to Qs', words: null, shape: 'the triangle above the {Pw} line and below {S}, from {Qsw} to {Qs}' },
      { id: 'rent', what: 'quota rent (to the holders of the import licences): Pq to Pw, Qs to Qd', words: WORDS.quotaRent, shape: 'the rectangle between the {Pq} and {Pw} lines, from {Qs} to {Qd}' },
      { id: 'dwlConsumption', what: 'DWL in consumption: between D and Pw, Qd to Qdw', words: null, shape: 'the triangle above the {Pw} line and below {D}, from {Qd} to {Qdw}' },
      { id: 'csAfter', what: 'CS with the quota: under D above Pq, 0 to Qd', words: WORDS.cs, shape: 'the area under {D} and above the {Pq} line, from 0 to {Qd}' },
      { id: 'psBefore', what: 'PS at the world price: below Pw above S, 0 to Qsw', words: WORDS.ps, shape: 'the area below the {Pw} line and above {S}, from 0 to {Qsw}' },
    );
    Object.assign(measures, {
      dwl: ['dwlProduction', 'dwlConsumption'],
      quotaRent: ['rent'],
      psGain: ['psGain'],
      csLoss: ['psGain', 'dwlProduction', 'rent', 'dwlConsumption'],
      csAfter: ['csAfter'],
      psBefore: ['psBefore'],
      psAfter: ['psBefore', 'psGain'],
    });
    Object.assign(measureWords, { csLoss: WORDS.csLoss, dwl: WORDS.dwl });
  } else if (hasS && hasPw && lines) {
    // The two quota rents: the high-price (smaller quota) rectangle is taller, the other wider; what they share, and what each has alone.
    const high = stage === 'raised' ? 'before' : 'after';
    const [ph, pl, qsh, qdh, qsl, qdl] = stage === 'raised' ? ['Pq', 'Pq2', 'Qs', 'Qd', 'Qs2', 'Qd2'] : ['Pq2', 'Pq', 'Qs2', 'Qd2', 'Qs', 'Qd'];
    regions.push(
      { id: 'rentKept', what: `quota rent in both states: Pw to ${pl}, ${qsh} to ${qdh}`, words: null, shape: `the rectangle between the {${pl}} and {Pw} lines, from {${qsh}} to {${qdh}}` },
      { id: 'rentHigh', what: `quota rent only ${high} (the higher price): ${pl} to ${ph}, ${qsh} to ${qdh}`, words: null, shape: `the rectangle between the {${ph}} and {${pl}} lines, from {${qsh}} to {${qdh}}` },
      { id: 'rentLeft', what: `quota rent only ${high === 'before' ? 'after' : 'before'} (the larger quota), left part: Pw to ${pl}, ${qsl} to ${qsh}`, words: null, shape: `the rectangle between the {${pl}} and {Pw} lines, from {${qsl}} to {${qsh}}` },
      { id: 'rentRight', what: `quota rent only ${high === 'before' ? 'after' : 'before'} (the larger quota), right part: Pw to ${pl}, ${qdh} to ${qdl}`, words: null, shape: `the rectangle between the {${pl}} and {Pw} lines, from {${qdh}} to {${qdl}}` },
    );
    const highSet = ['rentKept', 'rentHigh'];
    const lowSet = ['rentKept', 'rentLeft', 'rentRight'];
    measures.quotaRentBefore = stage === 'raised' ? highSet : lowSet;
    measures.quotaRent = stage === 'raised' ? lowSet : highSet;
    measureWords.quotaRentBefore = w('Original quota rent', '原先的配額租金');
    measureWords.quotaRent = w('New quota rent', '新的配額租金');
  } else if (hasS && hasPw && demand) {
    regions.push({ id: 'rent', what: 'quota rent after the demand change: Pq2 to Pw, Qs2 to Qd2', words: WORDS.quotaRent, shape: 'the rectangle between the {Pq2} and {Pw} lines, from {Qs2} to {Qd2}' });
    measures.quotaRent = ['rent'];
  }

  // Ticks the asks read.
  const ticks: Partial<Record<SceneAsk, string[]>> = two
    ? { priceBefore: ['Pq'], priceAfter: ['Pq2'], quantityBefore: ['Qd'], quantityAfter: ['Qd2'], ...(hasS ? { importsBefore: ['Qs', 'Qd'], importsAfter: ['Qs2', 'Qd2'], domesticOutput: ['Qs2'] } : {}) }
    : {
        priceAfter: ['Pq'],
        quantityAfter: ['Qd'],
        ...(hasPw ? { priceBefore: ['Pw'] } : {}),
        ...(hasPw || hasSq ? { importsBefore: ['Qsw', 'Qdw'], quantityBefore: ['Qdw'] } : {}),
        ...(hasS ? { importsAfter: ['Qs', 'Qd'], domesticOutput: ['Qs'] } : {}),
      };

  // Points a question may letter.
  const points: ScenePointDef[] = [pt('dAtSq', 'D', 'Sq'), pt('e0', 'D', 'S'), pt('dAtPw', 'D', 'Pw'), pt('sAtPw', 'S', 'Pw'), pt('sAtPq', 'S', 'Pq'), pt('dAtPq', 'D', 'Pq'), pt('pwAtQs', 'Pw', 'Qs'), pt('pwAtQd', 'Pw', 'Qd')];
  if (lines) points.push(pt('dAtSq2', 'D', 'Sq2'), pt('sAtPq2', 'S', 'Pq2'), pt('pwAtQs2', 'Pw', 'Qs2'), pt('pwAtQd2', 'Pw', 'Qd2'));
  if (demand) points.push(pt('d2AtSq', 'D2', 'Sq'), pt('d2AtPw', 'D2', 'Pw'), pt('sAtPq2', 'S', 'Pq2'), pt('pwAtQs2', 'Pw', 'Qs2'), pt('pwAtQd2', 'Pw', 'Qd2'));

  const shown = two ? ['Pw', 'Pq', 'Pq2', 'Qd', 'Qd2'] : ['Pw', 'Pq', ...(hasPw ? ['Qsw', 'Qdw'] : []), 'Qs', 'Qd'];
  return {
    type: 'importQuota',
    when: `an import quota in a small open economy${stage !== 'none' ? `, stage ${stage}` : ''}`,
    parts,
    regions,
    measures,
    measureWords,
    ticks,
    shown: shown.filter((id) => parts.some((p) => p.id === id)),
    edges: (lines ? ['Qs', 'Qd', 'Qs2', 'Qd2'] : demand ? ['Qs2', 'Qd2'] : ['Qsw', 'Qs', 'Qd', 'Qdw']).filter((id) => parts.some((p) => p.id === id)),
    points,
  };
}

/** The one-state entry the prompt's scene list prints (the stages and the brace form are described beside it). */
export const IMPORT_QUOTA_MENU_DEF: SceneDef = {
  ...importQuotaDef({ stage: 'none', labels: [] }),
  when: 'an import quota in a small open economy (DSE P1 and Paper 2): D, domestic S, the world price Pw, S with the quota (kinked: S up to Pw, flat for the quota, then S moved right), the price with the quota, imports, the quota rent, the deadweight loss; the brace form; a quota raised or cut, demand changing under it (IMPORT QUOTA below)',
};

// ---- the economics, in unit space ----

/** A straight line: slope `m` through `at`. */
export interface QuotaLine {
  m: number;
  at: [number, number];
}
/** A small open economy: domestic demand and supply, and the world price. */
export interface QuotaMarket {
  d: QuotaLine;
  s: QuotaLine;
  pw: number;
}

const xOf = (l: QuotaLine, p: number) => l.at[0] + (p - l.at[1]) / l.m;

/** The imports at the world price with no quota. */
export const freeImports = (m: QuotaMarket) => xOf(m.d, m.pw) - xOf(m.s, m.pw);

/** The domestic price with a quota `q` (null = free trade): where the gap between D and S equals the quota; Pw when it does not bind. */
export function quotaPrice(m: QuotaMarket, q: number | null): number {
  if (q === null || q >= freeImports(m) - 1e-9) return m.pw;
  // x_D(p) − x_S(p) is linear in p: (aD − aS) + p (1/dm − 1/sm) = q.
  const aD = m.d.at[0] - m.d.at[1] / m.d.m;
  const aS = m.s.at[0] - m.s.at[1] / m.s.m;
  return (q - (aD - aS)) / (1 / m.d.m - 1 / m.s.m);
}

/** One state's market: free trade (q null) or with the quota q. */
export function quotaFacts(m: QuotaMarket, q: number | null): StateFacts {
  const price = quotaPrice(m, q);
  const quantity = xOf(m.d, price);
  const domestic = Math.max(0, xOf(m.s, price));
  const imports = quantity - domestic;
  // Linear curves: CS = |dD|·Qd²/2, PS = dS·Qs²/2.
  const cs = (Math.abs(m.d.m) * quantity * quantity) / 2;
  const ps = (m.s.m * domestic * domestic) / 2;
  const rent = (price - m.pw) * imports;
  const dwl = ((price - m.pw) * (domestic - Math.max(0, xOf(m.s, m.pw)) + (xOf(m.d, m.pw) - quantity))) / 2;
  return { binds: price > m.pw + 1e-9, quantity, price, cs, ps, tss: cs + ps + rent, dwl, shortage: 0, surplus: 0, imports, domestic, rent };
}

export type QuotaChange = 'imposed' | 'removed' | 'raised' | 'lowered' | 'demandRise' | 'demandFall';

/** Both states of a change: `q` the quota, `dq` its change, `h` the demand shift (rightward, in quantity). */
export function quotaStates(change: QuotaChange, m: QuotaMarket, q: number, dq: number, h: number): { before: StateFacts; after: StateFacts } {
  const withQ = quotaFacts(m, q);
  switch (change) {
    case 'imposed':
      return { before: quotaFacts(m, null), after: withQ };
    case 'removed':
      return { before: withQ, after: quotaFacts(m, null) };
    case 'raised':
      return { before: withQ, after: quotaFacts(m, q + dq) };
    case 'lowered':
      return { before: withQ, after: quotaFacts(m, q - dq) };
    case 'demandRise':
    case 'demandFall': {
      const dx = change === 'demandRise' ? h : -h;
      return { before: withQ, after: quotaFacts({ ...m, d: { ...m.d, at: [m.d.at[0] + dx, m.d.at[1]] } }, q) };
    }
  }
}

/** The same change on other slopes, world prices, quotas and sizes: a statement holds only when all agree. */
const VARIANTS = new Map<QuotaChange, Array<{ before: StateFacts; after: StateFacts }>>();
export function quotaVariants(change: QuotaChange): Array<{ before: StateFacts; after: StateFacts }> {
  const cached = VARIANTS.get(change);
  if (cached) return cached;
  const out: Array<{ before: StateFacts; after: StateFacts }> = [];
  const E: [number, number] = [0.5, 0.5];
  for (const dm of [-0.42, -1, -2.2])
    for (const sm of [0.42, 1, 2.2])
      for (const a of [0.08, 0.2])
        for (const f of [0.3, 0.6])
          for (const h of [0.05, 0.15]) {
            const m: QuotaMarket = { d: { m: dm, at: E }, s: { m: sm, at: E }, pw: E[1] - a };
            const m0 = freeImports(m);
            const q = f * m0;
            const dq = 0.25 * m0;
            // The quota binds in both states (a figure that drew it not binding is not this one).
            if (change === 'demandFall' && freeImports({ ...m, d: { ...m.d, at: [E[0] - h, E[1]] } }) <= q + 1e-6) continue;
            out.push(quotaStates(change, m, q, dq, h));
          }
  VARIANTS.set(change, out);
  return out;
}

// ---- the question's words ----

/** Words between a verb and "quota" that do not name demand (an "increase in demand under the quota" is not a quota raised). */
const NEAR = String.raw`(?:(?!demand|需求)[^.。;；]){0,30}?`;
const QUOTA = String.raw`(?:import\s+)?quotas?`;
const verbs = (en: string, zh: string) =>
  new RegExp(String.raw`\b(?:${en})\w*${NEAR}${QUOTA}|\b${QUOTA}[^.。;；]{0,20}?\b(?:is|are|be|was|were|being)\s+(?:${en})\w*|(?:${zh})[^。；]{0,8}配額|配額[^。；]{0,8}(?:${zh})`, 'i');
/** In order: a demand change first ("demand increases while the quota stays" is not a quota raised). */
export const QUOTA_CHANGE_WORDS: Array<{ change: QuotaChange; re: RegExp }> = [
  { change: 'removed', re: verbs('abolish|remov|lift|scrap|cancel|eliminat|withdr', '取消|撤銷|撤消|廢除') },
  { change: 'demandRise', re: /\bdemand\s+(?:for\s+[^.。;；]{0,30}?)?(?:increases|rises|goes\s+up|will\s+(?:increase|rise))|\b(?:increase|rise)\s+in\s+(?:the\s+)?(?:domestic\s+)?demand|需求[^。；]{0,6}(?:增加|上升)/i },
  { change: 'demandFall', re: /\bdemand\s+(?:for\s+[^.。;；]{0,30}?)?(?:decreases|falls|drops|will\s+(?:decrease|fall))|\b(?:decrease|fall|drop)\s+in\s+(?:the\s+)?(?:domestic\s+)?demand|需求[^。；]{0,6}(?:減少|下降)/i },
  { change: 'raised', re: verbs('rais|increas|doubl|tripl|enlarg|relax|expand|loosen', '增加|提高|放寬|擴大|倍增') },
  { change: 'lowered', re: verbs('reduc|cut|lower|decreas|tighten|halv', '減少|降低|收緊|削減|減半') },
];

/** The change a stem names, or null (an import quota imposed is the default reading). */
export function quotaChangeIn(stem: string): QuotaChange | null {
  return QUOTA_CHANGE_WORDS.find((c) => c.re.test(stem))?.change ?? null;
}

/** A one-state figure's alternative readings, picked by the stem (`stageCheck.ts`). */
export function quotaChanges(m: QuotaMarket, q: number, dq: number, h: number): NonNullable<StageFacts['changes']> {
  return QUOTA_CHANGE_WORDS.map(({ change, re }) => ({ what: `the quota ${change === 'removed' ? 'abolished' : change === 'raised' ? 'raised' : change === 'lowered' ? 'cut' : change === 'demandRise' ? 'kept while demand rises' : 'kept while demand falls'}`, when: re, ...quotaStates(change, m, q, dq, h), variants: quotaVariants(change) }));
}

/**
 * The stem against the scene: an import quota drawn as another scene, and a two-state figure
 * whose change is not the one the question names.
 */
export function importQuotaWords(scene: SpecScene, stem: string): DiagramIssue[] {
  const out: DiagramIssue[] = [];
  const named = /\bimport\s+quotas?\b|進口配額/i.test(stem);
  if (scene.type !== 'importQuota') {
    if (named && scene.type !== 'none')
      out.push({ level: scene.type === 'tariff' ? 'look' : 'error', code: 'scene.policy', text: `The question has an import quota, but the figure is scene ${scene.type}. An import quota at the world price (the kinked supply, the brace, the quota rent) is scene importQuota.` });
    return out;
  }
  // A tariff question drawn as an import quota (the tariff rule lets the two share a stem that compares them).
  if (/\btariff|關稅/i.test(stem) && !/\bquotas?\b|配額/i.test(stem)) out.push({ level: 'error', code: 'scene.policy', text: 'The question has a tariff and no quota, but the figure is scene importQuota: a tariff is scene tariff.' });
  const stage = (scene.stage ?? 'none') as SceneStage;
  if (stage === 'none') return out;
  const change = quotaChangeIn(stem);
  if (!change) return out;
  const want: Partial<Record<QuotaChange, string>> = { raised: 'raised', lowered: 'lowered', demandRise: 'demandRise', demandFall: 'demandFall' };
  const expected = want[change];
  if (expected && expected !== stage) out.push({ level: 'error', code: 'scene.stage', text: `The question ${change === 'raised' ? 'raises the quota' : change === 'lowered' ? 'cuts the quota' : change === 'demandRise' ? 'has demand rising' : 'has demand falling'}, but the scene has stage "${stage}": use stage "${expected}".` });
  if (change === 'removed') out.push({ level: 'error', code: 'scene.stage', text: `The question abolishes the quota: draw the one-state figure (stage "none"); its statements are read as the quota removed.` });
  return out;
}
