import { isMonopolyStage, monopolyDef } from './monopoly';
import { tradeDef } from './trade';
import { sceneDef, WORDS, type SceneDef, type ScenePartDef, type ScenePointDef, type SceneRegionDef } from './sceneCatalogue';
import type { MonopolyStage, SceneAsk, SceneBinds, SceneStage, SpecScene, SpecText } from './types';

/**
 * Two-state control scenes (k-0587, audit k-0583 task B). A price ceiling, a price floor or a
 * quota with a second state on the same figure: the control itself lowered or raised (two
 * control lines, HKDSE 2015 P1 Q19, 2021 P1 Q17, 2020 P1 Q20, 2023 P1 Q17; a quota enlarged,
 * 2015 P2 Q3), or a curve shifting while it stays (a ceiling and a supply shift, 2026 P1 Q16; a
 * quota and a demand rise, 2024 P2 Q3; a ceiling made effective by a demand rise, 2023 P1 Q21,
 * which round 3 drew as its own scene `ceilingDemandRise`).
 *
 * The model chooses the stage and the states the control binds in; the code places the lines
 * from them (a ceiling binds below the equilibrium price, a floor above, a quota left of the
 * equilibrium quantity) and generates the catalogue entry: the parts, the deadweight-loss
 * regions (kept / added / removed: a partition), the before and after asks and the points a
 * question may letter. Pure data and rules; `scene.ts` draws it.
 */

export type Control = 'ceiling' | 'floor' | 'quota';

/** Where a control sits against the two equilibria of a shift stage. */
export type StagePlace = 'old' | 'between' | 'beyond' | 'outside';

export interface StagePlan {
  control: Control;
  stage: Exclude<SceneStage, 'none' | MonopolyStage>;
  binds: SceneBinds;
  /** The control binds before / after. */
  b1: boolean;
  b2: boolean;
  /** The curve that shifts, or null when the control itself moves (two control lines). */
  shift: 'demand' | 'supply' | null;
  /** A line stage: the control is made stricter (a ceiling lowered, a floor raised, a quota cut). */
  tighten: boolean;
  /** A shift stage: where the control sits against the old and the new equilibrium. */
  place: StagePlace | null;
  /** A shift stage: the equilibrium price (a quota: quantity) rises. */
  up: boolean;
}

const CONTROL_OF: Partial<Record<SpecScene['type'], Control>> = { priceCeiling: 'ceiling', priceFloor: 'floor', quota: 'quota' };

/** The scene's two-state plan, null for a one-state scene, or why the choices cannot be drawn. */
export function stagePlan(scene: Pick<SpecScene, 'type' | 'stage' | 'binds'>): StagePlan | null | { error: string } {
  const stage = scene.stage ?? 'none';
  if (stage === 'none') return null;
  // A monopoly's stages are its own (k-0589, `monopoly.ts`); a control takes none of them.
  if (scene.type === 'monopoly') return null;
  if (isMonopolyStage(stage)) return { error: `stage "${stage}" is for a monopoly scene; scene ${scene.type} takes stage "none" or a control stage.` };
  const control = CONTROL_OF[scene.type];
  if (!control) return { error: `stage "${stage}" is for a priceCeiling, priceFloor or quota scene; scene ${scene.type} takes stage "none".` };
  const binds = scene.binds ?? 'both';
  const b1 = binds === 'both' || binds === 'before';
  const b2 = binds === 'both' || binds === 'after';
  const what = control === 'ceiling' ? 'price ceiling' : control === 'floor' ? 'price floor' : 'quota';
  if (stage === 'lowered' || stage === 'raised') {
    // A ceiling binds lower down, a floor higher up, a quota further left (a smaller quota).
    const tighten = control === 'floor' ? stage === 'raised' : stage === 'lowered';
    if (control === 'quota' && binds !== 'both')
      return { error: 'A quota changed is drawn binding in both states (both quotas left of the equilibrium quantity): set binds "both". A quota abolished is the one-state quota scene.' };
    if (tighten && binds === 'before') return { error: `A ${what} ${stage} becomes stricter: if it binds before it still binds after. Use binds "both", "after" (it starts on the other side of the equilibrium) or "neither".` };
    if (!tighten && binds === 'after') return { error: `A ${what} ${stage} becomes looser: if it binds after it bound before too. Use binds "both", "before" or "neither".` };
    return { control, stage, binds, b1, b2, shift: null, tighten, place: null, up: false };
  }
  const shift = stage === 'demandRise' || stage === 'demandFall' ? 'demand' : 'supply';
  if (control === 'quota' && shift === 'supply') return { error: 'A quota with a supply shift is not drawn: use stage demandRise or demandFall, or kind "curves".' };
  // The equilibrium price rises with more demand or less supply; the quantity with more of either.
  const up = control === 'quota' ? stage === 'demandRise' : stage === 'demandRise' || stage === 'supplyFall';
  // A ceiling binds below the price, a floor above it, a quota left of the quantity.
  const bindsBelow = control !== 'floor';
  const place: StagePlace = binds === 'both' ? 'beyond' : binds === 'neither' ? 'outside' : 'old';
  if (control === 'quota' && binds === 'neither') return { error: 'A quota that binds in neither state is not drawn: use binds "both", "before" or "after".' };
  if (binds === 'after' || binds === 'before') {
    // Binding after only: the control sits at the old equilibrium and the shift moves the equilibrium past it.
    const needUp = binds === 'after' ? bindsBelow : !bindsBelow;
    if (up !== needUp) {
      const moves = control === 'quota' ? (up ? 'raises the equilibrium quantity' : 'lowers the equilibrium quantity') : up ? 'raises the equilibrium price' : 'lowers the equilibrium price';
      return { error: `${stage} ${moves}, so a ${what} that binds only ${binds} the shift cannot be drawn. Check the stage, or use binds "both" or "neither".` };
    }
    return { control, stage, binds, b1, b2, shift, tighten: false, place: binds === 'after' ? 'old' : 'between', up };
  }
  return { control, stage, binds, b1, b2, shift, tighten: false, place, up };
}

