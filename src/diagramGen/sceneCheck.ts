import type { Diagram } from '@/model/diagram';
import { tickKey } from './compile';
import { labelsIn } from './labels';
import type { SceneBuilt } from './scene';
import type { SceneDef } from './sceneCatalogue';
import { sceneDefOf } from './stageCatalogue';
import { plainOf } from './text';
import { tradeKey, tradeWords } from './trade';
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

// ---- areas named by their corners: "area efj", "fgmj" (k-0577 round 2) ----

/** Words that may follow "area" and are not corner letters. */
const NOT_CORNERS = new Set(
  'above below under over the that this these those which where from with and are will would can may must its each both lost gain loss shown also then has have had was for not all one two lies lie lying into onto less more equal is was bounded shaded marked formed enclosed between'.split(' '),
);
const AREA_WORD_EN = String.raw`\b(?:[Aa]reas?|[Rr]egions?|[Tt]riangles?|[Rr]ectangles?|[Tt]rapeziums?|[Qq]uadrilaterals?|[Ss]hapes?)`;
const CORNERS_EN = new RegExp(String.raw`${AREA_WORD_EN}\s+((?:[a-z]{3,6}|[A-Z]{3,6})(?:\s*(?:,|and|or|\+|&)\s*(?:[a-z]{3,6}|[A-Z]{3,6}))*)(?![A-Za-z])`, 'g');
const CORNERS_ZH = /(?:面積|區域|三角形|長方形|梯形|四邊形)\s*((?:[a-z]{3,6}|[A-Z]{3,6})(?:\s*(?:、|及|和|與|\+|＋)\s*(?:[a-z]{3,6}|[A-Z]{3,6}))*)(?![A-Za-z])/g;
const POINT_LETTER_EN = /\b[Pp]oints?\s+([a-z](?:\s*(?:,|and|or|&)\s*[a-z])*)(?![A-Za-z])/g;
const POINT_LETTER_ZH = /點\s*([a-z])(?![A-Za-z])|(?<![A-Za-z])([a-z])\s*點/g;

const isCorners = (token: string) => !NOT_CORNERS.has(token.toLowerCase()) && new Set(token).size === token.length;

/** The corner-named areas a text names ("efj", "fgmj"), in order, each once. */
export function cornerAreasIn(text: string): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (isCorners(t) && !out.includes(t)) out.push(t);
  };
  for (const re of [CORNERS_EN, CORNERS_ZH]) for (const m of text.matchAll(re)) for (const t of m[1].match(/[A-Za-z]{3,6}/g) ?? []) add(t);
  return out;
}

/** An option that is only a corner-named area ("fgk", "Area efj", "面積 egn"); null otherwise. */
export function optionCorners(option: string): string | null {
  const bare = option.replace(/[.。]\s*$/, '').replace(/\b(?:the\s+)?(?:areas?|regions?|triangles?)\b|面積|區域/gi, ' ').trim();
  if (/^[a-z]{3,6}$/.test(bare) || /^[A-Z]{3,6}$/.test(bare)) return isCorners(bare) ? bare : null;
  const named = cornerAreasIn(option);
  return named.length === 1 ? named[0] : null;
}

/** Every letter a text uses as a corner or a point. */
export function cornerLettersIn(text: string): string[] {
  const out = new Set<string>();
  for (const area of cornerAreasIn(text)) for (const l of area) out.add(l);
  for (const re of [POINT_LETTER_EN, POINT_LETTER_ZH]) for (const m of text.matchAll(re)) for (const l of (m[1] ?? m[2] ?? '').match(/[a-z]/g) ?? []) out.add(l);
  return [...out];
}

/**
 * The corner-named areas and letters a question really uses (k-0577 round 3, after the review):
 * an area an option names always counts; one named only in the stem or explanation counts when
 * it shares two letters with the options' areas or is named twice. "The area gained by
 * consumers" or "the area left of S" once in an explanation is English, not corners.
 */
