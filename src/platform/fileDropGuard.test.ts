import { describe, expect, it } from 'vitest';
import { guardStrayFileDrops, holdsFiles, refuseStrayFileDrop, refuseStrayFileOver } from './fileDropGuard';

/**
 * A file dropped where nothing takes it must not navigate the window (`fileDropGuard.ts`).
 * Node has `Event` and `EventTarget` but no `DragEvent`, so the drag is an ordinary cancelable
 * event carrying the `dataTransfer` the guard reads.
 */

interface Transfer {
  types: string[];
  dropEffect: DataTransfer['dropEffect'];
}

function drag(type: 'dragover' | 'drop', types: string[], dropEffect: Transfer['dropEffect'] = 'copy') {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const dataTransfer: Transfer = { types, dropEffect };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return { event: event as unknown as DragEvent, dataTransfer };
}

describe('holdsFiles', () => {
  it('is true only when the drag carries files', () => {
    expect(holdsFiles(drag('dragover', ['Files']).event)).toBe(true);
    expect(holdsFiles(drag('dragover', ['text/plain', 'Files']).event)).toBe(true);
    expect(holdsFiles(drag('dragover', ['text/plain']).event)).toBe(false);
    expect(holdsFiles(drag('dragover', []).event)).toBe(false);
    expect(holdsFiles({ dataTransfer: null })).toBe(false);
  });
});

describe('a file held over a place that takes none', () => {
  it('is cancelled and shown as not allowed', () => {
    const { event, dataTransfer } = drag('dragover', ['Files']);
    refuseStrayFileOver(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('none');
  });

  it('is left alone once a component has taken it', () => {
    const { event, dataTransfer } = drag('dragover', ['Files'], 'copy');
    event.preventDefault();
    refuseStrayFileOver(event);
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('does not touch an in-page drag', () => {
    const { event, dataTransfer } = drag('dragover', ['text/plain']);
    refuseStrayFileOver(event);
    expect(event.defaultPrevented).toBe(false);
    expect(dataTransfer.dropEffect).toBe('copy');
  });
});

describe('a file dropped there anyway', () => {
  it('is cancelled, so the webview does not navigate to it', () => {
    const { event } = drag('drop', ['Files']);
    refuseStrayFileDrop(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('is not cancelled twice, and an in-page drop is not cancelled at all', () => {
    const plain = drag('drop', ['text/plain']).event;
    refuseStrayFileDrop(plain);
    expect(plain.defaultPrevented).toBe(false);
  });
});

describe('guardStrayFileDrops', () => {
  const asWindow = (target: EventTarget) => target as unknown as Window;

  it('guards a target until it is removed', () => {
    const target = new EventTarget();
    const remove = guardStrayFileDrops(asWindow(target));

    const held = drag('dragover', ['Files']);
    target.dispatchEvent(held.event);
    expect(held.event.defaultPrevented).toBe(true);
    const dropped = drag('drop', ['Files']);
    target.dispatchEvent(dropped.event);
    expect(dropped.event.defaultPrevented).toBe(true);

    remove();
    const after = drag('drop', ['Files']);
    target.dispatchEvent(after.event);
    expect(after.event.defaultPrevented).toBe(false);
  });

  it('leaves a drop a component already took, wherever the guard sits in the order', () => {
    const target = new EventTarget();
    // The page's own handler (the start screen, the feedback dialog) runs before the window's.
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      (event as unknown as DragEvent).dataTransfer!.dropEffect = 'copy';
    });
    guardStrayFileDrops(asWindow(target));
    const held = drag('dragover', ['Files']);
    target.dispatchEvent(held.event);
    expect(held.dataTransfer.dropEffect).toBe('copy');
  });
});