export function isPlan(p: ReturnType<typeof stagePlan>): p is StagePlan {
  return Boolean(p && !('error' in p));
}

const curve = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'curve', label, what, place });
const y = (id: string, label: string, what: string, place: string, labour?: string): ScenePartDef => ({ id, kind: 'yTick', label, what, place, ...(labour ? { labour } : {}) });
const x = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'xTick', label, what, place });
const w = (en: string, zh: string): SpecText => ({ en, zh });

/** The part ids the asks read, per state: what a student would answer with. */
export interface StageReadings {
  quantity: [string, string];
  price: [string, string];
  /** At the control in each state: quantity demanded and supplied (absent for a quota). */
  demanded: [string, string] | null;
  supplied: [string, string] | null;
}

/** The parts a plan draws (ids), so the catalogue, the builder and the asks agree. */
export function stageParts(plan: StagePlan): { parts: ScenePartDef[]; readings: StageReadings } {
  const parts: ScenePartDef[] = [];
  const { control, shift } = plan;
  const lines = shift === null;
  const atOld = plan.place === 'old';
  const after = control === 'quota' ? 'with the quota after' : `at the ${control} after`;
  // Curves.
  parts.push(curve('D', shift === 'demand' ? 'D_1' : 'D', shift === 'demand' ? 'demand before' : 'demand', 'downward-sloping'));
  if (shift === 'demand') parts.push(curve('D2', 'D_2', `demand after (${plan.stage === 'demandRise' ? 'D moved right' : 'D moved left'})`, plan.stage === 'demandRise' ? '{D} shifted to the right' : '{D} shifted to the left'));
  parts.push(curve('S', control === 'quota' ? 'S_0' : shift === 'supply' ? 'S_1' : 'S', control === 'quota' ? 'supply without a quota' : shift === 'supply' ? 'supply before' : 'supply', 'upward-sloping'));
  if (shift === 'supply') parts.push(curve('S2', 'S_2', `supply after (${plan.stage === 'supplyRise' ? 'S moved right' : 'S moved left'})`, plan.stage === 'supplyRise' ? '{S} shifted to the right' : '{S} shifted to the left'));
  if (control === 'quota') {
    parts.push(curve('S1', 'S_1', lines ? 'supply with the first quota (S up to Qq1, then vertical)' : 'supply with the quota (S up to Qq1, then vertical)', 'follows {S} up to {Qq1}, then vertical'));
    if (lines) parts.push(curve('S2', 'S_2', 'supply with the second quota (S up to Qq2, then vertical)', 'follows {S} up to {Qq2}, then vertical'));
  }
  const newCurves = shift === 'demand' ? '{D2} and {S}' : '{D} and {S2}';
  // Price ticks and lines.
  if (control !== 'quota') {
    const lab = 'W';
    parts.push(y('Pc1', 'P_1', lines ? `the ${control} before (a dashed line)` : `the ${control} (a dashed line)`, atOld ? 'a horizontal price line through where {D} meets {S}' : `a horizontal price line ${control === 'ceiling' ? (plan.b1 ? 'below' : 'above') : plan.b1 ? 'above' : 'below'} where {D} meets {S}`, `${lab}_1`));
    if (lines) parts.push(y('Pc2', 'P_2', `the ${control} after (a dashed line)`, `a horizontal price line ${control === 'ceiling' ? (plan.b2 ? 'below' : 'above') : plan.b2 ? 'above' : 'below'} where {D} meets {S}`, `${lab}_2`));
    if (!atOld) parts.push(y('P0', 'P_0', shift ? 'equilibrium price before' : 'equilibrium price', 'where {D} meets {S}', 'W_0'));
  } else {
    parts.push(y('P0', 'P_0', shift ? 'equilibrium price before (no quota)' : 'equilibrium price without a quota', 'where {D} meets {S}', 'W_0'));
    if (!atOld) parts.push(y('Pq1', 'P_1', 'price with the quota before (on D at Qq1)', 'on {D} directly above {Qq1}'));
    if (plan.b2) parts.push(y('Pq2', 'P_2', `price ${after} (on ${shift ? 'D2 at Qq1' : 'D at Qq2'})`, shift ? 'on {D2} directly above {Qq1}' : 'on {D} directly above {Qq2}'));
  }
  if (shift) parts.push(y('Pn', 'P_n', 'equilibrium price after the shift (no control)', `where ${newCurves} meet`, 'W_n'));
  // Quantity ticks.
  // A quota set at the old equilibrium quantity is drawn there: its tick is the quota's.
  if (!(control === 'quota' && atOld)) parts.push(x('Q0', 'Q_0', shift ? 'equilibrium quantity before' : 'equilibrium quantity', 'where {D} meets {S}'));
  if (shift) parts.push(x('Qn', 'Q_n', 'equilibrium quantity after the shift (no control)', `where ${newCurves} meet`));
  if (control === 'quota') {
    parts.push(x('Qq1', 'Q_1', lines ? 'the first quota' : 'the quota', atOld ? 'where {D} meets {S} (the quota is there)' : 'where {S1} turns vertical'));
    if (lines) parts.push(x('Qq2', 'Q_2', 'the second quota', 'where {S2} turns vertical'));
  } else {
    if (!atOld) {
      parts.push(x('Qd1', 'Q_d1', `quantity demanded at Pc1${shift ? ' before' : ''}`, 'where {D} meets the {Pc1} line'));
      parts.push(x('Qs1', 'Q_s1', `quantity supplied at Pc1${shift ? ' before' : ''}`, 'where {S} meets the {Pc1} line'));
    }
    if (lines) {
      parts.push(x('Qd2', 'Q_d2', 'quantity demanded at Pc2', 'where {D} meets the {Pc2} line'));
      parts.push(x('Qs2', 'Q_s2', 'quantity supplied at Pc2', 'where {S} meets the {Pc2} line'));
    } else if (shift === 'demand') {
      parts.push(x('Qd2', 'Q_d2', 'quantity demanded at Pc1 after (on D2)', 'where {D2} meets the {Pc1} line'));
    } else {
      parts.push(x('Qs2', 'Q_s2', 'quantity supplied at Pc1 after (on S2)', 'where {S2} meets the {Pc1} line'));
    }
  }

  // What a student reads in each state.
  let readings: StageReadings;
  if (control === 'quota') {
    const q1 = plan.b1 || atOld ? 'Qq1' : 'Q0';
    const q2 = plan.b2 ? (lines ? 'Qq2' : 'Qq1') : shift ? 'Qn' : 'Q0';
    const p1 = plan.b1 ? 'Pq1' : 'P0';
    const p2 = plan.b2 ? 'Pq2' : shift ? 'Pn' : 'P0';
    readings = { quantity: [q1, q2], price: [p1, p2], demanded: null, supplied: null };
  } else {
    const d1 = atOld ? 'Q0' : 'Qd1';
    const s1 = atOld ? 'Q0' : 'Qs1';
    const d2 = lines || shift === 'demand' ? 'Qd2' : d1;
    const s2 = lines || shift === 'supply' ? 'Qs2' : s1;
    const traded = (b: boolean, d: string, s: string, free: string) => (b ? (control === 'ceiling' ? s : d) : free);
    readings = {
      quantity: [traded(plan.b1, d1, s1, 'Q0'), traded(plan.b2, d2, s2, shift ? 'Qn' : 'Q0')],
      price: [plan.b1 || atOld ? 'Pc1' : 'P0', plan.b2 ? (lines ? 'Pc2' : 'Pc1') : shift ? 'Pn' : 'P0'],
      demanded: [d1, d2],
      supplied: [s1, s2],
    };
  }
  return { parts, readings };
}

