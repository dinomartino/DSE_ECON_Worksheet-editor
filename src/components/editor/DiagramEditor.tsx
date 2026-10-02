'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { hasAnswerLayer } from '@/model/diagramAnswers';
import { graphFromBlock, rebaseOnGraph } from '@/model/graph';
import { graphStore } from '@/storage';
import { emptyBiText, isBiTextEmpty, plain } from '@/model/text';
import type { CaptionPlacement, DiagramBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { diagramSize, diagramSvg } from '@/render/diagram';
import { Button, FigureAlignField, NumberField, Segmented } from '@/components/ui';
import { sideOf } from '@/i18n/catalogue';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { BiTextField } from './BiTextField';
import { DIAGRAM_PANEL_MESSAGES } from './diagramEditing.messages';
import { DiagramCanvas } from './DiagramCanvas';
import { ForumFields, PieSliceFields } from './DiagramDataFields';
import { DiagramTemplatePopover } from './DiagramTemplatePicker';
import { FlowCanvas } from './FlowCanvas';
import { ForumCanvas } from './ForumCanvas';

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
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const side = sideOf(useUiLanguage());
  const language = useWorksheetStore((s) => s.mode.language);
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | undefined>();
  const noticeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const diagram = block.diagram;

  const saveToGraphs = async () => {
    const graph = graphFromBlock(block, language, fonts);
    let next: { text: string; tone: 'ok' | 'error' };
    try {
      await graphStore.save(graph);
      next = { tone: 'ok', text: m.savedToGraphs(graph.name) };
    } catch {
      next = { tone: 'error', text: m.saveFailed };
    }
    setNotice(next);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(undefined), next.tone === 'error' ? 8000 : 4000);
  };

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
        // The thumbnail opens the canvas, so it shows what the canvas shows.
        answers: 'show',
      }),
    [diagram, block.widthPx, block.heightPx, language, fonts],
  );

  const elementCount =
    diagram.curves.length +
    diagram.points.length +
    diagram.labels.length +
    diagram.arrows.length +
    (diagram.areas?.length ?? 0);

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
          title={
            diagram.flow
              ? m.editFlowTitle
              : diagram.forum
                ? m.resizeForumTitle
                : m.drawTitle
          }
          onClick={() => setDrawing(true)}
          className="group/preview relative block w-full overflow-hidden rounded border border-line bg-surface [&_svg]:h-auto [&_svg]:w-full "
          style={{ lineHeight: 0 }}
        >
          <span dangerouslySetInnerHTML={{ __html: preview }} />
          <span className="absolute inset-0 flex items-center justify-center bg-accent/0 opacity-0 transition-[background-color,opacity] duration-150 ease-out-soft group-hover/preview:bg-accent/10 group-hover/preview:opacity-100 group-active/preview:bg-accent/15">
            <span className="translate-y-0.5 rounded-md bg-ink/80 px-2 py-1 text-[11px] font-medium leading-none text-white transition-transform duration-150 ease-out-soft group-hover/preview:translate-y-0">
              {diagram.flow ? m.overlayEdit : diagram.forum ? m.overlayResize : m.overlayDraw}
            </span>
          </span>
        </button>
      )}

      {drawing &&
        !diagram.pie &&
        (diagram.flow ? (
          <FlowCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
        ) : diagram.forum ? (
          <ForumCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
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
      ) : diagram.forum ? (
        <ForumFields
          forum={diagram.forum}
          onChange={(forum) => {
            // Re-measured on every edit, unlike a pie's slices: bubble text sets the
            // boxes' heights and the picture sets the middle row, so the figure's own
            // size changes with the data (§ the picture is measured, not padded).
            const next = { ...diagram, forum };
            onChange({
              ...block,
              ...diagramSize(next, block.widthPx, language),
              diagram: next,
            });
          }}
        />
      ) : diagram.flow ? (
        /* The flow chart is edited on its own canvas — boxes drag between columns,
           arrows draw box-to-box — so the panel offers the way in and a summary, the
           same division the axes diagrams use. */
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDrawing(true)}>
            {m.editFlowButton}
          </Button>
          <span className="text-[11px] text-ink-subtle">
            {diagram.flow.nodes.length === 0
              ? m.flowEmpty
              : m.flowCount(diagram.flow.nodes.length, diagram.flow.arrows.length)}
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
            {m.drawButton}
          </Button>
          <span className="text-[11px] text-ink-subtle">
            {elementCount === 0
              ? m.drawEmpty
              : m.elementCount(elementCount)}
          </span>
          {/* The answer layer is found from here: teachers looked for "mark the answer
              on the diagram" in the panel, not in the canvas. */}
          <span className="basis-full text-[11px] leading-snug text-ink-subtle">
            {hasAnswerLayer(diagram) ? m.answerLayerOn : m.answerLayerHint}
          </span>
        </div>
      )}

      {/* A copy into Graphs 圖表庫. Nothing stays linked. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="subtle" onClick={() => void saveToGraphs()} title={m.saveToGraphsHint}>
          {m.saveToGraphs}
        </Button>
        {notice && (
          <span
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`animate-fade-in text-[11px] ${notice.tone === 'error' ? 'text-danger-ink' : 'text-ink-muted'}`}
          >
            {notice.text}
          </span>
        )}
      </div>

      {/* Wraps, because the controls have genuinely different needs: Width is sized by
          its content while the template button wants whatever is left. In a 400px column
          that sum exceeds the row often enough that a second line is the honest answer —
          squeezing instead clipped "Width" off the edge. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-subtle">{m.template}</span>
          {/* A visual picker, not a name list: a teacher chooses a *shape*, and the
              cards render each template through the real renderer. */}
          <DiagramTemplatePopover
            currentId={diagram.templateId ?? 'blank'}
            trigger={
              <>
                {plain(
                  DIAGRAM_TEMPLATES.find(
                    (template) => template.id === (diagram.templateId ?? 'blank'),
                  )?.name[side] ?? [],
                ) || (
                  // i18n-ignore: named in the editing language
                  side === 'zh' ? '空白坐標軸' : 'Blank axes'
                )}{' '}
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
            // The same re-base from a saved graph: its geometry, this block's width.
            onPickGraph={(graph) => onChange(rebaseOnGraph(block, graph, language))}
          />
        </div>
        <NumberField
          label={m.width}
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
        translate={{ kind: 'altText' }}
        label={m.altText}
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
        translate={{ kind: 'diagramTitle', fallsBack: true }}
        label={m.title}
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
          <span className="text-[11px] text-ink-subtle">{m.titleSits}</span>
          <Segmented<CaptionPlacement>
            label={m.titlePlacement}
            value={block.diagram.titlePlacement ?? 'above'}
            options={[
              { value: 'above', label: m.above, title: m.aboveHint },
              { value: 'below', label: m.below, title: m.belowHint },
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
