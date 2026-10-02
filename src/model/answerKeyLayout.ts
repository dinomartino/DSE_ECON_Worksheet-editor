import type {
  AnswerKeyLayout,
  AnswerKeyPreset,
  BiText,
  LqKeyLayout,
  McKeyLayout,
  RichText,
} from './types';

/**
 * The answer key's layout (`Worksheet.answerKeyLayout`): a preset, and the teacher's
 * changes to it. Stored as deltas against the preset; absent means Classic, today's key.
 *
 * - **Choosing a preset** sets every section layout and switch to the preset's, and keeps
 *   the title and subtitle (they are words the teacher typed, not style).
 * - **A change after it** is stored only when it differs from the preset, so "Reset to
 *   preset" is dropping the deltas, and a key set back by hand stores nothing.
 * - **Read tolerantly.** A preset or layout this build does not know (a newer build's)
 *   reads as Classic's value and is left in the stored field; a value of the wrong JS type
 *   is dropped on load. Nothing here can make a document fail to open.
 * - **A preset may fix a setting** (`ANSWER_KEY_FIXED`): a stored change to it is ignored,
 *   so no stored value can put marking notation on a Suggested answers handout.
 *
 * Presentation of the key only: no paper output reads this field.
 */

/** The switches and section layouts a preset decides. */
export interface AnswerKeySettings {
  mcLayout: McKeyLayout;
  lqLayout: LqKeyLayout;
  showLegend: boolean;
  showDisclaimer: boolean;
  showStems: boolean;
  showMcStems: boolean;
  showExplanations: boolean;
  showRationales: boolean;
  showSources: boolean;
  showPartMarks: boolean;
  schemeAsPoints: boolean;
  questionTotals: boolean;
  sectionTotals: boolean;
  paperTotal: boolean;
}

export type AnswerKeySetting = keyof AnswerKeySettings;

/** The layout as the renderer reads it: every setting decided. */
export interface ResolvedAnswerKeyLayout extends AnswerKeySettings {
  preset: AnswerKeyPreset;
  title?: BiText;
  subtitle?: BiText;
}

/** Classic: the key as it printed before layouts existed. Absent field = exactly this. */
const CLASSIC: AnswerKeySettings = {
  mcLayout: 'grid',
  lqLayout: 'compact',
  showLegend: false,
  showDisclaimer: false,
  showStems: false,
  showMcStems: false,
  showExplanations: true,
  showRationales: true,
  showSources: true,
  showPartMarks: true,
  schemeAsPoints: false,
  questionTotals: false,
  sectionTotals: false,
  paperTotal: false,
};

/**
 * Every preset's settings. **The extension point for a new whole-key style**: add its id
 * to `AnswerKeyPreset`, its settings here and in `ANSWER_KEY_FIXED`, its style in
 * `render/answerKey.ts:ANSWER_KEY_STYLES`, and its card in the Layout panel. Order is the
 * gallery's.
 */
export const ANSWER_KEY_PRESETS: Record<AnswerKeyPreset, AnswerKeySettings> = {
  classic: CLASSIC,
  /** HKEAA 評卷參考: the two-pair MC table, a Marks column, legend and disclaimer. */
  hkeaa: {
    ...CLASSIC,
    mcLayout: 'hkeaaTable',
    lqLayout: 'marksColumn',
    showLegend: true,
    showDisclaimer: true,
    showExplanations: false,
    showRationales: false,
    showSources: false,
    questionTotals: true,
  },
  /**
   * Suggested answers 參考答案, handed back to students: answers, model diagrams and the
   * marking points as plain bullets, with no marking notation. Question wording on (a
   * student needs the question to read the answer); part marks on (the paper printed
   * them, and they say how much was wanted); explanations on, option rationales off.
   */
  suggested: {
    ...CLASSIC,
    lqLayout: 'answers',
    showSources: false,
    showStems: true,
    showRationales: false,
    schemeAsPoints: true,
  },
  /**
   * Detailed table (CIE-style): long questions as Question | Answer | Marks | Guidance,
   * MC with each option's reasoning, the markers' note on, a total per question.
   */
  detailed: {
    ...CLASSIC,
    mcLayout: 'rationaleTable',
    lqLayout: 'table',
    showDisclaimer: true,
    showSources: false,
    questionTotals: true,
  },
};