export function namedCorners(mcq: { stem: string; statements: readonly string[]; options: readonly string[] }, explanation: string): { areas: string[]; letters: string[] } {
  const fromOptions = [...new Set(mcq.options.flatMap(cornerAreasIn))];
  const optionLetters = new Set(fromOptions.flatMap((a) => [...a]));
  const others = [mcq.stem, ...mcq.statements, explanation];
  const seen = new Map<string, number>();
  for (const t of [...mcq.options, ...others]) for (const a of cornerAreasIn(t)) seen.set(a, (seen.get(a) ?? 0) + (t.split(a).length - 1));
  const extra = [...new Set(others.flatMap(cornerAreasIn))].filter((a) => !fromOptions.includes(a) && ([...a].filter((l) => optionLetters.has(l)).length >= 2 || (seen.get(a) ?? 0) >= 2));
  const areas = [...fromOptions, ...extra];
  const letters = new Set(areas.flatMap((a) => [...a]));
  for (const t of [...mcq.options, ...others]) for (const re of [POINT_LETTER_EN, POINT_LETTER_ZH]) for (const m of t.matchAll(re)) for (const l of (m[1] ?? m[2] ?? '').match(/[a-z]/g) ?? []) letters.add(l);
  return { areas, letters: [...letters] };
}

type Pt = { x: number; y: number };

function hull(points: Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return ps;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...ps].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function inPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Whether the area with corners `corners` is the union of `regions`, sampled on a fine grid:
 * the two may differ by at most 3% of the larger. Corner areas are convex (triangles,
 * quadrilaterals), so the corners' hull is the area whatever order the letters come in.
 */
export function sameArea(corners: Pt[], regions: ReadonlyArray<readonly Pt[]>): boolean {
  const shape = hull(corners);
  if (shape.length < 3 || !regions.length) return false;
  const all = [...shape, ...regions.flat()];
  const [x0, x1] = [Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x))];
  const [y0, y1] = [Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y))];
  const N = 160;
  let a = 0;
  let b = 0;
  let differ = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const p = { x: x0 + ((i + 0.5) / N) * (x1 - x0), y: y0 + ((j + 0.5) / N) * (y1 - y0) };
      const inA = inPolygon(p, shape);
      const inB = regions.some((r) => inPolygon(p, r));
      if (inA) a += 1;
      if (inB) b += 1;
      if (inA !== inB) differ += 1;
    }
  }
  return differ <= 0.03 * Math.max(a, b, 1);
}

/** The figure's lines as polylines: its curves, and each dashed drop from a point to an axis. */
function figureLines(diagram: Diagram): Pt[][] {
  const out: Pt[][] = diagram.curves.map((c) => c.points);
  for (const p of diagram.points) for (const axis of p.dropTo ?? []) out.push([p.at, axis === 'x' ? { x: p.at.x, y: 0 } : { x: 0, y: p.at.y }]);
  return out;
}

function onLine(line: readonly Pt[], p: Pt): boolean {
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) < 0.004) return true;
  }
  return false;
}

/** The catalogue points at the corners of a region union, by id (for a repair message). */
function cornersOf(built: SceneBuilt, regions: readonly string[]): string[] {
  const polys = regions.map((r) => built.regionPolygons.get(r)).filter((p): p is Pt[] => Boolean(p));
  const ids = [...built.pointPlaces.keys()];
  // The smallest set of catalogue points whose hull is the union: try every subset of 3 and 4.
  for (const n of [3, 4]) {
    const pick = (start: number, chosen: string[]): string[] | null => {
      if (chosen.length === n) return sameArea(chosen.map((id) => built.pointPlaces.get(id)!), polys) ? chosen : null;
      for (let i = start; i < ids.length; i += 1) {
        const found = pick(i + 1, [...chosen, ids[i]]);
        if (found) return found;
      }
      return null;
    };
    const found = pick(0, []);
    if (found) return found;
  }
  return [];
}

/**
 * The question's corner letters against the figure's lettered points: every letter the stem,
 * statements, options or explanation use must be on a point; an area the keyed option names by
 * its corners must be what the question asks; no other option may name the same area.
 */
