'use client';

import { useMemo, useState } from 'react';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { emptyBiText, isBiTextEmpty, plain } from '@/model/text';
import type { CaptionPlacement, DiagramBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { diagramSize, diagramSvg } from '@/render/diagram';
import { Button, FigureAlignField, NumberField, Segmented, SelectField } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { DiagramCanvas } from './DiagramCanvas';

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
      <button
        type="button"
        title="Draw on this diagram"
        onClick={() => setDrawing(true)}
        className="group/preview relative block w-full overflow-hidden rounded border border-line bg-surface [&_svg]:h-auto [&_svg]:w-full "
        style={{ lineHeight: 0 }}
      >
        <span dangerouslySetInnerHTML={{ __html: preview }} />
        <span className="absolute inset-0 flex items-center justify-center bg-sky-500/0 opacity-0 transition-opacity group-hover/preview:bg-sky-500/10 group-hover/preview:opacity-100">
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-medium leading-none text-white">
            Draw
          </span>
        </span>
      </button>

      {drawing && (
        <DiagramCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
      )}

      {/* Draw is the weightiest control in this panel, because every edit to the picture
          itself now happens there — a teacher who does not find this button finds no way
          to change the diagram at all. `default` rather than `primary`: primary is
          reserved for Export (§weight matches consequence), and against the subtle fields
          below, default already reads as the action. The count beside it is the panel's
          one report on the geometry — it says the drawing has contents without pretending
          to list them. */}
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

      {/* Wraps, because the two controls have genuinely different needs: Width is sized by
          its content while the template select wants whatever is left. In a 400px column
          that sum exceeds the row often enough that a second line is the honest answer —
          squeezing instead clipped "Width" off the edge. */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          label="Template"
          value={diagram.templateId ?? 'blank'}
          options={DIAGRAM_TEMPLATES.map((template) => ({
            value: template.id,
            label: plain(template.name.en),
          }))}
          onChange={(templateId) => {
            // Replacing the geometry wholesale is the point of picking a template, and it
            // routes through the store like any edit, so ⌘Z brings the old one back.
            onChange({ ...block, diagram: buildFromTemplate(String(templateId)) });
          }}
        />
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
