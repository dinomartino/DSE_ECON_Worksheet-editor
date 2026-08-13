'use client';

import { useState } from 'react';
import { editTargetKey, flattenBlocks } from '@/model/edits';
import { createParagraphBlock, createPart, createSubPart } from '@/model/factories';
import { partMarks, questionMarks } from '@/model/marks';
import { partLabel, subPartLabel } from '@/model/numbering';
import { emptyBiText, plain } from '@/model/text';
import type { ContentBlock, QuestionPart, StructuredQuestion } from '@/model/types';
import type { EditorPanelProps } from '@/registry/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, GroupHeader, IconButton, NumberField, Pill } from '@/components/ui';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/ui/icons';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';

/**
 * Which part (and sub-part) of this question owns an edit-target key, if any.
 *
 * The preview publishes what was clicked as an `editTargetKey` string; the panel maps
 * it back to the model to know which collapsed card must open. Resolved from the
 * model, never the DOM — the key formats are `model/edits.ts`'s own.
 */
function targetOwner(
  question: StructuredQuestion,
  key: string | undefined,
): { partId: string; subPartId?: string } | undefined {
  if (!key) return undefined;
  const [kind, id] = key.split(':');
  const holdsBlock =
    kind === 'blockText' || kind === 'blockCaption' || kind === 'tableCell';
  const inBlocks = (blocks: ContentBlock[] | undefined) =>
    Boolean(blocks && flattenBlocks(blocks).some((block) => block.id === id));

  for (const part of question.parts) {
    for (const sub of part.subParts ?? []) {
      if (kind === 'subPartAnswer' && id === sub.id) return { partId: part.id, subPartId: sub.id };
      if (holdsBlock && inBlocks(sub.blocks)) return { partId: part.id, subPartId: sub.id };
    }
    if (kind === 'partAnswer' && id === part.id) return { partId: part.id };
    if (holdsBlock && (inBlocks(part.blocks) || inBlocks(part.blocksBefore))) {
      return { partId: part.id };
    }
  }
  return undefined;
}

/** The first paragraph's text, for naming a collapsed card. */
function excerptOf(blocks: ContentBlock[]): string {
  const para = blocks.find((block) => block.kind === 'paragraph');
  return para && para.kind === 'paragraph'
    ? plain(para.text.en) || plain(para.text.zh)
    : '';
}

/**
 * Structured-question editor (§5.3): parts and sub-parts with add/remove/reorder,
 * marks on each leaf, per-part answers, and live totals (§3.5).
 *
 * Depth is carried by a left rule and label rather than by another nested box —
 * stacking four bordered rectangles inside a 380px column was the main reason this
 * panel read as an undifferentiated wall.
 *
 * Parts and sub-parts are **collapsible**: a real LQ has four parts of several fields
 * each, and all of them open at once was a wall nothing could be found in. A card
 * opens by click, when "+ Part" creates it, and — the path that must never fail —
 * when the preview's selection lands inside it, so clicking (c)'s text on the paper
 * opens (c) here with the matching field scrolled into view.
 */
