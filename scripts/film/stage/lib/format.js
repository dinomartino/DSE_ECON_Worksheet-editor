// The page's frame format, from ?format=landscape|portrait (default landscape). Every
// stage module that needs the design size or the text safe area reads it from here.
import { formatOf, pick as pickFor } from '../../format.mjs';

const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
export const FORMAT = formatOf(q?.get('format'));
/** Design px of the frame: 1920×1080 (landscape) or 1080×1920 (portrait). */
export const W = FORMAT.W;
export const H = FORMAT.H;
export const PORTRAIT = FORMAT.id === 'portrait';
/** The value for this page's format: pick({ landscape: …, portrait: … }). */
export const pick = (table) => pickFor(FORMAT.id, table);
