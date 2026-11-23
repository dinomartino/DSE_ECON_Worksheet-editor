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
export const CURVE_ROLES = ['demand', 'supply', 'ad', 'sras', 'lras', 'vertical', 'horizontal', 'frontier'] as const;
export type CurveRole = (typeof CURVE_ROLES)[number];

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
  /** The printed name, a symbol: "D", "S_0", "SRAS_1", "PPC". `_x` / `_{xy}` subscripts. */
  label: string;
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

/** A horizontal price line: a ceiling, a floor or minimum wage, a world price, a fixed price. */
export const LEVEL_KINDS = ['ceiling', 'floor', 'world', 'fixed'] as const;
export type LevelKind = (typeof LEVEL_KINDS)[number];

export interface SpecLevel {
  id: string;
  kind: LevelKind;
  /** Against the first market equilibrium (first demand-like × supply-like curve). */
  side: 'below' | 'above';
  label: string;
}

/** A marked crossing of two curves, with dashed drops and ticks. */
export interface SpecEquilibrium {
  a: string;
  b: string;
  /** The point's own name ("E_0"); '' = none (most scheme diagrams name only the ticks). */
  name: string;
  /** The y-axis tick ("P_0"); '' = no drop to the y-axis. */
  yTick: string;
  /** The x-axis tick ("Q_0"); '' = no drop to the x-axis. */
  xTick: string;
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

export const SPEC_KINDS = ['none', 'curves', 'chart', 'template'] as const;
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
  equilibria: SpecEquilibrium[];
  gaps: SpecGap[];
  shades: SpecShade[];
  marks: SpecMark[];
  /** Arrows along the axes from the first equilibrium's P and Q to the second's. */
  changeArrows: boolean;
  chart: SpecChart;
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
      /** A reference picture was given but could not be sent. */
      imageSkipped: boolean;
      model: string;
    }
  | { ok: false; error: AiErrorInfo };
