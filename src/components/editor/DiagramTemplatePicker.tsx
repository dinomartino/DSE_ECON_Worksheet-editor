'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DIAGRAM_TEMPLATES, DIAGRAM_TEMPLATE_GROUPS } from '@/model/diagramTemplates';
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

interface TemplateCard {
  id: string;
  group: string;
  name: string;
  hint: string;
  /** Lower-cased names and hint in both languages, for the search box. */
  haystack: string;
  svg: string;
}

/** One rendered card per template, built once per page — the geometry is static. */
let cardCache: TemplateCard[] | null = null;
function templateCards(): TemplateCard[] {
  cardCache ??= DIAGRAM_TEMPLATES.map((template) => {
    const diagram = template.build();
    const size = diagramSize(diagram, 220, 'en');
    const words = [template.name.en, template.name.zh, template.hint.en, template.hint.zh];
    return {
      id: template.id,
      group: template.group,
      name: plain(template.name.en),
      hint: plain(template.hint.en),
      haystack: words.map((text) => plain(text)).join(' ').toLowerCase(),
      svg: diagramSvg(diagram, { ...size, language: 'en' }),
    };
  });
  return cardCache;
}

export function DiagramTemplateCards({
  currentId,
  onPick,
}: {
  /** The template the diagram started from, ringed so "which one is this" is visible. */
  currentId?: string;
  onPick: (templateId: string) => void;
}) {
  const cards = useMemo(() => templateCards(), []);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const groups = DIAGRAM_TEMPLATE_GROUPS.map((group) => ({
    id: group.id,
    name: plain(group.name.en),
    cards: cards.filter((card) => card.group === group.id && (!needle || card.haystack.includes(needle))),
  })).filter((group) => group.cards.length > 0);
  return (
    <div className="flex flex-col gap-2">
      <label className="block">
        <span className="sr-only">Search diagram templates</span>
        <input
          type="search"
          autoFocus
          value={search}
          placeholder="Search templates"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.stopPropagation();
              setSearch('');
            }
          }}
          className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[12px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </label>
      {groups.length === 0 && (
        <p className="px-1 py-3 text-center text-[12px] text-ink-subtle">No template matches.</p>
      )}
      {groups.map((group) => (
        <section key={group.id} aria-label={group.name} data-template-group={group.id}>
          <h3 className="mb-1 px-0.5 text-[11px] font-semibold text-ink-muted">{group.name}</h3>
          <TemplateGrid cards={group.cards} currentId={currentId} onPick={onPick} />
        </section>
      ))}
    </div>
  );
}

function TemplateGrid({
  cards,
  currentId,
  onPick,
}: {
  cards: TemplateCard[];
  currentId?: string;
  onPick: (templateId: string) => void;
}) {
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
            // A small lift on hover, back down when pressed. The ring is selection, not
            // focus (focus keeps the browser outline), so it may ease with the shadow.
            'rounded-lg border p-1.5 text-left transition-[background-color,border-color,box-shadow,translate,scale] duration-150 ease-out-soft ' +
            'hover:-translate-y-0.5 hover:bg-surface-sunken hover:shadow-md active:translate-y-0 active:scale-[0.98] ' +
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
          className="fixed z-40 origin-top-left animate-pop-in overflow-y-auto rounded-xl border border-line bg-surface-raised p-1.5 shadow-2xl"
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