export function StructuredEditorPanel({ question, onChange }: EditorPanelProps<StructuredQuestion>) {
  const setParts = (parts: QuestionPart[]) => onChange({ parts });

  const selectedTargetKey = useWorksheetStore((s) => s.selectedTargetKey);
  const owner = targetOwner(question, selectedTargetKey);

  // A lone part (or lone sub-part) opens by default — collapsing the only thing
  // there is would just add a click to every visit.
  const [expandedParts, setExpandedParts] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (question.parts.length === 1) initial.add(question.parts[0].id);
    if (owner) initial.add(owner.partId);
    return initial;
  });
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const part of question.parts) {
      const subs = part.subParts ?? [];
      if (subs.length === 1) initial.add(subs[0].id);
    }
    if (owner?.subPartId) initial.add(owner.subPartId);
    return initial;
  });

  /*
   * Follow the preview's selection into a collapsed card — as a render-time
   * adjustment, not an effect, so the revealed control is in the DOM in the same
   * commit `Inspector`'s layout effect queries it to scroll. Only a *change* of
   * target expands: the teacher can still collapse the card a selected field
   * lives in, and it stays collapsed until the selection moves.
   */
  const [prevTargetKey, setPrevTargetKey] = useState(selectedTargetKey);
  if (selectedTargetKey !== prevTargetKey) {
    setPrevTargetKey(selectedTargetKey);
    if (owner && !expandedParts.has(owner.partId)) {
      setExpandedParts(new Set(expandedParts).add(owner.partId));
    }
    if (owner?.subPartId && !expandedSubs.has(owner.subPartId)) {
      setExpandedSubs(new Set(expandedSubs).add(owner.subPartId));
    }
  }

  const togglePart = (id: string) =>
    setExpandedParts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSub = (id: string) =>
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

          const partOpen = expandedParts.has(part.id);

          return (
            <section
              key={part.id}
              data-edit-target={editTargetKey({
                kind: 'partAnswer',
                questionId: question.id,
                partId: part.id,
              })}
              className="group/part rounded-lg border border-line bg-surface "
            >
              <header
                className={`flex items-center gap-2 px-2.5 py-1.5 ${
                  partOpen ? 'border-b border-line' : ''
                }`}
              >
                <button
                  type="button"
                  aria-expanded={partOpen}
                  onClick={() => togglePart(part.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="shrink-0 text-ink-subtle" aria-hidden>
                    {partOpen ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-muted ">
                    Part {partLabel(partIndex)}
                  </span>
                  <Pill>{partMarks(part)}m</Pill>
                  {/* A closed card must still say which part it is — the letter alone
                      cannot be told apart in a four-part question. */}
                  {!partOpen && (
                    <span className="min-w-0 truncate text-[11px] text-ink-subtle">
                      {excerptOf(part.blocks)}
                    </span>
                  )}
                </button>
                <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/part:opacity-100">
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

              {partOpen && (
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
                    value={part.marks}
                    // Clearable because absent and zero differ: absent prints no label
                    // at all — some parts are marked as a group elsewhere — while 0
                    // deliberately prints "(0 marks)".
                    clearable
                    placeholder="—"
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
                    value={part.marks}
                    // Clearable so a group can carry no label at all — emptied, the
                    // shared "(N marks)" simply does not print.
                    clearable
                    placeholder="—"
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
                      <div
                        key={subPart.id}
                        data-edit-target={editTargetKey({
                          kind: 'subPartAnswer',
                          questionId: question.id,
                          partId: part.id,
                          subPartId: subPart.id,
                        })}
                        className="group/sub space-y-1.5"
                      >
                        <header className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={expandedSubs.has(subPart.id)}
                            onClick={() => toggleSub(subPart.id)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            <span className="shrink-0 text-ink-subtle" aria-hidden>
                              {expandedSubs.has(subPart.id) ? (
                                <ChevronDownIcon size={10} />
                              ) : (
                                <ChevronRightIcon size={10} />
                              )}
                            </span>
                            <span className="shrink-0 text-[11px] font-semibold text-ink-subtle ">
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
                            {!expandedSubs.has(subPart.id) && (
                              <span className="min-w-0 truncate text-[11px] text-ink-subtle">
                                {excerptOf(subPart.blocks)}
                              </span>
                            )}
                          </button>
                          <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/sub:opacity-100">
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

                        {expandedSubs.has(subPart.id) && (
                        <>
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
                        </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => {
                    const created = createSubPart();
                    // Created open — it exists to be typed into.
                    setExpandedSubs((prev) => new Set(prev).add(created.id));
                    patchPart(partIndex, {
                      subParts: [...subParts, created],
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
                    });
                  }}
                >
                  + Sub-part
                </Button>
              </div>
              )}
            </section>
          );
        })}
      </section>

      <div className="flex items-center justify-between border-t border-line pt-3 ">
        <Button
          size="sm"
          onClick={() => {
            const created = createPart();
            // Created open — it exists to be typed into.
            setExpandedParts((prev) => new Set(prev).add(created.id));
            setParts([...question.parts, created]);
          }}
        >
          + Part
        </Button>
        <span className="text-xs font-semibold text-ink-muted ">
          Total: {questionMarks(question)} marks
        </span>
      </div>
    </div>
  );
}
