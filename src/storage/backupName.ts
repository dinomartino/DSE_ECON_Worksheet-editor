/** `Worksheets backup <yyyy-mm-dd>.zip`. Apart from `backup.ts` (JSZip), so a save picker can suggest it before that loads. */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Worksheets backup ${day}.zip`;
}
