'use client';

import { useState } from 'react';
import { Collapsible } from '@/components/ui/Collapsible';
import { Button, CheckField, IconButton, SelectField } from '@/components/ui';
import { assessmentTitleBlock, createFillInField, createTotalMarksField } from '@/model/bands';
import {
  createPageCountPart,
  createPageNumberPart,
  createTextPart,
  defaultFooter,
  defaultHeader,
  headerFooterOf,
  MARGIN_PRESETS,
  PAPER_SIZES,
  cmToTwips,
  pageSetupOf,
  twipsToCm,
} from '@/model/page';
import { bi, emptyBiText } from '@/model/text';
import type { HeaderFooterSlots, Orientation, PageMargins, PaperSize } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { BiTextField } from './BiTextField';

/**
 * Page design controls: paper, orientation, margins, and the header/footer content.
 *
 * Header and footer are edited as three slots (left / centre / right) because that is
 * how they print — the same three-tab layout the .docx writes. Page numbers are
 * inserted as a token rather than typed, since the export turns them into live Word
 * fields that renumber per page.
 */

const SLOTS: Array<{ key: keyof HeaderFooterSlots; label: string }> = [
  { key: 'left', label: 'Left' },
  { key: 'center', label: 'Centre' },
  { key: 'right', label: 'Right' },
];

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
    <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span className="w-12">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        min={0}
        max={5}
        value={draft ?? asText(twips)}
        className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-xs tabular-nums text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
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

