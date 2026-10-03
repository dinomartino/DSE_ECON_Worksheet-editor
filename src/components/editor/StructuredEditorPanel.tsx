'use client';

import { useState, type ReactNode } from 'react';
import { editTargetKey, flattenBlocks } from '@/model/edits';
import { createAnswerDiagram, createParagraphBlock, createPart, createSubPart } from '@/model/factories';
import { partMarks, questionMarks } from '@/model/marks';
import { partLabel, subPartLabel } from '@/model/numbering';
import { emptyBiText } from '@/model/text';
import type {
  AnswerGraph,
  ContentBlock,
  DiagramBlock,
  QuestionPart,
  StructuredQuestion,
} from '@/model/types';
import { createAnswerGraph } from '@/model/answerGraph';
import { AnswerGraphFields } from './AnswerGraphFields';
import { AnswerDiagramRow } from './AnswerDiagramRow';
import type { EditorPanelProps } from '@/registry/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, GroupHeader, NumberField, Pill } from '@/components/ui';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { ChevronRightIcon } from '@/components/ui/icons';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';
import { excerptOfBlocks, MiniNumber, scrollPageTo } from './panelRows';
import { MarkSchemeEditor } from './MarkSchemeEditor';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { STRUCTURED_PANEL_MESSAGES } from './StructuredEditorPanel.messages';

type PanelMessages = Messages<typeof STRUCTURED_PANEL_MESSAGES>;

/** Set or drop a leaf's scheme; removing it leaves no `scheme: undefined` key behind. */
function withScheme<T extends { scheme?: MarkScheme }>(leaf: T, scheme: MarkScheme | undefined): T {
  const next = { ...leaf };
  if (scheme) next.scheme = scheme;
  else delete next.scheme;
  return next;
}

const replacePart = (parts: QuestionPart[], index: number, part: QuestionPart) =>
  parts.map((entry, i) => (i === index ? part : entry));

/**
 * Which part (and sub-part) of this question owns an edit-target key, if any.
 *
 * The preview publishes what was clicked as an `editTargetKey` string; the panel maps
 * it back to the model to know which collapsed row must open. Resolved from the
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

/** The row menu's graph-space toggle: adds a fresh box, or removes the one there. */
function graphMenuItem(
  m: PanelMessages,
  current: AnswerGraph | undefined,
  set: (graph: AnswerGraph | undefined) => void,
): MenuItem {
  return current
    ? { label: m.removeGraph, onSelect: () => set(undefined) }
    : { label: m.addGraph, onSelect: () => set(createAnswerGraph()) };
}

/** The row menu's model-diagram toggle (§ `QuestionPart.answerDiagram`). */
function diagramMenuItem(
  m: PanelMessages,
  current: DiagramBlock | undefined,
  set: (diagram: DiagramBlock | undefined) => void,
): MenuItem {
  return current
    ? { label: m.removeDiagram, onSelect: () => set(undefined) }
    : { label: m.addDiagram, onSelect: () => set(createAnswerDiagram()) };
}

/**
 * One row of the mark scheme grid: chevron + letter + excerpt as the toggle, then the
 * marks and lines cells, then the row's own `Menu`. The text itself is typed on the
 * page — the row is the paper-setter's ledger line for that part.
 */
function SchemeRow({
  m,
  open,
  onToggle,
  label,
  excerpt,
  targetKey,
  pageTargetKey,
  marks,
  lines,
  menu,
  menuLabel,
}: {
  m: PanelMessages;
  open: boolean;
  onToggle: () => void;
  label: string;
  excerpt: string;
  targetKey: string;
  /** Where this part's text lives on the page — clicking the row shows it there. */
  pageTargetKey?: string;
  /** The marks cell: an editable field, or a derived total shown as a pill. */
  marks: ReactNode;
  lines: ReactNode;
  menu: MenuItem[];
  menuLabel: string;
}) {
  return (
    <div data-edit-target={targetKey} className="flex items-center gap-1.5 rounded-md px-1 py-0.5">
      <button
        type="button"
        aria-expanded={open}
        title={m.showOnPage}
        onClick={() => {
          onToggle();
          if (pageTargetKey) scrollPageTo(pageTargetKey);
        }}
        className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md text-left transition-colors duration-150 ease-out-soft hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="shrink-0 text-ink-subtle" aria-hidden>
          <ChevronRightIcon
            size={11}
            className={`transition-transform duration-150 ease-out-soft ${open ? 'rotate-90' : ''}`}
          />
        </span>
        <span className="w-8 shrink-0 text-[11px] font-semibold tabular-nums text-ink-muted">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-subtle">
          {excerpt || <span className="italic">{m.typeOnPage}</span>}
        </span>
      </button>
      {marks}
      {lines}
      <Menu items={menu} label={menuLabel} />
    </div>
  );
}

