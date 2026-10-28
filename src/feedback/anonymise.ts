/**
 * An anonymised copy of a document, for a bug report (k-0180): the same file with every
 * word and picture replaced, so a teacher can send the shape of a problem without its
 * content. Runs only on the device; nothing here touches the network.
 *
 * What is kept is what lays the page out: structure, formatting, every text's length
 * (character by character, each replaced by a random one of the same kind and roughly
 * the same width), every picture's pixel size. What is replaced is everything a person
 * wrote or inserted. Random per call, from the platform's CSPRNG, so a copy cannot be
 * mapped back to its original.
 *
 * Deny by default: the walk scrambles every string in the document unless its key is a
 * known structural one (`KEPT_KEYS`: ids, kinds, enums, colours, font names). A field
 * added later that this file has not heard of comes out scrambled, never leaked; the
 * census in `anonymise.test.ts` reads the model's types and fails until it is classified.
 */
import { PATTERN_SEPARATOR } from '@/model/patterns';
import { topicOf } from '@/model/topics';
import type { Worksheet } from '@/model/types';

/** A source of randomness: `next()` in [0, 1), `fill()` for bulk bytes. */
export interface Random {
  next(): number;
  fill(bytes: Uint8Array): void;
}

/** The platform's CSPRNG. `getRandomValues` takes at most 64 KiB per call. */
export function cryptoRandom(): Random {
  const pool = new Uint32Array(256);
  let at = pool.length;
  const fill = (bytes: Uint8Array) => {
    for (let start = 0; start < bytes.length; start += 65536) {
      crypto.getRandomValues(bytes.subarray(start, Math.min(bytes.length, start + 65536)));
    }
  };
  return {
    next() {
      if (at === pool.length) {
        crypto.getRandomValues(pool);
        at = 0;
      }
      return pool[at++] / 2 ** 32;
    },
    fill,
  };
}

/** A seeded generator (mulberry32), for tests that must be repeatable. Never for a real copy. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  return {
    next,
    fill(bytes) {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = (next() * 256) | 0;
    },
  };
}

const pick = (pool: string, random: Random): string => {
  const chars = Array.from(pool);
  return chars[Math.floor(random.next() * chars.length)];
};

// ─── Text ────────────────────────────────────────────────────────────────────────────

/**
 * Letters grouped by advance width (Times New Roman's, the papers' Latin face; Arial's
 * agrees closely), so a scrambled line wraps where the original did. A letter is
 * replaced by any letter of its group, itself included.
 */
const LETTER_GROUPS = [
  'fijlrt', // narrow
  'acesz', // between
  'bdghknopquvxy', // regular
  'mw', // wide
  'IJ',
  'EFLPSTZ',
  'ABCDGHKNOQRUVXY',
  'MW',
] as const;

const GROUP_OF = new Map<string, string>();
for (const group of LETTER_GROUPS) for (const letter of group) GROUP_OF.set(letter, group);

const DIGITS = '0123456789';
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const FULLWIDTH_DIGITS = '０１２３４５６７８９';
const FULLWIDTH_UPPER = 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ';
const FULLWIDTH_LOWER = 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ';

/** Common Traditional Chinese characters: every one the same full width as any other. */
export const COMMON_CHINESE =
  '的一是不了人我在有他這中大來上國個到說們為子和你地出道也時年得就那要下以生會自著去之過家學對可她裏後小麼心多天而能好都然沒日於起還發成事只作當想看文無開手十用主行方又如前所本見經頭面公同三已老從動兩長知民樣現分將外但身些與高意進把法此實回二理美點月明其種聲全工己話兒者向情部正名定女問力機給等幾很業最間新什打便位因重被走電四第門相次東政海口使教西再平真聽世氣信北少關并內加化由卻代軍產入先山五太水萬市眼體別處總才場師書比住員九笑性通目華報立馬命張活難神數件安表原車白應路期叫死常提感金何更反合放做系計或司利受光王果親界及今京務制解各任至清物台象記邊共風戰干接它許八特覺望直服毛林題建南度統色字請交愛讓認算論百吃義科怎元社術結六功指思非流每青管夫連遠資隊跟帶花快條院變聯言權往展該領傳近留紅治決周保達辦運武半候七必城父強步完革深區即求品士轉量空甚眾技輕程告江語英基派滿式李息寫呢識極令黃德收臉錢黨倒未持取設始版雙歷越史商千片容研像找友孩站廣改議形委早房音火際則首單據導影失拿網香似斯專石若兵弟誰校讀志飛觀爭究包組造落視濟喜離雖壞興引照病準質注且份價';