export function checkSceneCorners(spec: DiagramSpec, built: SceneBuilt, mcq: McqWords, explanation: string): { issues: DiagramIssue[]; solved: SolvedKey | null; used: boolean } {
  const issues: DiagramIssue[] = [];
  const scene = spec.scene!;
  const def = sceneDefOf(scene);
  const corners = namedCorners(mcq, explanation);
  const named = corners.letters;
  const keyedCorners = optionCorners(mcq.options[mcq.answer] ?? '');
  const used = named.length > 0;
  if (!def || !used) return { issues, solved: null, used };
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const letterAt = new Map([...built.pointLabels].map(([id, l]) => [l, id]));
  const missing = named.filter((l) => !letterAt.has(l));
  if (missing.length) {
    const areas = corners.areas;
    error(
      'scene.cornerMissing',
      `The question names ${areas.length ? `area${areas.length > 1 ? 's' : ''} ${areas.join(', ')}` : 'points'} by corner letters, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on no point of the figure. Letter every corner the stem, options and explanation use on the scene point where the explanation's geometry puts it (scene.points: [{point, label}]; points: ${def.points.map((p) => p.id).join(', ')}).`,
    );
  }
  // Each named area is a real area of the figure: every edge runs along a drawn line (u-fbsp v2: m and j on the wrong points made "efj" a triangle no line bounds).
  if (!missing.length && built.diagram) {
    const lines = figureLines(built.diagram);
    for (const area of corners.areas) {
      const pts = [...area].map((l) => ({ l, at: built.pointPlaces.get(letterAt.get(l) ?? '') })).filter((p): p is { l: string; at: Pt } => Boolean(p.at));
      if (pts.length !== area.length) continue;
      const shape = hull(pts.map((p) => p.at));
      if (shape.length < pts.length) {
        error('scene.cornerShape', `Area ${area}: its corners do not make a ${area.length === 3 ? 'triangle' : 'shape'} (a letter lies on a side or inside). Put the letters where the explanation's geometry puts them.`);
        continue;
      }
      const name = (at: Pt) => pts.find((p) => p.at === at)!.l;
      const loose = shape.map((a, i) => [a, shape[(i + 1) % shape.length]] as const).filter(([a, b]) => !lines.some((line) => onLine(line, a) && onLine(line, b) && onLine(line, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })));
      if (loose.length) {
        error(
          'scene.cornerEdge',
          `Area ${area} has ${loose.length === 1 ? 'a side' : 'sides'} ${loose.map(([a, b]) => `${name(a)}–${name(b)}`).join(', ')} that ${loose.length === 1 ? 'runs' : 'run'} along no line of the figure, so the letters are on the wrong points. Each corner sits where two lines meet (or on a curve at a dashed line) so that every side of the area runs along a curve or a dashed line, as the explanation describes it.`,
        );
      }
    }
  }
  if (!keyedCorners || scene.ask === 'none' || !def.measures[scene.ask]) return { issues, solved: null, used };
  const regions = def.measures[scene.ask]!;
  const polys = regions.map((r) => built.regionPolygons.get(r)).filter((p): p is Pt[] => Boolean(p));
  const areaOf = (corners: string): Pt[] | null => {
    const pts = [...corners].map((l) => letterAt.get(l)).map((id) => (id ? built.pointPlaces.get(id) : undefined));
    return pts.every(Boolean) ? (pts as Pt[]) : null;
  };
  const want = cornersOf(built, regions);
  const wantLetters = want.map((id) => built.pointLabels.get(id) ?? `(${id}, unlettered)`);
  const keyedShape = areaOf(keyedCorners);
  const keyedRight = keyedShape ? sameArea(keyedShape, polys) : false;
  if (!missing.length && !keyedRight) {
    error(
      'scene.cornerKey',
      `The key is option ${'ABCD'[mcq.answer]} (area ${keyedCorners}), but with these letters area ${keyedCorners} is not ${scene.ask}. ${scene.ask} is ${regions.join(' + ')}, whose corners are the points ${want.join(', ') || '(none found)'}${want.length ? ` (now lettered ${wantLetters.join(', ')})` : ''}. Put the letters on the points so area ${keyedCorners} is exactly those corners; the question's words are fixed.`,
    );
  }
  const options = mcq.options.map(optionCorners);
  const option = keyedRight ? mcq.answer : -1;
  // Two options naming one area are twins only when nothing else tells them apart (HKDSE 2023 P1 Q21: "over-production … area abc" / "under-production … area abc").
  const rest = (o: string) => {
    let out = o.replace(new RegExp(AREA_WORD_EN, 'g'), ' ').replace(/面積|區域/g, ' ');
    for (const a of cornerAreasIn(o)) out = out.replace(new RegExp(String.raw`(?<![A-Za-z])${a}(?![A-Za-z])`, 'g'), ' ');
    return out.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  };
  const twins = options
    .map((c, i) => (c && i !== mcq.answer && rest(mcq.options[i]) === rest(mcq.options[mcq.answer] ?? '') ? i : -1))
    .filter((i) => i >= 0)
    .filter((i) => {
      const shape = areaOf(options[i]!);
      return shape && keyedRight && sameArea(shape, polys);
    });
  if (twins.length) error('scene.twoKeys', `Options ${[mcq.answer, ...twins].map((i) => 'ABCD'[i]).join(' and ')} both name ${scene.ask}.`);
  const solved: SolvedKey = { labels: [keyedCorners], option, why: `${scene.ask} is ${regions.join(' + ')}, the area with corners ${wantLetters.join(', ')}` };
  return { issues, solved, used };
}

