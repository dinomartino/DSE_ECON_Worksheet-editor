import { JSON_SHAPE_HINT } from '../schema';
import type {
  CompletionRequest,
  CompletionResult,
  ModelInfo,
  OutputDialect,
  ProviderConfig,
  ProviderPreset,
} from '../types';

/** One API family's wire shape. Pure: builds requests and reads bodies, never sends. */
export interface Adapter {
  /** The structured-output ladder for this preset, best rung first. */
  rungs(preset: ProviderPreset): OutputDialect[];
  build(preset: ProviderPreset, config: ProviderConfig, req: CompletionRequest, dialect: OutputDialect): WireRequest;
  /** Null when the body is not this family's success shape. */
  extract(body: unknown): Extracted | null;
  models(preset: ProviderPreset, config: ProviderConfig): WireRequest;
  parseModels(body: unknown): ModelInfo[];
}

export interface WireRequest { url: string; headers: Record<string, string>; body?: string }
export type Extracted = Pick<CompletionResult, 'text' | 'finish' | 'usage'>;

/** A rung that doesn't enforce the schema carries the JSON shape hint in `system`. */
export function systemFor(system: string, enforced: boolean, hint: string = JSON_SHAPE_HINT): string {
  return enforced ? system : `${system}\n\n${hint}`;
}

/** The base URL without a trailing slash. */
export const trimBase = (url: string) => url.replace(/\/+$/, '');

/** A model's preset options (`extra`), or {} for a typed id the preset doesn't list. */
export function modelExtra(preset: ProviderPreset, model: string): Record<string, unknown> {
  return preset.models.find((m) => m.id === model)?.extra ?? {};
}

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