/** Kana and Hangul are as wide as a Chinese character; anything wide takes one. */
const WIDE_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Stretches kept as they are: list markers and typed numbering — "(1)", "(ii)", "(a)",
 * "（２）", "A." at a line's start, "3." at a line's start. They carry the layout of a
 * list, not anyone's wording.
 */
const MARKERS =
  /[(（](?:[0-9０-９]{1,2}|[ivxlcIVXLC]{1,5}|[a-zA-Z])[)）]|(?<=^|[\n\t])[ 　]*(?:[A-H]|[0-9]{1,2})[.)．）](?=[\s　]|$)/gu;

function scrambleChar(char: string, random: Random): string {
  const group = GROUP_OF.get(char);
  if (group) return pick(group, random);
  if (char >= '0' && char <= '9') return pick(DIGITS, random);
  if (FULLWIDTH_DIGITS.includes(char)) return pick(FULLWIDTH_DIGITS, random);
  if (SUBSCRIPT_DIGITS.includes(char)) return pick(SUBSCRIPT_DIGITS, random);
  if (SUPERSCRIPT_DIGITS.includes(char)) return pick(SUPERSCRIPT_DIGITS, random);
  if (FULLWIDTH_UPPER.includes(char)) return pick(FULLWIDTH_UPPER, random);
  if (FULLWIDTH_LOWER.includes(char)) return pick(FULLWIDTH_LOWER, random);
  if (WIDE_LETTER.test(char)) return pick(COMMON_CHINESE, random);
  // Any other letter or number (é, ß, Greek, Ⅻ): a regular-width Latin letter.
  if (/[\p{L}\p{N}]/u.test(char)) return pick(LETTER_GROUPS[2], random);
  return char;
}

/** A word, a number, or one wide character: what is scrambled as a unit. */
const UNIT = /[A-Za-z]+|[0-9]+|[０-９]+|[Ａ-Ｚａ-ｚ]+|[\s\S]/gu;

/**
 * The text with every letter and digit replaced, everything else kept: the same number
 * of characters, the same kinds in the same places. List markers survive (`MARKERS`).
 * A word or number that came out as it went in is drawn again, so nothing anyone wrote
 * stays where it was, even by chance.
 */
export function scrambleText(text: string, random: Random): string {
  let out = '';
  let from = 0;
  const scramble = (part: string) =>
    part.replace(UNIT, (unit) => {
      // Spaces, line breaks, tabs, punctuation, symbols: the layout, kept.
      if (!/[\p{L}\p{N}]/u.test(unit)) return unit;
      let next = unit;
      for (let attempt = 0; attempt < 32 && next === unit; attempt += 1) {
        next = Array.from(unit, (char) => scrambleChar(char, random)).join('');
      }
      return next;
    });
  for (const match of text.matchAll(MARKERS)) {
    out += scramble(text.slice(from, match.index)) + match[0];
    from = match.index + match[0].length;
  }
  return out + scramble(text.slice(from));
}

// ─── Pictures ────────────────────────────────────────────────────────────────────────

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
};

/** A `data:` URL's bytes, or undefined for anything else (an asset id, a broken URL). */
export function dataUrlBytes(src: string): Uint8Array | undefined {
  const match = /^data:[^,]*?(;base64)?,([\s\S]*)$/.exec(src);
  if (!match) return undefined;
  try {
    return match[1] ? base64ToBytes(match[2]) : new TextEncoder().encode(decodeURIComponent(match[2]));
  } catch {
    return undefined;
  }
}

