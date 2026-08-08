'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogTabs, Field } from '@/components/ui/Dialog';
import { Button, CheckField, GroupHeader, SelectField } from '@/components/ui';
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
  headerFooterOf,
  MARGIN_PRESETS,
  PAPER_SIZES,
  pageSetupOf,
  twipsToCm,
} from '@/model/page';
import { isQabDocument } from '@/model/pageFurniture';
import { documentShape } from '@/model/documentShape';
import { requireQuestionType } from '@/registry';
import { bi, emptyBiText, plain } from '@/model/text';
import { academicYear, type CoverPaperStyle } from '@/model/cover';
import type { Band, HeaderFooter, PageMargins, PaperSize } from '@/model/types';
import { useWorksheetStore, type BandScope } from '@/store/worksheetStore';
import { BandPreview, BandPresetCard } from './BandPreview';
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

/**
 * Four tabs became three.
 *
 * "Title block" was its own tab while printing on page 1 immediately below the header
 * and replacing the title set on the "Worksheet" tab — one decision spread over three
 * places, none of which mentioned the other two. They are now one tab ordered down the
 * page: title, then header, then footer.
 */
type Tab = 'document' | 'page' | 'furniture' | 'cover';

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
        label="Title"
        hint={
          usingTitleBlock
            ? 'The title block prints on page 1 instead — edit that on the page. To rename the file, click its name in the toolbar.'
            : 'Printed at the top of the first page. To rename the file, click its name in the toolbar.'
        }
      >
        <BiTextField
          ariaLabel="Worksheet title"
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
        label="Instructions"
        hint={
          worksheet.cover
            ? 'A line under the title. This paper’s rubric lives on the cover — edit it there.'
            : 'A line under the title — e.g. “Answer ALL questions.”'
        }
      >
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
        <Field label="Paper size" hint="Fixed by the booklet's page frame.">
          <span className="block text-xs text-ink-muted">
            {PAPER_SIZES[setup.paper].label} — the size the reference booklet’s frame and
            answer-line pitch were measured against.
          </span>
        </Field>
      ) : (
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
      )}

      {/* Portrait only. Shown rather than hidden so the page setup still reads as
          complete — a missing row invites "where did orientation go?" — but stated as
          a fact instead of a one-option `<select>`, which looks interactive and does
          nothing when clicked. The model keeps `Orientation` as a two-value union and
          the exporter still writes `w:orient`, so restoring the choice is one edit
          here. */}
      <Field label="Orientation" hint="Worksheets print portrait.">
        <span className="block text-xs text-ink-muted">Portrait</span>
      </Field>

      {/* The booklet's margins are measured, not chosen.
          Its page furniture — the frame and the two rotated margin notes — is positioned
          against the reference's own column, and its lines-per-page were counted in it,
          so a changed margin moves the frame away from the text it frames and re-cuts
          every answer page. Stated rather than offered-and-ignored (§ `documentShape`:
          withhold, and say why). */}
      {shape === 'lqMock' ? (
        <Field label="Margins" hint="Fixed by the booklet's page frame.">
          <span className="block text-xs text-ink-muted">
            The reference booklet’s own margins. The page frame and margin notes are
            positioned against this column, so changing it would move them off the text
            they frame.
          </span>
        </Field>
      ) : shape === 'paper1' ? (
        <Field label="Margins" hint="Fixed by the reference paper.">
          <span className="block text-xs text-ink-muted">
            The reference MCQ paper’s own margins. Question, statement and option
            indents were measured against this column, so the geometry is fixed
            together.
          </span>
        </Field>
      ) : (
        <>
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
        </>
      )}

      {/* The exam paper's between-question air, in blank lines on the fixed 12pt grid.
          The default is the question type's own measured number (§ `examGapLines`), so
          "Default" is stored as absence and keeps tracking it; a chosen number is the
          document's own (§ `Worksheet.examGapLines`). Offered only on the MCQ paper —
          the wide boundary exists nowhere else (§ `boundaryGapLines`). */}
      {shape === 'paper1' && (
        <Field
          label="Between questions"
          hint="Blank lines separating one question from the next. A single question can override this in its own panel, or by dragging its gap on the page."
        >
          <SelectField<number>
            value={worksheet.examGapLines ?? 0}
            options={[
              {
                value: 0,
                label: `Default — ${
                  // Read off the paper's own questions rather than naming a type:
                  // whatever kind this paper holds states its own measured gap.
                  (worksheet.questions[0]
                    ? requireQuestionType(worksheet.questions[0]).examGapLines
                    : undefined) ?? 3
                } lines (the reference paper)`,
              },
              ...[1, 2, 3, 4, 5, 6].map((lines) => ({
                value: lines,
                label: lines === 1 ? '1 line' : `${lines} lines`,
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
 * Header and footer settings.
 *
 * Organised by **where a thing prints** — the top of every page, the bottom of every
 * page, page 1's own — rather than by which model field stores it. That is the question
 * a teacher actually arrives with ("how do I get the school name at the top?"), and the
 * old arrangement answered a different one: it grouped by mechanism, so the masthead sat
 * on a separate "Title block" tab from the header despite printing three centimetres
 * below it and doing a visibly similar job.
 *
 * Everything with a place on the printed page — the text, the rows, which zone a field
 * sits in — is still edited *on* the page (§ "the preview is the editor"). What stays
 * here is what has no visual representation there: whether the band prints at all,
 * whether it carries a rule, what page 1 does, and the presets, because choosing a
 * starting layout is a decision about the document rather than a manipulation of it.
 */
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
      <span className="font-medium">Full marks appears more than once.</span> The total is
      worked out from the questions, so it will print the same number in each place. Remove
      the one you do not want by hovering it on the page and clicking ✕.
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
      <span className="font-medium">
        The {edges.join(' and ')} {edges.length > 1 ? 'are' : 'is'} taller than the margin.
      </span>{' '}
      About {cm} cm of it runs into the page, so questions are pushed down. Give the page a
      bigger {edges[0] === 'header' ? 'top' : 'bottom'} margin on the Page tab, or remove a
      row.
    </p>
  );
}

/**
 * One editable row list — either page 1's or the running rows.
 *
 * Both surfaces are the same thing (a `Band[]` printed at one edge), so they get one
 * component: the only differences are which list the writes are scoped to and what the
 * surface is called. Two hand-written copies would drift, and the pair has to look alike
 * for the split to read as "the same choice, made twice".
 */
function BandSurface({
  which,
  scope,
  label,
  hint,
  bands,
  rule,
  onRule,
  extraAction,
}: {
  which: 'header' | 'footer';
  scope: BandScope;
  label: string;
  hint: string;
  bands: Band[];
  rule: boolean | undefined;
  onRule?: (rule: boolean) => void;
  extraAction?: React.ReactNode;
}) {
  const setBands = useWorksheetStore((s) => s.setHeaderFooterBands);
  const addBand = useWorksheetStore((s) => s.addHeaderFooterBand);
  const presets = HEADER_FOOTER_PRESETS.filter((preset) => preset.edge === which);

  return (
    <div className="space-y-2">
      <GroupHeader title={label} hint={hint} />

      {/*
        An empty surface offers exactly one way forward — pick a layout. With rows present
        it offers the opposite: what is printing now, and the controls to adjust it.
        Showing both at once gave three competing answers to "how do I start".
      */}
      {bands.length === 0 ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => (
              <BandPresetCard
                key={preset.id}
                name={preset.name}
                bands={preset.build()}
                edge={which}
                onClick={() => setBands(which, preset.build(), scope)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Button size="sm" variant="subtle" onClick={() => addBand(which, undefined, scope)}>
              Or start with an empty row
            </Button>
            {extraAction}
          </div>
        </div>
      ) : (
        <>
          <div>
            <div className="rounded-lg border border-line bg-[#fdfcfa] py-1.5 text-[#3f3b38]">
              <BandPreview bands={bands} rule={rule} edge={which} />
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Click this {which} on the page to type in it, or drag a field between the left,
              centre and right zones.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {onRule && (
              <CheckField label="Rule line" checked={Boolean(rule)} onChange={onRule} />
            )}
            <Button size="sm" variant="subtle" onClick={() => addBand(which, undefined, scope)}>
              + Row
            </Button>
            <Button size="sm" variant="subtle" onClick={() => setBands(which, [], scope)}>
              Clear
            </Button>
            {extraAction}
          </div>

          {/* Presets as pictures. A name told a teacher nothing about the layout, so the
              only way to compare them was to apply each in turn — destroying whatever was
              there each time. */}
          <details className="pt-0.5">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-ink-muted hover:text-ink">
              Replace with a different layout ▾
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <BandPresetCard
                  key={preset.id}
                  name={preset.name}
                  bands={preset.build()}
                  edge={which}
                  onClick={() => setBands(which, preset.build(), scope)}
                />
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/**
 * One edge, presented as the two surfaces it actually prints on.
 *
 * **Page 1 comes first, and is edited directly.** It used to be defined *relative to* the
 * running rows: a teacher wanting a cover had to build a header for pages 2+ they might
 * not want, then choose "Its own rows" — which copied it — then edit the copy. That is
 * backwards from how a paper is made, where the cover is the first thing decided and the
 * running line is the afterthought. Now each surface owns its rows, its presets and its
 * rule, and choosing a page-1 layout writes `firstPage` directly (the store creates the
 * separation on the first page-1 write rather than demanding it already exist).
 *
 * The two are still linked, because most papers do repeat one header: "Same as page 1"
 * copies across, and "Same as pages 2+" collapses the split back to one list. Those are
 * offered as quiet actions rather than as the mode a teacher must pass through.
 */
function HeaderFooterSection({
  which,
  alwaysOn = false,
}: {
  which: 'header' | 'footer';
  /**
   * Withhold the on/off switch — the booklet's footer is part of its shape, not an
   * option (§ `EdgeSections`). The rows themselves stay fully editable.
   */
  alwaysOn?: boolean;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setHeaderFooter = useWorksheetStore((s) => s.setHeaderFooter);
  const setFirstPageMode = useWorksheetStore((s) => s.setFirstPageMode);
  const setFirstPageBands = useWorksheetStore((s) => s.setFirstPageBands);

  const value = headerFooterOf(
    worksheet[which],
    which === 'header' ? defaultHeader : defaultFooter,
  );
  const name = which === 'header' ? 'Header' : 'Footer';
  const edge = which === 'header' ? 'top' : 'bottom';
  const enabled = alwaysOn || value.enabled;

  // Resolved in the model, so the panel cannot disagree with the page about which of the
  // three states this document is in (§ Page 1 can differ).
  const firstPage = firstPageHeaderFooter(value);
  const separated = Boolean(value.firstPage);
  const blankOnFirst = !separated && value.showOnFirstPage === false;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">{name}</h3>
          <p className="text-[11px] text-ink-muted">
            {alwaysOn
              ? `Always printed on a Question-Answer Book.`
              : `Printed at the ${edge} of the page.`}
          </p>
        </div>
        {!alwaysOn && (
          <CheckField
            label="Show"
            checked={value.enabled}
            onChange={(on) => setHeaderFooter(which, { enabled: on })}
          />
        )}
      </div>

      {enabled && (
        <div className="space-y-3.5 rounded-xl border border-line bg-surface-sunken p-3.5">
          {/*
            Page 1 first: it is the sheet a teacher builds first, and the one they are
            looking at when they open this dialog.
          */}
          {blankOnFirst ? (
            <div className="space-y-2">
              <GroupHeader title="Page 1" hint="Nothing prints on the first sheet." />
              <Button size="sm" variant="subtle" onClick={() => setFirstPageMode(which, 'same')}>
                Print the {which} on page 1 too
              </Button>
            </div>
          ) : (
            <BandSurface
              which={which}
              scope={separated ? 'firstPage' : 'running'}
              label="Page 1"
              hint={
                separated
                  ? 'Its own rows — the cover.'
                  : 'Currently the same rows as later pages.'
              }
              bands={firstPage.bands}
              rule={firstPage.rule}
              onRule={
                separated
                  ? (rule) =>
                      setHeaderFooter(which, { firstPage: { ...value.firstPage!, rule } })
                  : (rule) => setHeaderFooter(which, { rule })
              }
              extraAction={
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setFirstPageMode(which, 'blank')}
                >
                  Leave page 1 blank
                </Button>
              }
            />
          )}

          <div className="space-y-2 border-t border-line pt-3">
            {separated ? (
              <BandSurface
                which={which}
                scope="running"
                label="Pages 2 onward"
                hint="The running line, repeated on every later sheet."
                bands={value.bands}
                rule={value.rule}
                onRule={(rule) => setHeaderFooter(which, { rule })}
                extraAction={
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => setFirstPageMode(which, 'same')}
                  >
                    Same as page 1
                  </Button>
                }
              />
            ) : (
              <div className="space-y-1.5">
                <GroupHeader
                  title="Pages 2 onward"
                  hint={
                    blankOnFirst ? 'The rows above print from page 2.' : 'The same rows as page 1.'
                  }
                />
                {/*
                  The one action that opens the split, offered *after* page 1 is built
                  rather than required before it. It copies the current rows, since a
                  teacher separating the two almost always wants "like the others, but
                  with the school name" — starting blank would make them rebuild it.
                */}
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setFirstPageMode(which, 'different')}
                >
                  Give page 1 its own {which}
                </Button>
              </div>
            )}
          </div>

          {separated && (
            <p className="rounded-lg bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-ink-muted">
              Both are edited on the page too — hover the {which} on the sheet you want to
              change and type, add a row or remove one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The masthead — the rows printed on page 1 between the header and the first question.
 *
 * Presented as **two ways of titling the document**, one of which is in use, because
 * that is what they are and the interface used to hide it. `worksheet.title` and the
 * masthead bands both print a centred bold line near the top of page 1, the bands
 * *silently replace* the title when present (see `Preview`'s masthead block), and the
 * two lived on separate tabs — "Worksheet" and "Title block" — with nothing saying so.
 * A teacher who added a title block watched their typed title disappear and had no way
 * to connect the two actions.
 *
 * So the choice is stated once, as a choice, with the consequence drawn under each
 * option rather than discovered by trying it.
 */
/**
 * Build a mock-exam cover.
 *
 * A once-per-document decision with its own options, so it lives here rather than on the
 * add rail — and it is deliberately a *form with a button*, not a live-bound section: the
 * cover it produces is plain elements a teacher then edits on the page (see
 * `model/cover.ts`). Re-running it replaces the cover rather than stacking a second one.
 */
function CoverTab({ onClose }: { onClose: () => void }) {
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
        <h3 className="text-[13px] font-semibold text-ink">Mock exam cover</h3>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          A two-column front page: the paper’s identity and instructions on the left, a
          candidate panel on the right. Every line is edited on the page afterwards, like
          any other text.
        </p>
      </div>

      <Field
        label="Paper style"
        hint="The two differ in where candidates put their answers, which is what the instructions have to say."
      >
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['mcq', 'Multiple choice', 'Answers on a separate answer sheet'],
              ['writeIn', 'Write-in booklet', 'Answers in the spaces provided'],
            ] as Array<[CoverPaperStyle, string, string]>
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={paperStyle === value}
              onClick={() => setPaperStyle(value)}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition-[background-color,border-color,color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
        {field('Corner code', code, setCode, coverYear.short)}
        {field('School', school, setSchool, 'SCHOOL NAME')}
        {field('Examination', examName, setExamName, `S.6 MOCK EXAMINATION ${coverYear.long}`)}
        {field('Paper', paperName, setPaperName, 'ECONOMICS   PAPER 1')}
        {field('Time allowed', timeAllowed, setTimeAllowed, '8:30 am – 9:30 am (1 hour)')}
      </div>

      {hasCover && <CoverOptions />}

      {hasCover && (
        <p className="rounded-lg border border-line bg-surface-sunken p-2.5 text-[11px] leading-relaxed text-ink-muted">
          This document already has a cover. Building another replaces it.
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
            Remove cover
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
          {hasCover ? 'Replace cover' : 'Add cover page'}
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
  const cover = useWorksheetStore((s) => s.worksheet.cover);
  const updateCover = useWorksheetStore((s) => s.updateCover);
  if (!cover) return null;

  const marker = cover.instructionMarker ?? 'paren';
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <h4 className="text-[12px] font-semibold text-ink">Cover options</h4>

      <Field
        label="Instruction numbers"
        hint="A house style: the reference’s Paper 1 numbers “1.”, its Paper 2 “(1)”."
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
              className={`h-8 flex-1 cursor-pointer rounded-lg border text-[13px] transition-[background-color,border-color,color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
        label="Write-in boxes"
        hint="Boxes beside the panel label. 0 draws none; with an empty note that removes the panel and the cover prints one wide column."
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

function TitleSection() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setBands = useWorksheetStore((s) => s.setBands);
  const addBand = useWorksheetStore((s) => s.addBand);
  const addBandField = useWorksheetStore((s) => s.addBandField);
  const bands = worksheet.bands ?? [];
  const usingBlock = bands.length > 0;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Title on page 1</h3>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Printed below the header, above the first question. Choose one — a title block
          takes the place of the plain title rather than printing as well as it.
        </p>
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
          className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-[background-color,border-color,color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
              {plain(worksheet.title.en) || plain(worksheet.title.zh) || 'Worksheet title'}
            </span>
          </div>
          <span
            className={`text-[11px] font-medium ${!usingBlock ? 'text-ink' : 'text-ink-muted'}`}
          >
            Just the title
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
          className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-[background-color,border-color,color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
            Title block (name, marks, time)
          </span>
        </button>
      </div>

      {usingBlock && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-sunken p-3">
          <span className="mr-1 text-[11px] text-ink-muted">
            Edit the text on the page. Add to the last row:
          </span>
          <Button size="sm" variant="subtle" onClick={() => addBand()}>
            + Row
          </Button>
          <Button
            size="sm"
            variant="subtle"
            title="A total computed from the question marks"
            onClick={() =>
              addBandField(bands[bands.length - 1].id, 'left', createTotalMarksField())
            }
          >
            + Full marks
          </Button>
          <Button
            size="sm"
            variant="subtle"
            title="A ruled line to write on"
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
        </div>
      )}
    </section>
  );
}

/**
 * The header and footer sections, shaped by what the document is.
 *
 * A Question-Answer Book always prints its footer and never offers a header: the
 * header part is the vehicle for the page frame and margin notes, and no page of the
 * reference booklet carries a headed line. The controls are **withheld, not greyed
 * out** — a disabled switch invites the question "why can't I", while a sentence
 * answers it (§ missing per-cell controls are explained).
 */
function EdgeSections() {
  const qab = useWorksheetStore((s) => isQabDocument(s.worksheet));
  return (
    <>
      <div className="border-t border-line pt-5">
        {qab ? (
          <section>
            <h3 className="text-[13px] font-semibold text-ink">Header</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              A Question-Answer Book prints no header — the page frame and the margin
              notes occupy the top of every sheet, as the reference booklet has it.
            </p>
          </section>
        ) : (
          <HeaderFooterSection which="header" />
        )}
      </div>
      <div className="border-t border-line pt-5">
        <HeaderFooterSection which="footer" alwaysOn={qab} />
      </div>
    </>
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
          { id: 'document', label: 'Worksheet', hint: 'Title, fonts, sections' },
          { id: 'page', label: 'Page', hint: 'Paper, margins' },
          { id: 'furniture', label: 'Title & edges', hint: 'Header, footer, page 1' },
          { id: 'cover', label: 'Cover', hint: 'Mock exam front page' },
        ]}
      >
        {tab === 'document' && <DocumentTab />}
        {tab === 'cover' && <CoverTab onClose={onClose} />}
        {tab === 'page' && <PageTab />}
        {/* Ordered down the page — title, then the top of every page, then the bottom —
            so the panel reads in the order the printed sheet does. */}
        {tab === 'furniture' && (
          <div className="space-y-6">
            <BandOverflowNotice />
            <DuplicateFieldNotice />
            <TitleSection />
            <EdgeSections />
          </div>
        )}
      </DialogTabs>
    </Dialog>
  );
}
