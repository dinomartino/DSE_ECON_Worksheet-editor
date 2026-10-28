import { watermarkOf, watermarkOpacity } from '@/model/watermark';
import type { Worksheet } from '@/model/types';

/**
 * The watermark's picture with its strength drawn into its pixels, for the `.docx` (k-0242).
 *
 * Word reads the strength from the file (`a:alphaModFix`), but LibreOffice, and with it
 * every app that opens a `.docx` without Word's picture effects, prints the picture at full
 * strength: a black logo across every page. Baked in, the picture is faint wherever the
 * file is opened. A PNG keeps its transparency (each pixel's alpha × the strength); a JPEG
 * has none, so it is laid over white instead, which reads the same behind the text.
 *
 * Browser-only (a canvas), and a pre-pass like `renderDiagramImages`, so `buildParts`
 * stays synchronous; without it (the node tests) the exporter falls back to the original
 * picture and Word's transparency setting.
 */
export async function bakeWatermarkImage(worksheet: Worksheet): Promise<string | undefined> {
  const mark = watermarkOf(worksheet);
  if (!mark || typeof document === 'undefined') return undefined;
  const image = await new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = mark.src;
  });
  if (!image || !image.naturalWidth || !image.naturalHeight) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const jpeg = /^data:image\/jpe?g/i.test(mark.src);
  if (jpeg) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.globalAlpha = watermarkOpacity(mark);
  context.drawImage(image, 0, 0);
  return jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
}
