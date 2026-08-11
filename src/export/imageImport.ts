/**
 * Preparing an inserted picture for storage.
 *
 * A worksheet carries its pictures inline: `ImageBlock.src` and `CellImage.src` are
 * `data:` URLs, base64 in the document's own JSON. That is what makes a downloaded
 * `.worksheet.json` self-contained, and it is also the whole cost — base64 adds a
 * third again, localStorage gives roughly 5MB *across every document*, and the bytes
 * that arrived were the camera's, not the page's. A teacher who inserts four photos
 * of textbook figures can fill the budget for every worksheet they will ever save.
 *
 * So an inserted file is reduced to what the paper can actually print, once, at
 * import. The rule teachers never have to think about: whatever you insert prints at
 * 300 DPI, and never gets worse than you gave it.
 *
 * Browser-only and asynchronous — it decodes and re-encodes through a canvas — which
 * is why it lives here beside `diagramImage.ts` rather than in `model/`.
 */

/**
 * The widest a stored picture ever needs to be, in CSS pixels at 96dpi.
 *
 * Derived from the ceiling, not from the size the figure is inserted at. The printed
 * width of a figure is `widthPx / 96` inches, resize is width-only, and the text
 * column is a hard wall — a picture cannot be dragged wider than the page. So the
 * widest any picture can ever print is the widest content column the app offers, and
 * storing more pixels than that buys resolution no backend can emit.
 *
 * A4 portrait at the narrowest margins the presets offer (1.27cm) leaves
 * 11906 − 2×720 = 10466 twips ≈ 7.27in of column. At 300 DPI that is ~2180px. A3 is
 * wider, but a figure on A3 is not what the budget is being spent on, and the cap is
 * a floor on quality rather than a promise about paper: an A3 figure still prints at
 * over 200 DPI, which is past what these scans carry in the first place.
 *
 * Rounded to 2200 — the precision implied by "300 DPI on a page whose margins the
 * teacher may change" does not survive a tighter number.
 */
export const MAX_STORED_WIDTH_PX = 2200;

/**
 * A defensive ceiling on the other axis, for a rotated scan.
 *
 * A picture taller than the page is broken for reasons this module cannot fix, but a
 * portrait phone photo of a textbook page is both common and enormous, and capping
 * width alone leaves it at full height. A4's 297mm at 300 DPI is ~3500px.
 */
export const MAX_STORED_HEIGHT_PX = 3500;

/** JPEG quality for a photograph that had to be resized. One generation at 0.85 is free. */
const JPEG_QUALITY = 0.85;

/**
 * What `.docx` export can decode (`export/docx/index.ts`'s `DATA_URL`).
 *
 * A picture in any other format is not merely large — it fails to export at all, so
 * transcoding it is a repair, not an optimisation.
 */
const EXPORTABLE = new Set(['image/png', 'image/jpeg', 'image/gif']);

/** What an import produced: the bytes to store, and the size they decode at. */
export interface PreparedImage {
  /** A `data:` URL in a format `.docx` export can decode. */
  src: string;
  /** The stored image's own dimensions — what `naturalWidthPx`/`naturalHeightPx` mean. */
  naturalWidthPx: number;
  naturalHeightPx: number;
}

/**
 * What to do with a file, decided before any canvas is touched.
 *
 * Pure, so the policy can be tested without a browser: the canvas work below is
 * mechanical, and every judgement that could be wrong — the cap, never upscaling,
 * which formats are left alone, which are repaired — is decided here.
 *
 * `keep` stores the original bytes. `reencode` draws to `width`×`height` and encodes
 * as `format`, where `race` means "try both and keep the smaller" (only reachable for
 * a format that must be transcoded and carries no alpha).
 */
export type ImagePlan =
  | { action: 'keep'; reason: 'within-budget' | 'animated' }
  | {
      action: 'reencode';
      width: number;
      height: number;
      format: 'image/png' | 'image/jpeg' | 'race';
      /** Whether the source was over the cap, as opposed to merely unexportable. */
      oversized: boolean;
    };

