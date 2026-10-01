'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogTabs, Field } from '@/components/ui/Dialog';
import { Button, CheckField, GroupHeader, NumberField, Segmented, SelectField } from '@/components/ui';
import {
  assessmentTitleBlock,
  createFillInField,
  createTotalMarksField,
  duplicateComputedFields,
  HEADER_FOOTER_PRESETS,
} from '@/model/bands';
import { FONT_PRESETS } from '@/model/factories';
import {
  bandsHeight,
  bandsOverflow,
  cmToTwips,
  defaultFooter,
  defaultHeader,
  firstPageHeaderFooter,
  firstPageModeOf,
  type FirstPageMode,
  headerFooterOf,
  MARGIN_PRESETS,
  PAPER_SIZES,
  pageSetupOf,
  twipsToCm,
} from '@/model/page';
import { isQabDocument } from '@/model/pageFurniture';
import { documentShape } from '@/model/documentShape';
import { listQuestionTypes, requireQuestionType } from '@/registry';
import { bi, emptyBiText, plain } from '@/model/text';
import { academicYear, type CoverPaperStyle } from '@/model/cover';
import {
  MAX_VERSIONS,
  newVersionSeed,
  versionCount,
  versionLetter,
  versionLetters,
} from '@/model/versions';
import { chromeLabel, targetOf } from '@/model/paperSummary';
import { cleanClasses, commitClassInput, isIsoDate } from '@/model/classes';
import { cohortLabel } from '@/library/cohort';
import { paperClasses } from '@/library/tabFilters';
import type { Band, HeaderFooter, LanguageMode, PageMargins, PaperSize, PaperTarget } from '@/model/types';
import type { AnyQuestionTypeDefinition } from '@/registry/types';
import { useWorksheetStore, type BandScope } from '@/store/worksheetStore';
import { BandPreview, BandPresetCard } from './BandPreview';
import { BiTextField } from './BiTextField';
import { CloseIcon } from '@/components/ui/icons';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { DOCUMENT_SETTINGS_MESSAGES, MARGIN_PRESET_KEYS } from './DocumentSettings.messages';
import type { Messages as MessagesOf } from '@/i18n/catalogue';
import type { UiLanguage } from '@/settings/language';

/**
 * Everything decided once per document, in one dialog.
 *
 * These controls — title, fonts, paper, margins, header, footer, the title block —
 * used to live as two collapsed accordions at the top of the right sidebar. That put
 * the rarest decisions in the most valuable space: they occupied the top third of the
 * work column permanently, and expanded they were tall enough to push the question
 * editor off the bottom of the screen, which is what the `max-h-[50%]` cap in the old
 * `Sidebar` was fighting.
 *
 * Nothing here was removed — every control the two panels had is below, given a real
 * label and a line of explanation instead of a 10px uppercase eyebrow. The rule that
 * decides what belongs here rather than on the page is unchanged (§ "the preview is
 * the editor"): header *text* is typed on the page, while whether the header exists at
 * all has no visual representation there and so lives in a panel.
 */

/** `furniture` is the header & footer tab, which also holds page 1's title. */
type Tab = 'document' | 'page' | 'furniture' | 'cover';

/** Top/bottom before left/right — the order Word and every print dialog state them in. */
const MARGIN_EDGES: Array<{
  key: keyof PageMargins;
  label: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight';
}> = [
  { key: 'top', label: 'marginTop' }, // i18n-ignore: catalogue key
  { key: 'bottom', label: 'marginBottom' }, // i18n-ignore: catalogue key
  { key: 'left', label: 'marginLeft' }, // i18n-ignore: catalogue key
  { key: 'right', label: 'marginRight' }, // i18n-ignore: catalogue key
];

/**
 * One margin edge, typed in centimetres but stored in twips.
 *
 * Centimetres because that is the unit teachers get from a school template and the one
 * the presets are labelled in; twips because that is what `w:pgMar` takes and what the
 * preview converts from, so no rounding happens between the two views (§7.1).
 *
 * A local draft string rather than a controlled number: typing "1." is a valid step
 * toward 1.5, and re-deriving the field's text from the stored twips on every keystroke
 * would delete the decimal point as soon as it was typed.
 */
function CmField({
  label,
  twips,
  onChange,
}: {
  label: string;
  twips: number;
  onChange: (twips: number) => void;
}) {
  const asText = (value: number) => twipsToCm(value).toFixed(2).replace(/\.?0+$/, '');
  const [draft, setDraft] = useState<string | undefined>();

  const commit = (raw: string) => {
    setDraft(undefined);
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return; // Empty or nonsense reverts to the stored value.
    onChange(cmToTwips(Math.min(5, Math.max(0, parsed))));
  };

  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-muted">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        min={0}
        max={5}
        value={draft ?? asText(twips)}
        className="h-9 w-20 rounded-lg border border-line bg-surface px-2.5 text-[13px] tabular-nums text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => setDraft(event.target.value)}
        // Commit on blur and on Enter rather than per keystroke, so one edit is one undo
        // entry instead of one per digit.
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit((event.target as HTMLInputElement).value);
        }}
      />
      <span className="text-ink-subtle">cm</span>
    </label>
  );
}

