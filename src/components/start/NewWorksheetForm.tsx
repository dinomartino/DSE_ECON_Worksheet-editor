'use client';

import { useRef, useState } from 'react';
import { CheckField, Segmented, SelectField } from '@/components/ui';
import { Field } from '@/components/ui/Dialog';
import { FONT_PRESETS } from '@/model/factories';
import {
  createWorksheetFrom,
  type DocumentType,
  type NewWorksheetOptions,
} from '@/model/newWorksheet';
import { academicYear } from '@/model/cover';
import { MARGIN_PRESETS } from '@/model/page';
import type { LanguageMode, PageMargins, PaperSize, Worksheet } from '@/model/types';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages, useUiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { PaperSketch } from './PaperSketch';
import { DOCUMENT_SETTINGS_MESSAGES, MARGIN_PRESET_KEYS } from '@/components/editor/DocumentSettings.messages';
import { NEW_FORM_MESSAGES } from './screen.messages';
import { kindText, START_KINDS, writeLastKind } from './startKinds';

/**
 * The once-per-document decisions, asked before the first question exists.
 *
 * A **form, not a wizard of steps**: everything fits on one screen. Only the name must
 * be typed; every other field has a working default.
 *
 * The **document type leads** and everything else follows from it. It used to be the
 * other way around — the cover was one question, sections another — which made the
 * teacher assemble a booklet out of parts the form could have derived: choosing
 * "Paper 2 cover" and "sections" *was* choosing the QAB, but nothing said so, and the
 * plain LQ worksheet (answer space with no exam apparatus) was not reachable at all.
 * One card up front answers cover, sections, furniture and seeding in a stroke; the
 * rest of the form is page properties.
 */
/**
 * Id linking the form to its submit button.
 *
 * The Create button lives in `Dialog`'s pinned `footer`, outside the scrolling body that
 * holds the fields — actions rendered *inside* the body scroll with the form and get cut
 * in half by the panel edge on a laptop-height window, which is how this shipped first.
 * `form="…"` is the platform's own way to submit across that DOM boundary, so Enter in a
 * field and a click on Create take the identical path.
 */
export const NEW_WORKSHEET_FORM_ID = 'new-worksheet-form';

/** A realistic filing name per type, shown as the Name field's placeholder. */
export function namePlaceholder(type: DocumentType, now?: Date, lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(NEW_FORM_MESSAGES, lang);
  const year = academicYear(now).short;
  switch (type) {
    case 'classroom':
      return m.placeholderClassroom;
    case 'lqWorksheet':
      return m.placeholderLq;
    case 'paper1':
      return m.placeholderPaper1(year);
    case 'lqMock':
      return m.placeholderPaper2(year);
  }
}

/** The name to create under, or undefined when nothing but whitespace was typed. */
export function newWorksheetName(typed: string): string | undefined {
  return typed.trim() || undefined;
}

export const NAME_REQUIRED_MESSAGE = NEW_FORM_MESSAGES.nameRequired.en;
const NAME_ERROR_ID = 'new-worksheet-name-error';

/** Which types carry a mock-exam cover, and so ask for its fields. */
const HAS_COVER: Record<DocumentType, boolean> = {
  classroom: false,
  lqWorksheet: false,
  paper1: true,
  lqMock: true,
};

/**
 * Which types offer the section-headings choice (the others decide it themselves).
 *
 * Only the classroom worksheet genuinely has the choice. The three exam-shaped documents
 * each *are* a shape: the booklet's Sections A–C are its structure, a plain LQ set has
 * none, and an MCQ paper runs as one unbroken sequence of questions between its lead-in
 * and "END OF PAPER" — the reference (DSE 2021 P1) carries no section heading anywhere.
 */
export const ASKS_SECTIONS: Record<DocumentType, boolean> = {
  classroom: true,
  lqWorksheet: false,
  paper1: false,
  lqMock: false,
};