/**
 * A figure drawn from curves or a template (no scene) against the corner letters its question
 * uses (k-0577 round 3): every letter must be printed on it. On develop a curves figure for
 * HKDSE 2023 P1 Q21 passed with b missing, since only scenes checked their corners.
 */
export function checkCornerLettersDrawn(diagram: Diagram, mcq: McqWords, explanation: string): DiagramIssue[] {
  const named = namedCorners(mcq, explanation).letters;
  if (!named.length) return [];
  const printed = new Set<string>();
  for (const p of diagram.points) for (const side of ['en', 'zh'] as const) p.label?.[side].forEach((r) => printed.add(r.text.trim()));
  for (const l of diagram.labels) for (const side of ['en', 'zh'] as const) l.text?.[side].forEach((r) => printed.add(r.text.trim()));
  const missing = named.filter((l) => !printed.has(l));
  return missing.length
    ? [
        {
          level: 'error',
          code: 'figure.cornerMissing',
          text: `The question names areas or points by corner letters, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on the figure. Use a scene that has the points (scene.points: a tax raised from t1 to t2 is taxChange, a ceiling made effective by a rise in demand is priceCeiling with stage demandRise, binds after), or name each point where the explanation puts it.`,
        },
      ]
    : [];
}

export interface McqWords {
  stem: string;
  statements: readonly string[];
  options: readonly string[];
  answer: number;
}

