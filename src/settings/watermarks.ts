import type { FieldValidator, SettingsSchema } from './types';
import { text } from './validators';

/**
 * Settings → Watermarks: the teacher's saved watermarks, on this computer, for every paper
 * (k-0242). A list from the start: one teacher may work for two schools, or want a logo
 * for one paper and "SAMPLE" for another. A paper keeps its own copy of the one it uses
 * (`Worksheet.watermark`), so renaming or deleting an entry here never changes a paper.
 *
 * Stored in the app's settings (`econgen.settings.watermarks`), never in a document and
 * never backed up with the documents. Each entry is validated on its own, so one broken
 * entry is dropped and the rest of the list survives.
 */

export interface SavedWatermark {
  id: string;
  /** The teacher's name for it ("St Mary's College"). */
  name: string;
  /** A picture the teacher imported, or a line of text drawn as a picture. */
  kind: 'image' | 'text';
  /** For a text watermark, the words it was drawn from. */
  text?: string;
  /** PNG or JPEG `data:` URL, already downscaled (`prepareWatermarkPicture`). */
  src: string;
  widthPx: number;
  heightPx: number;
  createdAt: string;
}

export interface WatermarkSettings {
  library: SavedWatermark[];
  /** What the one-click button puts on a paper that has no watermark yet. */
  lastUsedId: string;
}

/** Room for a handful of logos without crowding the browser's storage. */
export const MAX_SAVED_WATERMARKS = 20;
const MAX_NAME = 80;
/** Generous for a downscaled logo (`prepareWatermarkPicture` keeps the long edge ≤ 1200px). */
const MAX_SRC = 3_000_000;
const PICTURE_URL = /^data:image\/(png|jpe?g);base64,/i;

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const savedWatermark: FieldValidator<SavedWatermark> = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !entry.id) return undefined;
  if (typeof entry.src !== 'string' || entry.src.length > MAX_SRC || !PICTURE_URL.test(entry.src)) return undefined;
  if (!positive(entry.widthPx) || !positive(entry.heightPx)) return undefined;
  const kind = entry.kind === 'text' ? 'text' : 'image';
  const name = typeof entry.name === 'string' ? entry.name.slice(0, MAX_NAME) : '';
  return {
    id: entry.id,
    name,
    kind,
    ...(kind === 'text' && typeof entry.text === 'string' ? { text: entry.text.slice(0, 200) } : {}),
    src: entry.src,
    widthPx: entry.widthPx,
    heightPx: entry.heightPx,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
  };
};

/** Every valid entry, in order; an entry with an id seen before is dropped. */
export const watermarkLibrary: FieldValidator<SavedWatermark[]> = (raw) => {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: SavedWatermark[] = [];
  for (const item of raw) {
    const entry = savedWatermark(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
};

export const WATERMARK_SETTINGS: SettingsSchema<WatermarkSettings> = {
  section: 'watermarks',
  version: 1,
  storageKey: 'econgen.settings.watermarks',
  defaults: () => ({ library: [], lastUsedId: '' }),
  fields: { library: watermarkLibrary, lastUsedId: text(200) },
};

/** The entry the one-click button applies: the last used, else the newest. */
export function defaultWatermark(settings: WatermarkSettings): SavedWatermark | undefined {
  return (
    settings.library.find((entry) => entry.id === settings.lastUsedId) ??
    settings.library[settings.library.length - 1]
  );
}
