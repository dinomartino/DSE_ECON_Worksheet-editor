/**
 * The teacher's own term data, validated one value at a time: a rendering they add to an
 * EDB term, and a term the EDB glossary does not have. Pure, no imports: the settings
 * store, the glossary engine and the Settings pane all read these rules.
 */

export const MAX_RENDERING = 40;
export const MAX_ENGLISH = 120;
export const MAX_RENDERINGS = 10;
export const MAX_FORMS = 10;

/** A term the teacher added. Its key in storage is its `id`. */
export interface CustomTerm {
  /** The English term, as the teacher typed it. */
  en: string;
  /** Other English forms ("digital gross domestic product"). */
  forms?: string[];
  /** Capitals only; matched case-sensitively, plural allowed (GDPs). */
  abbreviation?: string;
  /** Chinese renderings; `[0]` is preferred. */
  zh: string[];
}

const HAN = /\p{Script=Han}/u;

/** A Chinese rendering as stored: NFC, trimmed, 1 to 40 characters with at least one Han
 *  character, no slash (the CSV separates renderings with " / ") and no line break. */
export function cleanRendering(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.normalize('NFC').trim();
  if (!s || s.length > MAX_RENDERING || !HAN.test(s) || /[/／\r\n\t]/.test(s)) return undefined;
  return s;
}

/** An English term or form: NFC, single-spaced, with a letter, no slash or line break. */
export function cleanEnglish(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s || s.length > MAX_ENGLISH || !/[A-Za-z]/.test(s) || /[/\r\n]/.test(s)) return undefined;
  return s;
}

/** Capitals and digits, starting with a capital: 2 to 12 characters. */
export function cleanAbbreviation(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  return /^[A-Z][A-Z0-9]{1,11}$/.test(s) ? s : undefined;
}

/** Distinct clean renderings, in order, at most 10; invalid ones are dropped. */
export function cleanRenderings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    const clean = cleanRendering(r);
    if (clean && !out.includes(clean) && out.length < MAX_RENDERINGS) out.push(clean);
  }
  return out;
}

/** A stored custom term, or undefined when its English or every rendering is unusable. */
export function cleanCustomTerm(raw: unknown): CustomTerm | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const en = cleanEnglish(row.en);
  const zh = cleanRenderings(row.zh);
  if (!en || !zh.length) return undefined;
  const lower = en.toLowerCase();
  const forms: string[] = [];
  for (const f of Array.isArray(row.forms) ? row.forms : []) {
    const clean = cleanEnglish(f);
    if (clean && clean.toLowerCase() !== lower && !forms.some((x) => x.toLowerCase() === clean.toLowerCase()) && forms.length < MAX_FORMS) {
      forms.push(clean);
    }
  }
  const abbreviation = cleanAbbreviation(row.abbreviation);
  return { en, zh, ...(forms.length ? { forms } : {}), ...(abbreviation ? { abbreviation } : {}) };
}

/** A new storage id for a custom term. */
export function newTermId(taken: (id: string) => boolean): string {
  for (;;) {
    const id = `t${Math.random().toString(36).slice(2, 10)}`;
    if (!taken(id)) return id;
  }
}
