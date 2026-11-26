import type { Diagram } from '@/model/diagram';
import { tickKey } from './compile';
import { labelsIn } from './labels';
import type { SceneBuilt } from './scene';
import { sceneDef, type SceneDef } from './sceneCatalogue';
import { plainOf } from './text';
import type { DiagramIssue, DiagramSpec, SceneAsk, SolvedKey, SpecScene } from './types';

/**
 * A scene against its question (k-0577): the answer worked out from the drawing (the letters on
 * the regions an area is made of, or the ticks a quantity reads), the question's own words
 * against the scene (a tax is a tax scene, inelastic demand is drawn steep), and the figure in
 * words for the blind solve. Issue texts are English for the repair turn.
 */

const isArea = (def: SceneDef, ask: SceneAsk) => Boolean(def.measures[ask]);
const isTick = (def: SceneDef, ask: SceneAsk) => Boolean(def.ticks[ask]);

/** "B + C", "Area a", "areas E and F", "面積 B + E" → the letters; null when the option is not only area letters. */
export function optionLetters(option: string): string[] | null {
  const bare = option
    .replace(/\b(?:the\s+)?(?:areas?|regions?)\b/gi, ' ')
    .replace(/面積|區域/g, ' ')
    .replace(/\s+and\s+/gi, ' + ')
    .replace(/[＋、及和與]/g, '+')
    .trim();
  if (!/^[A-Ha-h](?:\s*\+\s*[A-Ha-h])*$/.test(bare)) return null;
  return bare.split('+').map((l) => l.trim());
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export interface McqWords {
  stem: string;
  statements: readonly string[];
  options: readonly string[];
  answer: number;
}

/** The answer from the drawing, against the keyed option. */
export function checkSceneKey(spec: DiagramSpec, built: SceneBuilt, mcq: McqWords): { issues: DiagramIssue[]; solved: SolvedKey | null } {
  const issues: DiagramIssue[] = [];
  const scene = spec.scene!;
  const def = sceneDef(scene.type);
  if (!def || scene.ask === 'none') return { issues, solved: null };
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const keyed = mcq.options[mcq.answer] ?? '';

  if (isArea(def, scene.ask)) {
    const regions = def.measures[scene.ask]!;
    const bare = regions.filter((r) => !built.regionLabels.has(r));
    if (bare.length) {
      error('scene.unlettered', `The question asks for ${scene.ask}, which is made of the regions ${regions.join(' + ')}; ${bare.join(', ')} ${bare.length === 1 ? 'has' : 'have'} no letter. Letter every region the options name.`);
      return { issues, solved: null };
    }
    const letters = [...new Set(regions.map((r) => built.regionLabels.get(r)!))];
    // A letter that also covers a region outside the asked area cannot name it.
    for (const letter of letters) {
      const outside = [...built.regionLabels].filter(([r, l]) => l === letter && !regions.includes(r)).map(([r]) => r);
      if (outside.length) error('scene.mixed', `Area ${letter} also covers ${outside.join(', ')}, which is not part of ${scene.ask}: letter the regions one by one.`);
    }
    const sets = mcq.options.map(optionLetters);
    const option = sets.findIndex((set) => set !== null && sameSet(set, letters));
    const solved: SolvedKey = { labels: letters, option, why: `${scene.ask} is ${regions.join(' + ')}, lettered ${letters.join(' + ')}` };
    const keyedSet = optionLetters(keyed);
    if (keyedSet && !sameSet(keyedSet, letters)) {
      error('scene.key', `With these letters, ${scene.ask} (${regions.join(' + ')}) is ${letters.join(' + ')}, but the key is option ${'ABCD'[mcq.answer]} (${keyed}). Re-letter the regions so the keyed option is ${scene.ask}; the question's words are fixed.`);
    }
    const twins = sets.map((set, i) => (set && i !== option && sameSet(set, letters) ? i : -1)).filter((i) => i >= 0);
    if (option >= 0 && twins.length) error('scene.twoKeys', `Options ${[option, ...twins].map((i) => 'ABCD'[i]).join(' and ')} both read ${letters.join(' + ')}.`);
    return { issues, solved };
  }

  if (isTick(def, scene.ask)) {
    const parts = def.ticks[scene.ask]!;
    const labels = parts.map((p) => built.partLabels.get(p) ?? '');
    const blank = parts.filter((_, i) => !labels[i]);
    if (blank.length) {
      error('scene.tickUnlabelled', `The question asks for ${scene.ask}, read at ${parts.join(' and ')}; ${blank.join(', ')} ${blank.length === 1 ? 'has' : 'have'} no label. Give it the label the options use.`);
      return { issues, solved: null };
    }
    const keys = labels.map(tickKey);
    const option = mcq.options.findIndex((o) => sameSet(labelsIn(o).length ? labelsIn(o) : [tickKey(o)], keys));
    const solved: SolvedKey = { labels, option, why: `${scene.ask} is read at ${parts.join(' and ')}, labelled ${labels.join(' and ')}` };
    // A label the symbol reader does not know ("Q*") is the option itself.
    const keyedKeys = labelsIn(keyed).length ? labelsIn(keyed) : keys.length === 1 && /^\S{1,6}$/.test(keyed.trim()) ? [tickKey(keyed)] : [];
    if (keyedKeys.length && !sameSet(keyedKeys, keys)) {
      error('scene.key', `On this figure ${scene.ask} is ${labels.join(' to ')}, but the key is option ${'ABCD'[mcq.answer]} (${keyed}). Give the parts the labels that make the keyed option right; the question's words are fixed.`);
    }
    return { issues, solved };
  }

  error('scene.ask', `Scene ${def.type} cannot answer "${scene.ask}". It answers ${[...Object.keys(def.measures), ...Object.keys(def.ticks)].join(', ')}.`);
  return { issues, solved: null };
}

// ---- the question's words against the scene ----

const WORDS: Array<{ re: RegExp; ok: (s: SpecScene) => boolean; says: string }> = [
  {
    re: /\b(?:unit|per[- ]unit|specific|sales|commodity) tax\b|\btax(?:es)? (?:of|on) (?!imports?)|從量稅|徵收.{0,8}(?<!關)稅/i,
    ok: (s) => s.type === 'unitTax' || s.type === 'tariff' || s.type === 'externality',
    says: 'a per-unit tax (scene unitTax)',
  },
  { re: /\bsubsid(?:y|ies|ise|ize)\b|津貼|補貼|資助/i, ok: (s) => s.type === 'unitSubsidy' || s.type === 'externality', says: 'a subsidy (scene unitSubsidy)' },
  { re: /price ceiling|maximum price|rent control|最高價格|價格上限|租金管制/i, ok: (s) => s.type === 'priceCeiling', says: 'a price ceiling (scene priceCeiling)' },
  { re: /price floor|minimum price|minimum wage|最低價格|價格下限|最低工資/i, ok: (s) => s.type === 'priceFloor', says: 'a price floor or minimum wage (scene priceFloor)' },
  { re: /\btariff|關稅/i, ok: (s) => s.type === 'tariff', says: 'a tariff (scene tariff)' },
  { re: /(?<!import )\bquota\b|(?<!進口)配額/i, ok: (s) => s.type === 'quota' || s.type === 'tariff', says: 'a quota (scene quota)' },
  { re: /external costs?|negative externalit|界外成本|負面界外效應/i, ok: (s) => s.type === 'externality' && s.externality.startsWith('negative'), says: 'an external cost (scene externality, a negative one)' },
  { re: /external benefits?|positive externalit|界外利益|界外效益|正面界外效應/i, ok: (s) => s.type === 'externality' && s.externality.startsWith('positive'), says: 'an external benefit (scene externality, a positive one)' },
];

const INELASTIC = (what: string) => new RegExp(`${what}[^.。;；]{0,40}?(?:price[- ])?inelastic|inelastic ${what}|${what === 'demand' ? '需求' : '供應'}[^。；]{0,10}缺乏彈性`, 'i');
const ELASTIC = (what: string) => new RegExp(`${what}[^.。;；]{0,40}?(?<![a-z])(?:price[- ])?elastic\\b|(?<![a-z])elastic ${what}|${what === 'demand' ? '需求' : '供應'}[^。；]{0,10}富(?:於)?彈性`, 'i');

/**
 * The question says what the scene must be: `stem` (the stem and statements, never the options,
 * which may name other policies as distractors) the policy and the externality's sign; `stem`
 * and `key` together the elasticities.
 */
export function checkSceneWords(spec: DiagramSpec, stem: string, key: string): DiagramIssue[] {
  const scene = spec.scene;
  if (!scene || scene.type === 'none') return [];
  const issues: DiagramIssue[] = [];
  // "perfectly inelastic" is upright: no scene draws it, so its words prove nothing about the slope.
  const clean = (t: string) => t.replace(/perfectly (?:price[- ])?(?:in)?elastic/gi, '');
  const text = clean(`${stem}\n${key}`);
  for (const w of WORDS) {
    if (w.re.test(clean(stem)) && !w.ok(scene)) issues.push({ level: 'error', code: 'scene.policy', text: `The question has ${w.says}, but the figure is scene ${scene.type}${scene.type === 'externality' ? ` (${scene.externality})` : ''}.` });
  }
  for (const what of ['demand', 'supply'] as const) {
    const slope = scene[what];
    if (INELASTIC(what).test(text) && slope !== 'steep') issues.push({ level: 'error', code: 'scene.elasticity', text: `The question says ${what} is inelastic: set ${what} "steep".` });
    else if (ELASTIC(what).test(text) && !INELASTIC(what).test(text) && slope !== 'flat') issues.push({ level: 'error', code: 'scene.elasticity', text: `The question says ${what} is elastic: set ${what} "flat".` });
  }
  return issues;
}

// ---- the figure in words, for the blind solve ----

const sym = (raw: string) => raw.replace(/_\{?([^}\s]*)\}?/g, '$1').trim();