/** Pixel size from a PNG, GIF, JPEG or WebP header; undefined for anything else. */
export function imagePixelSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const at = (i: number) => bytes[i] ?? 0;
  const be16 = (i: number) => (at(i) << 8) | at(i + 1);
  const le16 = (i: number) => at(i) | (at(i + 1) << 8);
  const be32 = (i: number) => ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0;
  const ascii = (i: number, n: number) => String.fromCharCode(...bytes.subarray(i, i + n));
  const sized = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : undefined);

  if (at(0) === 0x89 && ascii(1, 3) === 'PNG') return sized(be32(16), be32(20));
  if (ascii(0, 3) === 'GIF') return sized(le16(6), le16(8));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') return sized(1 + (at(24) | (at(25) << 8) | (at(26) << 16)), 1 + (at(27) | (at(28) << 8) | (at(29) << 16)));
    if (chunk === 'VP8L') {
      const b = (i: number) => at(21 + i);
      return sized(1 + (b(0) | ((b(1) & 0x3f) << 8)), 1 + ((b(1) >> 6) | (b(2) << 2) | ((b(3) & 0x0f) << 10)));
    }
    if (chunk === 'VP8 ') return sized(le16(26) & 0x3fff, le16(28) & 0x3fff);
    return undefined;
  }
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (at(i) !== 0xff) return undefined;
      const marker = at(i + 1);
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      // Start of frame (baseline, progressive, …), never DHT/JPG/DAC.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return sized(be16(i + 7), be16(i + 5));
      }
      i += 2 + be16(i + 2);
    }
  }
  return undefined;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Bits per pixel the noise may use: greys at 1, 2, 4 and 8 bits, then RGB. */
const DEPTHS = [
  { bits: 1, colorType: 0, channels: 1 },
  { bits: 2, colorType: 0, channels: 1 },
  { bits: 4, colorType: 0, channels: 1 },
  { bits: 8, colorType: 0, channels: 1 },
  { bits: 8, colorType: 2, channels: 3 },
] as const;

/**
 * A PNG of random noise, `width` × `height` pixels, near `targetBytes` long.
 *
 * Noise does not compress, so the file is stored uncompressed (deflate's stored blocks)
 * and its size is set by the bit depth alone: the depth whose size is nearest the
 * original's, so a copy is about as heavy as the document it stands for.
 */
