import type { BiText, TabLeader, TabStop, TabStopAlign } from './types';
import { bi } from './text';

/**
 * Word's tab rule, in one place for the page, the ruler and the exporters
 * (docs/Tabs vs Word.md).
 *
 * A typed tab is `\t` inside a run. It goes to the first custom stop past where it starts,
 * then to the default grid, which `settings.xml` writes as `w:defaultTabStop`. Positions
 * are measured from the text column's left edge (the page margin, or a cell's text edge),
 * not from the paragraph's indent: an indented stem still tabs to margin + 0.5 in.
 */

/** `w:defaultTabStop`: 0.5 in. */
export const DEFAULT_TAB_STOP_TWIPS = 720;

/** The widest position Word's Tabs dialog accepts (22 in). */
export const MAX_TAB_POS_TWIPS = 31680;

export const TWIPS_PER_CM = 1440 / 2.54;

/** Twips to CSS px (1 twip = 1/20 pt, 1 pt = 4/3 px). */
export const twipsToPx = (twips: number): number => twips / 15;

export const TAB_ALIGNS: readonly TabStopAlign[] = ['left', 'center', 'right', 'decimal'];
export const TAB_LEADERS: readonly TabLeader[] = ['dot', 'hyphen', 'underscore'];

/**
 * A format's stops, made safe to lay out: real numbers in range, known alignments and
 * leaders, sorted, one stop per position. A malformed entry is dropped rather than
 * failing a render; the stored value is left as it is.
 */
export function cleanTabStops(stops: unknown): TabStop[] {
  if (!Array.isArray(stops)) return [];
  const byPos = new Map<number, TabStop>();
  for (const raw of stops) {
    if (!raw || typeof raw !== 'object') continue;
    const { pos, align, leader } = raw as Partial<TabStop>;
    if (typeof pos !== 'number' || !Number.isFinite(pos)) continue;
    const at = Math.round(pos);
    if (at <= 0 || at > MAX_TAB_POS_TWIPS) continue;
    const stop: TabStop = { pos: at, align: TAB_ALIGNS.includes(align as TabStopAlign) ? align! : 'left' };
    if (leader && TAB_LEADERS.includes(leader)) stop.leader = leader;
    byPos.set(at, stop);
  }
  return [...byPos.values()].sort((a, b) => a.pos - b.pos);
}

/** A stop in layout units (CSS px on the page, twips in tests). */
export interface PlacedStop {
  pos: number;
  align: TabStopAlign;
  leader?: TabLeader;
}

/**
 * The stop a tab starting at `x` goes to, or `undefined` when none is left (Word then
 * carries the tab to the next line).
 *
 * The first custom stop past `x`, up to `customLimit` (the column's edge: Word honours a
 * stop past the paragraph's right indent, which is how a right-indented stem still sets
 * "(3 marks)" at the margin); past the last one, the next multiple of `defaultStop`, up
 * to `limit` (the line's end). Half a unit of slack, so a tab sitting exactly on a stop
 * moves on to the next one, as Word's does.
 */
export function nextTabStop(
  x: number,
  stops: readonly PlacedStop[],
  defaultStop: number,
  limit: number,
  customLimit = limit,
): PlacedStop | undefined {
  const custom = stops.find((stop) => stop.pos > x + 0.5);
  if (custom) return custom.pos <= customLimit + 0.5 ? custom : undefined;
  if (defaultStop <= 0) return undefined;
  const pos = (Math.floor((x + 0.5) / defaultStop) + 1) * defaultStop;
  return pos <= limit + 0.5 ? { pos, align: 'left' } : undefined;
}

/**
 * The gap a tab at `x` leaves before the text after it.
 *
 * `portion` is the width of that text on this line, up to the next tab; `toDecimal` the
 * part of it before its first full stop (the whole portion when it has none). A centred,
 * right or decimal portion that does not fit before its stop starts at `x`, never over
 * the text before the tab.
 */
export function tabGap(x: number, stop: PlacedStop, portion: number, toDecimal = portion): number {
  const start =
    stop.align === 'center'
      ? stop.pos - portion / 2
      : stop.align === 'right'
        ? stop.pos - portion
        : stop.align === 'decimal'
          ? stop.pos - toDecimal
          : stop.pos;
  return Math.max(0, start - x);
}

/** Add a stop, replacing one already at that position. */
export function withTabStop(stops: readonly TabStop[] | undefined, stop: TabStop): TabStop[] {
  return cleanTabStops([...(stops ?? []).filter((s) => s.pos !== Math.round(stop.pos)), stop]);
}

/** Move the stop at `from` to `to`, keeping its alignment and leader. */
export function movedTabStop(stops: readonly TabStop[] | undefined, from: number, to: number): TabStop[] {
  const moving = (stops ?? []).find((s) => s.pos === from);
  if (!moving) return cleanTabStops(stops);
  return withTabStop(
    (stops ?? []).filter((s) => s.pos !== from),
    { ...moving, pos: to },
  );
}

export function withoutTabStop(stops: readonly TabStop[] | undefined, pos: number): TabStop[] {
  return cleanTabStops((stops ?? []).filter((s) => s.pos !== pos));
}

/** A position snapped to the ruler's 0.25 cm step, inside the column. */
export function snapTabPos(twips: number, width: number): number {
  const step = TWIPS_PER_CM / 4;
  return Math.min(Math.round(width), Math.max(Math.round(step), Math.round(Math.round(twips / step) * step)));
}

/** The layouts teachers build with tabs, as ready-made stops (docs/Tabs vs Word.md, phase 3). */
export type TabPreset = 'rightText' | 'answerLine' | 'nameLine';

export const TAB_PRESETS: readonly TabPreset[] = ['rightText', 'answerLine', 'nameLine'];

/**
 * A preset's stops for a column `width` twips wide. Real stops, so the teacher can still
 * move them here or in Word.
 *
 * - `rightText`: a right stop at the margin, for "(3 marks)" or a source line.
 * - `answerLine`: the same stop with an underscore leader, a line to the margin.
 * - `nameLine`: Name ____ Class ____ No. ____, the fields ending at 55 %, 80 % and the margin.
 */
export function tabPresetStops(preset: TabPreset, width: number): TabStop[] {
  const at = (fraction: number) => Math.round(width * fraction);
  switch (preset) {
    case 'rightText':
      return [{ pos: at(1), align: 'right' }];
    case 'answerLine':
      return [{ pos: at(1), align: 'right', leader: 'underscore' }];
    case 'nameLine':
      return [
        { pos: at(0.55), align: 'left', leader: 'underscore' },
        { pos: at(0.8), align: 'left', leader: 'underscore' },
        { pos: at(1), align: 'right', leader: 'underscore' },
      ];
  }
}

/** The wording a preset types into an empty field, so the tabs have something to align. */
export function tabPresetText(preset: TabPreset): BiText | undefined {
  switch (preset) {
    case 'nameLine':
      return bi('Name:\tClass:\tNo.:\t', '姓名：\t班別：\t學號：\t');
    case 'answerLine':
      return bi('\t', '\t');
    case 'rightText':
      return undefined;
  }
}

/** Does a text end in a tab, on the given side? */
export function endsWithTab(text: BiText, side: 'en' | 'zh'): boolean {
  const runs = text[side];
  return runs.length > 0 && runs[runs.length - 1].text.endsWith('\t');
}
