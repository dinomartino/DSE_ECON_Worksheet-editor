'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import { diagramSize, diagramSvg } from '@/render/diagram';
import { Button } from '@/components/ui';

/**
 * The diagram templates as a visual grid — a teacher picks a *shape*, so the picker
 * shows the shapes (§ "a choice between two layouts is shown, not named"). Each card
 * renders the template's real geometry through the same renderer the page and the
 * export use, so the thumbnail cannot drift from what picking it produces.
 *
 * Shared by the two places a template is chosen: inserting a diagram (`+ Diagram` in
 * the block editor) and re-basing an existing one (the diagram panel), which is what
 * keeps the choice looking identical at both moments.
 */

/** One rendered card per template, built once per mount — the geometry is static. */
function useTemplateCards() {
  return useMemo(
    () =>
      DIAGRAM_TEMPLATES.map((template) => {
        const diagram = template.build();
        const size = diagramSize(diagram, 220, 'en');
        return {
          id: template.id,
          name: plain(template.name.en),
          hint: plain(template.hint.en),
          svg: diagramSvg(diagram, { ...size, language: 'en' }),
        };
      }),
    [],
  );
}

export function DiagramTemplateCards({
  currentId,
  onPick,
}: {
  /** The template the diagram started from, ringed so "which one is this" is visible. */
  currentId?: string;
  onPick: (templateId: string) => void;
}) {
  const cards = useTemplateCards();
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          title={card.hint}
          aria-pressed={card.id === currentId}
          onClick={() => onPick(card.id)}
          className={
            'rounded-lg border p-1.5 text-left transition-colors hover:bg-surface-sunken ' +
            (card.id === currentId
              ? 'border-accent ring-1 ring-accent'
              : 'border-line')
          }
        >
          <span
            className="flex h-20 items-center justify-center overflow-hidden rounded bg-white [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full"
            style={{ lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: card.svg }}
          />
          <span className="mt-1 block truncate text-[11px] font-medium text-ink">
            {card.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * A trigger + downward popover around the cards. Downward and right-aligned for the
 * reason the table picker opens that way: upward runs into the sidebar's tab bar,
 * which swallows pointer events over the top rows.
 */
const POPOVER_WIDTH = 336;
const POPOVER_MARGIN = 8;

export function DiagramTemplatePopover({
  trigger,
  currentId,
  onPick,
}: {
  trigger: React.ReactNode;
  currentId?: string;
  onPick: (templateId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Fixed viewport coordinates, computed from the trigger on open.
   *
   * Absolute positioning cannot serve this popover: both triggers live inside the
   * sidebar's scroller, which clips anything escaping its own box, and the grid is
   * taller than the panel below either trigger. Fixed placement steps outside every
   * clipping ancestor; the clamps keep the whole grid on screen wherever the trigger
   * happens to be.
   */
  const [at, setAt] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + 4;
    setAt({
      left: Math.max(
        POPOVER_MARGIN,
        Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN),
      ),
      top,
      maxHeight: Math.max(160, window.innerHeight - top - POPOVER_MARGIN),
    });
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="subtle"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggle}
      >
        {trigger}
      </Button>
      {open && at && (
        <div
          className="fixed z-40 overflow-y-auto rounded-xl border border-line bg-surface-raised p-1.5 shadow-2xl"
          style={{ left: at.left, top: at.top, width: POPOVER_WIDTH, maxHeight: at.maxHeight }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          <DiagramTemplateCards
            currentId={currentId}
            onPick={(templateId) => {
              onPick(templateId);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