/** Worksheet identity: what the document is called and what it is set in. */
function DocumentTab() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);

  const fontIndex = FONT_PRESETS.findIndex(
    (preset) =>
      preset.latin === worksheet.fonts.latin && preset.eastAsia === worksheet.fonts.eastAsia,
  );
  const usingTitleBlock = (worksheet.bands ?? []).length > 0;

  return (
    <div className="space-y-5">
      {/* The hint changes when a title block is in use, because the field's effect
          changes: the bands replace the plain title on the page, so a teacher typing
          here and seeing nothing move is looking at a control that genuinely is not
          doing what its label promises. Saying so beats leaving them to work it out. */}
      {/* Since renaming writes `worksheet.name`, this field is now only ever about what
          *prints*. The old hint said "Used for the file name", which stopped being true
          the moment the two separated — and a hint that describes a effect the field no
          longer has is worse than none. */}
      <Field
        label={m.title}
        hint={usingTitleBlock ? m.titleHintBlock : m.titleHint}
      >
        <BiTextField
          translate={{ kind: 'title' }}
          ariaLabel={m.titleAria}
          value={worksheet.title}
          rows={1}
          onChange={(title) => updateWorksheet({ title })}
        />
      </Field>

      {/* On a paper with a cover the rubric belongs *there* — the cover's numbered
          instructions are what a candidate reads, and a line here prints a second time
          directly under it. Kept editable (a teacher may still want a body note) but
          the hint says where the real instructions live rather than suggesting wording
          the cover already carries. */}
      <Field
        label={m.instructions}
        hint={worksheet.cover ? m.instructionsHintCover : m.instructionsHint}
      >
        <BiTextField
          translate={{ kind: 'instructions' }}
          ariaLabel={m.instructions}
          value={worksheet.instructions ?? emptyBiText()}
          rows={2}
          onChange={(instructions) => updateWorksheet({ instructions })}
        />
      </Field>

      <Field label={m.fonts} hint={m.fontsHint}>
        <SelectField<number>
          value={fontIndex >= 0 ? fontIndex : -1}
          options={[
            ...(fontIndex < 0 ? [{ value: -1, label: m.custom }] : []),
            ...FONT_PRESETS.map((preset, index) => ({ value: index, label: preset.label })),
          ]}
          onChange={(index) => {
            const preset = FONT_PRESETS[index];
            if (preset) {
              updateWorksheet({ fonts: { latin: preset.latin, eastAsia: preset.eastAsia } });
            }
          }}
        />
      </Field>

      <VersionsField />

      <TargetField />

      <BankField />

      {/* Section headings are typed on the page, not here.
          A section is a heading in the flow now, so it has a visual representation to
          click — which is the rule for what belongs on the paper rather than in a panel
          (§"the preview is the editor"). This list edited headings by index while the
          page showed them in place, giving two ways to change one thing. */}
    </div>
  );
}

/**
 * Shuffled paper versions: how many, a new shuffle, and which one the page shows.
 * Version A is the authored order; only the count and seed are stored.
 */
function VersionsField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const variant = useWorksheetStore((s) => s.mode.variant);
  const setMode = useWorksheetStore((s) => s.setMode);
  const count = versionCount(worksheet);
  const letters = versionLetters(worksheet);
  const shown = variant && letters.includes(variant) ? variant : 'A';

  const setCount = (next: number) => {
    if (next < 2) {
      updateWorksheet({ versions: undefined });
      setMode({ variant: undefined });
      return;
    }
    updateWorksheet({ versions: { count: next, seed: worksheet.versions?.seed ?? newVersionSeed() } });
    if (letters.indexOf(shown) >= next) setMode({ variant: undefined });
  };

  return (
    <Field
      label={m.versions}
      hint={m.versionsHint}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<string>
          label={m.versionsCount}
          value={String(count)}
          onChange={(value) => setCount(Number(value))}
          options={Array.from({ length: MAX_VERSIONS }, (_, index) => ({
            value: String(index + 1),
            label: index === 0 ? m.versionsOff : String(index + 1),
            title: index === 0 ? m.versionsOne : m.versionsRange(versionLetter(index)),
          }))}
        />
        {letters.length > 0 && (
          <>
            <Button
              size="sm"
              variant="subtle"
              title={m.reshuffleTitle}
              onClick={() =>
                updateWorksheet({
                  versions: { count, seed: newVersionSeed(worksheet.versions?.seed) },
                })
              }
            >
              {m.reshuffle}
            </Button>
            <span className="flex items-center gap-2 text-[11px] text-ink-muted">
              {m.pageShows}
              <Segmented<string>
                label={m.versionShown}
                value={shown}
                onChange={(letter) => setMode({ variant: letter === 'A' ? undefined : letter })}
                options={letters.map((letter) => ({ value: letter, label: letter }))}
              />
            </span>
          </>
        )}
      </div>
    </Field>
  );
}

/** The registry's short name ("MCQ", "LQ", as the bank says it), in the chrome's language. */
function typeLabel(definition: AnyQuestionTypeDefinition, language: LanguageMode): string {
  const zh = language === 'zh';
  const summary = definition.summary;
  const named = summary?.short ?? summary?.label;
  const label = named
    ? chromeLabel(named, zh)
    : plain(zh ? definition.displayName.zh : definition.displayName.en);
  // Beside "Marks" and "Time", so capitalised.
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Who sat this paper and when (`model/classes.ts`), for the question bank's "used with".
 * No classes = a draft the bank never counts as a use. Each class is a chip: Enter, a
 * comma or leaving the box commits what is typed (`commitClassInput`), Backspace in an
 * empty box takes the last one off.
 */
function BankField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const lang = useUiLanguage();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const [draft, setDraft] = useState('');
  const stored = cleanClasses(worksheet.classes) ?? [];
  const refs = paperClasses(worksheet);
  const cohorts = [...new Set(refs.flatMap((ref) => (ref.cohort !== undefined ? [cohortLabel(ref.cohort)] : [])))];
  const satOn = isIsoDate(worksheet.satOn) ? worksheet.satOn : '';
  const saveClasses = (next: string[]) => {
    if (next.join('\u0000') !== stored.join('\u0000')) updateWorksheet({ classes: next.length > 0 ? next : undefined });
  };
  const commit = (typed: string, final: boolean) => {
    const { classes, rest } = commitClassInput(stored, typed, final);
    saveClasses(classes);
    setDraft(rest);
  };
  const status =
    refs.length === 0
      ? m.classesNone
      : [cohorts.length > 0 ? m.yearGroup(cohorts.join(', ')) : undefined, satOn ? undefined : m.noDate(formatDay(worksheet.createdAt, lang))]
          .filter(Boolean)
          .join(' · ');
  return (
    <Field
      label={m.classes}
      hint={m.classesHint}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-h-8 w-64 flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 transition-colors duration-150 ease-out-soft focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
            {stored.map((name, index) => (
              <span key={`${name}-${index}`} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-surface-sunken pl-1.5 text-xs text-ink">
                {name}
                <button
                  type="button"
                  aria-label={m.removeClass(name)}
                  onClick={() => saveClasses(stored.filter((_, at) => at !== index))}
                  className="flex h-6 w-5 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 ease-out-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <CloseIcon size={10} />
                </button>
              </span>
            ))}
            <input
              type="text"
              aria-label={m.classesAria}
              value={draft}
              placeholder={stored.length === 0 ? m.classesExample : m.addClass}
              onChange={(event) => commit(event.target.value, false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit(draft, true);
                } else if (event.key === 'Backspace' && draft === '' && stored.length > 0) {
                  event.preventDefault();
                  saveClasses(stored.slice(0, -1));
                }
              }}
              onBlur={() => commit(draft, true)}
              className="h-6 min-w-[4.5rem] flex-1 bg-transparent px-1 text-xs text-ink outline-none placeholder:text-ink-subtle"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            {m.satOn}
            <input
              type="date"
              aria-label={m.satOn}
              value={satOn}
              onChange={(event) => updateWorksheet({ satOn: isIsoDate(event.target.value) ? event.target.value : undefined })}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </label>
        </div>
        {status && <p className="text-[11px] text-ink-subtle">{status}</p>}
        <CheckField
          label={m.hideFromBank}
          checked={Boolean(worksheet.bankHidden)}
          onChange={(hidden) => updateWorksheet({ bankHidden: hidden || undefined })}
        />
      </div>
    </Field>
  );
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DAY_ZH = new Intl.DateTimeFormat('zh-HK', { day: 'numeric', month: 'short', year: 'numeric' });

