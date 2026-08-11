import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Delete has four listeners on the page, one per selection: a text target, a picture, a
 * table cell, and the whole item (question or layout element). Every window keydown
 * listener fires — `stopPropagation` cannot separate them (§ modalLayer) — so the only
 * way a handler yields the key is to stand down before registering.
 *
 * The whole-item handler is the destructive one, and clicking any component inside a
 * question selects that question on the way up. So it stayed armed *alongside* the
 * specific handler: Delete on a picture removed the picture and the question holding
 * it; Delete on a table cell wiped a whole MCQ while the only thing ringed on the page
 * was one cell.
 *
 * Read from source rather than by mounting the page: the bug is a missing guard, and a
 * guard's absence is what has to be caught. Each `if (x) return;` is a claim that a
 * finer selection owns the key.
 */
const source = readFileSync('src/components/preview/Preview.tsx', 'utf8');

/** The body of the whole-item Delete effect, from its guards to its listener. */
function wholeItemGuards(): string {
  const start = source.indexOf('if (!selectedQuestionId && !selectedLayoutId) return;');
  expect(start, 'the whole-item Delete handler moved or was renamed').toBeGreaterThan(-1);
  // Back up over the guards that precede it inside the same effect.
  const effect = source.lastIndexOf('useEffect(() => {', start);
  return source.slice(effect, start);
}

describe('Delete precedence on the page', () => {
  it.each([
    ['selectedElement', 'a selected text target'],
    ['selectedBlockId', 'a selected picture'],
    ['activeCell', 'a selected table cell'],
  ])('stands the whole-item handler down for %s', (guard, what) => {
    expect(
      wholeItemGuards(),
      `Delete deletes the whole question while ${what} is selected — the finer ` +
        `handler runs too, so both fire and the question goes with the component`,
    ).toContain(`if (${guard}) return;`);
  });

  it('re-registers when any of those selections change', () => {
    // A guard read inside the effect but missing from its dependency list is a stale
    // closure: the handler would keep the arming it had when the effect last ran.
    const deps = source.slice(
      source.indexOf('if (!selectedQuestionId && !selectedLayoutId) return;'),
    );
    const list = deps.slice(deps.indexOf('}, ['), deps.indexOf(']);') + 3);
    for (const guard of ['selectedElement', 'selectedBlockId', 'activeCell']) {
      expect(list, `${guard} guards the handler but is not a dependency`).toContain(guard);
    }
  });

  /*
   * The other half of the same problem: a cell that could never be *deselected*. The
   * cell selection lives in the store, so no local reset reached it — it stayed ringed
   * and the sidebar stayed on the table panel however far away the teacher clicked.
   */
  it('drops the cell on a press that is not on a cell, after the chrome exemption', () => {
    const press = source.slice(source.indexOf('onMouseDown={(event) => {'));
    const body = press.slice(0, press.indexOf('beginSweep('));

    const onCell = body.indexOf('if (target.closest("[data-table-cell]")) return;');
    const chrome = body.indexOf('button, a, input, textarea, select');
    const clear = body.indexOf('setActiveCell(undefined);');

    expect(onCell, 'a press on a cell is the table\'s own gesture').toBeGreaterThan(-1);
    expect(clear, 'a press elsewhere never dropped the cell selection').toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(onCell);
    /*
     * The table's resize grips and its insert/delete chips are buttons, and they act on
     * the active cell. Clearing before the chrome exemption would drop the cell on the
     * way to the very control that needs it.
     */
    expect(
      clear,
      'pressing a table control would clear the cell it is about to act on',
    ).toBeGreaterThan(chrome);
  });

  /*
   * The third face of the same problem: a component that could only be deselected by
   * selecting a *different* one or by leaving the question. Clicking the question's own
   * body — the gap between two parts, the padding beside a stem — left the component
   * ringed, the sidebar on it, and Delete armed for it.
   *
   * The wrapper's handler is only ever reached by a click on the question itself: every
   * finer path calls `stopPropagation`. So clearing here is unconditional, except for
   * the cell, which activates in capture on the way down.
   */
  describe('the question body deselects what is inside it', () => {
    /** The question branch of `ItemBody`'s `onSelect`. */
    function questionSelect(): string {
      const start = source.indexOf('selfSelected.current = true;');
      expect(start, "the question's own select handler moved").toBeGreaterThan(-1);
      return source.slice(start, source.indexOf('blocks.push({', start));
    }

    it.each([
      ['setSelectedElement(undefined);', 'a selected text target'],
      ['setSelectedBlockId(undefined);', 'a selected picture'],
      ['setActiveCell(undefined);', 'a selected table cell'],
    ])('drops %s when the click lands on the question body', (call, what) => {
      expect(
        questionSelect(),
        `clicking the question's own body leaves ${what} selected — the ring, the ` +
          `sidebar and Delete all stay pointed at a component the teacher has left`,
      ).toContain(call);
    });

    it('exempts a click inside a table cell, which selected in capture', () => {
      const body = questionSelect();
      const exempt = body.indexOf('[data-table-cell]');
      const clear = body.indexOf('setActiveCell(undefined);');

      expect(
        exempt,
        'a cell activates in capture, so clearing here undoes the selection this very ' +
          'click just made',
      ).toBeGreaterThan(-1);
      expect(clear).toBeGreaterThan(exempt);
    });

    /*
     * The exemption is only sound while the finer paths stop the click themselves. If
     * one stopped doing so, its selection would reach this handler and be cleared by the
     * click that made it — the component would flicker and never stay selected.
     */
    it.each([
      ['src/components/preview/InlineEditable.tsx', 'a text field'],
      ['src/components/preview/ResizableBlock.tsx', 'a picture'],
    ])('%s stops the click, so selecting it never reaches the wrapper', (path, what) => {
      const child = readFileSync(path, 'utf8');
      const click = child.indexOf('onClick={(event) => {');
      expect(click, `${what} has no click handler to stop`).toBeGreaterThan(-1);
      expect(
        child.slice(click, click + 400),
        `selecting ${what} would bubble to the question wrapper, which would clear it`,
      ).toContain('event.stopPropagation();');
    });
  });

  it('clears a cell range through the bulk verb, not one target at a time', () => {
    // `onDelete` is one commit per call, so a range cleared cell by cell would cost as
    // many undos as it held cells (§ drag gestures commit once).
    expect(source).toContain('onClearCells(activeCell.blockId, cellIdsToClear)');
  });
});
