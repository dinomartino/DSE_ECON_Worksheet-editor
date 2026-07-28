'use client';

import { useState } from 'react';
import { Dialog, DialogTabs, Field } from '@/components/ui/Dialog';
import { Button, CheckField, Segmented, SelectField } from '@/components/ui';
import { DocumentIcon, PageIcon, SectionIcon, TextIcon } from '@/components/ui/icons';
import {
  assessmentTitleBlock,
  createFillInField,
  createTotalMarksField,
  HEADER_FOOTER_PRESETS,
} from '@/model/bands';
import { FONT_PRESETS } from '@/model/factories';
import {
  cmToTwips,
  defaultFooter,
  defaultHeader,
  headerFooterOf,
  MARGIN_PRESETS,
  PAPER_SIZES,
  pageSetupOf,
  twipsToCm,
} from '@/model/page';
import { bi, emptyBiText } from '@/model/text';
import type { HeaderFooter, Orientation, PageMargins, PaperSize } from '@/model/types';
import { useWorksheetStore, type FirstPageMode } from '@/store/worksheetStore';
import { BiTextField } from './BiTextField';

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

type Tab = 'document' | 'page' | 'headerFooter' | 'titleBlock';

/** Top/bottom before left/right — the order Word and every print dialog state them in. */
const MARGIN_EDGES: Array<{ key: keyof PageMargins; label: string }> = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
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
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);

  const fontIndex = FONT_PRESETS.findIndex(
    (preset) =>
      preset.latin === worksheet.fonts.latin && preset.eastAsia === worksheet.fonts.eastAsia,
  );

  return (
    <div className="space-y-5">
      <Field label="Title" hint="Printed at the top of the first page.">
        <BiTextField
          ariaLabel="Worksheet title"
          value={worksheet.title}
          rows={1}
          onChange={(title) => updateWorksheet({ title })}
        />
      </Field>

      <Field label="Instructions" hint="A line under the title — e.g. “Answer ALL questions.”">
        <BiTextField
          ariaLabel="Instructions"
          value={worksheet.instructions ?? emptyBiText()}
          rows={2}
          onChange={(instructions) => updateWorksheet({ instructions })}
        />
      </Field>

      <Field label="Fonts" hint="Applied to Latin and Chinese text separately in the export.">
        <SelectField<number>
          value={fontIndex >= 0 ? fontIndex : -1}
          options={[
            ...(fontIndex < 0 ? [{ value: -1, label: 'Custom' }] : []),
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

      {/* Section headings are typed on the page, not here.
          A section is a heading in the flow now, so it has a visual representation to
          click — which is the rule for what belongs on the paper rather than in a panel
          (§"the preview is the editor"). This list edited headings by index while the
          page showed them in place, giving two ways to change one thing. */}
    </div>
  );
}

/** Paper geometry: size, orientation, margins. */
function PageTab() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setPageSetup = useWorksheetStore((s) => s.setPageSetup);
  const setup = pageSetupOf(worksheet);

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
      <Field label="Paper size" hint="Written straight into the .docx page setup.">
        <SelectField<PaperSize>
          value={setup.paper}
          options={Object.entries(PAPER_SIZES).map(([value, info]) => ({
            value: value as PaperSize,
            label: info.label,
          }))}
          onChange={(paper) => setPageSetup({ paper })}
        />
      </Field>

      <Field label="Orientation">
        <SelectField<Orientation>
          value={setup.orientation}
          options={[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ]}
          onChange={(orientation) => setPageSetup({ orientation })}
        />
      </Field>

      {/* Margins: a preset, or Custom to type all four edges.
          "Custom" is a real, selectable option rather than a label that only appeared
          once the numbers happened not to match a preset — previously there was no way
          to *reach* custom margins from this panel at all. Choosing it keeps the current
          numbers as the starting point, so it opens the fields rather than resetting. */}
      <Field label="Margins" hint="Pick a preset, or set each edge yourself.">
        <SelectField<number>
          value={customOpen || presetIndex < 0 ? -1 : presetIndex}
          options={[
            ...MARGIN_PRESETS.map((preset, index) => ({ value: index, label: preset.label })),
            { value: -1, label: 'Custom…' },
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
                label={label}
                twips={setup.margins[key]}
                onChange={(next) => setPageSetup({ margins: { ...setup.margins, [key]: next } })}
              />
            ))}
          </div>
          {/* Word's own floor. Below this most printers clip, so the page would not
              print as previewed — the input clamps rather than warning after the fact. */}
          <p className="text-[11px] text-ink-subtle">
            0–5 cm per edge. Stored in twips, exactly as Word writes them.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Header and footer settings.
 *
 * Deliberately small. Everything that has a place on the printed page — the text, the
 * rows, which zone a field sits in — is edited *on* the page (§ "the preview is the
 * editor"); this keeps only what has no visual representation there: whether the band
 * prints at all, whether it carries a rule, and whether page 1 shows it. Presets live
 * here too, because choosing a starting layout is a decision about the document rather
 * than a manipulation of it.
 */
/** Which of the three page-1 states a stored header/footer is in. */
function firstPageModeOf(value: HeaderFooter): FirstPageMode {
  if (value.firstPage) return 'different';
  return value.showOnFirstPage === false ? 'blank' : 'same';
}

function HeaderFooterSection({ which }: { which: 'header' | 'footer' }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setHeaderFooter = useWorksheetStore((s) => s.setHeaderFooter);
  const setBands = useWorksheetStore((s) => s.setHeaderFooterBands);
  const addBand = useWorksheetStore((s) => s.addHeaderFooterBand);
  const setFirstPageMode = useWorksheetStore((s) => s.setFirstPageMode);

  const value = headerFooterOf(
    worksheet[which],
    which === 'header' ? defaultHeader : defaultFooter,
  );
  const presets = HEADER_FOOTER_PRESETS.filter((preset) => preset.edge === which);
  const name = which === 'header' ? 'Header' : 'Footer';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">{name}</h3>
        <CheckField
          label={`Show ${which}`}
          checked={value.enabled}
          onChange={(enabled) => setHeaderFooter(which, { enabled })}
        />
      </div>

      {value.enabled && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-sunken p-3.5">
          <p className="text-xs leading-relaxed text-ink-muted">
            {value.bands.length === 0
              ? 'Start from a layout below, then type on the page.'
              : 'Click the text on the page to edit it. Drag a field between the left, centre and right zones.'}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                onClick={() => setBands(which, preset.build())}
              >
                {preset.name}
              </Button>
            ))}
            <Button size="sm" variant="subtle" onClick={() => addBand(which)}>
              + Row
            </Button>
            {value.bands.length > 0 && (
              <Button size="sm" variant="subtle" onClick={() => setBands(which, [])}>
                Clear
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
            <CheckField
              label="Rule line"
              checked={Boolean(value.rule)}
              onChange={(rule) => setHeaderFooter(which, { rule })}
            />
          </div>

          {/* What page 1 does. Three states rather than a checkbox, because a cover page
              usually wants its *own* header — school and paper name — rather than either
              the running one or nothing at all. Word expresses exactly this with
              `w:titlePg`, so the choice maps onto one flag in the export. */}
          <div className="space-y-2 border-t border-line pt-3">
            <span className="block text-[13px] font-medium text-ink">First page</span>
            <Segmented<FirstPageMode>
              label={`First page ${which}`}
              value={firstPageModeOf(value)}
              onChange={(next) => setFirstPageMode(which, next)}
              options={[
                { value: 'same', label: 'Same', title: `Page 1 shows the same ${which}` },
                { value: 'blank', label: 'Blank', title: `Page 1 shows no ${which}` },
                {
                  value: 'different',
                  label: 'Different',
                  title: `Page 1 has its own ${which}, edited on the first page`,
                },
              ]}
            />
            {firstPageModeOf(value) === 'different' && (
              <p className="text-xs leading-relaxed text-ink-muted">
                Page 1 started as a copy of the rows above. Edit it directly on the first
                sheet — the other pages keep what is set here.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The masthead — rows of left/centre/right zones at the top of page one. */
function TitleBlockTab() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setBands = useWorksheetStore((s) => s.setBands);
  const addBand = useWorksheetStore((s) => s.addBand);
  const addBandField = useWorksheetStore((s) => s.addBandField);
  const bands = worksheet.bands ?? [];

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-[13px] font-medium text-ink">Title block</span>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
          Replaces the plain centred title with rows of left / centre / right zones you drag
          fields between, on the page itself.
        </p>
      </div>

      {bands.length === 0 ? (
        <Button
          onClick={() =>
            setBands(assessmentTitleBlock(worksheet.title, bi('Assessment 1', '測驗一')))
          }
        >
          Add title block
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-line bg-surface-sunken p-3.5">
          <p className="text-xs text-ink-muted">
            {bands.length} row{bands.length === 1 ? '' : 's'} · drag fields between zones on the
            page.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => addBand()}>
              + Row
            </Button>
            <Button
              size="sm"
              variant="subtle"
              title="Add a computed total-marks field to the last row"
              onClick={() =>
                addBandField(bands[bands.length - 1].id, 'left', createTotalMarksField())
              }
            >
              + Full marks
            </Button>
            <Button
              size="sm"
              variant="subtle"
              title="Add a ruled fill-in field to the last row"
              onClick={() =>
                addBandField(
                  bands[bands.length - 1].id,
                  'right',
                  createFillInField(bi('Name:', '姓名：')),
                )
              }
            >
              + Fill-in
            </Button>
            <Button size="sm" variant="danger" onClick={() => setBands([])}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentSettings({
  initialTab = 'document',
  onClose,
}: {
  initialTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <Dialog
      title="Document settings"
      description="Applies to the whole worksheet. Changes show on the page immediately."
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
          {
            id: 'document',
            label: 'Worksheet',
            hint: 'Title, fonts, sections',
            icon: <DocumentIcon size={16} />,
          },
          { id: 'page', label: 'Page', hint: 'Paper, margins', icon: <PageIcon size={16} /> },
          {
            id: 'headerFooter',
            label: 'Header & footer',
            hint: 'Rules, page numbers',
            icon: <TextIcon size={16} />,
          },
          {
            id: 'titleBlock',
            label: 'Title block',
            hint: 'Masthead rows',
            icon: <SectionIcon size={16} />,
          },
        ]}
      >
        {tab === 'document' && <DocumentTab />}
        {tab === 'page' && <PageTab />}
        {tab === 'headerFooter' && (
          <div className="space-y-6">
            <HeaderFooterSection which="header" />
            <HeaderFooterSection which="footer" />
          </div>
        )}
        {tab === 'titleBlock' && <TitleBlockTab />}
      </DialogTabs>
    </Dialog>
  );
}
