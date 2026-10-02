'use client';

import {
  ANSWER_KEY_PRESET_IDS,
  hasAnswerKeyChanges,
  isAnswerKeySettingFixed,
  resetAnswerKeyLayout,
  resolveAnswerKeyLayout,
  withAnswerKeyPreset,
  withAnswerKeySetting,
  withAnswerKeyText,
  type AnswerKeySetting,
} from '@/model/answerKeyLayout';
import type { AnswerKeyPreset, LqKeyLayout, McKeyLayout } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, GroupHeader, Segmented } from '@/components/ui';
import type { TextKey } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { AnswerKeySketch } from './AnswerKeySketch';
import { ANSWER_KEY_LAYOUT_MESSAGES } from './AnswerKeyLayoutPanel.messages';

/**
 * The Marking scheme view's **Layout 版面** tab: how the answer key is laid out, saved
 * with the paper (`Worksheet.answerKeyLayout`). A style first, then the two section
 * layouts and the switches; every change is one undoable commit through the store.
 *
 * An inspector, not a second page: it never shows the key's words. The title and
 * subtitle are typed where they print.
 */

type M = typeof ANSWER_KEY_LAYOUT_MESSAGES;

/** Each style's card. A new preset adds its words here and its sketch in `AnswerKeySketch`. */
const PRESET_WORDS: Record<AnswerKeyPreset, { name: TextKey<M>; about: TextKey<M> }> = {
  classic: { name: 'classic', about: 'classicHint' },
  hkeaa: { name: 'hkeaa', about: 'hkeaaHint' },
  suggested: { name: 'suggested', about: 'suggestedHint' },
  detailed: { name: 'detailed', about: 'detailedHint' },
};

const MC_OPTIONS: Array<{ value: McKeyLayout; name: TextKey<M>; tip: TextKey<M> }> = [
  { value: 'grid', name: 'mcGrid', tip: 'mcGridTitle' },
  { value: 'hkeaaTable', name: 'mcTable', tip: 'mcTableTitle' },
  { value: 'list', name: 'mcList', tip: 'mcListTitle' },
  { value: 'rationaleTable', name: 'mcReasons', tip: 'mcReasonsTitle' },
];

/** `answers` is not offered: it is Suggested answers' own, and that preset fixes it. */
const LQ_OPTIONS: Array<{ value: LqKeyLayout; name: TextKey<M>; tip: TextKey<M> }> = [
  { value: 'compact', name: 'lqCompact', tip: 'lqCompactTitle' },
  { value: 'marksColumn', name: 'lqColumn', tip: 'lqColumnTitle' },
  { value: 'table', name: 'lqTable', tip: 'lqTableTitle' },
];

/** The switches, in order; a preset that fixes one hides it (`ANSWER_KEY_FIXED`). */
const SHOW: Array<{ key: AnswerKeySetting; name: TextKey<M> }> = [
  { key: 'showDisclaimer', name: 'disclaimer' },
  { key: 'showLegend', name: 'legend' },
  { key: 'showStems', name: 'stems' },
  { key: 'showExplanations', name: 'explanations' },
  { key: 'showRationales', name: 'rationales' },
  { key: 'showSources', name: 'sources' },
  { key: 'showPartMarks', name: 'partMarks' },
  { key: 'schemeAsPoints', name: 'schemeAsPoints' },
];

const TOTALS: Array<{ key: AnswerKeySetting; name: TextKey<M> }> = [
  { key: 'questionTotals', name: 'questionTotals' },
  { key: 'sectionTotals', name: 'sectionTotals' },
  { key: 'paperTotal', name: 'paperTotal' },
];

