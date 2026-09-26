'use client';

import { useMemo, useState } from 'react';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import type { DiagramBlock } from '@/model/types';
import { diagramSize, diagramSvg } from '@/render/diagram';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, GroupHeader, NumberField } from '@/components/ui';
import { DiagramCanvas } from './DiagramCanvas';
import { DiagramTemplatePopover } from './DiagramTemplatePicker';
import { FlowCanvas } from './FlowCanvas';
import { ForumCanvas } from './ForumCanvas';

/**
 * A leaf's model answer diagram (§ `QuestionPart.answerDiagram`), compact: thumbnail,
 * Draw…, template and width. Drawing opens the same canvases a stem diagram uses; the
 * alt text is the template's.
 */
export function AnswerDiagramRow({
  block,
  onChange,
  onRemove,
}: {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
  onRemove: () => void;
}) {
  const language = useWorksheetStore((s) => s.mode.language);
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);
  const [drawing, setDrawing] = useState(false);
  const diagram = block.diagram;
  // A pie's slices are data with no canvas of their own; it can be swapped, not drawn.
  const drawable = !diagram.pie;

  // Memoised: the string goes to `dangerouslySetInnerHTML` (see `DiagramEditor`).
  const thumbnail = useMemo(
    () => diagramSvg(diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language, fonts }),
    [diagram, block.widthPx, block.heightPx, language, fonts],
  );
  const templateName =
    plain(
      DIAGRAM_TEMPLATES.find((template) => template.id === (diagram.templateId ?? 'blank'))?.name
        .en ?? [],
    ) || 'Blank axes';

  return (
    <div
      data-answer-diagram-fields=""
      className="space-y-1.5 rounded-md border border-dashed border-line p-2"
    >
      <GroupHeader
        title="Model diagram"
        hint="teacher only"
        action={
          <Button size="sm" variant="danger" onClick={onRemove}>
            Remove
          </Button>
        }
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          title={drawable ? 'Draw on this diagram' : 'A pie chart is edited as data'}
          disabled={!drawable}
          onClick={() => setDrawing(true)}
          className="w-20 shrink-0 overflow-hidden rounded border border-line bg-surface transition-[border-color,transform,scale] duration-150 ease-out-soft enabled:cursor-pointer enabled:hover:border-accent enabled:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&_svg]:h-auto [&_svg]:w-full"
          style={{ lineHeight: 0 }}
        >
          <span dangerouslySetInnerHTML={{ __html: thumbnail }} />
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {drawable && (
            <Button size="sm" onClick={() => setDrawing(true)}>
              ✎ Draw…
            </Button>
          )}
          <DiagramTemplatePopover
            currentId={diagram.templateId ?? 'blank'}
            trigger={<>{templateName} ▾</>}
            onPick={(templateId) => {
              // Re-measured: templates disagree about their box (see `DiagramEditor`).
              const next = buildFromTemplate(templateId);
              onChange({ ...block, ...diagramSize(next, block.widthPx, language), diagram: next });
            }}
          />
          <NumberField
            label="Width"
            min={160}
            suffix="px"
            value={block.widthPx}
            onChange={(widthPx) =>
              onChange({ ...block, ...diagramSize(diagram, Math.max(160, widthPx), language) })
            }
          />
        </div>
      </div>
      {drawing &&
        drawable &&
        (diagram.flow ? (
          <FlowCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
        ) : diagram.forum ? (
          <ForumCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
        ) : (
          <DiagramCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
        ))}
    </div>
  );
}