/** "3 Nov 2025" for an ISO date or timestamp; the raw text if it will not parse. */
function formatDay(iso: string, lang: UiLanguage): string {
  const when = Date.parse(iso);
  return Number.isNaN(when) ? iso : (lang === 'zh-HK' ? DAY_ZH : DAY).format(when);
}

/**
 * The paper's blueprint: marks, minutes and items per type, each optional. The toolbar
 * summary shows progress against it and the paper check lists a miss. Emptying every
 * box removes the target, so an untouched document never carries one.
 */
function TargetField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const docLanguage = useWorksheetStore((s) => s.mode.language);
  // Chinese chrome names the types in Chinese whatever the paper is written in.
  const language: LanguageMode = useUiLanguage() === 'zh-HK' ? 'zh' : docLanguage;
  const target = worksheet.target ?? {};
  const set = (patch: PaperTarget) => {
    const next = { ...target, ...patch };
    updateWorksheet({ target: targetOf({ target: next }) });
  };
  const setCount = (typeId: string, value: number | undefined) =>
    set({ counts: { ...(target.counts ?? {}), [typeId]: value as number } });

  return (
    <Field
      label={m.target}
      hint={m.targetHint}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {listQuestionTypes().map((definition) => (
          <NumberField
            key={definition.id}
            clearable
            label={typeLabel(definition, language)}
            value={target.counts?.[definition.id]}
            placeholder="–"
            onChange={(value) => setCount(definition.id, value)}
          />
        ))}
        <NumberField
          clearable
          label={m.targetMarks}
          value={target.marks}
          placeholder="–"
          onChange={(marks) => set({ marks })}
        />
        <NumberField
          clearable
          label={m.targetTime}
          suffix={m.targetMinutes}
          value={target.minutes}
          placeholder="–"
          onChange={(minutes) => set({ minutes })}
        />
      </div>
    </Field>
  );
}

