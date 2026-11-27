/**
 * AI-made diagrams (k-0515): a generated question that needs a figure gets one, as an
 * editable editor diagram (`model/diagram.ts`), never a picture. The model writes a small
 * semantic spec (`DiagramSpec`): curves by role and slope, shifts by direction, equilibria,
 * price lines, gaps, Shade presets, a data chart, or one of the editor's own templates.
 * `compile.ts` turns it into anchored geometry with the template kit, so a teacher can drag,
 * re-label and re-shade it like any diagram they drew. Types only.
 */
import type { AiClient, AiErrorInfo, CompletionRequest, CompletionResult, ProviderPreset } from '@/ai/types';
import type { Diagram } from '@/model/diagram';
import type { DiagramBlock } from '@/model/types';
import type { Side } from '@/model/textSlots';

/** A word or phrase in both languages, plain text. '' = absent. */
export interface SpecText {
  en: string;
  zh: string;
}

/**
 * What a curve stands for. Decides its starting shape and how a shift reads against the
 * answer key (right = increase for every role; up = increase for demand-like roles,
 * decrease for supply-like ones).
 */
export const CURVE_ROLES = ['demand', 'supply', 'ad', 'sras', 'lras', 'vertical', 'horizontal', 'frontier', 'graph'] as const;
export type CurveRole = (typeof CURVE_ROLES)[number];

/**
 * A plain graph's line (role 'graph', k-0545): "tax payment against income", "average cost
 * against output". origin: straight from the origin; linear: straight from a point on the
 * y-axis; convex: bending upward (rising ever faster, or falling ever slower); concave:
 * bending downward; flat: horizontal. 'none' on every other role.
 */
/**
 * A plain graph's line (k-0545). The broken lines (k-0554) are the tax graphs old HKCEE papers
 * draw: zero up to an allowance then rising; rising then level at a cap (a standard rate); both.
 */
export const GRAPH_SHAPES = ['none', 'origin', 'linear', 'convex', 'concave', 'flat', 'zeroThenRising', 'risingThenFlat', 'linearThenFlat', 'zeroRisingFlat'] as const;
export type GraphShape = (typeof GRAPH_SHAPES)[number];
export const GRAPH_RISES = ['rising', 'falling'] as const;
export type GraphRise = (typeof GRAPH_RISES)[number];

/** normal: the usual slope; steep: inelastic; flat: elastic. Ignored by vertical, horizontal. */
export const SLOPES = ['normal', 'steep', 'flat'] as const;
export type Slope = (typeof SLOPES)[number];

/** Where a vertical / horizontal line or a frontier sits: low/left, mid, high/right (or small, normal, large). */
export const PLACES = ['low', 'mid', 'high'] as const;
export type Place = (typeof PLACES)[number];

export interface SpecCurve {
  /** Spec-local id other entries refer to: "D", "S", "AD". */
  id: string;
  role: CurveRole;
  slope: Slope;
  place: Place;
  /** The printed name, a symbol: "D", "S_0", "SRAS_1", "PPC". `_x` / `_{xy}` subscripts. '' allowed on a graph line. */
  label: string;
  /** Role 'graph' only (k-0545): the line's shape and which way it goes; absent in a spec saved before = 'none' / 'rising'. */
  shape?: GraphShape;
  rise?: GraphRise;
}

/**
 * out / in: a frontier's both intercepts (for a line: right / left). right / left on a
 * frontier move only its x-intercept, up / down only its y-intercept.
 */