export function noisePng(width: number, height: number, targetBytes: number, random: Random): Uint8Array {
  const rowBytes = (depth: (typeof DEPTHS)[number]) => Math.ceil((width * depth.bits * depth.channels) / 8);
  const rawSize = (depth: (typeof DEPTHS)[number]) => height * (1 + rowBytes(depth));
  const depth = DEPTHS.reduce((best, candidate) =>
    Math.abs(Math.log(rawSize(candidate) / Math.max(1, targetBytes))) <
    Math.abs(Math.log(rawSize(best) / Math.max(1, targetBytes)))
      ? candidate
      : best,
  );

  const row = rowBytes(depth);
  const raw = new Uint8Array(rawSize(depth));
  random.fill(raw);
  for (let y = 0; y < height; y += 1) raw[y * (row + 1)] = 0; // filter: none

  // zlib: header, stored blocks of at most 65535 bytes, Adler-32.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b += 1) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    zlib[o] = b === blocks - 1 ? 1 : 0;
    zlib[o + 1] = len & 0xff;
    zlib[o + 2] = len >>> 8;
    zlib[o + 3] = ~len & 0xff;
    zlib[o + 4] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), o + 5);
    o += 5 + len;
  }
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < raw.length; i += 1) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  new DataView(zlib.buffer).setUint32(o, ((s2 << 16) | s1) >>> 0);

  const chunks: Array<[string, Uint8Array]> = [
    ['IHDR', (() => {
      const ihdr = new Uint8Array(13);
      const view = new DataView(ihdr.buffer);
      view.setUint32(0, width);
      view.setUint32(4, height);
      ihdr[8] = depth.bits;
      ihdr[9] = depth.colorType;
      return ihdr;
    })()],
    ['IDAT', zlib],
    ['IEND', new Uint8Array(0)],
  ];
  const png = new Uint8Array(8 + chunks.reduce((sum, [, data]) => sum + 12 + data.length, 0));
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer);
  let p = 8;
  for (const [type, data] of chunks) {
    view.setUint32(p, data.length);
    for (let i = 0; i < 4; i += 1) png[p + 4 + i] = type.charCodeAt(i);
    png.set(data, p + 8);
    view.setUint32(p + 8 + data.length, crc32(png, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  }
  return png;
}

/** The pixel sizes an image-bearing object may state, in the order they describe its bytes. */
interface Sized {
  naturalWidthPx?: unknown;
  naturalHeightPx?: unknown;
  widthPx?: unknown;
  heightPx?: unknown;
}

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.round(value) : undefined;

/** Never more pixels than a stored picture may have (`imageImport.ts`), whatever a field claims. */
const MAX_NOISE_PIXELS = 2200 * 3500;

/** A noise picture standing in for `src`: its pixel size, about its byte size, as a PNG. */
export function noiseImage(src: string, holder: Sized, random: Random): string {
  const bytes = dataUrlBytes(src);
  const read = bytes && imagePixelSize(bytes);
  let width = read?.width ?? positive(holder.naturalWidthPx) ?? positive(holder.widthPx) ?? 1;
  let height = read?.height ?? positive(holder.naturalHeightPx) ?? positive(holder.heightPx) ?? 1;
  if (width * height > MAX_NOISE_PIXELS) {
    const shrink = Math.sqrt(MAX_NOISE_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * shrink));
    height = Math.max(1, Math.floor(height * shrink));
  }
  return `data:image/png;base64,${bytesToBase64(noisePng(width, height, bytes?.length ?? width * height, random))}`;
}

// ─── The document ────────────────────────────────────────────────────────────────────

/**
 * String fields kept as they are: the document's structure, never anyone's wording.
 * Enums and ids, colours as hex, font names. Every other string is scrambled.
 */
export const KEPT_KEYS: ReadonlySet<string> = new Set([
  // Ids and references to them.
  'id', 'rootId', 'fromDocId', 'follows', 'from', 'to', 'of', 'on', 'point', 'curve', 'cross', 'templateId', 'libraryId',
  // Kinds and enums.
  'kind', 'type', 'align', 'along', 'borders', 'captionPlacement', 'change', 'density', 'dropTo', 'fill',
  'instructionMarker', 'labelAt', 'labelPlacement', 'labelSide', 'leader', 'lqLayout', 'mcLayout',
  'optionAlign', 'optionLayout', 'orientation', 'paper', 'pattern', 'preset', 'shading', 'shape', 'slot',
  'statementAlign', 'stroke', 'style', 'tableSide', 'titlePlacement', 'vAlign', 'vertAlign', 'width',
  // Formatting.
  'color', 'latin', 'eastAsia',
]);

/** Timestamps: set to the moment of the copy, so they say nothing about the original. */
export const TIMESTAMP_KEYS: ReadonlySet<string> = new Set(['createdAt', 'updatedAt', 'copiedAt', 'tagsAt']);

/** Top-level fields left out of the copy: never printed, only about the teacher's classes. */
export const DROPPED_KEYS: ReadonlySet<string> = new Set(['classes', 'satOn']);

/** Pictures: a `data:` URL (or an asset id), replaced by noise of the same pixel size. */
export const IMAGE_KEY = 'src';

/**
 * String fields scrambled on purpose (the rest are scrambled by default): the run text
 * every printed word lives in, the bank's tags (`scrambleTag`), and the file's name
 * (replaced whole).
 */
