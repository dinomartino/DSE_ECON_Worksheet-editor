'use client';

import { useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { emptyBiText, isBiTextEmpty, plain } from '@/model/text';
import type { PieSlice } from '@/model/diagram';
import type { CaptionPlacement, DiagramBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { diagramSize, diagramSvg } from '@/render/diagram';
import {
  Button,
  FigureAlignField,
  IconButton,
  NumberField,
  Segmented,
} from '@/components/ui';
import { BiTextField } from './BiTextField';
import { DiagramCanvas } from './DiagramCanvas';
import { DiagramTemplatePopover } from './DiagramTemplatePicker';
import { FlowCanvas } from './FlowCanvas';

/**
 * The diagram block's panel: **everything except the drawing** — the canvas owns the
 * geometry (the old five-tab coordinate editor failed because you cannot see what you
 * are editing). What remains is what the canvas has no opinion about: Template
 * (wholesale replacement), Width (print size; the canvas draws at a zoom), Alt text,
 * and Title creation/placement (an absent title has nothing on the canvas to click).
 * The live thumbnail is the same renderer the exporter uses.
 */

interface Props {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
}

export function DiagramEditor({ block, onChange }: Props) {
  const language = useWorksheetStore((s) => s.mode.language);
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);
  const [drawing, setDrawing] = useState(false);

  const diagram = block.diagram;

  /*
   * Memoised for the reason `DiagramNodeView` memoises its copy: the string goes to
   * `dangerouslySetInnerHTML`, so a fresh-but-identical string makes React replace the
   * markup and the browser reparse and re-lay-out the whole SVG. This panel re-renders on
   * every keystroke in the fields below, and the thumbnail depends only on the geometry
   * and the fonts.
   */
  const preview = useMemo(
    () =>
      diagramSvg(diagram, {
        widthPx: block.widthPx,
        heightPx: block.heightPx,
        language,
        fonts,
      }),
    [diagram, block.widthPx, block.heightPx, language, fonts],
  );

  const elementCount =
    diagram.curves.length + diagram.points.length + diagram.labels.length + diagram.arrows.length;

  return (
    <div className="space-y-2">
      {/* The thumbnail is the way into the drawing surface: clicking a picture to edit it
          is the gesture teachers already expect, and it matches the rule the page preview
          follows — what you click is what you edit.

          The SVG is told to fill its box rather than to be `widthPx` wide: the sidebar is
          narrower than the printed diagram, and at print width the right-hand axis title
          would be cut off by the panel. The selector is `[&_svg]`, not `[&>svg]` — the
          markup is injected into a wrapping <span>, so the svg is a *grandchild*, and the
          direct-child form silently matched nothing. */}
      {diagram.pie ? (
        // A pie has no drawing surface — its slices are data, edited in the fields
        // below — so the thumbnail is a plain preview, not a way into a canvas.
        <div
          className="overflow-hidden rounded border border-line bg-surface [&_svg]:h-auto [&_svg]:w-full"
          style={{ lineHeight: 0 }}
        >
          <span dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      ) : (
        <button
          type="button"
          title={diagram.flow ? 'Edit this flow chart' : 'Draw on this diagram'}
          onClick={() => setDrawing(true)}
          className="group/preview relative block w-full overflow-hidden rounded border border-line bg-surface [&_svg]:h-auto [&_svg]:w-full "
          style={{ lineHeight: 0 }}
        >
          <span dangerouslySetInnerHTML={{ __html: preview }} />
          <span className="absolute inset-0 flex items-center justify-center bg-sky-500/0 opacity-0 transition-opacity group-hover/preview:bg-sky-500/10 group-hover/preview:opacity-100">
            <span className="rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-medium leading-none text-white">
              {diagram.flow ? 'Edit' : 'Draw'}
            </span>
          </span>
        </button>
      )}

      {drawing &&
        !diagram.pie &&
        (diagram.flow ? (
          <FlowCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
        ) : (
          <DiagramCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
        ))}

      {diagram.pie ? (
        <PieSliceFields
          slices={diagram.pie.slices}
          onChange={(slices) =>
            onChange({ ...block, diagram: { ...diagram, pie: { slices } } })
          }
        />
      ) : diagram.flow ? (
        /* The flow chart is edited on its own canvas — boxes drag between columns,
           arrows draw box-to-box — so the panel offers the way in and a summary, the
           same division the axes diagrams use. */
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDrawing(true)}>
            ✎ Edit flow chart
          </Button>
          <span className="text-[11px] text-ink-subtle">
            {diagram.flow.nodes.length === 0
              ? 'Empty — add boxes and arrows on the canvas'
              : `${diagram.flow.nodes.length} ${diagram.flow.nodes.length === 1 ? 'box' : 'boxes'} · ${diagram.flow.arrows.length} ${diagram.flow.arrows.length === 1 ? 'arrow' : 'arrows'}`}
          </span>
        </div>
      ) : (
        /* Draw is the weightiest control in this panel, because every edit to the picture
           itself now happens there — a teacher who does not find this button finds no way
           to change the diagram at all. `default` rather than `primary`: primary is
           reserved for Export (§weight matches consequence), and against the subtle fields
           below, default already reads as the action. The count beside it is the panel's
           one report on the geometry — it says the drawing has contents without pretending
           to list them. */
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDrawing(true)}>
            ✎ Draw
          </Button>
          <span className="text-[11px] text-ink-subtle">
            {elementCount === 0
              ? 'Empty — draw curves, points and labels'
              : `${elementCount} ${elementCount === 1 ? 'element' : 'elements'} · edit them on the canvas`}
          </span>
        </div>
      )}

      {/* Wraps, because the controls have genuinely different needs: Width is sized by
          its content while the template button wants whatever is left. In a 400px column
          that sum exceeds the row often enough that a second line is the honest answer —
          squeezing instead clipped "Width" off the edge. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-subtle">Template</span>
          {/* A visual picker, not a name list: a teacher chooses a *shape*, and the
              cards render each template through the real renderer. */}
          <DiagramTemplatePopover
            currentId={diagram.templateId ?? 'blank'}
            trigger={
              <>
                {plain(
                  DIAGRAM_TEMPLATES.find(
                    (template) => template.id === (diagram.templateId ?? 'blank'),
                  )?.name.en ?? [],
                ) || 'Blank axes'}{' '}
                ▾
              </>
            }
            onPick={(templateId) => {
              // Replacing the geometry wholesale is the point of picking a template, and it
              // routes through the store like any edit, so ⌘Z brings the old one back.
              // Re-measured, because the shapes disagree about their box — a pie is a
              // square-ish circle, the axes templates a 4:3 plot — and keeping the old
              // block size would letterbox the new picture inside it.
              const next = buildFromTemplate(templateId);
              onChange({
                ...block,
                ...diagramSize(next, block.widthPx, language),
                diagram: next,
              });
            }}
          />
        </div>
        <NumberField
          label="Width"
          min={160}
          suffix="px"
          value={block.widthPx}
          onChange={(widthPx) => {
            // Width is the teacher's number — it decides how much of the text column the
            // figure takes. The height is *measured* from what the diagram draws, so a
            // title or a two-line axis name grows the picture instead of squashing the
            // plot inside a fixed 4:3 box.
            const next = Math.max(160, widthPx);
            onChange({ ...block, ...diagramSize(block.diagram, next, language) });
          }}
        />
        <FigureAlignField
          value={block.align}
          onChange={(align) => onChange({ ...block, align })}
        />
      </div>

      {/* Alt text is document metadata, not geometry: it never appears in the drawing.
          A diagram has no caption — its words are `diagram.title`, typed on the canvas
          and drawn inside the image itself. */}
      <BiTextField
        label="Alt text"
        value={block.altText}
        onChange={(altText) => onChange({ ...block, altText })}
        rows={1}
      />
      {/* The title, edited here and **only** here.

          It is drawn inside the picture and rasterizes into the same PNG, so it is not a
          caption printed beside the figure — but it is still writing, and writing belongs
          in a field. The canvas draws it so the drawing surface shows the printed picture,
          and deliberately does not let it be selected, dragged or retyped there: one
          address for a diagram's words, with no second surface to disagree with. */}
      <BiTextField
        label="Title"
        value={block.diagram.title ?? emptyBiText()}
        onChange={(title) => {
          /*
           * Clearing the field deletes the title outright, rather than storing the empty
           * husk the editing surface hands back.
           *
           * A contenteditable emptied with ⌘A-Backspace does not return `[]` — it returns
           * a run holding `"\n"`. That is whitespace, so `isBiTextEmpty` correctly hides
           * the placement control and `pickSides` draws nothing, and the deletion *looks*
           * complete. But the husk is still in the document: it reaches the exporter, it
           * round-trips through save/load, and it is exactly the `{"en":[{"text":"\\n"}]}`
           * that turned up in the reference worksheets and printed a phantom blank line.
           * A field cleared to nothing must store nothing.
           *
           * `titlePlacement` goes with it. It answers "which side does the title print
           * on"; with no title the question has no subject, and leaving it behind means a
           * later re-titling silently inherits a side the teacher never chose for it.
           */
          const cleared = isBiTextEmpty(title);
          const next = cleared
            ? (({ title: _t, titlePlacement: _p, ...rest }) => rest)(block.diagram)
            : { ...block.diagram, title };

          onChange({
            ...block,
            // The picture is measured, so gaining or losing a title resizes it. Doing
            // this on every keystroke keeps the stored size honest — a title added and
            // never re-measured would print into room nothing reserved.
            ...diagramSize(next, block.widthPx, language),
            diagram: next,
          });
        }}
        rows={1}
      />
      {/* Which side of the plot it prints on. Offered only once there *is* a title:
          most DSE diagrams carry none, and a placement control over an empty field asks
          about something that does not exist. */}
      {!isBiTextEmpty(block.diagram.title) && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-subtle">Title sits</span>
          <Segmented<CaptionPlacement>
            label="Title placement"
            value={block.diagram.titlePlacement ?? 'above'}
            options={[
              { value: 'above', label: 'Above', title: 'Draw the title above the plot' },
              { value: 'below', label: 'Below', title: 'Draw the title below the plot' },
            ]}
            onChange={(titlePlacement) =>
              onChange({ ...block, diagram: { ...block.diagram, titlePlacement } })
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * The pie chart's slices: name + share per row, in draw order (clockwise from 12
 * o'clock). The printed percent is derived from share ÷ total, so the fields never
 * show it — a stored percent is exactly what would go stale when a slice is added.
 *
 * Slice edits never re-measure the block: the labels draw *inside* the circle, so no
 * name or value can change the picture's box (only the title does that, above).
 */
function PieSliceFields({
  slices,
  onChange,
}: {
  slices: PieSlice[];
  onChange: (slices: PieSlice[]) => void;
}) {
  const patch = (id: string, change: Partial<PieSlice>) =>
    onChange(slices.map((slice) => (slice.id === id ? { ...slice, ...change } : slice)));

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-ink-subtle">
        Slices — clockwise from the top
      </span>
      {slices.map((slice, index) => (
        <div key={slice.id} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <BiTextField
              ariaLabel={`Slice ${index + 1} name`}
              value={slice.label}
              onChange={(label) => patch(slice.id, { label })}
              rows={1}
            />
          </div>
          <NumberField
            label="Share"
            min={0}
            value={slice.value}
            onChange={(value) => patch(slice.id, { value })}
          />
          <IconButton
            label={`Remove slice ${index + 1}`}
            onClick={() => onChange(slices.filter((other) => other.id !== slice.id))}
          >
            ✕
          </IconButton>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          onClick={() =>
            onChange([...slices, { id: nanoid(10), label: emptyBiText(), value: 10 }])
          }
        >
          + Slice
        </Button>
        <span className="text-[11px] text-ink-subtle">
          Percentages are computed from the shares.
        </span>
      </div>
    </div>
  );
}