/** Paper geometry: size, orientation, margins. */
function PageTab() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setPageSetup = useWorksheetStore((s) => s.setPageSetup);
  const setExamGapLines = useWorksheetStore((s) => s.setExamGapLines);
  const setup = pageSetupOf(worksheet);
  const shape = documentShape(worksheet);

  // Whether the custom-margin fields are open. Sticky rather than derived purely from
  // "the numbers match no preset", so choosing Custom keeps the fields up even while the
  // current values still happen to equal a preset — otherwise selecting Custom on a
  // default document would show nothing to edit.
  const [customOpen, setCustomOpen] = useState(false);

  // Which preset the current margins match, so switching away and back is lossless.
  const presetIndex = MARGIN_PRESETS.findIndex(
    (preset) =>
      preset.margins.top === setup.margins.top &&
      preset.margins.right === setup.margins.right &&
      preset.margins.bottom === setup.margins.bottom &&
      preset.margins.left === setup.margins.left,
  );

  return (
    <div className="space-y-5">
      {/* Paper size is fixed for the booklet, for the same reason its margins are: the
          furniture geometry and the lines-per-page were measured against an A4 column,
          so another size moves the frame off the text and re-cuts every answer page. */}
      {shape === 'lqMock' ? (
        <Field label={m.paperSize} hint={m.fixedByBooklet}>
          <span className="block text-xs text-ink-muted">
            {m.paperSizeBooklet(PAPER_SIZES[setup.paper].label)}
          </span>
        </Field>
      ) : (
        <Field label={m.paperSize} hint={m.paperSizeHint}>
          <SelectField<PaperSize>
            value={setup.paper}
            options={Object.entries(PAPER_SIZES).map(([value, info]) => ({
              value: value as PaperSize,
              label: info.label,
            }))}
            onChange={(paper) => setPageSetup({ paper })}
          />
        </Field>
      )}

      {/* Portrait only. Shown rather than hidden so the page setup still reads as
          complete — a missing row invites "where did orientation go?" — but stated as
          a fact instead of a one-option `<select>`, which looks interactive and does
          nothing when clicked. The model keeps `Orientation` as a two-value union and
          the exporter still writes `w:orient`, so restoring the choice is one edit
          here. */}
      <Field label={m.orientation} hint={m.orientationHint}>
        <span className="block text-xs text-ink-muted">{m.portrait}</span>
      </Field>

      {/* The booklet's margins are measured, not chosen.
          Its page furniture — the frame and the two rotated margin notes — is positioned
          against the reference's own column, and its lines-per-page were counted in it,
          so a changed margin moves the frame away from the text it frames and re-cuts
          every answer page. Stated rather than offered-and-ignored (§ `documentShape`:
          withhold, and say why). */}
      {shape === 'lqMock' ? (
        <Field label={m.margins} hint={m.fixedByBooklet}>
          <span className="block text-xs text-ink-muted">{m.marginsBooklet}</span>
        </Field>
      ) : shape === 'paper1' ? (
        <Field label={m.margins} hint={m.fixedByPaper}>
          <span className="block text-xs text-ink-muted">{m.marginsPaper1}</span>
        </Field>
      ) : (
        <>
      {/* Margins: a preset, or Custom to type all four edges.
          "Custom" is a real, selectable option rather than a label that only appeared
          once the numbers happened not to match a preset — previously there was no way
          to *reach* custom margins from this panel at all. Choosing it keeps the current
          numbers as the starting point, so it opens the fields rather than resetting. */}
      <Field label={m.margins} hint={m.marginsHint}>
        <SelectField<number>
          value={customOpen || presetIndex < 0 ? -1 : presetIndex}
          options={[
            ...MARGIN_PRESETS.map((preset, index) => ({
              value: index,
              label: MARGIN_PRESET_KEYS[index] ? m[MARGIN_PRESET_KEYS[index]] : preset.label,
            })),
            { value: -1, label: m.customEllipsis },
          ]}
          onChange={(index) => {
            const preset = MARGIN_PRESETS[index];
            if (preset) {
              setCustomOpen(false);
              setPageSetup({ margins: { ...preset.margins } });
              return;
            }
            // Custom: reveal the fields, leaving the current geometry in place.
            setCustomOpen(true);
          }}
        />
      </Field>

      {(customOpen || presetIndex < 0) && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-sunken p-3.5">
          <div className="grid grid-cols-2 gap-3">
            {MARGIN_EDGES.map(({ key, label }) => (
              <CmField
                key={key}
                label={m[label]}
                twips={setup.margins[key]}
                onChange={(next) => setPageSetup({ margins: { ...setup.margins, [key]: next } })}
              />
            ))}
          </div>
          {/* Word's own floor. Below this most printers clip, so the page would not
              print as previewed — the input clamps rather than warning after the fact. */}
          <p className="text-[11px] text-ink-subtle">{m.marginsRange}</p>
        </div>
      )}
        </>
      )}

      {/* The exam paper's between-question air, in blank lines on the fixed 12pt grid.
          The default is the question type's own measured number (§ `examGapLines`), so
          "Default" is stored as absence and keeps tracking it; a chosen number is the
          document's own (§ `Worksheet.examGapLines`). Offered only on the MCQ paper —
          the wide boundary exists nowhere else (§ `boundaryGapLines`). */}
      {shape === 'paper1' && (
        <Field
          label={m.betweenQuestions}
          hint={m.betweenQuestionsHint}
        >
          <SelectField<number>
            value={worksheet.examGapLines ?? 0}
            options={[
              {
                value: 0,
                label: m.gapDefault(
                  // Read off the paper's own questions rather than naming a type:
                  // whatever kind this paper holds states its own measured gap.
                  (worksheet.questions[0]
                    ? requireQuestionType(worksheet.questions[0]).examGapLines
                    : undefined) ?? 3,
                ),
              },
              ...[1, 2, 3, 4, 5, 6].map((lines) => ({
                value: lines,
                label: m.gapLines(lines),
              })),
            ]}
            onChange={(lines) => setExamGapLines(lines === 0 ? undefined : lines)}
          />
        </Field>
      )}
    </div>
  );
}

/**
 * Says when the same computed field prints twice.
 *
 * The header presets and the title block each carry a marks total, so choosing both —
 * which a teacher reasonably might, since one is "the top of every page" and the other
 * is "the cover" — prints "Full marks: 45" twice with nothing explaining why. The number
 * is derived, so this is never intentional; it is also invisible in this dialog, which
 * shows the two lists in separate sections.
 *
 * A notice rather than an automatic fix: which copy to drop depends on the paper.
 */
function DuplicateFieldNotice() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const header = headerFooterOf(worksheet.header, defaultHeader);
  const footer = headerFooterOf(worksheet.footer, defaultFooter);

  const duplicates = duplicateComputedFields([
    worksheet.bands,
    header.enabled ? header.bands : undefined,
    header.enabled ? header.firstPage?.bands : undefined,
    footer.enabled ? footer.bands : undefined,
    footer.enabled ? footer.firstPage?.bands : undefined,
  ]);

  if (duplicates.length === 0) return null;

  return (
    <p className="rounded-lg bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
      <span className="font-medium">{m.dupTitle}</span> {m.dupBody}
    </p>
  );
}

/**
 * Says when a header/footer is too tall for the margin it lives in.
 *
 * A header sits in the top margin and only displaces body text once it runs past it
 * (§ `headerFooterOffsets`). When that does happen the questions really are pushed down
 * the page, and the cause — five rows in a 2.54 cm margin — is not visible from looking
 * at the page, because the symptom appears at the *bottom* of the sheet as content that
 * no longer fits.
 *
 * Reported rather than fixed: widening the margin and dropping a row are both reasonable,
 * and silently doing either would change a printed page the teacher had settled on.
 */
function BandOverflowNotice() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setup = pageSetupOf(worksheet);
  const header = headerFooterOf(worksheet.header, defaultHeader);
  const footer = headerFooterOf(worksheet.footer, defaultFooter);

  const tallest = (value: HeaderFooter) =>
    value.enabled
      ? Math.max(
          bandsHeight(value.bands ?? [], value.rule),
          bandsHeight(firstPageHeaderFooter(value).bands, value.rule),
        )
      : 0;

  const over = bandsOverflow(setup.margins, tallest(header), tallest(footer));
  const edges = [
    ...(over.header > 0 ? (['header'] as const) : []),
    ...(over.footer > 0 ? (['footer'] as const) : []),
  ];
  if (edges.length === 0) return null;

  const worst = Math.max(over.header, over.footer);
  const cm = (twipsToCm(worst) + 0.05).toFixed(1);

  return (
    <p className="rounded-lg bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
      <span className="font-medium">{m.overTitle(edges.includes('header'), edges.includes('footer'))}</span>{' '}
      {m.overBody(cm, edges[0] === 'header')}
    </p>
  );
}

