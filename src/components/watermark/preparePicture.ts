/**
 * Watermark pictures, made in the browser when the teacher saves one (k-0242).
 *
 * Every watermark ends up a PNG or JPEG `data:` URL: what the `.docx` can embed and every
 * backend draws the same way. An SVG logo is drawn once onto a canvas (Word's SVG support
 * needs a PNG beside it anyway); a line of text is drawn as a picture, so a text watermark
 * prints in the same place, size and faintness as a logo with no font of its own in the file.
 */

export interface PreparedWatermark {
  src: string;
  widthPx: number;
  heightPx: number;
}

/** The long edge kept: sharp at A4 width on a 150 dpi print, small enough to store. */
export const WATERMARK_MAX_EDGE_PX = 1200;
/** An SVG with no size of its own is drawn this wide. */
const SVG_FALLBACK_PX = 1000;

const ACCEPTED = /^image\/(png|jpe?g|svg\+xml|gif|webp)$/i;
export const WATERMARK_FILE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg';

export function isWatermarkFile(file: File): boolean {
  return ACCEPTED.test(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('unreadable picture'));
    image.src = url;
  });
}

/** The scale that brings the long edge within `WATERMARK_MAX_EDGE_PX`, never enlarging. */
export function fitScale(width: number, height: number, max = WATERMARK_MAX_EDGE_PX): number {
  const long = Math.max(width, height);
  return long > max ? max / long : 1;
}

/**
 * A picture file as a watermark: downscaled, an SVG rasterised, transparency kept (PNG); a
 * photograph stays JPEG so it does not balloon. Rejects when the browser cannot draw it.
 */
export async function prepareWatermarkPicture(file: File): Promise<PreparedWatermark> {
  const svg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    if (!width || !height) {
      if (!svg) throw new Error('unreadable picture');
      width = SVG_FALLBACK_PX;
      height = SVG_FALLBACK_PX;
    } else if (svg && Math.max(width, height) < SVG_FALLBACK_PX) {
      // A vector logo has no pixels to lose: draw it large, not at its nominal 100px.
      const up = SVG_FALLBACK_PX / Math.max(width, height);
      width *= up;
      height *= up;
    }
    const scale = fitScale(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    const src = jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
    return { src, widthPx: canvas.width, heightPx: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The face a text watermark is drawn in: the paper's own serif, with Chinese faces after it. */
const TEXT_FONT =
  '"Times New Roman", Times, "PMingLiU", "MingLiU", "Songti TC", "Noto Serif CJK TC", "Noto Serif TC", serif';

/**
 * A line of text drawn as a watermark picture: bold, black (the paper's faintness makes it
 * grey), across or diagonal as Word's own text watermark offers. Trimmed to its ink box.
 */
export function drawTextWatermark(text: string, layout: 'diagonal' | 'horizontal'): PreparedWatermark {
  const words = text.trim() || ' ';
  const fontPx = 160;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('no canvas');
  measure.font = `bold ${fontPx}px ${TEXT_FONT}`;
  const textWidth = Math.ceil(measure.measureText(words).width);
  const textHeight = Math.ceil(fontPx * 1.25);
  const angle = layout === 'diagonal' ? -Math.PI / 4 : 0;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const width = Math.ceil(textWidth * cos + textHeight * sin);
  const height = Math.ceil(textWidth * sin + textHeight * cos);
  const scale = fitScale(width, height);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.scale(scale, scale);
  context.translate(width / 2, height / 2);
  context.rotate(angle);
  context.font = `bold ${fontPx}px ${TEXT_FONT}`;
  context.fillStyle = '#000000';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(words, 0, 0);
  return { src: canvas.toDataURL('image/png'), widthPx: canvas.width, heightPx: canvas.height };
}
