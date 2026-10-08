/**
 * A tiny PDF writer for the reader's tests: invented pages, text drawn item by item in the
 * order given (so a test can draw option letters before their texts), Helvetica and
 * Helvetica-Bold, gray images, raw path operators. ASCII only.
 */
export interface PdfText {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
  /** Draw it turned 90° (margin text). */
  rotated?: boolean;
}

export interface PdfPageSpec {
  texts?: PdfText[];
  /** Gray images, each drawn into this box (points, y up). */
  images?: Array<{ x: number; y: number; w: number; h: number }>;
  /** Raw path operators, e.g. `"50 100 m 200 300 l S"`. */
  paths?: string;
  width?: number;
  height?: number;
}

const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(pages: PdfPageSpec[], options: { title?: string; encrypted?: boolean } = {}): Uint8Array {
  const objects: string[] = [];
  const reserve = () => objects.push('');
  const set = (n: number, body: string) => (objects[n - 1] = body);
  const add = (body: string) => objects.push(body);
  const stream = (dict: string, data: string) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;

  reserve(); // 1 catalog
  reserve(); // 2 pages
  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const image = add(stream('/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode', '20608040>'));
  const kids: number[] = [];
  for (const page of pages) {
    const ops: string[] = [];
    for (const t of page.texts ?? []) {
      const size = t.size ?? 11;
      const m = t.rotated ? `0 1 -1 0 ${t.x} ${t.y}` : `1 0 0 1 ${t.x} ${t.y}`;
      ops.push(`BT /${t.bold ? 'F2' : 'F1'} ${size} Tf ${m} Tm (${escape(t.text)}) Tj ET`);
    }
    for (const box of page.images ?? []) ops.push(`q ${box.w} 0 0 ${box.h} ${box.x} ${box.y} cm /Im1 Do Q`);
    if (page.paths) ops.push(page.paths);
    const content = add(stream('', ops.join('\n')));
    kids.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width ?? 595} ${page.height ?? 842}] /Contents ${content} 0 R ` +
          `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> /XObject << /Im1 ${image} 0 R >> >> >>`,
      ),
    );
  }
  set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  set(2, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const info = options.title ? add(`<< /Title (${escape(options.title)}) >>`) : 0;
  // An empty-password check that fails: pdf.js asks for a password.
  const encrypt = options.encrypted
    ? add(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`)
    : 0;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, k) => {
    offsets.push(out.length);
    out += `${k + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R` +
    (info ? ` /Info ${info} 0 R` : '') +
    (encrypt ? ` /Encrypt ${encrypt} 0 R /ID [<${'01'.repeat(16)}> <${'01'.repeat(16)}>]` : '') +
    ` >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** The bytes as their own `ArrayBuffer`, as a file input gives them. */
export const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;
