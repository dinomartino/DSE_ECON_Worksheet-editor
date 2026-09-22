/**
 * The browser's own "save a file": an anchor with a `download` attribute.
 *
 * Its own module so `src/platform` can fall back to it without importing `src/storage`,
 * which imports `src/platform` — the web path must stay exactly what shipped.
 */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick; revoking synchronously cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