/** The answer from the drawing, against the keyed option. */
export function checkSceneKey(spec: DiagramSpec, built: SceneBuilt, mcq: McqWords, cornersUsed = false): { issues: DiagramIssue[]; solved: SolvedKey | null } {
  const issues: DiagramIssue[] = [];
  const scene = spec.scene!;
  const def = sceneDefOf(scene);
  if (!def || scene.ask === 'none') return { issues, solved: null };
  // A question that names its areas by corners and no option by region letters: the corner check answered it.
  if (cornersUsed && isArea(def, scene.ask) && !mcq.options.some((o) => optionLetters(o))) return { issues, solved: null };
  // A trade figure's asks are numbers (k-0589).
  if (scene.type === 'ppfTrade') return built.trade ? tradeKey(scene, built.trade, mcq) : { issues, solved: null };
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

// ---- how the scene reads ----

/**
 * A curve's name is a short symbol at its end (S_1, MSC, D = MPB = MSB): words in brackets
 * ("S_2 (with tax = t_2)") crowd the other names (u-fbsp); the stem says what each curve is.
 */
export function checkSceneLook(spec: DiagramSpec): DiagramIssue[] {
  const scene = spec.scene;
  const def = scene ? sceneDefOf(scene) : undefined;
  if (!scene || !def) return [];
  const long = scene.labels.filter((l) => def.parts.find((p) => p.id === l.part)?.kind === 'curve' && (/[()（）]/.test(l.label) || l.label.replace(/[_{}\s]/g, '').length > 10));
  return long.length
    ? [{ level: 'error', code: 'scene.longName', text: `Curve names are short symbols at the curve's end: ${long.map((l) => `"${l.label}"`).join(', ')} ${long.length === 1 ? 'is' : 'are'} too long. Use the symbol alone (S_1, S_2); the stem says what each curve is.` }]
    : [];
}

// ---- the question's words against the scene ----

const WORDS: Array<{ re: RegExp; ok: (s: SpecScene) => boolean; says: string }> = [
  {
    re: /\b(?:unit|per[- ]unit|specific|sales|commodity) tax\b|\btax(?:es)? (?:of|on) (?!imports?)|從量稅|徵收.{0,8}(?<!關)稅/i,
    // k-0589: a per-unit tax on a monopoly raises its MC; a lump-sum tax ("a tax of $1m on the firm") moves nothing.
    ok: (s) => s.type === 'unitTax' || s.type === 'taxChange' || s.type === 'tariff' || s.type === 'externality' || (s.type === 'monopoly' && (s.stage === 'mcRise' || s.stage === 'mcRiseToPrice' || s.stage === 'lumpSumTax')),
    says: 'a per-unit tax (scene unitTax)',
  },
  { re: /\bsubsid(?:y|ies|ise|ize)\b|津貼|補貼|資助/i, ok: (s) => s.type === 'unitSubsidy' || s.type === 'subsidyChange' || s.type === 'externality', says: 'a subsidy (scene unitSubsidy, or subsidyChange when it is raised from s1 to s2)' },
  { re: /price ceiling|maximum price|rent control|最高價格|價格上限|租金管制/i, ok: (s) => s.type === 'priceCeiling' || s.type === 'ceilingDemandRise', says: 'a price ceiling (scene priceCeiling; stage for a second state)' },
  { re: /price floor|minimum price|minimum wage|最低價格|價格下限|最低工資/i, ok: (s) => s.type === 'priceFloor', says: 'a price floor or minimum wage (scene priceFloor; stage for a second state)' },
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
  issues.push(...monopolyWords(scene, clean(stem)), ...tradeWords(scene, stem));
  if (scene.type !== 'ppfTrade' && /production\s+possibilit|consumption\s+possibilit|\bPPF\b|\bPPC\b|\bCPF\b|生產可能|消費可能/i.test(stem))
    issues.push({ level: 'look', code: 'scene.policy', text: `The question is about production possibilities, but the figure is scene ${scene.type}. PPF / CPF trade is scene ppfTrade; a single PPC is kind "curves".` });
  for (const what of ['demand', 'supply'] as const) {
    // A monopoly's `supply` is its MC's slope, which the question rarely calls elastic.
    if ((scene.type === 'monopoly' && what === 'supply') || scene.type === 'ppfTrade') continue;
    const slope = scene[what];
    if (INELASTIC(what).test(text) && slope !== 'steep') issues.push({ level: 'error', code: 'scene.elasticity', text: `The question says ${what} is inelastic: set ${what} "steep".` });
    else if (ELASTIC(what).test(text) && !INELASTIC(what).test(text) && slope !== 'flat') issues.push({ level: 'error', code: 'scene.elasticity', text: `The question says ${what} is elastic: set ${what} "flat".` });
  }
  return issues;
}

const MONOPOLY = /\bmonopol|\bsole\s+(?:supplier|seller|producer|provider)|壟斷|獨家(?:供應|經營)/i;
const LUMP_SUM = /lump[- ]sum\s+tax|定額稅|一筆過(?:的)?稅/i;
const COST_THING = String.raw`(?:marginal\s+cost|\bMC\b|costs?|price\s+of\s+(?:fuel|oil|inputs?|raw\s+materials?|components?|electricity)|fuel\s+prices?|oil\s+prices?|wages?|成本|油價|燃料價格|工資|零件價格)`;
const COST_UP = new RegExp(String.raw`${COST_THING}[^.。;；]{0,40}?(?:\brises?\b|\bincreases?\b|\bgo(?:es)?\s+up\b|\bhigher\b|上升|上漲|增加|提高)|(?:\brise|\bincrease)\s+in\s+(?:the\s+)?${COST_THING}`, 'i');
const COST_DOWN = new RegExp(String.raw`${COST_THING}[^.。;；]{0,40}?(?:\bfalls?\b|\bdrops?\b|\bdecreases?\b|\blower\b|\bcheaper\b|下降|下跌|減少|降低)|(?:\bfall|\bdrop|\bdecrease)\s+in\s+(?:the\s+)?${COST_THING}|\bcheaper\b|更便宜`, 'i');

/**
 * A monopoly against its question (k-0589): a monopoly stem drawn with a market scene is looked
 * at; a lump-sum tax is stage lumpSumTax; a cost that rises is not drawn falling, and back.
 */
function monopolyWords(scene: SpecScene, stem: string): DiagramIssue[] {
  const out: DiagramIssue[] = [];
  if (scene.type !== 'monopoly') {
    if (MONOPOLY.test(stem)) out.push({ level: 'look', code: 'scene.policy', text: `The question is about a monopoly, but the figure is scene ${scene.type} (a market with a supply curve). A monopoly firm's D, MR and MC is scene monopoly.` });
    return out;
  }
  const stage = scene.stage ?? 'none';
  if (LUMP_SUM.test(stem) && stage !== 'lumpSumTax' && stage !== 'none') out.push({ level: 'error', code: 'scene.stage', text: `The question has a lump-sum tax: it changes no marginal cost, so the figure is stage "lumpSumTax" (Q and P unchanged), not "${stage}".` });
  const up = COST_UP.test(stem);
  const down = COST_DOWN.test(stem);
  if ((stage === 'mcFall' || stage === 'mcFallKept') && up && !down) out.push({ level: 'error', code: 'scene.stage', text: `The question says a cost rises, but the figure has stage "${stage}" (MC falls): use "mcRise" (or "mcRiseToPrice").` });
  if ((stage === 'mcRise' || stage === 'mcRiseToPrice') && down && !up) out.push({ level: 'error', code: 'scene.stage', text: `The question says a cost falls, but the figure has stage "${stage}" (MC rises): use "mcFall" (or "mcFallKept" when the firm keeps its price and output).` });
  return out;
}

// ---- the figure in words, for the blind solve ----

const sym = (raw: string) => raw.replace(/_\{?([^}\s]*)\}?/g, '$1').trim();

