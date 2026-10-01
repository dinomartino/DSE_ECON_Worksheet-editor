'use client';

import { useRef } from 'react';
import { nanoid } from 'nanoid';
import { emptyBiText } from '@/model/text';
import type { ForumBubble, ForumChart, ForumSlot, PieSlice } from '@/model/diagram';
import { prepareImageForStorage } from '@/export/imageImport';
import { Button, IconButton, NumberField, Segmented } from '@/components/ui';
import type { TextKey } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { BiTextField } from './BiTextField';
import { DIAGRAM_PANEL_MESSAGES } from './diagramEditing.messages';

/*
 * The data of the chart kinds not drawn on axes: a pie's slices and a forum's bubbles.
 * One set of fields for a worksheet's diagram panel and a saved graph's (Graphs 圖表庫),
 * so the two never edit a chart differently.
 */

/** The four corner slots, in reading order, with the labels the picker shows. */
const FORUM_SLOTS: Array<{ value: ForumSlot; label: string; title: TextKey<typeof DIAGRAM_PANEL_MESSAGES> }> = [
  { value: 'topLeft', label: '◤', title: 'topLeft' }, // i18n-ignore: catalogue key
  { value: 'topRight', label: '◥', title: 'topRight' }, // i18n-ignore: catalogue key
  { value: 'bottomLeft', label: '◣', title: 'bottomLeft' }, // i18n-ignore: catalogue key
  { value: 'bottomRight', label: '◢', title: 'bottomRight' }, // i18n-ignore: catalogue key
];

/**
 * The forum figure's data: a speech bubble per row (speaker + view + corner slot)
 * and the central picture. Placement is slot-based, never free — the same reason a
 * band's zones are — so the panel offers corners, not coordinates.
 */
export function ForumFields({
  forum,
  onChange,
  resizeHint,
}: {
  forum: ForumChart;
  onChange: (forum: ForumChart) => void;
  /** Where the bubble widths are dragged: the worksheet's preview opens a canvas. */
  resizeHint?: string;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const fileInput = useRef<HTMLInputElement>(null);
  const slotOptions = FORUM_SLOTS.map((slot) => ({ ...slot, title: m[slot.title] }));
  const bubbles = forum.bubbles;
  const patch = (id: string, change: Partial<ForumBubble>) =>
    onChange({
      ...forum,
      bubbles: bubbles.map((bubble) =>
        bubble.id === id ? { ...bubble, ...change } : bubble,
      ),
    });

  const handleImageFile = async (file: File) => {
    // The same reduction every stored picture takes (§ `prepareImageForStorage`) —
    // the figure rides inline in the document's JSON like an `ImageBlock` does.
    const prepared = await prepareImageForStorage(file);
    onChange({
      ...forum,
      image: {
        src: prepared.src,
        // Zero means it could not be decoded here; a 4:3 guess still gives the
        // layout a ratio to draw by, the same fallback `BlockEditor` uses.
        naturalWidthPx: prepared.naturalWidthPx || 400,
        naturalHeightPx: prepared.naturalHeightPx || 300,
      },
    });
  };

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-ink-subtle">
        {m.bubblesHeading}
      </span>
      {bubbles.map((bubble, index) => (
        <div key={bubble.id} className="space-y-1 rounded border border-line p-1.5">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <BiTextField
                translate={{ kind: 'speaker', fallsBack: true }}
                ariaLabel={m.bubbleSpeaker(index + 1)}
                value={bubble.speaker}
                onChange={(speaker) => patch(bubble.id, { speaker })}
                rows={1}
              />
            </div>
            <Segmented<ForumSlot>
              label={m.bubbleCorner(index + 1)}
              value={bubble.slot}
              options={slotOptions}
              onChange={(slot) => patch(bubble.id, { slot })}
            />
            <IconButton
              label={m.bubbleRemove(index + 1)}
              onClick={() =>
                onChange({
                  ...forum,
                  bubbles: bubbles.filter((other) => other.id !== bubble.id),
                })
              }
            >
              ✕
            </IconButton>
          </div>
          <BiTextField
            translate={{ kind: 'bubble', fallsBack: true }}
            ariaLabel={m.bubbleView(index + 1)}
            value={bubble.text}
            onChange={(text) => patch(bubble.id, { text })}
            rows={2}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            // Seed the first corner nothing occupies, reading order — the reference
            // figures fill top-left, top-right, then bottom-left.
            const taken = new Set(bubbles.map((bubble) => bubble.slot));
            const slot =
              FORUM_SLOTS.find((option) => !taken.has(option.value))?.value ?? 'topLeft';
            onChange({
              ...forum,
              bubbles: [
                ...bubbles,
                { id: nanoid(10), slot, speaker: emptyBiText(), text: emptyBiText() },
              ],
            });
          }}
        >
          {m.addBubble}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => fileInput.current?.click()}>
          {forum.image ? m.replacePicture : m.addPicture}
        </Button>
        {forum.image && (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => onChange({ ...forum, image: undefined })}
          >
            {m.removePicture}
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file again still fires a change event.
            event.target.value = '';
            if (file) void handleImageFile(file);
          }}
        />
      </div>
      <span className="text-[11px] text-ink-subtle">
        {m.bubblesPoint} {resizeHint ?? m.resizeHint}
      </span>
    </div>
  );
}

/**
 * The pie chart's slices: name + share per row, in draw order (clockwise from 12
 * o'clock). The printed percent is derived from share ÷ total, so the fields never
 * show it — a stored percent is exactly what would go stale when a slice is added.
 *
 * Slice edits never re-measure the block: the labels draw *inside* the circle, so no
 * name or value can change the picture's box (only the title does that).
 */
export function PieSliceFields({
  slices,
  onChange,
}: {
  slices: PieSlice[];
  onChange: (slices: PieSlice[]) => void;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const patch = (id: string, change: Partial<PieSlice>) =>
    onChange(slices.map((slice) => (slice.id === id ? { ...slice, ...change } : slice)));

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-ink-subtle">
        {m.slicesHeading}
      </span>
      {slices.map((slice, index) => (
        <div key={slice.id} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <BiTextField
              translate={{ kind: 'diagramLabel', fallsBack: true }}
              ariaLabel={m.sliceName(index + 1)}
              value={slice.label}
              onChange={(label) => patch(slice.id, { label })}
              rows={1}
            />
          </div>
          <NumberField
            label={m.share}
            min={0}
            value={slice.value}
            onChange={(value) => patch(slice.id, { value })}
          />
          <IconButton
            label={m.sliceRemove(index + 1)}
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
          {m.addSlice}
        </Button>
        <span className="text-[11px] text-ink-subtle">
          {m.percentNote}
        </span>
      </div>
    </div>
  );
}
