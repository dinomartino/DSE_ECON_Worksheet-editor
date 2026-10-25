import { flushSync } from "react-dom";
import { dropEmptySchemePoint, editTargetKey, joinSchemePoint, splitSchemePoint, textOfTarget } from "@/model/edits";
import { newId } from "@/model/factories";
import { joinParagraph, splitParagraph } from "@/model/paragraphs";
import { richTextLength } from "@/model/text";
import type { McqQuestion } from "@/model/types";
import type { EditTarget } from "@/render/ir";
import { useWorksheetStore } from "@/store/worksheetStore";
import { openFieldWhenReady } from "./InlineEditable";

/**
 * Word's Enter, Backspace and Delete between fields (k-0200), shared by the paper and the
 * Marking scheme view so a field behaves the same wherever it is typed.
 *
 * - a **paragraph** splits at the caret; Backspace at its start / Delete at its end joins;
 * - a **mark point** splits into a new point after it with the same mark (§
 *   `splitMarkPoint`), and joins the same way within its group; Enter on an empty point
 *   removes it and finishes, as Enter on an empty list item ends a list in Word;
 * - an **option or statement** hands over to the next (the last finishes);
 * - a field of **one text that may run to lines** — an answer, a level or EC descriptor, an
 *   MC explanation or rationale, a `/` alternative — takes a line break (`enterBreaksLine`);
 * - anything else (a heading, a title, a marks box) finishes.
 *
 * Each split or join is one commit, so ⌘Z takes it back in one step.
 */

type Side = "en" | "zh";

/** Enter starts a new line inside the field, as Shift+Enter does (§ `InlineEditable.enterBreaksLine`). */
export function enterBreaksLine(target: EditTarget): boolean {
  switch (target.kind) {
    case "questionAnswer":
    case "partAnswer":
    case "subPartAnswer":
    case "schemeAlternative":
    case "schemeLevel":
    case "schemeEc":
    case "mcqExplanation":
    case "mcqRationale":
      return true;
    default:
      return false;
  }
}

/** The move Enter makes once the field has closed, or `undefined` where Enter finishes. */
export function fieldEnter(
  target: EditTarget,
  side: Side,
  range: { start: number; end: number },
): (() => void) | undefined {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return undefined;
  if (target.kind === "blockText") {
    return () => {
      const id = newId();
      // Rendered now, so the new paragraph's field is on the page to open before the next key.
      flushSync(() => store.commit((draft) => splitParagraph(draft, target.blockId, side, range.start, range.end, id)));
      openFieldWhenReady(editTargetKey({ kind: "blockText", blockId: id }), side, "start");
    };
  }
  if (target.kind === "schemePoint") {
    return () => {
      // Read once this field's typing is in the store: Enter on an empty point ends the
      // list, removing the point (when it may go) rather than adding another.
      if (pointIsEmpty(target, side)) {
        store.commit((draft) => dropEmptySchemePoint(draft, target));
        return;
      }
      const id = newId();
      flushSync(() => store.commit((draft) => splitSchemePoint(draft, target, side, range.start, range.end, id)));
      openFieldWhenReady(editTargetKey({ ...target, pointId: id }), side, "start");
    };
  }
  if (target.kind === "mcqOption" || target.kind === "mcqStatement") {
    const question = store.worksheet.questions.find((q) => q.id === target.questionId) as
      | McqQuestion
      | undefined;
    if (!question) return undefined;
    const next: EditTarget | undefined =
      target.kind === "mcqOption"
        ? (() => {
            const at = question.options.findIndex((option) => option.id === target.optionId);
            const option = at < 0 ? undefined : question.options[at + 1];
            return option ? { kind: "mcqOption", questionId: question.id, optionId: option.id } : undefined;
          })()
        : target.index + 1 < (question.statements?.length ?? 0)
          ? { kind: "mcqStatement", questionId: question.id, index: target.index + 1 }
          : undefined;
    // The last option (or statement) finishes, as Enter always did.
    if (!next) return undefined;
    return () => openFieldWhenReady(editTargetKey(next), side, "end");
  }
  return undefined;
}

/** The join Backspace / Delete makes at a field's edge, or `undefined` where there is none. */
export function fieldJoin(target: EditTarget, side: Side, direction: "backward" | "forward"): (() => void) | undefined {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return undefined;
  if (target.kind === "blockText") {
    if (!joinParagraph(store.worksheet, target.blockId, side, direction)) return undefined;
    return () => {
      // The caret is read from the committed document: this field's last keys are in it now.
      let landing: { blockId: string; caret: number } | undefined;
      flushSync(() =>
        store.commit((draft) => {
          const joined = joinParagraph(draft, target.blockId, side, direction);
          landing = joined;
          return joined?.worksheet ?? draft;
        }),
      );
      if (landing) openFieldWhenReady(editTargetKey({ kind: "blockText", blockId: landing.blockId }), side, landing.caret);
    };
  }
  if (target.kind === "schemePoint") {
    if (!joinSchemePoint(store.worksheet, target, side, direction)) return undefined;
    return () => {
      let landing: { pointId: string; caret: number } | undefined;
      flushSync(() =>
        store.commit((draft) => {
          const joined = joinSchemePoint(draft, target, side, direction);
          landing = joined;
          return joined?.worksheet ?? draft;
        }),
      );
      if (landing) openFieldWhenReady(editTargetKey({ ...target, pointId: landing.pointId }), side, landing.caret);
    };
  }
  return undefined;
}

function pointIsEmpty(target: Extract<EditTarget, { kind: "schemePoint" }>, side: Side): boolean {
  const text = textOfTarget(useWorksheetStore.getState().worksheet, target);
  return text !== undefined && richTextLength(text[side]) === 0;
}
