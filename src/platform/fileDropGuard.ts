/**
 * A file dropped where nothing takes it does nothing.
 *
 * A webview's own answer to a stray file is to navigate to it, replacing the app with a
 * view of the file. The desktop shell used to swallow every native drag, so a stray drop
 * never got that far; now its drag-drop handler is off (`src-tauri/tauri.conf.json`
 * `dragDropEnabled`, so the page can have HTML5 drag-and-drop) the webview behaves as a
 * browser tab does. Installed once, on `window`, behind every component: a drop that a
 * component wants (the start screen, the feedback dialog, the import review) has already
 * been cancelled by the time it gets here and is left alone.
 */

/** Whether the drag carries files (and so could be navigated to), not an in-page drag or text. */
export function holdsFiles(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** A file held over a place that takes none: cancel the default, and show "not here". */
export function refuseStrayFileOver(event: DragEvent): void {
  if (event.defaultPrevented || !holdsFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
}

/** A file dropped there anyway (a webview that delivers it regardless): do not navigate. */
export function refuseStrayFileDrop(event: DragEvent): void {
  if (event.defaultPrevented || !holdsFiles(event)) return;
  event.preventDefault();
}

/** Install both on `target`; returns the removal. */
export function guardStrayFileDrops(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  target.addEventListener('dragover', refuseStrayFileOver);
  target.addEventListener('drop', refuseStrayFileDrop);
  return () => {
    target.removeEventListener('dragover', refuseStrayFileOver);
    target.removeEventListener('drop', refuseStrayFileDrop);
  };
}
