'use client';

import { useState } from 'react';
import { CheckField, Segmented, SelectField } from '@/components/ui';
import { Field } from '@/components/ui/Dialog';
import { FONT_PRESETS } from '@/model/factories';
import { createWorksheetFrom, type NewWorksheetOptions } from '@/model/newWorksheet';
import { MARGIN_PRESETS } from '@/model/page';
import type { CoverPaperStyle } from '@/model/cover';
import type { LanguageMode, PageMargins, PaperSize, Worksheet } from '@/model/types';

/**
 * The once-per-document decisions, asked before the first question exists.
 *
 * A **form, not a wizard of steps**: all six answers fit on one screen, and a teacher
 * who wants none of them presses Create immediately. Multi-step would turn a set of
 * defaults into a gate — and every field here already has a working default, so there
 * is nothing that must be answered before the editor can open.
 *
 * The cover choice sits last because it is the only one that changes what the document
 * *contains* rather than how it is set: the other five are properties of the page.
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

export function NewWorksheetForm({
  /** Preselected cover style, from the card the teacher pressed on the start screen. */
  initialCover,
  onCreate,
}: {
  initialCover?: CoverPaperStyle;
  onCreate: (worksheet: Worksheet, language: LanguageMode) => void;
}) {
  const [title, setTitle] = useState('');
  const [titleZh, setTitleZh] = useState('');
  const [language, setLanguage] = useState<LanguageMode>('en');
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [marginIndex, setMarginIndex] = useState(0);
  const [fontIndex, setFontIndex] = useState(0);
  const [cover, setCover] = useState<CoverPaperStyle | 'none'>(initialCover ?? 'none');
  const [sections, setSections] = useState(true);
  // Only shown once a cover is chosen: they are that cover's own fields, and five boxes
  // for a document that will have no cover is a form asking about something that does
  // not exist.
  const [school, setSchool] = useState('');
  const [examName, setExamName] = useState('');

  const submit = () => {
    const options: NewWorksheetOptions = {
      title,
      titleZh,
      paper,
      margins: MARGIN_PRESETS[marginIndex]?.margins as PageMargins,
      fonts: {
        latin: FONT_PRESETS[fontIndex].latin,
        eastAsia: FONT_PRESETS[fontIndex].eastAsia,
      },
      sections,
      ...(cover === 'none'
        ? {}
        : { cover, coverDetails: { school, examName } }),
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
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="Economics Worksheet"
          autoFocus
        />
        <TextField
          label="Title (中文)"
          value={titleZh}
          onChange={setTitleZh}
          placeholder="經濟科工作紙"
        />
      </div>

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
          <SelectField
            value={marginIndex}
            onChange={setMarginIndex}
            options={MARGIN_PRESETS.map((preset, index) => ({
              value: index,
              label: preset.label,
            }))}
          />
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

      <Field
        label="Cover page"
        hint="A mock-exam front page. Only a write-in booklet gets a candidate panel."
      >
        {/* `items-stretch` so all three cards take the height of the tallest: one hint
            wraps to two lines and the others do not, and without it the row reads as
            three cards of three different sizes. */}
        <div role="radiogroup" className="grid grid-cols-3 items-stretch gap-2">
          {(
            [
              ['none', 'None', 'Classroom worksheet'],
              ['mcq', 'Paper 1', 'Answers on a sheet'],
              ['writeIn', 'Paper 2', 'Answers in the booklet'],
            ] as Array<[CoverPaperStyle | 'none', string, string]>
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={cover === value}
              onClick={() => setCover(value)}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                cover === value
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-line bg-surface hover:border-ink-subtle'
              }`}
            >
              <span
                className={`text-[12px] font-medium ${
                  cover === value ? 'text-accent' : 'text-ink'
                }`}
              >
                {label}
              </span>
              <span className="text-[11px] leading-snug text-ink-muted">{hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Indented under the cover choice they belong to, rather than floating as a
          third pair of top-level boxes: they appear and disappear with it, and at the
          same level they read as document fields that happen to vanish. */}
      {cover !== 'none' && (
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
            placeholder="S.6 MOCK EXAM 2025–26"
          />
        </div>
      )}

      <div className="border-t border-line pt-4">
        <CheckField
          label="Start with Section A / Section B headings"
          checked={sections}
          onChange={setSections}
        />
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