/** What a student reads off a scene: the lines, the ticks in order and where each sits, each lettered region's outline. Never the asked area's name. */
export function sceneWords(spec: DiagramSpec, built: SceneBuilt, diagram: Diagram): string {
  const scene = spec.scene!;
  const def = sceneDefOf(scene);
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
  // A trade figure's lettered points and brackets (k-0589).
  for (const p of def.parts.filter((q) => q.kind === 'point' && built.partLabels.get(q.id))) lines.push(`Point ${label(p.id)}: ${fill(p.place)}.`);
  for (const p of def.parts.filter((q) => q.kind === 'bracket')) lines.push(`A bracket ${fill(p.place)}.`);
  // Lettered corners (k-0577 round 2): where each sits, in the parts' printed names; the solver works out the areas.
  for (const [id, letter] of built.pointLabels) {
    const p = def.points.find((q) => q.id === id);
    if (!p) continue;
    const name = (part: string) => label(part === 'other' ? (scene.externality.endsWith('Production') ? 'D' : 'S') : part === 'private' ? (scene.externality.endsWith('Production') ? 'S' : 'D') : part);
    const at = def.parts.find((q) => q.id === p.at);
    const where =
      !at || at.kind === 'curve'
        ? `where ${name(p.on)} meets ${name(p.at)}`
        : `on ${name(p.on)}, at the ${at.kind === 'xTick' ? 'quantity' : 'price'} of the point ${fill(at.place)} (on the same dashed line)`;
    lines.push(`Point ${letter}: ${where}.`);
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
