'use client';

import { useMemo, useState } from 'react';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { isBiTextEmpty, plain } from '@/model/text';
import type { CaptionPlacement, DiagramBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { diagramSvg } from '@/render/diagram';
import { Button, NumberField, Segmented, SelectField } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { DiagramCanvas } from './DiagramCanvas';

/**
 * The diagram block's panel: **everything except the drawing** (§5.3).
 *
 * This used to be a second, complete editor — five tabs (curves, points, labels, arrows,
 * axes), every element re-listed as a card, and every coordinate typed as a percentage of
 * the plot. It was the same mistake the table panel made with its grid of text inputs, and
 * it fails for the same reason: **you cannot see what you are editing.** Typing "x 62%" at
 * a curve you are not looking at is not how anyone places a supply curve, and the panel
 * could not show the intersections, the labels or the crowding that decide whether the
 * number is right.
 *
 * The canvas answers all of it, and answers it better: drag to place, arrow keys to nudge
 * a fifth of a percent at a time, snapping to real intersections, double-click any text to
 * retype it where it is drawn, and an element index for reaching a curve hidden under
 * another. So the tabs are gone rather than duplicated, and what remains is the set of
 * things the canvas has no opinion about:
 *
 * - **Template** — replaces the geometry wholesale, which is a decision about the whole
 *   picture rather than an edit within it;
 * - **Width** — the printed size, which the canvas deliberately ignores (it draws at a
 *   zoom so the stored size stays a *print* size);
 * - **Alt text** and **Caption** — `.docx` metadata that never appears in the drawing at
 *   all. The caption is ordinary document text printed above or below the picture (it is
 *   optional, and most diagrams carry none); the diagram's own *title* is inside the
 *   geometry, is centred and underlined over the plot, and is edited on the canvas.
 *
 * The live SVG is the way in, for the reason the page preview is: what you click is what
 * you edit. It is the very renderer the preview and exporter use, so the thumbnail cannot
 * show something the printed page will not.
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
            const next = Math.max(160, widthPx);
            // The 4:3 proportion is kept so the axis titles keep their room.
            onChange({ ...block, widthPx: next, heightPx: Math.round((next * 3) / 4) });
          }}
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
      {/* Which side of the plot the title prints on. Offered only once there *is* a
          title: most DSE diagrams carry none, and a placement control over an empty
          field asks about something that does not exist. The title itself is typed on
          the canvas, where it is drawn — this panel only owns the choice that has no
          visual handle to grab. */}
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
