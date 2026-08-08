'use client';

import { useState } from 'react';
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

/**
 * The once-per-document decisions, asked before the first question exists.
 *
 * A **form, not a wizard of steps**: everything fits on one screen, and a teacher who
 * wants none of it presses Create immediately. Every field has a working default, so
 * there is nothing that must be answered before the editor can open.
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

/**
 * The four documents, in the order a teacher meets them: the everyday sheet first,
 * then the two mocks, with the plain LQ set between them beside the booklet it
 * resembles. Each card names what the choice *includes*, because the whole point of
 * the type is that nothing else needs asking.
 */
const DOCUMENT_TYPES: Array<{
  value: DocumentType;
  label: string;
  hint: string;
}> = [
  {
    value: 'classroom',
    label: 'Classroom worksheet',
    hint: 'MCQ + structured questions. No cover.',
  },
  {
    value: 'lqWorksheet',
    label: 'LQ worksheet',
    hint: 'Long questions with dotted answer space. No exam furniture.',
  },
  {
    value: 'paper1',
    label: 'Paper 1 mock · MCQ',
    hint: 'Exam cover; answers go on a separate sheet.',
  },
  {
    value: 'lqMock',
    label: 'Paper 2 mock · booklet',
    hint: 'Question-Answer Book: cover, Sections A–C, page frame.',
  },
];

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
  /** Preselected document type, from the card the teacher pressed on the start screen. */
  initialType,
  onCreate,
}: {
  initialType?: DocumentType;
  onCreate: (worksheet: Worksheet, language: LanguageMode) => void;
}) {
  const [documentType, setDocumentType] = useState<DocumentType>(initialType ?? 'classroom');
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
    const options: NewWorksheetOptions = {
      documentType,
      paper,
      margins: MARGIN_PRESETS[marginIndex]?.margins as PageMargins,
      fonts: {
        latin: FONT_PRESETS[fontIndex].latin,
        eastAsia: FONT_PRESETS[fontIndex].eastAsia,
      },
      sections,
      ...(HAS_COVER[documentType] ? { coverDetails: { school, examName } } : {}),
    };
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
      <Field
        label="Document type"
        hint="Decides the cover, sections and page furniture — everything else below is paper."
      >
        <div role="radiogroup" className="grid grid-cols-2 items-stretch gap-2">
          {DOCUMENT_TYPES.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={documentType === value}
              onClick={() => setDocumentType(value)}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-[background-color,border-color,color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                documentType === value
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-line bg-surface hover:border-ink-subtle'
              }`}
            >
              <span
                className={`text-[12px] font-medium ${
                  documentType === value ? 'text-accent' : 'text-ink'
                }`}
              >
                {label}
              </span>
              <span className="text-[11px] leading-snug text-ink-muted">{hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Indented under the type they belong to, rather than floating as top-level
          boxes: they appear and disappear with it, and at the same level they read as
          document fields that happen to vanish. */}
      {HAS_COVER[documentType] && (
        <div className="ml-0.5 grid gap-3 border-l-2 border-accent/25 pl-3 sm:grid-cols-2">
          <TextField
            label="School"
            value={school}
            onChange={setSchool}
            placeholder="SCHOOL NAME"
          />
          <TextField
            label="Examination"
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
          label="Start with Section A / Section B headings"
          checked={sections}
          onChange={setSections}
        />
      ) : (
        // The types that decide sections for themselves say what they decided, so the
        // vanished checkbox does not read as an option quietly taken away.
        <p className="text-[11px] text-ink-subtle">
          {documentType === 'lqMock'
            ? 'Starts with Sections A–C (derived marks totals) and one sample long question.'
            : documentType === 'paper1'
              ? 'Starts with the “There are N questions…” line, one sample question and “END OF PAPER” — no section headings.'
              : 'Starts with one sample long question — no section headings.'}
        </p>
      )}

      {/*
        No title fields. A new document starts untitled — nothing is stamped into it
        (§ `createWorksheet`) — and the name is given where naming happens: typed onto
        the page, in Setup, or via Rename in the file list. Asking here was a box most
        teachers skipped, which then printed a heading nobody wrote.
      */}
      <Field
        label="Language"
        hint="Which side the editor shows. Both are always stored."
      >
        <Segmented
          label="Language"
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'EN', title: 'English only' },
            { value: 'zh', label: '中文', title: '中文 only' },
            { value: 'bilingual', label: 'EN+中', title: 'Bilingual' },
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
        <Field label="Paper">
          <SelectField
            value={paper}
            onChange={setPaper}
            options={[
              { value: 'A4' as PaperSize, label: 'A4' },
              { value: 'Letter' as PaperSize, label: 'Letter' },
              { value: 'A3' as PaperSize, label: 'A3' },
              { value: 'Legal' as PaperSize, label: 'Legal' },
            ]}
          />
        </Field>
        <Field label="Margins">
          {documentType === 'lqMock' || documentType === 'paper1' ? (
            // Both exam papers print on the reference's own margins — the booklet's
            // frame, dotted pitch and lines-per-page were measured against that
            // column, and the MCQ paper's indent scheme was measured against the
            // same one — so the answer is fixed rather than offered (§ `QAB_MARGINS`).
            <p className="flex h-9 items-center rounded-lg border border-line bg-surface-sunken px-2.5 text-[12px] text-ink-muted">
              {documentType === 'lqMock' ? 'Booklet (fixed)' : 'Exam paper (fixed)'}
            </p>
          ) : (
            <SelectField
              value={marginIndex}
              onChange={setMarginIndex}
              options={MARGIN_PRESETS.map((preset, index) => ({
                value: index,
                label: preset.label,
              }))}
            />
          )}
        </Field>
        <Field label="Fonts">
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
        className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