export function NewWorksheetForm({
  /** Preselected document type: the card pressed, or the last type created. */
  initialType,
  onCreate,
}: {
  initialType?: DocumentType;
  onCreate: (worksheet: Worksheet, language: LanguageMode) => void;
}) {
  const m = useMessages(NEW_FORM_MESSAGES);
  const marginNames = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const lang = useUiLanguage();
  const [documentType, setDocumentType] = useState<DocumentType>(initialType ?? 'classroom');
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<LanguageMode>('en');
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [marginIndex, setMarginIndex] = useState(0);
  const [fontIndex, setFontIndex] = useState(0);
  const [sections, setSections] = useState(true);
  // Only shown once the type carries a cover: they are that cover's own fields, and
  // boxes for a document that will have no cover is a form asking about something that
  // does not exist.
  const [school, setSchool] = useState('');
  const [examName, setExamName] = useState('');

  const submit = () => {
    const filingName = newWorksheetName(name);
    if (!filingName) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }
    const options: NewWorksheetOptions = {
      documentType,
      name: filingName,
      paper,
      margins: MARGIN_PRESETS[marginIndex]?.margins as PageMargins,
      fonts: {
        latin: FONT_PRESETS[fontIndex].latin,
        eastAsia: FONT_PRESETS[fontIndex].eastAsia,
      },
      sections,
      ...(HAS_COVER[documentType] ? { coverDetails: { school, examName } } : {}),
    };
    writeLastKind(documentType);
    onCreate(createWorksheetFrom(options), language);
  };

  return (
    <form
      id={NEW_WORKSHEET_FORM_ID}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field label={m.name} hint={m.nameHint}>
        <input
          ref={nameRef}
          type="text"
          value={name}
          autoFocus
          placeholder={namePlaceholder(documentType, undefined, lang)}
          aria-label={m.name}
          aria-invalid={nameMissing}
          aria-describedby={nameMissing ? NAME_ERROR_ID : undefined}
          className={`h-9 w-full rounded-lg border bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:ring-2 ${
            nameMissing
              ? 'border-danger focus:border-danger focus:ring-danger/25'
              : 'border-line focus:border-accent focus:ring-accent/25'
          }`}
          onChange={(event) => {
            setName(event.target.value);
            if (nameMissing && newWorksheetName(event.target.value)) setNameMissing(false);
          }}
        />
        {nameMissing && (
          <p id={NAME_ERROR_ID} role="alert" className="animate-fade-in text-xs text-danger-ink">
            {m.nameRequired}
          </p>
        )}
      </Field>

      <Field label={m.documentType} hint={m.documentTypeHint}>
        {/* A gallery of first pages, the empty desk's own sketches: a teacher knows a
            paper by its shape sooner than by its name. */}
        <div role="radiogroup" aria-label={m.documentType} className="grid grid-cols-4 gap-3">
          {START_KINDS.map((kind) => {
            const selected = documentType === kind.type;
            const words = kindText(kind.type, lang);
            return (
              <button
                key={kind.type}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDocumentType(kind.type)}
                className="group flex min-w-0 cursor-pointer flex-col text-left focus-visible:outline-none"
              >
                {/* Selected crossfades: border and fill ease, and the ring is a layer that
                    fades in, since the focus ring shares `box-shadow` and must not. */}
                <span
                  className={`relative flex justify-center rounded-lg border px-[21%] py-2.5 transition-colors duration-150 ease-out-soft group-focus-visible:ring-2 group-focus-visible:ring-accent ${
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
                    <PaperSketch type={kind.type} />
                  </span>
                </span>
                <span
                  className={`mt-1.5 block text-[12px] font-medium leading-snug transition-colors duration-150 ease-out-soft ${
                    selected ? 'text-accent-ink' : 'text-ink group-hover:text-accent-ink'
                  }`}
                >
                  {words.title}
                </span>
                {words.bilingual && (
                  <span lang="zh-HK" className="block text-[11px] leading-snug text-ink-subtle">
                    {kind.titleZh}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* What the chosen type includes. Keyed, so it fades to the new wording. */}
        <p key={documentType} className="animate-fade-in text-[11px] leading-snug text-ink-muted">
          {kindText(documentType, lang).hint}
        </p>
      </Field>

      {/* Indented under the type they belong to, rather than floating as top-level
          boxes: they appear and disappear with it, and at the same level they read as
          document fields that happen to vanish. */}
      {HAS_COVER[documentType] && (
        <div className="ml-0.5 grid animate-fade-in gap-3 border-l-2 border-accent/25 pl-3 sm:grid-cols-2">
          <TextField
            label={m.school}
            value={school}
            onChange={setSchool}
            placeholder="SCHOOL NAME"
          />
          <TextField
            label={m.examination}
            value={examName}
            onChange={setExamName}
            // Shortened from the cover's own full default: a placeholder that truncates
            // mid-word teaches the shape of the value worse than a shorter one that fits.
            // The year is still derived, so it never advertises a stale one.
            placeholder={`S.6 MOCK EXAM ${academicYear().short}`}
          />
        </div>
      )}

      {ASKS_SECTIONS[documentType] ? (
        <CheckField
          label={m.sectionsCheck}
          checked={sections}
          onChange={setSections}
        />
      ) : (
        // The types that decide sections for themselves say what they decided, so the
        // vanished checkbox does not read as an option quietly taken away.
        // Keyed by type, so the sentence fades to its new wording instead of snapping.
        <p key={documentType} className="animate-fade-in text-[11px] text-ink-subtle">
          {documentType === 'lqMock' ? m.startsLqMock : documentType === 'paper1' ? m.startsPaper1 : m.startsLq}
        </p>
      )}

      {/* No title field: the Name above is `Worksheet.name`, which never prints. The
          printed heading is typed onto the page, where it is seen. */}
      <Field label={m.language} hint={m.languageHint}>
        <Segmented
          label={m.language}
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'EN', title: m.onlyEnglish },
            { value: 'zh', label: '中文', title: m.onlyChinese },
            { value: 'bilingual', label: 'EN+中', title: m.bilingual },
          ]}
        />
      </Field>

      {/* The three page selects on one row. Each on its own line spent a third of the
          dialog's height on three dropdowns, which is what pushed the form into
          scrolling on a laptop screen — and they are the same kind of choice, so they
          read as a group rather than as three unrelated decisions.

          Unequal columns, because the labels are unequal: "A4" needs almost nothing
          while "Times New Roman / 新細明體" is the longest string in the dialog. At
          even thirds the font name truncated under its own chevron, which is the one
          thing a select must never do — the value is the whole point of the control. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1.5fr)]">
        <Field label={m.paper}>
          <SelectField
            value={paper}
            onChange={setPaper}
            options={[
              { value: 'A4' as PaperSize, label: 'A4' },
              { value: 'Letter' as PaperSize, label: 'Letter' }, // i18n-ignore: paper size names
              { value: 'A3' as PaperSize, label: 'A3' },
              { value: 'Legal' as PaperSize, label: 'Legal' }, // i18n-ignore: paper size names
            ]}
          />
        </Field>
        <Field label={m.margins}>
          {documentType === 'lqMock' || documentType === 'paper1' ? (
            // Both exam papers print on the reference's own margins — the booklet's
            // frame, dotted pitch and lines-per-page were measured against that
            // column, and the MCQ paper's indent scheme was measured against the
            // same one — so the answer is fixed rather than offered (§ `QAB_MARGINS`).
            <p className="flex h-9 items-center rounded-lg border border-line bg-surface-sunken px-2.5 text-[12px] text-ink-muted">
              {documentType === 'lqMock' ? m.bookletFixed : m.examFixed}
            </p>
          ) : (
            <SelectField
              value={marginIndex}
              onChange={setMarginIndex}
              options={MARGIN_PRESETS.map((preset, index) => ({
                value: index,
                label: MARGIN_PRESET_KEYS[index] ? marginNames[MARGIN_PRESET_KEYS[index]] : preset.label,
              }))}
            />
          )}
        </Field>
        <Field label={m.fonts}>
          <SelectField
            value={fontIndex}
            onChange={setFontIndex}
            options={FONT_PRESETS.map((preset, index) => ({
              value: index,
              label: preset.label,
            }))}
          />
        </Field>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px]">
      <span className="font-medium text-ink">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