/**
 * Structured-question editor, reframed as a **mark scheme grid** (§ the paper owns
 * the words): one compact row per part and sub-part — letter, excerpt, marks, answer
 * lines — which is the ledger a paper-setter actually drafts. The wording is typed on
 * the page; a row expands for what has no page handle: the interlude, block inserts,
 * and the teacher-only answer.
 *
 * Rows are **collapsible**, and — the path that must never fail — a row opens when
 * the preview's selection lands inside it, so clicking (c)'s text on the paper opens
 * (c) here with the matching control scrolled into view.
 */
export function StructuredEditorPanel({ question, onChange }: EditorPanelProps<StructuredQuestion>) {
  const m = useMessages(STRUCTURED_PANEL_MESSAGES);
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
   * Follow the preview's selection into a collapsed row — as a render-time
   * adjustment, not an effect, so the revealed control is in the DOM in the same
   * commit `Inspector`'s layout effect queries it to scroll. Only a *change* of
   * target expands: the teacher can still collapse the row a selected field
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
        label={m.stem}
        labelHint={m.typedOnPage}
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
        <section className="flex flex-wrap gap-3">
          <NumberField
            label={m.marks}
            value={question.marks ?? 0}
            onChange={(marks) => onChange({ marks })}
          />
          <NumberField
            label={m.answerLines}
            value={question.answerSpace}
            clearable
            placeholder={m.none}
            onChange={(answerSpace) => onChange({ answerSpace })}
          />
          {!question.answerGraph && (
            <Button size="sm" onClick={() => onChange({ answerGraph: createAnswerGraph() })}>
              {m.addGraphSpace}
            </Button>
          )}
          {!question.answerDiagram && (
            <Button size="sm" onClick={() => onChange({ answerDiagram: createAnswerDiagram() })}>
              {m.addModelDiagram}
            </Button>
          )}
        </section>
      )}
      {/* An essay's answer, model diagram and scheme, in print order, as a leaf part's. */}
      {question.parts.length === 0 && (
        <BiTextField
          translate={{ kind: 'answer' }}
          label={m.answerTeacher}
          value={question.answer ?? emptyBiText()}
          onChange={(answer) => onChange({ answer })}
        />
      )}
      {question.parts.length === 0 && question.answerDiagram && (
        <AnswerDiagramRow
          block={question.answerDiagram}
          onChange={(answerDiagram) => onChange({ answerDiagram })}
          onRemove={() => onChange({ answerDiagram: undefined })}
        />
      )}
      {question.parts.length === 0 && (
        <MarkSchemeEditor
          scheme={question.scheme}
          printedMarks={question.marks}
          onChange={(scheme) => onChange({ scheme })}
        />
      )}
      {question.parts.length === 0 && question.answerGraph && (
        <AnswerGraphFields
          graph={question.answerGraph}
          onChange={(answerGraph) => onChange({ answerGraph })}
          onRemove={() => onChange({ answerGraph: undefined })}
        />
      )}

      <section className="space-y-1">
        <GroupHeader
          title={m.partsMarks}
          hint={m.partsHint}
          // Off by default: parts carry their own marks, so the trailing sum is opt-in.
          action={
            <CheckField
              label={m.showTotal}
              checked={Boolean(question.showTotalMarks)}
              onChange={(showTotalMarks) => onChange({ showTotalMarks })}
            />
          }
        />

        {/* Column headings for the grid's two number cells, present only when there is
            a grid to head. Widths mirror the cells below, so the words sit over their
            column. */}
        {question.parts.length > 0 && (
          <div className="flex items-center justify-end gap-1.5 px-1 pr-8 text-[9px] font-medium uppercase tracking-wide text-ink-subtle">
            <span className="w-12 text-right">{m.colMarks}</span>
            <span className="w-12 text-right">{m.colLines}</span>
          </div>
        )}

        <div className="space-y-0.5">
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

            const partMenu: MenuItem[] = [
              {
                label: m.moveUp,
                onSelect: () => movePart(partIndex, -1),
                disabled: partIndex === 0,
              },
              {
                label: m.moveDown,
                onSelect: () => movePart(partIndex, 1),
                disabled: partIndex === question.parts.length - 1,
              },
              {
                label: m.addSubPart,
                onSelect: () => {
                  const created = createSubPart();
                  // Created open — it exists to be typed into. The part's own marks are
                  // *kept*: a new sub-part is created marked, so `partMarks` sums the
                  // sub-parts and the part's value is ignored — but once the boxes are
                  // emptied to share one label, the part's marks become the group's,
                  // and a wipe here would have destroyed exactly that figure.
                  setExpandedSubs((prev) => new Set(prev).add(created.id));
                  setExpandedParts((prev) => new Set(prev).add(part.id));
                  patchPart(partIndex, { subParts: [...subParts, created] });
                },
              },
              ...(interlude.length === 0
                ? [
                    {
                      label: m.textBefore,
                      onSelect: () => {
                        setExpandedParts((prev) => new Set(prev).add(part.id));
                        patchPart(partIndex, {
                          blocksBefore: [createParagraphBlock(emptyBiText())],
                        });
                      },
                    },
                  ]
                : []),
              graphMenuItem(m, part.answerGraph, (answerGraph) => {
                setExpandedParts((prev) => new Set(prev).add(part.id));
                patchPart(partIndex, { answerGraph });
              }),
              diagramMenuItem(m, part.answerDiagram, (answerDiagram) => {
                setExpandedParts((prev) => new Set(prev).add(part.id));
                patchPart(partIndex, { answerDiagram });
              }),
              {
                label: m.deletePart,
                danger: true,
                separated: true,
                onSelect: () => setParts(question.parts.filter((_, i) => i !== partIndex)),
              },
            ];

            return (
              <section key={part.id} className="rounded-lg border border-line bg-surface">
                <SchemeRow
                  m={m}
                  open={partOpen}
                  onToggle={() => togglePart(part.id)}
                  label={partLabel(partIndex)}
                  excerpt={excerptOfBlocks(part.blocks)}
                  targetKey={editTargetKey({
                    kind: 'partAnswer',
                    questionId: question.id,
                    partId: part.id,
                  })}
                  pageTargetKey={
                    part.blocks[0]
                      ? editTargetKey({ kind: 'blockText', blockId: part.blocks[0].id })
                      : undefined
                  }
                  marks={
                    hasSubParts && !sharesMarks ? (
                      // Individually marked sub-parts: the part's total is derived, and
                      // a derived number is never an input (§ marks are derived).
                      <span className="w-12 shrink-0 text-right">
                        <Pill>{m.marksShort(partMarks(part))}</Pill>
                      </span>
                    ) : (
                      <MiniNumber
                        // Clearable at heart: absent prints no label at all — some
                        // parts are marked as a group elsewhere — while 0 deliberately
                        // prints "(0 marks)".
                        label={
                          sharesMarks
                            ? subParts.length > 1
                              ? m.marksTogether(subPartLabel(0), subPartLabel(subParts.length - 1))
                              : m.marksFor(subPartLabel(0))
                            : m.partMarks(partLabel(partIndex))
                        }
                        value={part.marks}
                        placeholder="–"
                        onChange={(marks) => patchPart(partIndex, { marks })}
                      />
                    )
                  }
                  lines={
                    <MiniNumber
                      label={m.partSpace(partLabel(partIndex))}
                      value={part.answerSpace}
                      placeholder="–"
                      onChange={(answerSpace) => patchPart(partIndex, { answerSpace })}
                    />
                  }
                  menu={partMenu}
                  menuLabel={m.partActions(partLabel(partIndex))}
                />

                {partOpen && (
                  <div className="animate-fade-in space-y-2 border-t border-line p-2">
                    {/*
                     * The mid-question interlude (§`QuestionPart.blocksBefore`):
                     * unnumbered text — often a revised table — that resets the scenario
                     * before this part is asked. Rendered *above* the part's own blocks,
                     * where it prints. Added from the row's menu; removing the last
                     * block drops the field.
                     */}
                    {interlude.length > 0 && (
                      <div className="space-y-1 rounded-md border border-dashed border-line p-2">
                        <GroupHeader title={m.textBefore} hint={m.unnumberedHint} />
                        <BlockEditor
                          blocks={interlude}
                          onChange={(blocksBefore) =>
                            // Emptied back to nothing drops the field, rather than
                            // storing an empty array that reads as "an interlude that
                            // prints nothing".
                            patchPart(partIndex, {
                              blocksBefore: blocksBefore.length > 0 ? blocksBefore : undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    <BlockEditor
                      blocks={part.blocks}
                      onChange={(blocks) => patchPart(partIndex, { blocks })}
                    />

                    {subParts.length > 0 && (
                      <div className="space-y-0.5 border-l-2 border-line pl-2">
                        {subParts.map((subPart, subIndex) => {
                          const subOpen = expandedSubs.has(subPart.id);
                          const subMenu: MenuItem[] = [
                            {
                              label: m.moveUp,
                              onSelect: () => moveSubPart(subIndex, -1),
                              disabled: subIndex === 0,
                            },
                            {
                              label: m.moveDown,
                              onSelect: () => moveSubPart(subIndex, 1),
                              disabled: subIndex === subParts.length - 1,
                            },
                            graphMenuItem(m, subPart.answerGraph, (answerGraph) => {
                              setExpandedSubs((prev) => new Set(prev).add(subPart.id));
                              patchPart(partIndex, {
                                subParts: subParts.map((s, i) =>
                                  i === subIndex ? { ...s, answerGraph } : s,
                                ),
                              });
                            }),
                            diagramMenuItem(m, subPart.answerDiagram, (answerDiagram) => {
                              setExpandedSubs((prev) => new Set(prev).add(subPart.id));
                              patchPart(partIndex, {
                                subParts: subParts.map((s, i) =>
                                  i === subIndex ? { ...s, answerDiagram } : s,
                                ),
                              });
                            }),
                            {
                              label: m.deleteSubPart,
                              danger: true,
                              separated: true,
                              onSelect: () =>
                                patchPart(partIndex, {
                                  subParts: subParts.filter((_, i) => i !== subIndex),
                                }),
                            },
                          ];
                          return (
                            <div key={subPart.id}>
                              <SchemeRow
                                m={m}
                                open={subOpen}
                                onToggle={() => toggleSub(subPart.id)}
                                label={subPartLabel(subIndex)}
                                excerpt={excerptOfBlocks(subPart.blocks)}
                                targetKey={editTargetKey({
                                  kind: 'subPartAnswer',
                                  questionId: question.id,
                                  partId: part.id,
                                  subPartId: subPart.id,
                                })}
                                pageTargetKey={
                                  subPart.blocks[0]
                                    ? editTargetKey({
                                        kind: 'blockText',
                                        blockId: subPart.blocks[0].id,
                                      })
                                    : undefined
                                }
                                marks={
                                  <MiniNumber
                                    // Empty is a real state here, and the placeholder
                                    // has to say which one: the group's shared label,
                                    // not "unmarked".
                                    label={m.subMarks(subPartLabel(subIndex))}
                                    value={subPart.marks}
                                    placeholder={m.shared}
                                    onChange={(marks) =>
                                      patchPart(partIndex, {
                                        subParts: subParts.map((s, i) =>
                                          i === subIndex ? { ...s, marks } : s,
                                        ),
                                      })
                                    }
                                  />
                                }
                                lines={
                                  <MiniNumber
                                    label={m.subSpace(subPartLabel(subIndex))}
                                    value={subPart.answerSpace}
                                    placeholder="–"
                                    onChange={(answerSpace) =>
                                      patchPart(partIndex, {
                                        subParts: subParts.map((s, i) =>
                                          i === subIndex ? { ...s, answerSpace } : s,
                                        ),
                                      })
                                    }
                                  />
                                }
                                menu={subMenu}
                                menuLabel={m.subActions(subPartLabel(subIndex))}
                              />
                              {subOpen && (
                                <div className="animate-fade-in space-y-2 py-1 pl-6">
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
                                  {subPart.answerGraph && (
                                    <AnswerGraphFields
                                      graph={subPart.answerGraph}
                                      onChange={(answerGraph) =>
                                        patchPart(partIndex, {
                                          subParts: subParts.map((s, i) =>
                                            i === subIndex ? { ...s, answerGraph } : s,
                                          ),
                                        })
                                      }
                                      onRemove={() =>
                                        patchPart(partIndex, {
                                          subParts: subParts.map((s, i) =>
                                            i === subIndex ? { ...s, answerGraph: undefined } : s,
                                          ),
                                        })
                                      }
                                    />
                                  )}
                                  <BiTextField
                                    translate={{ kind: 'answer' }}
                                    label={m.answerTeacher}
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
                                  {subPart.answerDiagram && (
                                    <AnswerDiagramRow
                                      block={subPart.answerDiagram}
                                      onChange={(answerDiagram) =>
                                        patchPart(partIndex, {
                                          subParts: subParts.map((s, i) =>
                                            i === subIndex ? { ...s, answerDiagram } : s,
                                          ),
                                        })
                                      }
                                      onRemove={() =>
                                        patchPart(partIndex, {
                                          subParts: subParts.map((s, i) =>
                                            i === subIndex ? { ...s, answerDiagram: undefined } : s,
                                          ),
                                        })
                                      }
                                    />
                                  )}
                                  <MarkSchemeEditor
                                    scheme={subPart.scheme}
                                    printedMarks={
                                      sharesMarks && subIndex === subParts.length - 1
                                        ? part.marks
                                        : subPart.marks
                                    }
                                    onChange={(scheme) =>
                                      patchPart(partIndex, {
                                        subParts: subParts.map((s, i) =>
                                          i === subIndex ? withScheme(s, scheme) : s,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* After the sub-parts, where it prints: a part's room follows its group. */}
                    {part.answerGraph && (
                      <AnswerGraphFields
                        graph={part.answerGraph}
                        onChange={(answerGraph) => patchPart(partIndex, { answerGraph })}
                        onRemove={() => patchPart(partIndex, { answerGraph: undefined })}
                      />
                    )}

                    <BiTextField
                      translate={{ kind: 'answer' }}
                      label={m.answerMarking}
                      value={part.answer ?? emptyBiText()}
                      onChange={(answer) => patchPart(partIndex, { answer })}
                    />
                    {part.answerDiagram && (
                      <AnswerDiagramRow
                        block={part.answerDiagram}
                        onChange={(answerDiagram) => patchPart(partIndex, { answerDiagram })}
                        onRemove={() => patchPart(partIndex, { answerDiagram: undefined })}
                      />
                    )}
                    <MarkSchemeEditor
                      scheme={part.scheme}
                      printedMarks={hasSubParts ? partMarks(part) : part.marks}
                      onChange={(scheme) => setParts(replacePart(question.parts, partIndex, withScheme(part, scheme)))}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <Button
          size="sm"
          onClick={() => {
            const created = createPart();
            // Created open — it exists to be typed into.
            setExpandedParts((prev) => new Set(prev).add(created.id));
            setParts([...question.parts, created]);
          }}
        >
          {m.addPart}
        </Button>
        <span className="text-xs font-semibold text-ink-muted">
          {m.total(questionMarks(question))}
        </span>
      </div>
    </div>
  );
}