export function planImageImport(
  type: string,
  width: number,
  height: number,
  /** Whether any pixel carries alpha. Unknown before decoding, so the caller supplies it. */
  alpha: boolean,
): ImagePlan {
  /*
   * An animated GIF must never meet a canvas: `drawImage` takes frame one and the
   * animation is gone with no sign that anything happened. GIF exports as-is, so
   * there is nothing to repair — leave it alone whatever its size.
   */
  if (type === 'image/gif') return { action: 'keep', reason: 'animated' };

  // Scale to the cap, never up: a small picture is already its own best version.
  const scale = Math.min(1, MAX_STORED_WIDTH_PX / width, MAX_STORED_HEIGHT_PX / height);
  const oversized = scale < 1;
  const exportable = EXPORTABLE.has(type);

  // Nothing to fix: within the cap and in a format the exporter decodes. Not
  // re-encoding avoids a generation of loss and keeps the ICC profile.
  if (!oversized && exportable) return { action: 'keep', reason: 'within-budget' };

  /*
   * Which encoding to write.
   *
   * The two failure modes point in opposite directions, and this domain has both:
   * JPEG grows ringing around every axis label and curve on the line art and chart
   * crops that dominate it — worst exactly where it shows, in print — while PNG can
   * balloon a photograph, which is fatal under a shared 5MB budget.
   *
   * - **Alpha forces PNG.** JPEG has no alpha; flattening a cut-out is destructive
   *   and no size saving justifies it.
   * - **A JPEG stays a JPEG.** It is already lossy, so a second generation is the
   *   cheapest option available and PNG would only inflate it.
   * - **Everything else races**, PNG against JPEG, keeping JPEG only when it wins by
   *   a wide margin. That margin is what makes the race safe without a content
   *   classifier: flat colour and line art compress so well as PNG that JPEG cannot
   *   approach the threshold, while a photograph beats it several times over.
   *
   * A photographic PNG is the case this exists for. Keeping the source's family
   * unconditionally sounded principled and stored a downscaled 2600px photo as a 6MB
   * PNG — larger than the file that arrived, and alone past the whole budget. The
   * family is worth preserving only where it is protecting something.
   */
  const format = alpha ? 'image/png' : type === 'image/jpeg' ? 'image/jpeg' : 'race';

  return {
    action: 'reencode',
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    format,
    oversized,
  };
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the image.'));
    img.src = src;
  });

/**
 * Decode a file to a bitmap with EXIF orientation already applied.
 *
 * The single most likely silent corruption in this whole path. A phone photo carries
 * its rotation as an EXIF tag rather than in the pixels; re-encoding through a canvas
 * strips the tag, so if the decode did not *apply* it first the stored picture is
 * permanently sideways with no way back. `createImageBitmap` is asked explicitly.
 *
 * The `HTMLImageElement` fallback is for browsers without it; those apply orientation
 * during decode anyway, which is the same answer by a different route.
 */
async function decode(
  file: Blob,
  dataUrl: string,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through: some browsers reject the options bag rather than ignoring it.
    }
  }
  const img = await loadImage(dataUrl);
  return { source: img, width: img.naturalWidth, height: img.naturalHeight };
}

/** Does any pixel carry alpha? Decides PNG vs JPEG for a format that must be transcoded. */
function hasAlpha(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true; // Cannot tell — keep the channel rather than flatten it.
  try {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // A tainted canvas cannot be read. Nothing here is cross-origin, but an SVG with
    // an external reference can taint one, and PNG is the answer that loses nothing.
    return true;
  }
}

const toDataUrl = (blob: Blob) => readAsDataUrl(blob);

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'))),
      type,
      quality,
    );
  });

/**
 * Reduce an inserted picture to what the page can print.
 *
 * Returns the original bytes untouched whenever there is nothing to fix — the common
 * case for the screenshots and chart crops this domain runs on. Not re-encoding is
 * not merely cheaper: it avoids a generation of loss, keeps the ICC profile, and
 * skips every failure mode below.
 *
 * Never throws. A picture that cannot be processed is stored exactly as it arrived:
 * quota pressure is a problem a teacher can see and act on, a blank or sideways
 * figure is not.
 */
