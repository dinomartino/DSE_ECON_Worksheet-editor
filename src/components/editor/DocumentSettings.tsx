'use client';

import { useState } from 'react';
import { Dialog, DialogTabs, Field } from '@/components/ui/Dialog';
import { Button, CheckField, GroupHeader, SelectField } from '@/components/ui';
import { DocumentIcon, PageIcon, TextIcon } from '@/components/ui/icons';
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
import { bi, emptyBiText, plain } from '@/model/text';
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
type Tab = 'document' | 'page' | 'furniture';

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
      <Field
        label="Title"
        hint={
          usingTitleBlock
            ? 'Used for the file name. The title block prints on page 1 instead — edit that on the page.'
            : 'Printed at the top of the first page.'
        }
      >
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

      {/* Portrait only. Shown rather than hidden so the page setup still reads as
          complete — a missing row invites "where did orientation go?" — but stated as
          a fact instead of a one-option `<select>`, which looks interactive and does
          nothing when clicked. The model keeps `Orientation` as a two-value union and
          the exporter still writes `w:orient`, so restoring the choice is one edit
          here. */}
      <Field label="Orientation" hint="Worksheets print portrait.">
        <span className="block text-xs text-ink-muted">Portrait</span>
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
    <p className="rounded-lg border border-[#f0d9a8] bg-[#fdf6e6] px-3 py-2 text-[11px] leading-relaxed text-[#7a5c1e]">
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
    <p className="rounded-lg border border-[#f0d9a8] bg-[#fdf6e6] px-3 py-2 text-[11px] leading-relaxed text-[#7a5c1e]">
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
function HeaderFooterSection({ which }: { which: 'header' | 'footer' }) {
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
          <p className="text-[11px] text-ink-muted">Printed at the {edge} of the page.</p>
        </div>
        <CheckField
          label="Show"
          checked={value.enabled}
          onChange={(enabled) => setHeaderFooter(which, { enabled })}
        />
      </div>

      {value.enabled && (
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
          className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            !usingBlock
              ? 'border-accent bg-accent/5 ring-1 ring-accent'
              : 'border-line bg-surface hover:border-ink-subtle'
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
            className={`text-[11px] font-medium ${!usingBlock ? 'text-accent' : 'text-ink-muted'}`}
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
          className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            usingBlock
              ? 'border-accent bg-accent/5 ring-1 ring-accent'
              : 'border-line bg-surface hover:border-ink-subtle'
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
            className={`text-[11px] font-medium ${usingBlock ? 'text-accent' : 'text-ink-muted'}`}
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
            id: 'furniture',
            label: 'Title & edges',
            hint: 'Header, footer, page 1',
            icon: <TextIcon size={16} />,
          },
        ]}
      >
        {tab === 'document' && <DocumentTab />}
        {tab === 'page' && <PageTab />}
        {/* Ordered down the page — title, then the top of every page, then the bottom —
            so the panel reads in the order the printed sheet does. */}
        {tab === 'furniture' && (
          <div className="space-y-6">
            <BandOverflowNotice />
            <DuplicateFieldNotice />
            <TitleSection />
            <div className="border-t border-line pt-5">
              <HeaderFooterSection which="header" />
            </div>
            <div className="border-t border-line pt-5">
              <HeaderFooterSection which="footer" />
            </div>
          </div>
        )}
      </DialogTabs>
    </Dialog>
  );
}
