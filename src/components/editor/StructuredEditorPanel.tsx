'use client';

import { createParagraphBlock, createPart, createSubPart } from '@/model/factories';
import { partMarks, questionMarks } from '@/model/marks';
import { partLabel, subPartLabel } from '@/model/numbering';
import { emptyBiText } from '@/model/text';
import type { QuestionPart, StructuredQuestion } from '@/model/types';
import type { EditorPanelProps } from '@/registry/types';
import { Button, CheckField, GroupHeader, IconButton, NumberField, Pill } from '@/components/ui';
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
      <BlockEditor
        label="Stem"
        labelHint="what the student reads"
        blocks={question.blocks}
        onChange={(blocks) => onChange({ blocks })}
      />

      {/*
       * With no parts the question is the leaf, so it takes the two fields a part would
       * carry (§`StructuredQuestion.answerSpace`). A booklet essay is numbered "1." and
       * answered on the lines under it, and until these existed there was no way to mark
       * it or give it room without inventing a part (a) it does not have.
       *
       * They disappear the moment a part is added: the marks then belong to the part and
       * the room follows whichever part is being answered, so leaving them here would
       * offer two places to say the same thing.
       */}
      {question.parts.length === 0 && (
        <section className="space-y-2">
          <NumberField
            label="Marks"
            value={question.marks ?? 0}
            onChange={(marks) => onChange({ marks })}
          />
          <NumberField
            label="Answer space (dotted lines)"
            value={question.answerSpace}
            clearable
            placeholder="none"
            onChange={(answerSpace) => onChange({ answerSpace })}
          />
        </section>
      )}

      <section className="space-y-3">
        <GroupHeader
          title="Parts"
          hint={`${question.parts.length} · (a), (b), (c)…`}
          // Off by default: parts carry their own marks, so the trailing sum is opt-in.
          action={
            <CheckField
              label="Show total"
              checked={Boolean(question.showTotalMarks)}
              onChange={(showTotalMarks) => onChange({ showTotalMarks })}
            />
          }
        />

        {question.parts.map((part, partIndex) => {
          const subParts = part.subParts ?? [];
          const hasSubParts = subParts.length > 0;
          const interlude = part.blocksBefore ?? [];
          // No sub-part separately marked = one label for the group, carried by the part.
          const sharesMarks = hasSubParts && subParts.every((s) => s.marks === undefined);

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
                {/*
                 * The mid-question interlude (§`QuestionPart.blocksBefore`): unnumbered
                 * text — often a revised table — that resets the scenario before this
                 * part is asked.
                 *
                 * Rendered *above* the part's own blocks, where it prints, so the panel
                 * reads down the page in the order the paper does. Behind an affordance
                 * rather than a permanent second block editor: the ordinary part has no
                 * interlude, and two identical-looking editors on every part card would
                 * bury the one that holds the question.
                 */}
                {interlude.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-dashed border-line p-2">
                    <GroupHeader
                      title="Text before this part"
                      hint="Unnumbered, at the stem's indent"
                      action={
                        <IconButton
                          label="Remove text before this part"
                          variant="danger"
                          onClick={() => patchPart(partIndex, { blocksBefore: undefined })}
                        >
                          <span aria-hidden>✕</span>
                        </IconButton>
                      }
                    />
                    <BlockEditor
                      blocks={interlude}
                      onChange={(blocksBefore) =>
                        // Emptied back to nothing drops the field, rather than storing an
                        // empty array that reads as "an interlude that prints nothing".
                        patchPart(partIndex, {
                          blocksBefore: blocksBefore.length > 0 ? blocksBefore : undefined,
                        })
                      }
                    />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() =>
                      patchPart(partIndex, { blocksBefore: [createParagraphBlock(emptyBiText())] })
                    }
                  >
                    + Text before this part
                  </Button>
                )}

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

                {/*
                 * Sub-parts normally carry the marks and the part derives its total from
                 * them — so its own box stays hidden, or there would be two answers to
                 * the same question. It comes back for the one shape that needs it: a
                 * group sharing a single label, where no sub-part has a value to sum and
                 * the part's own marks are the group's (§`QuestionSubPart.marks`).
                 */}
                {hasSubParts && sharesMarks && (
                  <NumberField
                    // Named for the span it actually covers — "(i)–(ii)" — so it is clear
                    // the number is the group's, not the part's lead-in text's.
                    label={
                      subParts.length > 1
                        ? `Marks for ${subPartLabel(0)}–${subPartLabel(subParts.length - 1)} together`
                        : `Marks for ${subPartLabel(0)}`
                    }
                    value={part.marks ?? 0}
                    onChange={(marks) => patchPart(partIndex, { marks })}
                  />
                )}

                {/*
                 * The QAB's writing room, printed after this part (after the whole
                 * sub-part group when there is one). Clearable because absent and zero
                 * differ — absent prints nothing, the ordinary worksheet state.
                 */}
                <NumberField
                  label="Answer space (dotted lines)"
                  value={part.answerSpace}
                  clearable
                  placeholder="none"
                  onChange={(answerSpace) => patchPart(partIndex, { answerSpace })}
                />

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
                          {/*
                            * An unmarked sub-part has no total of its own — the group's
                            * label covers it — so the pill names that instead of the
                            * marks it lacks. Interpolating the absent number rendered a
                            * bare "m", which reads as a broken value rather than a
                            * deliberate one (§`QuestionSubPart.marks`).
                            */}
                          <Pill>
                            {subPart.marks === undefined ? 'shared' : `${subPart.marks}m`}
                          </Pill>
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
                          clearable
                          // Empty is a real state here, and the placeholder has to say
                          // which one: the group's shared label, not "unmarked".
                          placeholder="—"
                          onChange={(marks) =>
                            patchPart(partIndex, {
                              subParts: subParts.map((s, i) =>
                                i === subIndex ? { ...s, marks } : s,
                              ),
                            })
                          }
                        />

                        <NumberField
                          label="Answer space (dotted lines)"
                          value={subPart.answerSpace}
                          clearable
                          placeholder="none"
                          onChange={(answerSpace) =>
                            patchPart(partIndex, {
                              subParts: subParts.map((s, i) =>
                                i === subIndex ? { ...s, answerSpace } : s,
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
                      /*
                       * The part's own marks are *kept*, not cleared.
                       *
                       * A new sub-part is created marked, so `partMarks` sums the
                       * sub-parts and the part's value is ignored — clearing it changes
                       * no total while destroying the number an author typed. It matters
                       * once they empty the sub-part boxes to share one label: the part's
                       * marks become the group's total, and a wipe here would have thrown
                       * away exactly the figure that case needs (§`QuestionSubPart.marks`).
                       */
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
