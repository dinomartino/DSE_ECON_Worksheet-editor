'use client';

import { useState } from 'react';
import { ZONES, zonesOf, type ZoneName } from '@/model/bands';
import { plain } from '@/model/text';
import type { Band, BandField, BiText, LanguageMode } from '@/model/types';
import { InlineEditable } from './InlineEditable';

/**
 * The masthead, edited in place with fixed drop zones.
 *
 * This is the constrained answer to "like Canva, but not free positioning": each band row
 * exposes exactly three targets — left, centre, right — and a field can be dragged between
 * them or reordered inside one. There is no arbitrary x/y, so every arrangement maps onto a
 * Word paragraph with tab stops and the export always matches what is on screen.
 *
 * Zones are only outlined while a drag is in progress or on hover. An always-visible grid
 * would make the page look like a form rather than the printed worksheet it represents.
 */

interface Props {
  bands: Band[];
  language: LanguageMode;
  totalMarks: number;
  /** Move a field to a zone, landing before `beforeId` when given. */
  onMove: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) => void;
  onEditField: (fieldId: string, text: BiText) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (bandId: string, zone: ZoneName) => void;
}

/** What a field prints. Mirrors `bandFieldText` in the render layer. */
function fieldText(field: BandField, totalMarks: number): BiText {
  if (field.kind === 'text') return field.text;
  if (field.kind === 'totalMarks') {
    return {
      en: [{ text: `${plain(field.label?.en) || 'Full marks:'} ${totalMarks} marks` }],
      zh: [{ text: `${plain(field.label?.zh) || '總分：'}${totalMarks}分` }],
    };
  }
  const rule = '_'.repeat(Math.max(1, field.widthCh ?? 14));
  return {
    en: [{ text: `${plain(field.label.en)}${rule}` }],
    zh: [{ text: `${plain(field.label.zh)}${rule}` }],
  };
}

const ALIGN: Record<ZoneName, string> = {
  left: 'justify-start text-left',
  center: 'justify-center text-center',
  right: 'justify-end text-right',
};

export function BandEditor({
  bands,
  language,
  totalMarks,
  onMove,
  onEditField,
  onRemoveField,
  onAddField,
}: Props) {
  // Transient drag state; never committed, so it can't reach an undo entry.
  const [dragging, setDragging] = useState<{ bandId: string; fieldId: string } | undefined>();
  const [over, setOver] = useState<{ bandId: string; zone: ZoneName } | undefined>();

  return (
    <div className="mb-3">
      {bands.map((band) => {
        const zones = zonesOf(band);
        return (
          <div
            key={band.id}
            className={`group/band flex items-baseline gap-1 ${
              band.rule ? 'border-b border-slate-400 pb-0.5' : ''
            }`}
          >
            {ZONES.map((zone) => {
              const isOver = over?.bandId === band.id && over.zone === zone;
              // Only the band being dragged from can be dropped into: a field belongs to
              // one printed row, and moving it between rows is a different operation.
              const droppable = dragging?.bandId === band.id;

              return (
                <div
                  key={zone}
                  data-band-id={band.id}
                  data-zone={zone}
                  onDragOver={(event) => {
                    if (!droppable) return;
                    event.preventDefault();
                    setOver({ bandId: band.id, zone });
                  }}
                  onDragLeave={() => setOver(undefined)}
                  onDrop={(event) => {
                    if (!droppable || !dragging) return;
                    event.preventDefault();
                    onMove(band.id, dragging.fieldId, zone);
                    setDragging(undefined);
                    setOver(undefined);
                  }}
                  className={`flex min-h-[1.6em] flex-1 flex-wrap items-baseline gap-x-2 rounded px-1 transition-colors ${ALIGN[zone]} ${
                    isOver
                      ? 'bg-[#ede8ff] ring-2 ring-[#7c5cff]'
                      : droppable
                        ? 'ring-1 ring-dashed ring-[#c4b5fd]'
                        : 'group-hover/band:ring-1 group-hover/band:ring-dashed group-hover/band:ring-[#d6d1cb]'
                  }`}
                >
                  {zones[zone].map((field) => (
                    <span
                      key={field.id}
                      data-field-id={field.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDragging({ bandId: band.id, fieldId: field.id });
                      }}
                      onDragEnd={() => {
                        setDragging(undefined);
                        setOver(undefined);
                      }}
                      onDragOver={(event) => {
                        // Dropping onto a sibling inserts before it, so order within a
                        // zone is controllable and not just append-only.
                        if (!dragging || dragging.fieldId === field.id) return;
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDrop={(event) => {
                        if (!dragging || dragging.fieldId === field.id) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onMove(band.id, dragging.fieldId, zone, field.id);
                        setDragging(undefined);
                        setOver(undefined);
                      }}
                      className={`group/field inline-flex cursor-grab items-baseline active:cursor-grabbing ${
                        dragging?.fieldId === field.id ? 'opacity-40' : ''
                      }`}
                      style={{
                        ...(field.format?.fontSize ? { fontSize: `${field.format.fontSize}pt` } : {}),
                        ...(field.format?.bold ? { fontWeight: 700 } : {}),
                        ...(field.format?.italic ? { fontStyle: 'italic' } : {}),
                      }}
                    >
                      {field.kind === 'text' ? (
                        <InlineEditable
                          value={field.text}
                          side={language === 'zh' ? 'zh' : 'en'}
                          placeholder="Click to add text"
                          onCommit={(next) => onEditField(field.id, next)}
                        >
                          {plain(language === 'zh' ? field.text.zh : field.text.en)}
                        </InlineEditable>
                      ) : (
                        // A derived total and a generated rule are not editable text:
                        // there would be nowhere to write a change back to.
                        <span title={field.kind === 'totalMarks' ? 'Computed from question marks' : undefined}>
                          {plain(
                            language === 'zh'
                              ? fieldText(field, totalMarks).zh
                              : fieldText(field, totalMarks).en,
                          )}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="Remove field"
                        title="Remove field"
                        onClick={() => onRemoveField(field.id)}
                        className="ml-0.5 hidden text-[10px] leading-none text-[#8f8a86] hover:text-[#dc2626] group-hover/field:inline"
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  {/* An empty zone still needs a target, but it is a print preview first:
                      the affordance stays invisible until the row is hovered, so the page
                      reads as the worksheet rather than as a form. */}
                  {zones[zone].length === 0 && (
                    <button
                      type="button"
                      onClick={() => onAddField(band.id, zone)}
                      aria-label={`Add a field to the ${zone} zone`}
                      className="text-[10px] italic text-transparent transition-colors group-hover/band:text-[#a5a09b] hover:!text-[#6a48f5]"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
