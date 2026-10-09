/**
 * Text recognition for scanned pages, run by the desktop shell (offline, PP-OCRv6 small:
 * `docs/research/2026-10-ocr-survey.md`). Two commands:
 *
 *   ocr_status → { available, engine, version }
 *   ocr_image(<PNG or JPEG bytes>, header x-ocr-max-side) → { width, height, lines, ms }
 *
 * Boxes are four corners, clockwise from top-left, in the image's own pixels. Errors are
 * strings prefixed `decode:`, `model:` or `internal:`. On the web there is no engine:
 * `ocrEngine()` is undefined and the import dialog says scans are read in the desktop app.
 */
import { isDesktop } from './index';

export interface OcrLine {
  text: string;
  /** Recognition confidence, 0–1. */
  score: number;
  /** Four corners, clockwise from the top-left, in the image's pixels. */
  box: Array<[number, number]>;
  /** The text's direction in degrees, when the engine read it. */
  angle?: number;
}

export interface OcrResult {
  width: number;
  height: number;
  lines: OcrLine[];
  ms: number;
}

export interface OcrStatus {
  available: boolean;
  engine: string;
  version: string;
}

export type OcrErrorKind = 'decode' | 'model' | 'internal';

export class OcrError extends Error {
  constructor(
    readonly kind: OcrErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}

export interface OcrEngine {
  status(): Promise<OcrStatus>;
  /** One page: PNG or JPEG bytes. Rejects with `OcrError`. */
  read(image: Uint8Array): Promise<OcrResult>;
}

/** The engine downsizes larger pages itself; boxes still come back in the image's pixels. */
export const OCR_MAX_SIDE = 2400;

function ocrError(cause: unknown): OcrError {
  const text = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : String(cause);
  const m = /^(decode|model|internal):\s*([\s\S]*)$/.exec(text);
  return m ? new OcrError(m[1] as OcrErrorKind, m[2]) : new OcrError('internal', text);
}

const native: OcrEngine = {
  async status() {
    if (!isDesktop()) return { available: false, engine: '', version: '' };
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<OcrStatus>('ocr_status');
  },
  async read(image) {
    if (!isDesktop()) throw new OcrError('internal', 'Text recognition needs the desktop app.');
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<OcrResult>('ocr_image', image, { headers: { 'x-ocr-max-side': String(OCR_MAX_SIDE) } });
    } catch (cause) {
      throw ocrError(cause);
    }
  },
};

let injected: OcrEngine | undefined | null = null;

/** Tests and dev screenshots: use this engine instead (`undefined`: none); `null` restores the real one. */
export function setOcrEngine(engine: OcrEngine | undefined | null): void {
  injected = engine;
}

// Dev builds only (Next inlines NODE_ENV, so production drops it): screenshots of the
// reading step outside the shell set `window.__ECON_FAKE_OCR__` before the app loads.
function devFake(): OcrEngine | undefined {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return undefined;
  const spec = (window as unknown as { __ECON_FAKE_OCR__?: { delayMs?: number; available?: boolean } }).__ECON_FAKE_OCR__;
  if (!spec) return undefined;
  return {
    status: async () => ({ available: spec.available !== false, engine: 'fake', version: '0' }),
    read: async () => {
      await new Promise((resolve) => setTimeout(resolve, spec.delayMs ?? 800));
      return { width: 1654, height: 2339, lines: [], ms: spec.delayMs ?? 800 };
    },
  };
}

/** The engine to use, if any: the shell's on desktop, none on the web. */
export function ocrEngine(): OcrEngine | undefined {
  if (injected !== null) return injected;
  return devFake() ?? (isDesktop() ? native : undefined);
}

/** The engine when it says it can read (models present), else undefined. Never rejects. */
export async function readyOcrEngine(): Promise<OcrEngine | undefined> {
  const engine = ocrEngine();
  if (!engine) return undefined;
  try {
    return (await engine.status()).available ? engine : undefined;
  } catch {
    return undefined;
  }
}