/** What a student reads off a scene: the lines, the ticks in order and where each sits, each lettered region's outline. Never the asked area's name. */
export function sceneWords(spec: DiagramSpec, built: SceneBuilt, diagram: Diagram): string {
  const scene = spec.scene!;
  const def = sceneDef(scene.type);
  if (!def) return '';
  const label = (part: string) => sym(built.partLabels.get(part) ?? '') || `the unlabelled ${def.parts.find((p) => p.id === part)?.kind === 'xTick' ? 'quantity' : 'price'}`;
  const fill = (text: string) => text.replace(/\{([A-Za-z0-9]+)\}/g, (_, id: string) => label(id));
  const lines: string[] = [];
  const x = plainOf(diagram.x.title).replace(/\n/g, ' ') || 'Quantity';
  const y = plainOf(diagram.y.title).replace(/\n/g, ' ') || 'Price';
  lines.push(`Axes: ${y} (up), ${x} (across).`);
  const curves = def.parts.filter((p) => p.kind === 'curve').map((p) => `${label(p.id)}: ${fill(p.place)}`);
  lines.push(`Lines: ${curves.join('; ')}.`);
  for (const axis of ['yTick', 'xTick'] as const) {
    const ticks = def.parts
      .filter((p) => p.kind === axis && built.partLabels.get(p.id))
      .map((p) => {
        const at = tickAt(diagram, built.partLabels.get(p.id)!, axis === 'xTick' ? 'x' : 'y');
        return { p, at };
      })
      .filter((t) => t.at !== null)
      .sort((a, b) => a.at! - b.at!);
    if (ticks.length) lines.push(`${axis === 'xTick' ? `${x} ticks from the origin outward` : `${y} ticks from the bottom up`}: ${ticks.map((t) => `${label(t.p.id)} (${fill(t.p.place)})`).join(', ')}.`);
  }
  const byLabel = new Map<string, string[]>();
  for (const [region, l] of built.regionLabels) byLabel.set(l, [...(byLabel.get(l) ?? []), region]);
  for (const [l, regions] of byLabel) {
    const shapes = regions.map((r) => fill(def.regions.find((k) => k.id === r)?.shape ?? r));
    lines.push(`Area ${l}: ${shapes.join(', together with ')}.`);
  }
  return lines.join('\n');
}

function tickAt(diagram: Diagram, label: string, axis: 'x' | 'y'): number | null {
  const key = tickKey(label);
  for (const p of diagram.points) {
    const t = axis === 'x' ? p.xTickLabel : p.yTickLabel;
    if (t && tickKey(plainOf(t)) === key) return axis === 'x' ? p.at.x : p.at.y;
  }
  for (const c of diagram.curves) {
    if (axis === 'y' && c.derive?.kind === 'level' && tickKey(plainOf(c.label)) === key) return c.points[0]?.y ?? null;
  }
  return null;
}