/** The deadweight-loss regions a plan has, as ids: a partition (kept, added, removed). */
export function stageRegionIds(plan: StagePlan): string[] {
  const { b1, b2, shift, control } = plan;
  if (!b1 && !b2) return [];
  if (b1 !== b2) return [b1 ? 'dwlRemoved' : 'dwlAdded'];
  // Both bind. A curve shift that moves the traded quantity too (a ceiling and a supply shift, a floor and a demand shift): the two losses overlap partly, no partition here.
  if (shift === 'supply' && control !== 'floor') return [];
  if (shift === 'demand' && control === 'floor') return [];
  return ['dwlKept', grows(plan) ? 'dwlAdded' : 'dwlRemoved'];
}

/** Both states binding: the loss is larger after. */
export function grows(plan: StagePlan): boolean {
  if (plan.shift === null) return plan.tighten;
  // The traded quantity stays (on the curve that does not shift); the loss grows when the equilibrium moves away from it (to the right).
  return plan.shift === 'demand' ? plan.stage === 'demandRise' : plan.stage === 'supplyRise';
}

const REGION_TEXT: Record<string, Omit<SceneRegionDef, 'id' | 'words'>> = {
  dwlKept: { what: 'the deadweight loss in both states (the smaller one)', shape: 'the triangle between {D} and {S} (the curves of the state with the smaller loss), from the quantity traded in that state to its equilibrium' },
  dwlAdded: { what: 'the deadweight loss added after (only in the second state)', shape: 'the part of the second state’s triangle between demand and supply, from its quantity traded to its equilibrium, outside the first state’s' },
  dwlRemoved: { what: 'the deadweight loss removed (only in the first state)', shape: 'the part of the first state’s triangle between demand and supply, from its quantity traded to its equilibrium, outside the second state’s' },
};