type Messages = MessagesOf<typeof DOCUMENT_SETTINGS_MESSAGES>;

/** A header/footer preset's name in the interface language; an unknown id keeps its own. */
function presetName(m: Messages, preset: { id: string; name: string }): string {
  switch (preset.id) {
    case 'running-title':
    case 'paper-line':
      return m.presetRunningTitle;
    case 'exam':
      return m.presetExam;
    case 'title-only':
      return m.presetTitleOnly;
    case 'publisher':
      return m.presetPublisher;
    default:
      return preset.name;
  }
}

/**
 * One editable row list: page 1's own, or the running rows (`scope`).
 *
 * Text is typed on the page; this surface keeps what has no place there: the rule, a
 * new row, clearing, and the presets.
 */
function BandSurface({
  which,
  scope,
  bands,
  rule,
  onRule,
}: {
  which: 'header' | 'footer';
  scope: BandScope;
  bands: Band[];
  rule: boolean | undefined;
  onRule: (rule: boolean) => void;
}) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const setBands = useWorksheetStore((s) => s.setHeaderFooterBands);
  const addBand = useWorksheetStore((s) => s.addHeaderFooterBand);
  const presets = HEADER_FOOTER_PRESETS.filter((preset) => preset.edge === which);

  // Empty: one way forward, pick a layout. With rows: what prints, and its controls.
  if (bands.length === 0) {
    return (
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <BandPresetCard
              key={preset.id}
              name={presetName(m, preset)}
              bands={preset.build()}
              edge={which}
              onClick={() => setBands(which, preset.build(), scope)}
            />
          ))}
        </div>
        <Button size="sm" variant="subtle" onClick={() => addBand(which, undefined, scope)}>
          {m.startEmptyRow}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="rounded-lg border border-line bg-[#fdfcfa] py-1.5 text-[#3f3b38]">
          <BandPreview
            bands={bands}
            rule={rule}
            edge={which}
            page={scope === 'firstPage' ? { number: 1, count: 12 } : undefined}
          />
        </div>
        <p className="mt-1 text-[11px] text-ink-muted">
          {m.dragHint(which)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <CheckField label={m.ruleLine} checked={Boolean(rule)} onChange={onRule} />
        <Button size="sm" variant="subtle" onClick={() => addBand(which, undefined, scope)}>
          {m.addRow}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => setBands(which, [], scope)}>
          {m.clear}
        </Button>
      </div>

      <details className="group/presets pt-0.5">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-ink-muted transition-colors duration-150 ease-out-soft hover:text-ink">
          {m.replaceLayout}{' '}
          <span
            aria-hidden
            className="inline-block transition-transform duration-150 ease-out-soft group-open/presets:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="mt-2 grid animate-fade-in grid-cols-2 gap-2">
          {presets.map((preset) => (
            <BandPresetCard
              key={preset.id}
              name={presetName(m, preset)}
              bands={preset.build()}
              edge={which}
              onClick={() => setBands(which, preset.build(), scope)}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

/** Which page the panel is editing. */
type PageView = 'first' | 'later';

/**
 * A header/footer as the panel reads it. A Question-Answer Book prints no header and
 * always prints its footer: withheld and explained, not greyed out.
 */
function useEdge(which: 'header' | 'footer') {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const qab = isQabDocument(worksheet);
  const value = headerFooterOf(worksheet[which], which === 'header' ? defaultHeader : defaultFooter);
  return {
    value,
    withheld: qab && which === 'header',
    alwaysOn: qab && which === 'footer',
    enabled: (qab && which === 'footer') || value.enabled,
  };
}

/** The edge's master switch, which governs it on every page. */
function EdgeSwitch({ which }: { which: 'header' | 'footer' }) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const setHeaderFooter = useWorksheetStore((s) => s.setHeaderFooter);
  const { value, withheld, alwaysOn } = useEdge(which);
  if (withheld) return <span className="text-xs text-ink-muted">{m.noHeaderBooklet}</span>;
  if (alwaysOn) return <span className="text-xs text-ink-muted">{m.footerAlways}</span>;
  return (
    <CheckField
      label={m.printEdge(which)}
      checked={value.enabled}
      onChange={(on) => setHeaderFooter(which, { enabled: on })}
    />
  );
}

/** Heading for one edge inside a page view. */
function EdgeHeading({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {hint && <p className="text-[11px] leading-relaxed text-ink-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** The one-line state of an edge that prints nothing here. */
function EdgeOff({ which }: { which: 'header' | 'footer' }) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const { withheld } = useEdge(which);
  return (
    <p className="text-[11px] leading-relaxed text-ink-muted">
      {withheld ? m.withheldHeader : m.edgeOff(which)}
    </p>
  );
}

const firstPageOptions = (m: Messages): Array<{ value: FirstPageMode; label: string }> => [
  { value: 'same', label: m.sameAsLater },
  { value: 'different', label: m.itsOwn },
  { value: 'blank', label: m.nothing },
];

/** One edge on page 1: the same rows as later pages, its own, or nothing. */
function FirstPageEdge({
  which,
  onEditLater,
}: {
  which: 'header' | 'footer';
  onEditLater: () => void;
}) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const setHeaderFooter = useWorksheetStore((s) => s.setHeaderFooter);
  const setFirstPageMode = useWorksheetStore((s) => s.setFirstPageMode);
  const { value, withheld, enabled } = useEdge(which);
  const title = m.edgeOnPage1(which);

  if (withheld || !enabled) {
    return (
      <section className="space-y-1">
        <EdgeHeading title={title} />
        <EdgeOff which={which} />
      </section>
    );
  }

  // Read through the model, so the control cannot disagree with the page.
  const mode = firstPageModeOf(value);
  const resolved = firstPageHeaderFooter(value);

  return (
    <section className="space-y-2.5">
      <EdgeHeading
        title={title}
        action={
          <Segmented<FirstPageMode>
            label={title}
            value={mode}
            options={firstPageOptions(m)}
            onChange={(next) => setFirstPageMode(which, next)}
          />
        }
      />

      {mode === 'same' && (
        <div className="space-y-1.5">
          <div className="rounded-lg border border-line bg-[#fdfcfa] py-1.5 text-[#3f3b38]">
            <BandPreview
              bands={value.bands}
              rule={value.rule}
              edge={which}
              page={{ number: 1, count: 2 }}
              emptyLabel={m.laterEmpty(which)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[11px] text-ink-muted">{m.printsLater(which)}</p>
            <Button size="sm" variant="subtle" onClick={onEditLater}>
              {m.editOnLater}
            </Button>
          </div>
        </div>
      )}

      {mode === 'different' && (
        <div className="space-y-2">
          <BandSurface
            which={which}
            scope="firstPage"
            bands={resolved.bands}
            rule={resolved.rule}
            onRule={(rule) => setHeaderFooter(which, { firstPage: { ...value.firstPage!, rule } })}
          />
          <p className="text-[11px] text-ink-subtle">{m.ownRowsNote}</p>
        </div>
      )}

      {mode === 'blank' && (
        <p className="text-[11px] text-ink-muted">{m.page1Blank(which)}</p>
      )}
    </section>
  );
}

/** One edge on pages 2 onward: the running rows. */
function LaterPagesEdge({ which }: { which: 'header' | 'footer' }) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const setHeaderFooter = useWorksheetStore((s) => s.setHeaderFooter);
  const { value, withheld, enabled } = useEdge(which);
  const title = m.edgeOnLater(which);

  if (withheld || !enabled) {
    return (
      <section className="space-y-1">
        <EdgeHeading title={title} />
        <EdgeOff which={which} />
      </section>
    );
  }

  const mode = firstPageModeOf(value);
  const hint =
    mode === 'same' ? m.laterHintSame : mode === 'different' ? m.laterHintOwn : m.laterHintBlank;

  return (
    <section className="space-y-2.5">
      <EdgeHeading title={title} hint={hint} />
      <BandSurface
        which={which}
        scope="running"
        bands={value.bands}
        rule={value.rule}
        onRule={(rule) => setHeaderFooter(which, { rule })}
      />
    </section>
  );
}

/** The title as page 1 prints it, in the miniature. */
function MiniTitle() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const bands = worksheet.bands ?? [];
  if (bands.length > 0) return <BandPreview bands={bands} page={{ number: 1, count: 2 }} />;
  const title = plain(worksheet.title.en) || plain(worksheet.title.zh);
  return title ? (
    <p className="truncate px-1.5 text-center text-[8px] font-semibold">{title}</p>
  ) : (
    // An untitled page still reserves the title line; drawn as a bar.
    <div className="mx-auto mt-1 h-[4px] w-2/5 rounded-full bg-[#cfc8bf]" />
  );
}

/**
 * A page picture that doubles as the tab choosing which page the panel edits. Paper
 * inside, so literal hex; the selected tab takes the accent border.
 */
function PageThumbTab({
  view,
  selected,
  onSelect,
  label,
  caption,
}: {
  view: PageView;
  selected: boolean;
  onSelect: () => void;
  label: string;
  caption: string;
}) {
  const header = useEdge('header');
  const footer = useEdge('footer');
  const pageNumber = view === 'first' ? 1 : 2;
  const page = { number: pageNumber, count: 2 };
  const rowsOf = (edge: ReturnType<typeof useEdge>) =>
    edge.withheld || !edge.enabled
      ? { bands: [], rule: false }
      : view === 'first'
        ? firstPageHeaderFooter(edge.value)
        : { bands: edge.value.bands, rule: edge.value.rule };
  const top = rowsOf(header);
  const bottom = rowsOf(footer);

  return (
    <button
      type="button"
      role="tab"
      id={`hf-tab-${view}`}
      aria-selected={selected}
      aria-controls="hf-panel"
      onClick={onSelect}
      className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'border-accent bg-surface' : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <div aria-hidden className="flex h-[136px] flex-col overflow-hidden rounded border border-line/70 bg-[#fdfcfa] py-1.5 text-[#3f3b38]">
        <div className="min-h-0 shrink space-y-1 overflow-hidden">
          {top.bands.length > 0 && <BandPreview bands={top.bands} rule={top.rule} page={page} />}
          {view === 'first' && <MiniTitle />}
        </div>
        {/* Body text, drawn as lines; gives way first when the header is tall. */}
        <div className="min-h-0 flex-1 space-y-[5px] overflow-hidden px-2 pt-2.5">
          {[92, 78, 86, 60].map((width) => (
            <div key={width} className="h-[3px] rounded-full bg-[#e7e2dc]" style={{ width: `${width}%` }} />
          ))}
        </div>
        <div className="shrink-0">
          {bottom.bands.length > 0 && (
            <BandPreview bands={bottom.bands} rule={bottom.rule} edge="footer" page={page} />
          )}
        </div>
      </div>
      <span className="px-0.5">
        <span className={`block text-[12px] font-medium ${selected ? 'text-ink' : 'text-ink-muted'}`}>
          {label}
        </span>
        <span className="block truncate text-[11px] text-ink-subtle">{caption}</span>
      </span>
    </button>
  );
}

/** How page 1 differs, in a few words, for its tab caption. */
function firstPageCaption(
  edges: Array<{ name: string; edge: ReturnType<typeof useEdge> }>,
  m: Messages,
): string {
  const parts = edges.flatMap(({ name, edge }) => {
    if (edge.withheld || !edge.enabled) return [];
    const mode = firstPageModeOf(edge.value);
    if (mode === 'different') return [m.captionOwn(name)];
    if (mode === 'blank') return [m.captionNo(name)];
    return [];
  });
  if (parts.length === 0) return m.captionSame;
  return m.captionPlus(parts.join(m.captionList));
}

/**
 * Header and footer, organised by page: two page pictures choose which page is edited.
 * Page 1 chooses per edge between the later pages' rows, its own, or nothing, and holds
 * the title because only page 1 prints it (§ Page 1 can differ).
 */
function HeaderFooterTab() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const [view, setView] = useState<PageView>('first');
  const header = useEdge('header');
  const footer = useEdge('footer');

  return (
    <div className="space-y-5">
      <BandOverflowNotice />
      <DuplicateFieldNotice />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5">
        <EdgeSwitch which="header" />
        <EdgeSwitch which="footer" />
        {!header.withheld && (
          <span className="text-[11px] text-ink-subtle">{m.onOrOff}</span>
        )}
      </div>

      <div role="tablist" aria-label={m.pageToEdit} className="flex gap-3">
        <PageThumbTab
          view="first"
          selected={view === 'first'}
          onSelect={() => setView('first')}
          label={m.page1}
          caption={firstPageCaption(
            [
              { name: m.edgeHeader, edge: header },
              { name: m.edgeFooter, edge: footer },
            ],
            m,
          )}
        />
        <PageThumbTab
          view="later"
          selected={view === 'later'}
          onSelect={() => setView('later')}
          label={m.pages2Onward}
          caption={m.everyPageAfter}
        />
      </div>

      <div
        id="hf-panel"
        role="tabpanel"
        aria-labelledby={`hf-tab-${view}`}
        key={view}
        className="animate-fade-in space-y-6 border-t border-line pt-5"
      >
        {view === 'first' ? (
          <>
            <FirstPageEdge which="header" onEditLater={() => setView('later')} />
            <div className="border-t border-line pt-5">
              <TitleSection />
            </div>
            <div className="border-t border-line pt-5">
              <FirstPageEdge which="footer" onEditLater={() => setView('later')} />
            </div>
          </>
        ) : (
          <>
            <LaterPagesEdge which="header" />
            <div className="border-t border-line pt-5">
              <LaterPagesEdge which="footer" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Build a mock-exam cover.
 *
 * A once-per-document decision with its own options, so it lives here rather than on the
 * add rail — and it is deliberately a *form with a button*, not a live-bound section: the
 * cover it produces is plain elements a teacher then edits on the page (see
 * `model/cover.ts`). Re-running it replaces the cover rather than stacking a second one.
 */
function CoverTab({ onClose }: { onClose: () => void }) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const applyCover = useWorksheetStore((s) => s.applyCover);
  const removeCover = useWorksheetStore((s) => s.removeCover);
  const hasCover = useWorksheetStore((s) => Boolean(s.worksheet.cover));

  // Read once per open: the year cannot change while a dialog is up, and re-deriving it
  // per render would make the placeholders a new object on every keystroke.
  const coverYear = useMemo(() => academicYear(), []);

  const [paperStyle, setPaperStyle] = useState<CoverPaperStyle>('mcq');
  const [code, setCode] = useState('');
  const [school, setSchool] = useState('');
  const [examName, setExamName] = useState('');
  const [paperName, setPaperName] = useState('');
  const [timeAllowed, setTimeAllowed] = useState('');

  const field = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    placeholder: string,
  ) => (
    <label className="flex flex-col gap-1.5 text-[13px]">
      <span className="font-medium text-ink">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{m.coverHeading}</h3>
        <p className="text-[11px] leading-relaxed text-ink-muted">{m.coverIntro}</p>
      </div>

      <Field
        label={m.paperStyle}
        hint={m.paperStyleHint}
      >
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['mcq', m.styleMcq, m.styleMcqHint],
              ['writeIn', m.styleWriteIn, m.styleWriteInHint],
            ] as Array<[CoverPaperStyle, string, string]>
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={paperStyle === value}
              onClick={() => setPaperStyle(value)}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                paperStyle === value
                  ? 'border-accent bg-surface'
                  : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span
                className={`text-[12px] font-medium ${
                  paperStyle === value ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {label}
              </span>
              <span className="text-[11px] leading-snug text-ink-muted">{hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Every field is optional: left blank, the cover carries a placeholder the teacher
          types over on the page, which is faster than filling a form for a value they
          were going to see and edit anyway. */}
      {/* The year placeholders are derived from the same helper the cover uses, not
          retyped: a placeholder promising "2025-26" while the cover builds 2026-27 is
          a worse lie than no placeholder (§ `academicYear`). */}
      <div className="grid grid-cols-2 gap-3">
        {field(m.cornerCode, code, setCode, coverYear.short)}
        {field(m.school, school, setSchool, 'SCHOOL NAME')}
        {field(m.examination, examName, setExamName, `S.6 MOCK EXAMINATION ${coverYear.long}`)}
        {field(m.paper, paperName, setPaperName, 'ECONOMICS   PAPER 1')}
        {field(m.timeAllowed, timeAllowed, setTimeAllowed, '8:30 am – 9:30 am (1 hour)')}
      </div>

      {hasCover && <CoverOptions />}

      {hasCover && (
        <p className="rounded-lg border border-line bg-surface-sunken p-2.5 text-[11px] leading-relaxed text-ink-muted">
          {m.hasCover}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-line pt-4">
        {hasCover ? (
          <Button
            variant="danger"
            onClick={() => {
              removeCover();
              onClose();
            }}
          >
            {m.removeCover}
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          onClick={() => {
            applyCover({
              paperStyle,
              code: code.trim() || undefined,
              school: school.trim() || undefined,
              examName: examName.trim() || undefined,
              paperName: paperName.trim() || undefined,
              timeAllowed: timeAllowed.trim() || undefined,
            });
            // The result is on the page, so get out of the way and let them look at it.
            onClose();
          }}
        >
          {hasCover ? m.replaceCover : m.addCover}
        </Button>
      </div>
    </div>
  );
}

/**
 * Live settings for the cover that already exists.
 *
 * These are the structural knobs with no visual handle on the page — a marker style is
 * a convention, not a thing to click; a box count only shows as boxes. Text stays on
 * the page, as everywhere. Writes go through `updateCover` immediately: unlike the
 * generator form above, there is a live subject to act on.
 */
function CoverOptions() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const cover = useWorksheetStore((s) => s.worksheet.cover);
  const updateCover = useWorksheetStore((s) => s.updateCover);
  if (!cover) return null;

  const marker = cover.instructionMarker ?? 'paren';
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <h4 className="text-[12px] font-semibold text-ink">{m.coverOptions}</h4>

      <Field
        label={m.instructionNumbers}
        hint={m.instructionNumbersHint}
      >
        <div className="flex gap-2" role="radiogroup">
          {(
            [
              ['dot', '1.'],
              ['paren', '(1)'],
            ] as Array<['dot' | 'paren', string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={marker === value}
              onClick={() => updateCover({ instructionMarker: value })}
              className={`h-8 flex-1 cursor-pointer rounded-lg border text-[13px] transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                marker === value
                  ? 'border-accent bg-surface font-medium text-ink'
                  : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={m.writeInBoxes}
        hint={m.writeInBoxesHint}
      >
        <input
          type="number"
          min={0}
          max={10}
          value={cover.panelBoxes ?? 0}
          className="h-9 w-24 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
          onChange={(event) => {
            const next = Math.max(0, Math.min(10, Math.round(Number(event.target.value))));
            if (Number.isFinite(next)) updateCover({ panelBoxes: next });
          }}
        />
      </Field>
    </div>
  );
}

/**
 * The title printed on page 1: the plain title, or a title block that replaces it.
 * Stated as one choice because the block silently takes the title's place.
 */
function TitleSection() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setBands = useWorksheetStore((s) => s.setBands);
  const addBand = useWorksheetStore((s) => s.addBand);
  const addBandField = useWorksheetStore((s) => s.addBandField);
  const bands = worksheet.bands ?? [];
  const usingBlock = bands.length > 0;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{m.titleSection}</h3>
        <p className="text-[11px] leading-relaxed text-ink-muted">{m.titleSectionHint}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Plain title. Selecting it clears the bands, which is the action that was
            previously spelled "Remove" on a separate tab and looked like deletion
            rather than like switching back. */}
        <button
          type="button"
          role="radio"
          aria-checked={!usingBlock}
          onClick={() => usingBlock && setBands([])}
          className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            !usingBlock
              ? 'border-accent bg-surface'
              : 'border-line bg-surface hover:border-line-strong'
          }`}
        >
          {/* `flex-1` on both cards' miniatures, so the two labels sit on one line
              however tall the busier layout is — a short card whose label floats
              mid-air reads as unfinished rather than as the simpler option. */}
          <div className="flex min-h-[56px] flex-1 items-center justify-center rounded border border-line/70 bg-[#fdfcfa] px-2 py-1">
            <span className="truncate text-[9px] font-semibold text-[#3f3b38]">
              {plain(worksheet.title.en) || plain(worksheet.title.zh) || m.worksheetTitlePlaceholder}
            </span>
          </div>
          <span
            className={`text-[11px] font-medium ${!usingBlock ? 'text-ink' : 'text-ink-muted'}`}
          >
            {m.justTheTitle}
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={usingBlock}
          onClick={() =>
            !usingBlock &&
            setBands(assessmentTitleBlock(worksheet.title, bi('Assessment 1', '測驗一')))
          }
          className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            usingBlock
              ? 'border-accent bg-surface'
              : 'border-line bg-surface hover:border-line-strong'
          }`}
        >
          <div className="flex min-h-[56px] flex-1 flex-col justify-center rounded border border-line/70 bg-[#fdfcfa] py-1 text-[#3f3b38]">
            <BandPreview
              bands={
                usingBlock
                  ? bands
                  : assessmentTitleBlock(worksheet.title, bi('Assessment 1', '測驗一'))
              }
            />
          </div>
          <span
            className={`text-[11px] font-medium ${usingBlock ? 'text-ink' : 'text-ink-muted'}`}
          >
            {m.titleBlock}
          </span>
        </button>
      </div>

      {usingBlock && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-sunken p-3">
          <span className="mr-1 text-[11px] text-ink-muted">{m.titleBlockEdit}</span>
          <Button size="sm" variant="subtle" onClick={() => addBand()}>
            {m.addRow}
          </Button>
          <Button
            size="sm"
            variant="subtle"
            title={m.addFullMarksTitle}
            onClick={() =>
              addBandField(bands[bands.length - 1].id, 'left', createTotalMarksField())
            }
          >
            {m.addFullMarks}
          </Button>
          <Button
            size="sm"
            variant="subtle"
            title={m.addFillInTitle}
            onClick={() =>
              addBandField(
                bands[bands.length - 1].id,
                'right',
                createFillInField(bi('Name:', '姓名：')),
              )
            }
          >
            {m.addFillIn}
          </Button>
        </div>
      )}
    </section>
  );
}

