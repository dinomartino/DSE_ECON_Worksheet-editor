'use client';

import { createPart, createSubPart } from '@/model/factories';
import { partMarks, questionMarks } from '@/model/marks';
import { partLabel, subPartLabel } from '@/model/numbering';
import { emptyBiText } from '@/model/text';
import type { QuestionPart, StructuredQuestion } from '@/model/types';
import type { EditorPanelProps } from '@/registry/types';
import { Button, CheckField, Eyebrow, IconButton, NumberField, Pill } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';

/**
 * Structured-question editor (§5.3): parts and sub-parts with add/remove/reorder,
 * marks on each leaf, per-part answers, and live totals (§3.5).
 *
 * Depth is carried by a left rule and label rather than by another nested box —
 * stacking four bordered rectangles inside a 380px column was the main reason this
 * panel read as an undifferentiated wall.
 */
export function StructuredEditorPanel({ question, onChange }: EditorPanelProps<StructuredQuestion>) {
  const setParts = (parts: QuestionPart[]) => onChange({ parts });

  const patchPart = (index: number, patch: Partial<QuestionPart>) =>
    setParts(question.parts.map((part, i) => (i === index ? { ...part, ...patch } : part)));

  const movePart = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= question.parts.length) return;
    const next = [...question.parts];
    [next[index], next[target]] = [next[target], next[index]];
    setParts(next);
  };

  return (
    <div className="space-y-5">
      <BlockEditor label="Stem" blocks={question.blocks} onChange={(blocks) => onChange({ blocks })} />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Eyebrow>Parts</Eyebrow>
          <Pill>{question.parts.length}</Pill>
          {/* Off by default: parts carry their own marks, so the trailing sum is
              opt-in. */}
          <span className="ml-auto">
            <CheckField
              label="Show total"
              checked={Boolean(question.showTotalMarks)}
              onChange={(showTotalMarks) => onChange({ showTotalMarks })}
            />
          </span>
        </div>

        {question.parts.map((part, partIndex) => {
          const subParts = part.subParts ?? [];
          const hasSubParts = subParts.length > 0;

          const moveSubPart = (index: number, delta: number) => {
            const target = index + delta;
            if (target < 0 || target >= subParts.length) return;
            const next = [...subParts];
            [next[index], next[target]] = [next[target], next[index]];
            patchPart(partIndex, { subParts: next });
          };

          return (
            <section
              key={part.id}
              className="group/part rounded-lg border border-line bg-surface "
            >
              <header className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
                <span className="text-xs font-semibold text-ink-muted ">
                  Part {partLabel(partIndex)}
                </span>
                <Pill>{partMarks(part)}m</Pill>
                <span className="ml-auto flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/part:opacity-100">
                  <IconButton
                    label="Move part up"
                    disabled={partIndex === 0}
                    onClick={() => movePart(partIndex, -1)}
                  >
                    <span aria-hidden>↑</span>
                  </IconButton>
                  <IconButton
                    label="Move part down"
                    disabled={partIndex === question.parts.length - 1}
                    onClick={() => movePart(partIndex, 1)}
                  >
                    <span aria-hidden>↓</span>
                  </IconButton>
                  <IconButton
                    label="Delete part"
                    variant="danger"
                    onClick={() => setParts(question.parts.filter((_, i) => i !== partIndex))}
                  >
                    <span aria-hidden>✕</span>
                  </IconButton>
                </span>
              </header>

              <div className="space-y-2 p-2.5">
                <BlockEditor
                  blocks={part.blocks}
                  onChange={(blocks) => patchPart(partIndex, { blocks })}
                />

                {!hasSubParts && (
                  <NumberField
                    label="Marks"
                    value={part.marks ?? 0}
                    onChange={(marks) => patchPart(partIndex, { marks })}
                  />
                )}

                <BiTextField
                  label="Answer / marking scheme"
                  value={part.answer ?? emptyBiText()}
                  onChange={(answer) => patchPart(partIndex, { answer })}
                />

                {subParts.length > 0 && (
                  <div className="space-y-2 border-l-2 border-line pl-2.5 ">
                    {subParts.map((subPart, subIndex) => (
                      <div key={subPart.id} className="group/sub space-y-1.5">
                        <header className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-ink-subtle ">
                            {subPartLabel(subIndex)}
                          </span>
                          <Pill>{subPart.marks}m</Pill>
                          <span className="ml-auto flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/sub:opacity-100">
                            <IconButton
                              label="Move sub-part up"
                              disabled={subIndex === 0}
                              onClick={() => moveSubPart(subIndex, -1)}
                            >
                              <span aria-hidden>↑</span>
                            </IconButton>
                            <IconButton
                              label="Move sub-part down"
                              disabled={subIndex === subParts.length - 1}
                              onClick={() => moveSubPart(subIndex, 1)}
                            >
                              <span aria-hidden>↓</span>
                            </IconButton>
                            <IconButton
                              label="Delete sub-part"
                              variant="danger"
                              onClick={() =>
                                patchPart(partIndex, {
                                  subParts: subParts.filter((_, i) => i !== subIndex),
                                })
                              }
                            >
                              <span aria-hidden>✕</span>
                            </IconButton>
                          </span>
                        </header>

                        <BlockEditor
                          blocks={subPart.blocks}
                          onChange={(blocks) =>
                            patchPart(partIndex, {
                              subParts: subParts.map((s, i) =>
                                i === subIndex ? { ...s, blocks } : s,
                              ),
                            })
                          }
                        />

                        <NumberField
                          label="Marks"
                          value={subPart.marks}
                          onChange={(marks) =>
                            patchPart(partIndex, {
                              subParts: subParts.map((s, i) =>
                                i === subIndex ? { ...s, marks } : s,
                              ),
                            })
                          }
                        />

                        <BiTextField
                          label="Answer"
                          value={subPart.answer ?? emptyBiText()}
                          rows={1}
                          onChange={(answer) =>
                            patchPart(partIndex, {
                              subParts: subParts.map((s, i) =>
                                i === subIndex ? { ...s, answer } : s,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    patchPart(partIndex, {
                      subParts: [...subParts, createSubPart()],
                      // A part with sub-parts derives its marks from them (§3.5).
                      marks: undefined,
                    })
                  }
                >
                  + Sub-part
                </Button>
              </div>
            </section>
          );
        })}
      </section>

      <div className="flex items-center justify-between border-t border-line pt-3 ">
        <Button size="sm" onClick={() => setParts([...question.parts, createPart()])}>
          + Part
        </Button>
        <span className="text-xs font-semibold text-ink-muted ">
          Total: {questionMarks(question)} marks
        </span>
      </div>
    </div>
  );
}