const GAP_TEXT = { shortage: 'shortage', surplus: 'surplus' } as const;

/** The two-state catalogue entry: generated, so the prompt's rules, the builder and the checks agree. */
export function stageDef(scene: SpecScene, plan: StagePlan): SceneDef {
  const base = sceneDef(scene.type)!;
  const { parts, readings } = stageParts(plan);
  const regionIds = stageRegionIds(plan);
  const regions: SceneRegionDef[] = regionIds.map((id) => ({ id, words: null, ...REGION_TEXT[id] }));
  const has = (id: string) => regionIds.includes(id);
  const measures: SceneDef['measures'] = {};
  const before = ['dwlKept', 'dwlRemoved'].filter(has);
  const afterIds = ['dwlKept', 'dwlAdded'].filter(has);
  const change = ['dwlAdded', 'dwlRemoved'].filter(has);
  if (before.length) measures.dwlBefore = before;
  if (afterIds.length) {
    measures.dwlAfter = afterIds;
    measures.dwl = afterIds;
  }
  if (change.length) measures.dwlChange = change;
  const measureWords: SceneDef['measureWords'] = { dwlBefore: WORDS.dwl, dwlAfter: WORDS.dwl, dwl: WORDS.dwl };
  if (change.length) measureWords.dwlChange = has('dwlAdded') ? w('Increase in deadweight loss', '效率損失增加') : w('Decrease in deadweight loss', '效率損失減少');

  const ticks: Partial<Record<SceneAsk, string[]>> = {
    quantityBefore: [readings.quantity[0]],
    quantityAfter: [readings.quantity[1]],
    priceBefore: [readings.price[0]],
    priceAfter: [readings.price[1]],
  };
  if (readings.demanded && readings.supplied) {
    const gap = plan.control === 'ceiling' ? GAP_TEXT.shortage : GAP_TEXT.surplus;
    const pair = (i: 0 | 1) => (plan.control === 'ceiling' ? [readings.supplied![i], readings.demanded![i]] : [readings.demanded![i], readings.supplied![i]]);
    if (plan.b1) ticks[gap === 'shortage' ? 'shortageBefore' : 'surplusBefore'] = pair(0);
    if (plan.b2) {
      ticks[gap] = pair(1);
      ticks.quantityDemanded = [readings.demanded[1]];
      ticks.quantitySupplied = [readings.supplied[1]];
    }
  }

  // Points a question may letter: the equilibria, where a curve meets a control line, a curve above or below a quantity tick.
  const curveIds = parts.filter((p) => p.kind === 'curve' && !(plan.control === 'quota' && (p.id === 'S1' || (p.id === 'S2' && !plan.shift)))).map((p) => p.id);
  const small = (id: string) => id[0].toLowerCase() + id.slice(1);
  const points: ScenePointDef[] = [{ id: 'e0', on: 'D', at: 'S' }];
  if (plan.shift) points.push({ id: 'en', on: plan.shift === 'demand' ? 'D2' : 'D', at: plan.shift === 'demand' ? 'S' : 'S2' });
  const lineIds = parts.filter((p) => p.id === 'Pc1' || p.id === 'Pc2').map((p) => p.id);
  for (const c of curveIds) for (const l of lineIds) points.push({ id: `${small(c)}At${l}`, on: c, at: l });
  for (const c of curveIds) for (const q of parts.filter((p) => p.kind === 'xTick')) points.push({ id: `${small(c)}At${q.id}`, on: c, at: q.id });

  // Ticks printed by default: the control lines (a quota: its quantities); the others when the question labels them.
  const shown = plan.control === 'quota' ? parts.filter((p) => p.id === 'Qq1' || p.id === 'Qq2').map((p) => p.id) : lineIds;
  // Ticks whose dashed line bounds a lettered region.
  const edges = [...new Set([readings.quantity[0], readings.quantity[1]])].filter((id) => id !== 'Q0' && id !== 'Qn');

  const stageWhat = STAGE_WHAT[plan.stage];
  return {
    type: base.type,
    when: `${base.type} with stage ${plan.stage} (${stageWhat}), binds ${plan.binds}`,
    parts,
    regions,
    measures,
    measureWords,
    ticks,
    shown,
    edges,
    points,
  };
}