export function AnswerKeyLayoutPanel() {
  const stored = useWorksheetStore((s) => s.worksheet.answerKeyLayout);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const update = useWorksheetStore((s) => s.updateAnswerKeyLayout);
  const m = useMessages(ANSWER_KEY_LAYOUT_MESSAGES);
  const layout = resolveAnswerKeyLayout(stored);
  // A preset this build does not know (a newer build's) prints as Classic: say so.
  const foreign = typeof stored?.preset === 'string' && stored.preset !== layout.preset;

  const set = <K extends AnswerKeySetting>(key: K, value: (typeof layout)[K]) =>
    update((current) => withAnswerKeySetting(current, key, value));
  const open = (key: AnswerKeySetting) => !isAnswerKeySettingFixed(layout.preset, key);
  // The MC wording prints only in the list, so with it on the list is the layout.
  const mcAsList = open('showMcStems') && layout.showMcStems;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-5 px-4 py-4">
        <section className="flex flex-col gap-2.5">
          <GroupHeader title={m.style} hint={m.styleHint} />
          <div role="radiogroup" aria-label={m.style} className="grid grid-cols-2 gap-3">
            {ANSWER_KEY_PRESET_IDS.map((preset) => {
              const selected = !foreign && layout.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={readOnly}
                  onClick={() => update((current) => withAnswerKeyPreset(current, preset))}
                  className="group flex min-w-0 cursor-pointer flex-col text-left focus-visible:outline-none disabled:cursor-not-allowed"
                >
                  <span
                    className={`relative flex justify-center rounded-lg border px-[18%] py-2.5 transition-colors duration-150 ease-out-soft group-focus-visible:ring-2 group-focus-visible:ring-accent ${
                      selected
                        ? 'border-accent bg-accent/5'
                        : 'border-line bg-surface-sunken group-hover:bg-surface-hover'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute -inset-px rounded-lg ring-1 ring-accent transition-opacity duration-150 ease-out-soft ${
                        selected ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                    <span className="block w-full overflow-hidden rounded-[2px] shadow-[0_1px_2px_rgba(0,0,0,0.16),0_3px_8px_rgba(0,0,0,0.10)] ring-1 ring-black/5 transition-transform duration-[180ms] ease-out-soft group-active:scale-[0.985] group-active:duration-100">
                      <AnswerKeySketch preset={preset} />
                    </span>
                  </span>
                  <span
                    className={`mt-1.5 block text-[12px] font-medium leading-snug transition-colors duration-150 ease-out-soft ${
                      selected ? 'text-accent-ink' : 'text-ink group-hover:text-accent-ink'
                    }`}
                  >
                    {m[PRESET_WORDS[preset].name]}
                  </span>
                </button>
              );
            })}
          </div>
          <p key={layout.preset} className="animate-fade-in text-[11px] leading-snug text-ink-muted">
            {foreign ? m.newerStyle : m[PRESET_WORDS[layout.preset].about]}
          </p>
        </section>

        <section className="flex flex-col gap-1">
          <GroupHeader title={m.mcAnswers} />
          <Segmented
            label={m.mcAnswers}
            value={mcAsList ? 'list' : layout.mcLayout}
            onChange={(value) => set('mcLayout', value)}
            options={MC_OPTIONS.map((option) => ({
              value: option.value,
              label: m[option.name],
              title: m[option.tip],
              disabled: readOnly || mcAsList,
            }))}
          />
          {open('showMcStems') && (
            <div className="mt-1.5 flex flex-col gap-1">
              <CheckField
                label={m.mcStems}
                checked={layout.showMcStems}
                onChange={(on) => set('showMcStems', on)}
              />
              {mcAsList && <p className="text-[11px] leading-snug text-ink-subtle">{m.mcStemsHint}</p>}
            </div>
          )}
        </section>

        {open('lqLayout') && (
          <section className="flex flex-col gap-1">
            <GroupHeader title={m.longQuestions} />
            <Segmented
              label={m.longQuestions}
              value={layout.lqLayout}
              onChange={(value) => set('lqLayout', value)}
              options={LQ_OPTIONS.map((option) => ({
                value: option.value,
                label: m[option.name],
                title: m[option.tip],
                disabled: readOnly,
              }))}
            />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <GroupHeader title={m.show} />
          <CheckField
            label={m.subtitle}
            checked={layout.subtitle !== undefined}
            onChange={(on) =>
              update((current) => withAnswerKeyText(current, 'subtitle', on ? { en: [], zh: [] } : undefined))
            }
          />
          {SHOW.filter(({ key }) => open(key)).map(({ key, name }) => (
            <CheckField
              key={key}
              label={m[name]}
              checked={layout[key] as boolean}
              onChange={(on) => set(key, on)}
            />
          ))}
          <p className="text-[11px] leading-snug text-ink-subtle">
            {m.textHint} {layout.showStems && !open('showMcStems') && m.stemsHint}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <GroupHeader title={m.totals} />
          {TOTALS.map(({ key, name }) => (
            <CheckField
              key={key}
              label={m[name]}
              checked={layout[key] as boolean}
              onChange={(on) => set(key, on)}
            />
          ))}
        </section>

        <div>
          <Button
            variant="default"
            size="sm"
            title={m.resetTitle}
            disabled={readOnly || !hasAnswerKeyChanges(stored)}
            onClick={() => update((current) => resetAnswerKeyLayout(current))}
          >
            {m.reset}
          </Button>
        </div>
      </div>
    </div>
  );
}