/**
 * The settings a preset decides alone: its value always wins over a stored change, the
 * Layout panel hides the control, and a change to it stores nothing. Suggested answers
 * fixes everything that would put marking notation or marker-only notes on a student's
 * handout (the LQ layout, legend, disclaimer, source notes); the switches only Suggested
 * answers reads are fixed everywhere else.
 */
const ONLY_SUGGESTED: readonly AnswerKeySetting[] = ['showMcStems', 'showPartMarks', 'schemeAsPoints'];
export const ANSWER_KEY_FIXED: Record<AnswerKeyPreset, readonly AnswerKeySetting[]> = {
  classic: ONLY_SUGGESTED,
  hkeaa: ONLY_SUGGESTED,
  suggested: ['lqLayout', 'showLegend', 'showDisclaimer', 'showSources'],
  detailed: ONLY_SUGGESTED,
};

/** Whether `preset` decides `key` alone (§ `ANSWER_KEY_FIXED`). */
export function isAnswerKeySettingFixed(preset: AnswerKeyPreset, key: AnswerKeySetting): boolean {
  return ANSWER_KEY_FIXED[preset].includes(key);
}

export const ANSWER_KEY_PRESET_IDS = Object.keys(ANSWER_KEY_PRESETS) as AnswerKeyPreset[];
export const MC_KEY_LAYOUTS: readonly McKeyLayout[] = ['grid', 'hkeaaTable', 'list', 'rationaleTable'];
export const LQ_KEY_LAYOUTS: readonly LqKeyLayout[] = ['compact', 'marksColumn', 'table', 'answers'];

const SETTING_KEYS = Object.keys(CLASSIC) as AnswerKeySetting[];
const BOOLEAN_KEYS = SETTING_KEYS.filter((key) => typeof CLASSIC[key] === 'boolean');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRichText = (value: unknown): value is RichText =>
  Array.isArray(value) &&
  value.every((run) => isRecord(run) && typeof run.text === 'string');

const isBiText = (value: unknown): value is BiText =>
  isRecord(value) && isRichText(value.en) && isRichText(value.zh);

const knownPreset = (value: unknown): value is AnswerKeyPreset =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ANSWER_KEY_PRESETS, value);

/**
 * The stored field as saved, minus what cannot be read: not an object at all → nothing;
 * a switch that is not a boolean, a layout or preset that is not a string, a title that
 * is not text → that entry dropped. Unknown strings and unknown keys are kept, so a newer
 * build's choice survives this build's save. Empty → undefined.
 */
export function normalizeAnswerKeyLayout(raw: unknown): AnswerKeyLayout | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'title' || key === 'subtitle') {
      if (isBiText(value)) out[key] = value;
    } else if (key === 'preset' || key === 'mcLayout' || key === 'lqLayout') {
      if (typeof value === 'string') out[key] = value;
    } else if ((BOOLEAN_KEYS as string[]).includes(key)) {
      if (typeof value === 'boolean') out[key] = value;
    } else {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? (out as AnswerKeyLayout) : undefined;
}

/** The preset a stored layout names, Classic when it names none this build knows. */
export function answerKeyPreset(stored: AnswerKeyLayout | undefined): AnswerKeyPreset {
  return knownPreset(stored?.preset) ? stored.preset : 'classic';
}