function HeaderFooterEditor({ which }: { which: 'header' | 'footer' }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setHeaderFooter = useWorksheetStore((s) => s.setHeaderFooter);
  const addPart = useWorksheetStore((s) => s.addHeaderFooterPart);
  const updatePart = useWorksheetStore((s) => s.updateHeaderFooterPart);
  const removePart = useWorksheetStore((s) => s.removeHeaderFooterPart);

  const value = headerFooterOf(
    worksheet[which],
    which === 'header' ? defaultHeader : defaultFooter,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CheckField
          label={which === 'header' ? 'Show header' : 'Show footer'}
          checked={value.enabled}
          onChange={(enabled) => setHeaderFooter(which, { enabled })}
        />
        <CheckField
          label="Rule line"
          checked={Boolean(value.rule)}
          onChange={(rule) => setHeaderFooter(which, { rule })}
        />
        <CheckField
          label="On page 1"
          checked={value.showOnFirstPage !== false}
          onChange={(showOnFirstPage) => setHeaderFooter(which, { showOnFirstPage })}
        />
      </div>

      {value.enabled &&
        SLOTS.map(({ key, label }) => (
          <div key={key} className="rounded-md border border-line p-2 ">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-subtle ">
                {label}
              </span>
              <div className="flex items-center gap-0.5">
                <IconButton
                  label={`Add text to ${label.toLowerCase()}`}
                  onClick={() => addPart(which, key, createTextPart(emptyBiText()))}
                >
                  T
                </IconButton>
                <IconButton
                  label={`Insert page number in ${label.toLowerCase()}`}
                  onClick={() => addPart(which, key, createPageNumberPart())}
                >
                  #
                </IconButton>
                <IconButton
                  label={`Insert total page count in ${label.toLowerCase()}`}
                  onClick={() => addPart(which, key, createPageCountPart())}
                >
                  N
                </IconButton>
              </div>
            </div>

            {value.slots[key].length === 0 ? (
              <p className="text-[11px] text-ink-subtle">Empty</p>
            ) : (
              <div className="space-y-1.5">
                {value.slots[key].map((part) => (
                  <div key={part.id} className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      {part.kind === 'text' ? (
                        <BiTextField
                          value={part.text}
                          rows={1}
                          onChange={(text) => updatePart(which, key, part.id, text)}
                        />
                      ) : (
                        <span className="inline-block rounded bg-surface-hover px-1.5 py-1 text-[11px] text-ink-muted">
                          {part.kind === 'pageNumber' ? 'Page number (#)' : 'Total pages (N)'}
                        </span>
                      )}
                    </div>
                    <IconButton
                      label="Remove"
                      variant="danger"
                      onClick={() => removePart(which, key, part.id)}
                    >
                      ✕
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

export function PageSetupPanel() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setPageSetup = useWorksheetStore((s) => s.setPageSetup);
  const addPart = useWorksheetStore((s) => s.addHeaderFooterPart);
  const setBands = useWorksheetStore((s) => s.setBands);
  const addBand = useWorksheetStore((s) => s.addBand);
  const addBandField = useWorksheetStore((s) => s.addBandField);

  const setup = pageSetupOf(worksheet);
  const bands = worksheet.bands ?? [];

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
    <Collapsible title="Page & header/footer">
      <div className="space-y-3">
        <SelectField<PaperSize>
          label="Paper"
          value={setup.paper}
          options={Object.entries(PAPER_SIZES).map(([value, info]) => ({
            value: value as PaperSize,
            label: info.label,
          }))}
          onChange={(paper) => setPageSetup({ paper })}
        />

        <SelectField<Orientation>
          label="Orientation"
          value={setup.orientation}
          options={[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ]}
          onChange={(orientation) => setPageSetup({ orientation })}
        />

        {/* Margins: a preset, or Custom to type all four edges.
            "Custom" is a real, selectable option rather than a label that only appeared
            once the numbers happened not to match a preset — previously there was no way
            to *reach* custom margins from this panel at all, so any value outside the
            preset list was unreachable. Choosing it keeps the current numbers as the
            starting point, so it opens the fields rather than resetting the page. */}
        <SelectField<number>
          label="Margins"
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

        {(customOpen || presetIndex < 0) && (
          <div className="space-y-2 rounded-lg border border-line bg-surface p-2">
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              {MARGIN_EDGES.map(({ key, label }) => (
                <CmField
                  key={key}
                  label={label}
                  twips={setup.margins[key]}
                  onChange={(next) =>
                    setPageSetup({ margins: { ...setup.margins, [key]: next } })
                  }
                />
              ))}
            </div>
            {/* Word's own floor. Below this most printers clip, so the page would not
                print as previewed — the input clamps rather than warning after the fact. */}
            <p className="text-[10px] text-ink-subtle">
              0–5 cm per edge. Values are stored in twips, exactly as Word writes them.
            </p>
          </div>
        )}

        <div className="space-y-2 border-t border-line pt-2 ">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle ">
            Header
          </span>
          <HeaderFooterEditor which="header" />
        </div>

        <div className="space-y-2 border-t border-line pt-2 ">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle ">
            Footer
          </span>
          <HeaderFooterEditor which="footer" />
        </div>

        {/* The line nearly every worksheet needs; typing it out each time is busywork. */}
        <div className="border-t border-line pt-2 ">
          <Button
            size="sm"
            onClick={() => {
              addPart('header', 'left', createTextPart(bi('Name: ____________', '姓名：____________')));
              addPart('header', 'center', createTextPart(bi('Class: ______', '班別：______')));
              addPart('header', 'right', createTextPart(bi('Date: ______', '日期：______')));
            }}
          >
            + Add Name / Class / Date line
          </Button>
        </div>

        {/* The masthead. Editing happens on the page itself — this panel only creates it
            and adds rows, because dragging fields between zones belongs where they print. */}
        <div className="space-y-2 border-t border-line pt-2 ">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle ">
            Title block
          </span>
          {bands.length === 0 ? (
            <>
              <p className="text-[11px] text-ink-subtle">
                A title block replaces the plain centred title with rows of left / centre /
                right zones you can drag fields between on the page.
              </p>
              <Button
                size="sm"
                onClick={() =>
                  setBands(
                    assessmentTitleBlock(
                      worksheet.title,
                      bi('Assessment 1', '測驗一'),
                    ),
                  )
                }
              >
                + Add title block
              </Button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-ink-subtle">
                {bands.length} row{bands.length === 1 ? '' : 's'} · drag fields between zones
                on the page
              </p>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="subtle" onClick={addBand}>
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
            </>
          )}
        </div>
      </div>
    </Collapsible>
  );
}
