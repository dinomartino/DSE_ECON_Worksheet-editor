import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { exportOrigin } from '@/export/origin';
import { stampPdf } from '@/export/origin/pdf';

/**
 * k-0558 proof, step 2 (after `node scripts/origin-proof.mjs`): the engine's print stamped
 * exactly as the desktop's `savePdf` stamps it (`pdfOriginUpdate`, appended), with the id
 * the real app stored. Run by name only: `npx vitest run scripts/origin-proof.test.ts`.
 */
const OUT = process.env.K0558_OUT ?? '/tmp/k0558-proof';

it.skipIf(!existsSync(`${OUT}/proof.json`))('stamps the printed PDF with the stored id', () => {
  const proof = JSON.parse(readFileSync(`${OUT}/proof.json`, 'utf8')) as { afterReload: string; title: string };
  const raw = new Uint8Array(readFileSync(`${OUT}/paper-chrome-raw.pdf`));
  const stamped = stampPdf(raw, exportOrigin({ originId: proof.afterReload }), proof.title);
  writeFileSync(`${OUT}/paper.pdf`, stamped);
  expect(stamped.length).toBeGreaterThan(raw.length);
});