/** Every setting decided: the preset's, overlaid with the teacher's valid changes. */
export function resolveAnswerKeyLayout(stored: AnswerKeyLayout | undefined): ResolvedAnswerKeyLayout {
  const preset = answerKeyPreset(stored);
  const settings: AnswerKeySettings = { ...ANSWER_KEY_PRESETS[preset] };
  const raw = (isRecord(stored) ? stored : {}) as Record<string, unknown>;
  const open = (key: AnswerKeySetting) => !isAnswerKeySettingFixed(preset, key);
  if (open('mcLayout') && (MC_KEY_LAYOUTS as readonly unknown[]).includes(raw.mcLayout)) {
    settings.mcLayout = raw.mcLayout as McKeyLayout;
  }
  if (open('lqLayout') && (LQ_KEY_LAYOUTS as readonly unknown[]).includes(raw.lqLayout)) {
    settings.lqLayout = raw.lqLayout as LqKeyLayout;
  }
  for (const key of BOOLEAN_KEYS) {
    if (open(key) && typeof raw[key] === 'boolean') {
      (settings as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
  return {
    preset,
    ...settings,
    ...(isBiText(raw.title) ? { title: raw.title } : {}),
    ...(isBiText(raw.subtitle) ? { subtitle: raw.subtitle } : {}),
  };
}

/** `stored` with nothing in it → undefined, so the document carries no empty field. */
function compact(stored: Record<string, unknown>): AnswerKeyLayout | undefined {
  const out = Object.fromEntries(Object.entries(stored).filter(([, value]) => value !== undefined));
  if (out.preset === 'classic') delete out.preset;
  return Object.keys(out).length > 0 ? (out as AnswerKeyLayout) : undefined;
}

/** The setting keys a layout stores (its deltas); unknown keys are not deltas. */
const deltaKeys = (stored: AnswerKeyLayout | undefined): AnswerKeySetting[] =>
  SETTING_KEYS.filter((key) => stored?.[key] !== undefined);

/** Choose a preset: its settings replace every delta; the title and subtitle stay. */
export function withAnswerKeyPreset(
  stored: AnswerKeyLayout | undefined,
  preset: AnswerKeyPreset,
): AnswerKeyLayout | undefined {
  const rest = { ...(stored ?? {}) } as Record<string, unknown>;
  for (const key of SETTING_KEYS) delete rest[key];
  return compact({ ...rest, preset });
}

/**
 * Change one setting. Equal to the preset's value, or a setting the preset fixes
 * (§ `ANSWER_KEY_FIXED`) → the delta is dropped.
 */
export function withAnswerKeySetting<K extends AnswerKeySetting>(
  stored: AnswerKeyLayout | undefined,
  key: K,
  value: AnswerKeySettings[K],
): AnswerKeyLayout | undefined {
  const id = answerKeyPreset(stored);
  const preset = ANSWER_KEY_PRESETS[id];
  const next = { ...(stored ?? {}) } as Record<string, unknown>;
  if (preset[key] === value || isAnswerKeySettingFixed(id, key)) delete next[key];
  else next[key] = value;
  return compact(next);
}

/** "Reset to preset": every delta dropped, the preset, title and subtitle kept. */
export function resetAnswerKeyLayout(stored: AnswerKeyLayout | undefined): AnswerKeyLayout | undefined {
  return stored?.preset !== undefined
    ? withAnswerKeyPreset(stored, stored.preset)
    : withAnswerKeyPreset(stored, 'classic');
}

/** Whether the teacher changed anything from the preset ("Reset to preset" enabled). */
export function hasAnswerKeyChanges(stored: AnswerKeyLayout | undefined): boolean {
  const id = answerKeyPreset(stored);
  const preset = ANSWER_KEY_PRESETS[id];
  return deltaKeys(stored).some((key) => !isAnswerKeySettingFixed(id, key) && stored?.[key] !== preset[key]);
}

/** Set or clear the title or subtitle override (an empty title stores nothing). */
export function withAnswerKeyText(
  stored: AnswerKeyLayout | undefined,
  field: 'title' | 'subtitle',
  text: BiText | undefined,
): AnswerKeyLayout | undefined {
  const next = { ...(stored ?? {}) } as Record<string, unknown>;
  if (text === undefined) delete next[field];
  else next[field] = text;
  return compact(next);
}

/** `worksheet` carrying `layout`, the field removed when there is none (stores nothing). */
export function withAnswerKeyLayout<T extends { answerKeyLayout?: AnswerKeyLayout }>(
  worksheet: T,
  layout: AnswerKeyLayout | undefined,
): T {
  const { answerKeyLayout: _previous, ...rest } = worksheet;
  void _previous;
  return (layout ? { ...rest, answerKeyLayout: layout } : rest) as T;
}