export const DIRECTIONS = ['right', 'left', 'up', 'down', 'out', 'in'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const SIZES = ['small', 'normal', 'large'] as const;
export type ShiftSize = (typeof SIZES)[number];

/** A shifted copy of a curve (D₁ from D₀), drawn with its shift arrow. */
export interface SpecShift {
  /** The curve (or an earlier shift) it is a copy of. */
  of: string;
  id: string;
  direction: Direction;
  size: ShiftSize;
  label: string;
}

/**
 * A fixed level: a horizontal price line (a ceiling, a floor or minimum wage, a world price,
 * a fixed price) or, for a quota, a vertical quantity line.
 */
export const LEVEL_KINDS = ['ceiling', 'floor', 'world', 'fixed', 'quota'] as const;
export type LevelKind = (typeof LEVEL_KINDS)[number];

/**
 * line: drawn across the plot, its name at the axis end (a price ceiling drawn as a line).
 * guide: dashed from the axis to the last point marked on it, its name a tick: the HKDSE
 * MC look ("P₁ - - - -" to the crossings it reads).
 */
export const LEVEL_STYLES = ['line', 'guide'] as const;
export type LevelStyle = (typeof LEVEL_STYLES)[number];

export interface SpecLevel {
  id: string;
  kind: LevelKind;
  /**
   * Where it sits, against crossings of two drawn curves (k-0534): higher than (a quota:
   * to the right of) the crossing of `above`'s two ids, lower than (left of) `below`'s.
   * [] = no bound. Both empty: `side` against the first market equilibrium.
   */
  above: string[];
  below: string[];
  /** The fallback when `above` and `below` are both empty; 'at' (prototype): through the crossing named in `above`. */
  side: 'below' | 'above' | 'at';
  style: LevelStyle;
  label: string;
}

/**
 * A marked point where two lines meet (k-0534: any two drawn lines, a price line or quota
 * included), with dashed drops and ticks. `b` may also name an earlier point's x tick
 * ("Q_1": the point on `a` above that quantity, a producer price under a tax) or y tick
 * ("P_1": the point on `a` at that price).
 */
export interface SpecPoint {
  a: string;
  b: string;
  /** The point's own name ("E_0"); '' = none (most DSE diagrams name only the ticks). */
  name: string;
  /** The y-axis tick ("P_0"); '' = no drop to the y-axis. */
  yTick: string;
  /** The x-axis tick ("Q_0"); '' = no drop to the x-axis. */
  xTick: string;
  /** A filled dot. HKDSE MC figures have none; a named point usually does. */
  dot: boolean;
}
/** The pre-k-0534 name: every point was an equilibrium. */
export type SpecEquilibrium = SpecPoint;

/**
 * What the question asks, so the key can be worked out again from the drawing (k-0534):
 * the answer point is computed from the curves, shifts and controls, and its label must be
 * the keyed option. 'none' = nothing this solver reads (a PPC point, a reason, a shade).
 */
export const ASKS = [
  'none',
  'quantityTransacted',
  'quantityDemanded',
  'quantitySupplied',
  'shortage',
  'surplus',
  'marketPrice',
  'buyersPay',
  'sellersGet',
] as const;
export type AskWhat = (typeof ASKS)[number];

export interface SpecAsks {
  what: AskWhat;
  /** before: the curves as first drawn; after: each curve's last shift in their place. */
  state: 'before' | 'after';
}

/** The quantity gap at a price line between the demand and supply curves: a shortage or surplus. */
export interface SpecGap {
  level: string;
  label: SpecText;
}

/** Revenue areas between the first two equilibria, besides every Shade-menu preset id. */
export const REVENUE_SHADES = ['revenueGain', 'revenueLoss'] as const;

export interface SpecShade {
  /** A Shade-menu preset (`model/diagramPresets.ts:ShadePresetId`) or a revenue change. */
  preset: string;
  /** '' = the preset's own label. */
  label: SpecText;
}

/** A small marked point placed against a curve: a PPC's A (inside), B (on), C (outside). */
export interface SpecMark {
  of: string;
  where: 'inside' | 'on' | 'outside';
  label: string;
}

export interface SpecSeries {
  label: SpecText;
  values: number[];
}

/** A bar or line chart of figures: the "table as a graph" stimulus. */
export interface SpecChart {
  type: 'bar' | 'line';
  categories: SpecText[];
  series: SpecSeries[];
  yTitle: SpecText;
  xTitle: SpecText;
}

export const SPEC_KINDS = ['none', 'curves', 'chart', 'template', 'scene'] as const;

/**
 * A typed market scene (k-0577): the topic-E diagrams (surplus areas, tax and subsidy
 * incidence, price controls, quotas, externalities, a cost rise, a tariff) are built by code
 * from the scene's type and a few choices, never composed from raw parts. The model names the
 * type, the slopes, which label the question uses for each part, which regions carry which
 * letter, and what the question asks; `diagramGen/scene.ts` draws it with the template kit and
 * works the answer out from the drawing. The catalogue (parts, regions, measures) is
 * `diagramGen/sceneCatalogue.ts`.
 */
export const SCENE_TYPES = ['none', 'surplus', 'unitTax', 'taxChange', 'unitSubsidy', 'priceCeiling', 'ceilingDemandRise', 'priceFloor', 'quota', 'externality', 'costRise', 'tariff'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

/** goods: Price / Quantity; labour: Wage rate / Quantity of labour, ticks W instead of P. */
export const SCENE_MARKETS = ['goods', 'labour'] as const;
export type SceneMarket = (typeof SCENE_MARKETS)[number];

export const EXTERNALITIES = ['none', 'negativeProduction', 'positiveProduction', 'negativeConsumption', 'positiveConsumption'] as const;
export type Externality = (typeof EXTERNALITIES)[number];

/**
 * What a scene's question asks, for the key check: an area (the regions it is made of, as
 * letters) or a tick (one label, or two for a gap). One list for every scene; the catalogue
 * says which a scene has.
 */
export const SCENE_ASKS = [
  'none',
  // areas
  'cs',
  'ps',
  'tss',
  'cost',
  'revenue',
  'taxRevenue',
  'dwl',
  'buyersBurden',
  'sellersBurden',
  'csBefore',
  'csAfter',
  'csLoss',
  'psBefore',
  'psAfter',
  'psLoss',
  'consumerBenefit',
  'producerBenefit',
  'subsidyCost',
  'transfer',
  'tssBefore',
  'tssAfter',
  'tssLoss',
  'externalCost',
  'psGain',
  'dwlChange',
  // ticks
  'priceBefore',
  'priceAfter',
  'buyersPay',
  'sellersGet',
  'quantityBefore',
  'quantityAfter',
  'quantityDemanded',
  'quantitySupplied',
  'shortage',
  'surplus',
  'marketQuantity',
  'efficientQuantity',
  'misallocation',
  'importsBefore',
  'importsAfter',
  'domesticOutput',
] as const;
export type SceneAsk = (typeof SCENE_ASKS)[number];

/** The label a part is printed with: a curve's name or a tick ("P_1"). '' = no tick printed. */
export interface SceneLabel {
  part: string;
  label: string;
}

/**
 * A lettered point (k-0577 round 2): a catalogue point (where two parts meet, or a curve at a
 * tick's quantity) carrying a letter. HKDSE names areas by their corners ("area efj", "fgmj"):
 * those questions letter points, not regions.
 */
export interface ScenePoint {
  point: string;
  label: string;
}

/** A lettered (or worded) region: a catalogue region, or a whole measure drawn as one area. */
export interface SceneArea {
  region: string;
  /** "A" / "a" (the same in both languages), or words; '' = the catalogue's words for it. */
  label: SpecText;
}

export interface SpecScene {
  type: SceneType;
  market: SceneMarket;
  /** Type 'externality' only: which one. */
  externality: Externality;
  /** Elasticity as slope: steep = inelastic, flat = elastic. */
  demand: Slope;
  supply: Slope;
  /** The size of the tax, subsidy, cost rise, external effect, or the price control's distance from equilibrium. */
  size: ShiftSize;
  labels: SceneLabel[];
  areas: SceneArea[];
  /** Lettered corners, for a question that names areas by them; [] = none. */
  points: ScenePoint[];
  ask: SceneAsk;
  /** Draw the shortage / surplus bracket at a price control (a model answer; never when the question asks for it). */
  gap: boolean;
}
export type SpecKind = (typeof SPEC_KINDS)[number];

/**
 * The model's reply. Every field is always present (strict structured output allows no
 * optional fields); an unused one is '' or []. Only the fields of `kind` are read.
 */
export interface DiagramSpec {
  kind: SpecKind;
  /** One line: which diagram and why, or why none is needed. Shown to the teacher. */
  reason: string;
  /**
   * question: printed with the question (the students read it: a stimulus, an MCQ's figure).
   * answer: the model answer's diagram ("with the aid of a diagram…"), for the marking scheme.
   */
  placement: 'question' | 'answer';
  /** kind 'template': an editor template id (`model/diagramTemplates.ts`). */
  template: string;
  title: SpecText;
  xAxis: SpecText;
  yAxis: SpecText;
  curves: SpecCurve[];
  shifts: SpecShift[];
  levels: SpecLevel[];
  /** Marked points (was `equilibria`; a reply using that name still reads). */
  points: SpecPoint[];
  gaps: SpecGap[];
  shades: SpecShade[];
  marks: SpecMark[];
  /** Arrows along the axes from the first equilibrium's P and Q to the second's. */
  changeArrows: boolean;
  /** What a question asks, for the key check against the drawing. */
  asks: SpecAsks;
  chart: SpecChart;
  /** kind 'scene' (k-0577); absent in a spec saved before = type 'none'. */
  scene?: SpecScene;
}

/**
 * One thing a check found. `error` fails the diagram (one repair is asked for);
 * `look` keeps it and asks the teacher to check. Codes are stable; `text` is English
 * for the model's repair turn and the log, never shown as interface text.
 */
export interface DiagramIssue {
  level: 'error' | 'look';
  code: string;
  text: string;
  /** The figures it is about, by place (k-0554 `set.same`: the two drawn alike). */
  at?: readonly string[];
}

/** A reference question's figure, to make a similar but new one. */
export interface DiagramReference {
  /** An editor diagram (a bank or paper question's own figure): described to the model in words. */
  diagram?: Diagram;
  /** A picture of the figure (or the whole question), `data:image/…;base64,…`. */
  image?: ReferenceImage;
  /** Words about the figure when that is all there is (a scan's caption, an OCR line). */
  text?: string;
}

export interface ReferenceImage {
  dataUrl: string;
}

export interface DiagramGenInput {
  /** The question as printed, any language: stem, statements, options, parts. */
  question: string;
  /** The answer key: the correct option and why, or the marking scheme. */
  key: string;
  /** The sides the paper prints; the diagram's words are checked on these. */
  sides: readonly Side[];
  reference?: DiagramReference;
  /**
   * The writer's note to the diagram maker (k-0534): what to draw, which labels the options
   * use, which is the key. Never printed.
   */
  figure?: string;
  /**
   * An MCQ's options and key, one language (labels are the same in both): the key is worked
   * out again from the drawing and must be this option (k-0534). Also every text the
   * question prints, for the label check.
   */
  mcq?: { stem: string; statements: string[]; options: string[]; answer: number };
  /**
   * Edit this diagram instead of drawing a new one (a follow-up, k-0534): the model gets the
   * spec and `note`, keeps all the note does not touch, and says whether the words must change.
   */
  edit?: { spec: DiagramSpec; note: string };
  /** The figure of the draft this one replaces (Harder, Easier, Another): a starting point, not to be copied blindly. */
  base?: DiagramSpec;
  /** Printed width; default the full-column figure. */
  widthPx?: number;
}

export interface DiagramGenDeps {
  client: AiClient;
  preset: ProviderPreset;
  /**
   * Sends a request with pictures, when the provider layer can (k-0514 adds images to the
   * model). Absent, a reference picture is not sent: the model is told one exists and works
   * from the question's words and any reference diagram or text.
   */
  completeWithImages?: (req: CompletionRequest, images: readonly ReferenceImage[]) => Promise<CompletionResult>;
}

export type DiagramStatus = 'ok' | 'look' | 'failed';

/** The key worked out from the drawing (k-0534). */
export interface SolvedKey {
  /** The label(s) at the answer: one tick, or two for a shortage / surplus. */
  labels: string[];
  /** The keyed option that reads as those labels; -1 = none does. */
  option: number;
  /** How it was found, in English, for the repair turn and the log. */
  why: string;
}

export type DiagramGenOutcome =
  | {
      ok: true;
      /** 'none': the question needs no figure (block null). */
      status: DiagramStatus | 'none';
      /** The editable figure, measured for `sides`; null when none is needed or it failed. */
      block: DiagramBlock | null;
      spec: DiagramSpec;
      issues: DiagramIssue[];
      /** 1 = first reply; 2 = after one repair turn. */
      attempt: 1 | 2;
      /**
       * An edit only (`input.edit`): what the question's words must change to fit, in the
       * model's English; '' = the words stand as they are.
       */
      questionChange: string;
      /** What the drawing says the answer is, when `spec.asks` is something the solver reads. */
      solved: SolvedKey | null;
      /** A reference picture was given but could not be sent. */
      imageSkipped: boolean;
      model: string;
    }
  | { ok: false; error: AiErrorInfo };
