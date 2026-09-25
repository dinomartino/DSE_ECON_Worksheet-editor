import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  IDLE,
  ROOT_DROP,
  dropTargetValue,
  parseDropTarget,
  stepDrag,
  type DragInput,
  type DragState,
  type DragStep,
  type DropTarget,
} from './dashboardDrag';

const MOCKS: DropTarget = { folderId: 'f-mocks' };
const ROOT: DropTarget = { folderId: undefined };

/** Feed inputs in order; return every step so a test can count drops. */
function run(inputs: DragInput[], from: DragState = IDLE): DragStep[] {
  const steps: DragStep[] = [];
  let state = from;
  for (const input of inputs) {
    const step = stepDrag(state, input);
    steps.push(step);
    state = step.state;
  }
  return steps;
}

const down: DragInput = { type: 'down', docId: 'd1', pointerId: 1, x: 100, y: 100 };
const moveTo = (
  x: number,
  y: number,
  target: DropTarget | null = null,
): Extract<DragInput, { type: 'move' }> => ({ type: 'move', pointerId: 1, x, y, target });

describe('dashboard drag: threshold', () => {
  it('a press that stays under the threshold is a click — no drag, no drop, click not swallowed', () => {
    const steps = run([down, moveTo(102, 101), moveTo(103, 103), { type: 'up', pointerId: 1, target: MOCKS }]);
    expect(steps.some((s) => s.started)).toBe(false);
    expect(steps.some((s) => s.drop)).toBe(false);
    expect(steps.some((s) => s.ended)).toBe(false);
    expect(steps.at(-1)!.state).toEqual(IDLE);
  });

  it('starts once travel reaches the threshold, and only once', () => {
    const steps = run([down, moveTo(100 + DRAG_THRESHOLD_PX, 100), moveTo(140, 100), moveTo(160, 120)]);
    expect(steps.map((s) => !!s.started)).toEqual([false, true, false, false]);
    expect(steps[1].state.phase).toBe('dragging');
  });

  it('leaving the pressed element starts the drag whatever the travel', () => {
    const [, step] = run([down, { ...moveTo(101, 100), left: true }]);
    expect(step.started).toBe(true);
  });
});

describe('dashboard drag: release', () => {
  it('release over a folder files the document there, exactly once', () => {
    const steps = run([
      down,
      moveTo(150, 150, MOCKS),
      { type: 'up', pointerId: 1, target: MOCKS },
      // Stray events after the release — a late lostpointercapture, a second up.
      { type: 'cancel' },
      { type: 'up', pointerId: 1, target: MOCKS },
    ]);
    const drops = steps.filter((s) => s.drop).map((s) => s.drop);
    expect(drops).toEqual([{ docId: 'd1', folderId: 'f-mocks' }]);
    expect(steps[2].ended).toBe(true);
    expect(steps.at(-1)!.state).toEqual(IDLE);
  });

  it('release over All documents files it out of any folder', () => {
    const steps = run([down, moveTo(150, 150, ROOT), { type: 'up', pointerId: 1, target: ROOT }]);
    expect(steps[2].drop).toEqual({ docId: 'd1', folderId: undefined });
  });

  it('the release position decides, not the last hovered target', () => {
    const steps = run([down, moveTo(150, 150, MOCKS), { type: 'up', pointerId: 1, target: null }]);
    expect(steps[2].drop).toBeUndefined();
    expect(steps[2].ended).toBe(true);
  });

  it('release away from any folder cancels, and still swallows the click', () => {
    const steps = run([down, moveTo(150, 150), { type: 'up', pointerId: 1, target: null }]);
    expect(steps.some((s) => s.drop)).toBe(false);
    expect(steps[2].ended).toBe(true);
  });
});

describe('dashboard drag: cancel', () => {
  it('Escape (cancel) mid-drag drops nothing, and a later release does nothing', () => {
    const steps = run([
      down,
      moveTo(150, 150, MOCKS),
      { type: 'cancel' },
      { type: 'up', pointerId: 1, target: MOCKS },
    ]);
    expect(steps.some((s) => s.drop)).toBe(false);
    expect(steps[2]).toEqual({ state: IDLE, ended: true });
    expect(steps[3]).toEqual({ state: IDLE });
  });

  it('cancel before the threshold is silent', () => {
    const [, step] = run([down, { type: 'cancel' }]);
    expect(step).toEqual({ state: IDLE });
  });
});

describe('dashboard drag: other pointers', () => {
  it('ignores moves and releases from a different pointer', () => {
    const steps = run([
      down,
      { type: 'move', pointerId: 2, x: 300, y: 300, target: MOCKS },
      { type: 'up', pointerId: 2, target: MOCKS },
    ]);
    expect(steps[1].state.phase).toBe('pressed');
    expect(steps[2].state.phase).toBe('pressed');
    expect(steps.some((s) => s.drop || s.started)).toBe(false);
  });

  it('a second press mid-gesture does not restart it', () => {
    const steps = run([down, moveTo(150, 150), { ...down, docId: 'd2', pointerId: 2 }]);
    expect(steps[2].state).toMatchObject({ phase: 'dragging', docId: 'd1' });
  });
});

describe('dashboard drag: hover target', () => {
  it('tracks the target under the pointer, keeping the same state when it has not changed', () => {
    const steps = run([down, moveTo(150, 150, MOCKS), moveTo(152, 151, { folderId: 'f-mocks' }), moveTo(10, 10, ROOT)]);
    expect(steps[1].state).toMatchObject({ target: MOCKS });
    expect(steps[2].state).toBe(steps[1].state);
    expect(steps[3].state).toMatchObject({ target: ROOT });
  });
});

describe('dashboard drag: drop target attribute', () => {
  it('round-trips folders and All documents', () => {
    expect(parseDropTarget(dropTargetValue('f-mocks'))).toEqual(MOCKS);
    expect(parseDropTarget(dropTargetValue(undefined))).toEqual(ROOT);
    expect(dropTargetValue(undefined)).toBe(ROOT_DROP);
  });

  it('keeps an id containing the separator whole', () => {
    expect(parseDropTarget(dropTargetValue('a:b'))).toEqual({ folderId: 'a:b' });
  });

  it('anything else is no target', () => {
    for (const value of [null, undefined, '', 'folder:', 'mocks', 'ROOT']) {
      expect(parseDropTarget(value)).toBeNull();
    }
  });
});