export const SCRAMBLED_KEYS: ReadonlySet<string> = new Set(['text', 'tags', 'name']);

/**
 * A bank tag: a syllabus topic code this build knows stays (it is the syllabus's, not the
 * teacher's); a 題型 keeps its topic and loses its name; a free tag is scrambled.
 */
export function scrambleTag(tag: string, random: Random): string {
  if (topicOf(tag)) return tag;
  const at = tag.indexOf(PATTERN_SEPARATOR);
  if (at > 0 && topicOf(tag.slice(0, at))) {
    return tag.slice(0, at + PATTERN_SEPARATOR.length) + scrambleText(tag.slice(at + PATTERN_SEPARATOR.length), random);
  }
  return scrambleText(tag, random);
}

interface BiTextLike {
  en: Array<{ text?: unknown }>;
  zh: Array<{ text?: unknown }>;
}

const isBiText = (value: unknown): value is BiTextLike =>
  typeof value === 'object' && value !== null && Array.isArray((value as BiTextLike).en) && Array.isArray((value as BiTextLike).zh);

const plain = (runs: Array<{ text?: unknown }>): string =>
  runs.map((run) => (typeof run?.text === 'string' ? run.text : '')).join('');

/**
 * A text whose two sides read the same keeps reading the same: bilingual output prints
 * such a text once (a figure, a code, a name), so sides scrambled apart would print twice
 * and move the page. The English side's scramble is laid over the Chinese side's runs.
 */
function sameSides(original: BiTextLike, copy: BiTextLike): BiTextLike {
  const text = plain(original.en);
  if (!text || text !== plain(original.zh)) return copy;
  const scrambled = Array.from(plain(copy.en));
  let at = 0;
  const zh = copy.zh.map((run, index) => {
    const source = original.zh[index]?.text;
    if (typeof source !== 'string') return run;
    const length = Array.from(source).length;
    const piece = scrambled.slice(at, at + length).join('');
    at += length;
    return { ...run, text: piece };
  });
  return { ...copy, zh };
}

/** `report-2026-10-23`: the copy's name, by the local date. */
export function reportName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export interface AnonymiseOptions {
  random?: Random;
  now?: Date;
}

/**
 * The anonymised copy of `worksheet` (§ this file). The original is never changed.
 * A string's key decides it: kept (`KEPT_KEYS`), a picture (`src`), a timestamp, or
 * scrambled — the default, so an unknown field (a newer build's, under `__unknown`)
 * never passes through as written.
 */
export function anonymiseWorksheet(worksheet: Worksheet, options: AnonymiseOptions = {}): Worksheet {
  const random = options.random ?? cryptoRandom();
  const now = options.now ?? new Date();
  const stamp = now.toISOString();

  const walk = (value: unknown, key: string | undefined, holder: object | undefined): unknown => {
    if (typeof value === 'string') {
      if (key === IMAGE_KEY) return noiseImage(value, (holder ?? {}) as Sized, random);
      if (key !== undefined && TIMESTAMP_KEYS.has(key)) return stamp;
      if (key !== undefined && KEPT_KEYS.has(key)) return value;
      if (key === 'tags') return scrambleTag(value, random);
      return scrambleText(value, random);
    }
    // An array's items stand under the array's own key (`tags`, `cross`).
    if (Array.isArray(value)) return value.map((item) => walk(item, key, holder));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [field, entry] of Object.entries(value)) out[field] = walk(entry, field, value);
      return isBiText(value) ? sameSides(value, out as unknown as BiTextLike) : out;
    }
    return value;
  };

  const copy = walk(worksheet, undefined, undefined) as Worksheet & Record<string, unknown>;
  for (const key of DROPPED_KEYS) delete copy[key];
  copy.id = `report-${Array.from({ length: 10 }, () => pick(ID_ALPHABET, random)).join('')}`;
  copy.name = reportName(now);
  return copy;
}