const STAGE_WHAT: Record<StagePlan['stage'], string> = {
  lowered: 'the control lowered: two control lines',
  raised: 'the control raised: two control lines',
  demandRise: 'demand rises under the control',
  demandFall: 'demand falls under the control',
  supplyRise: 'supply rises under the control',
  supplyFall: 'supply falls under the control',
};

/** The catalogue entry for a scene: generated for a two-state control, the catalogue's own otherwise. */
export function sceneDefOf(scene: SpecScene): SceneDef | undefined {
  if (scene.type === 'monopoly') return monopolyDef(scene);
  if (scene.type === 'ppfTrade') return tradeDef(scene);
  const plan = stagePlan(scene);
  if (plan && 'error' in plan) return sceneDef(scene.type);
  return plan ? stageDef(scene, plan) : sceneDef(scene.type);
}

/**
 * Parts a plan does not draw because they sit on another part (k-0587, first live run: the model
 * listed every generic part): a ceiling at the old price puts Qd1 and Qs1 on Q0 and P0 on Pc1; the
 * curve a shift leaves keeps its 1 (Qs2 = Qs1 under a demand shift); a quota at the old quantity
 * puts Q0 on Qq1 and Pq1 on P0. A label given to one is the label of the part it sits on.
 */
export function stageAliases(plan: StagePlan): Record<string, string> {
  const out: Record<string, string> = {};
  const atOld = plan.place === 'old';
  if (plan.control === 'quota') {
    if (atOld) Object.assign(out, { Q0: 'Qq1', Pq1: 'P0' });
    if (plan.shift && plan.b2 === false) Object.assign(out, { Pq2: 'Pn' });
    return out;
  }
  if (atOld) Object.assign(out, { Qd1: 'Q0', Qs1: 'Q0', P0: 'Pc1' });
  if (plan.shift === 'demand') out.Qs2 = atOld ? 'Q0' : 'Qs1';
  if (plan.shift === 'supply') out.Qd2 = atOld ? 'Q0' : 'Qd1';
  return out;
}

/** The part a question's "from X to Y" names first must be the before part of its pair. */
export const STAGE_PAIRS: Array<[string, string]> = [
  ['D', 'D2'],
  ['S', 'S2'],
  ['S1', 'S2'],
  ['Pc1', 'Pc2'],
  ['Qq1', 'Qq2'],
  ['Pq1', 'Pq2'],
  ['P0', 'Pn'],
  ['Q0', 'Qn'],
  // k-0589: a monopoly's MC change
  ['MC', 'MC2'],
  ['Pm', 'Pm2'],
  ['Qm', 'Qm2'],
  ['Pc', 'Pc2'],
  ['Qc', 'Qc2'],
];