export function DocumentSettings({
  initialTab = 'document',
  onClose,
}: {
  initialTab?: Tab;
  onClose: () => void;
}) {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <Dialog
      title={m.dialogTitle}
      description={m.dialogDescription}
      onClose={onClose}
      width={760}
      // Fixed, so the panel does not resize as tabs are switched — "Page" is a handful
      // of selects while "Worksheet" is six fields, and letting the dialog follow that
      // moved the tab list out from under the pointer between clicks.
      height={620}
      // The rail and the panel scroll separately, so the body must not scroll too.
      scrollBody={false}
    >
      <DialogTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'document', label: m.tabWorksheet, hint: m.tabWorksheetHint },
          { id: 'page', label: m.tabPage, hint: m.tabPageHint },
          { id: 'furniture', label: m.tabFurniture, hint: m.tabFurnitureHint },
          { id: 'cover', label: m.tabCover, hint: m.tabCoverHint },
        ]}
      >
        {/* Keyed by tab so the incoming panel fades in rather than cutting. */}
        <div key={tab} className="animate-fade-in">
          {tab === 'document' && <DocumentTab />}
          {tab === 'cover' && <CoverTab onClose={onClose} />}
          {tab === 'page' && <PageTab />}
          {tab === 'furniture' && <HeaderFooterTab />}
        </div>
      </DialogTabs>
    </Dialog>
  );
}