export async function prepareImageForStorage(file: File): Promise<PreparedImage> {
  const original = await readAsDataUrl(file);

  let decoded: { source: CanvasImageSource; width: number; height: number };
  try {
    decoded = await decode(file, original);
  } catch {
    // Undecodable here but possibly fine in Word — store what arrived.
    return { src: original, naturalWidthPx: 0, naturalHeightPx: 0 };
  }

  const { source, width, height } = decoded;
  const close = () => {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
  };

  if (width <= 0 || height <= 0) {
    close();
    return { src: original, naturalWidthPx: 0, naturalHeightPx: 0 };
  }

  // GIF and the within-budget case are decided without touching a canvas at all.
  const cheapPlan = planImageImport(file.type, width, height, false);
  if (cheapPlan.action === 'keep') {
    close();
    return { src: original, naturalWidthPx: width, naturalHeightPx: height };
  }

  try {
    /*
     * Drawn straight to the target-size canvas, never to a full-size intermediate.
     * iOS Safari has a canvas area ceiling and fails a large one by returning blank
     * pixels rather than by throwing — a 40Mpx scan would become a white rectangle.
     * The target is small by construction, so the ceiling is never approached.
     */
    const canvas = document.createElement('canvas');
    canvas.width = cheapPlan.width;
    canvas.height = cheapPlan.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context.');
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(source, 0, 0, cheapPlan.width, cheapPlan.height);

    /*
     * The alpha question can only be answered once the pixels exist, so the plan is
     * re-asked with the real answer — and asked *before* any ground is painted, which
     * would make every image report as opaque. Every other term is unchanged.
     */
    const plan = planImageImport(file.type, width, height, hasAlpha(canvas));
    if (plan.action !== 'reencode') throw new Error('Plan changed under the canvas.');

    /*
     * A ground under a picture that is about to become JPEG, which carries no alpha:
     * compositing transparency onto an unpainted canvas yields **black**, turning the
     * white surround of a cut-out chart into a black box. White, because that is the
     * paper. Re-drawn over the ground, since the first draw is already down.
     */
    if (plan.format !== 'image/png') {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    let blob: Blob;
    if (plan.format === 'race') {
      const [png, jpeg] = await Promise.all([
        encode(canvas, 'image/png'),
        encode(canvas, 'image/jpeg', JPEG_QUALITY),
      ]);
      // A real photograph is far smaller as JPEG; line art is not, and keeping PNG
      // there is what protects the labels. The size race is the whole classifier.
      blob = jpeg.size < png.size * 0.6 ? jpeg : png;
    } else {
      blob = await encode(
        canvas,
        plan.format,
        plan.format === 'image/jpeg' ? JPEG_QUALITY : undefined,
      );
    }

    const encoded = await toDataUrl(blob);

    /*
     * Validate before trusting it. A canvas that failed quietly yields blank pixels
     * or a `"data:,"` URL, and storing that destroys the figure. Decoding the result
     * is the only check that catches both.
     */
    const check = await loadImage(encoded);
    if (check.naturalWidth !== plan.width || check.naturalHeight !== plan.height) {
      throw new Error('Re-encoded image did not decode at the expected size.');
    }

    /*
     * Never make the file worse.
     *
     * A re-encode can grow — a flat-colour PNG is routinely smaller than anything a
     * canvas produces. Keeping the original is only an option when it was already
     * exportable; an unexportable format has to be transcoded whatever it costs,
     * because the alternative is a `.docx` that will not build.
     *
     * `oversized` is not a reason to keep it either way: those bytes are over the cap
     * by definition, which is the whole thing being fixed.
     */
    if (encoded.length >= original.length && !plan.oversized && EXPORTABLE.has(file.type)) {
      close();
      return { src: original, naturalWidthPx: width, naturalHeightPx: height };
    }

    close();
    return { src: encoded, naturalWidthPx: plan.width, naturalHeightPx: plan.height };
  } catch {
    // Quota is a visible problem; a corrupted figure is not.
    close();
    return { src: original, naturalWidthPx: width, naturalHeightPx: height };
  }
}
