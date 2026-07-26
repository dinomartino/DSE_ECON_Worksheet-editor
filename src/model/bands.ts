import { newId } from './factories';
import { createPageNumberField } from './page';
import { emptyBiText } from './text';
import type { Band, BandField, BandZones, BiText } from './types';

/**
 * Bands: the constrained layout model.
 *
 * A band is a row of three zones (left / centre / right), each holding an ordered list of
 * small components. Dragging moves a component **between zones or within one** — there is
 * no arbitrary x/y placement. That constraint is the point: every arrangement maps onto a
 * Word paragraph with tab stops, so what the teacher arranges is exactly what exports.
 *
 * All the mutators here are pure and return a new `Band`, so they compose with the store's
 * undoable `commit` without special handling.
 */

export const ZONES = ['left', 'center', 'right'] as const;
export type ZoneName = (typeof ZONES)[number];

export function emptyZones(): BandZones {
  return { left: [], center: [], right: [] };
}

export function createBand(zones?: Partial<BandZones>): Band {
  return { id: newId(), zones: { ...emptyZones(), ...zones } };
}

export function createTextField(text: BiText = emptyBiText()): BandField {
  return { kind: 'text', id: newId(), text };
}

export function createTotalMarksField(label?: BiText): BandField {
  return { kind: 'totalMarks', id: newId(), label };
}

export function createFillInField(label: BiText, widthCh = 14): BandField {
  return { kind: 'fillIn', id: newId(), label, widthCh };
}

/** Normalise a band so consumers can assume all three zones exist. */
export function zonesOf(band: Band): BandZones {
  return { ...emptyZones(), ...(band.zones ?? {}) };
}

/** Is there anything to print in this band? */
export function bandIsEmpty(band: Band): boolean {
  const zones = zonesOf(band);
  return ZONES.every((zone) => zones[zone].length === 0);
}

/** Which zone holds `fieldId`, if any. */
export function findZone(band: Band, fieldId: string): ZoneName | undefined {
  const zones = zonesOf(band);
  return ZONES.find((zone) => zones[zone].some((field) => field.id === fieldId));
}

export function addField(band: Band, zone: ZoneName, field: BandField): Band {
  const zones = zonesOf(band);
  return { ...band, zones: { ...zones, [zone]: [...zones[zone], field] } };
}

export function removeField(band: Band, fieldId: string): Band {
  const zones = zonesOf(band);
  return {
    ...band,
    zones: {
      left: zones.left.filter((f) => f.id !== fieldId),
      center: zones.center.filter((f) => f.id !== fieldId),
      right: zones.right.filter((f) => f.id !== fieldId),
    },
  };
}

export function updateField(band: Band, fieldId: string, patch: Partial<BandField>): Band {
  const zones = zonesOf(band);
  const map = (fields: BandField[]) =>
    fields.map((field) => (field.id === fieldId ? ({ ...field, ...patch } as BandField) : field));
  return {
    ...band,
    zones: { left: map(zones.left), center: map(zones.center), right: map(zones.right) },
  };
}

/**
 * Move `fieldId` into `toZone`, landing before `beforeId` (or at the end).
 *
 * Removing before inserting is what makes a move within one zone land where the user
 * dropped it rather than one short — the same rule the section flow follows. A field that
 * no longer exists is a no-op rather than an error, so a stale drag is simply dropped.
 */
export function moveField(
  band: Band,
  fieldId: string,
  toZone: ZoneName,
  beforeId?: string,
): Band {
  const zones = zonesOf(band);
  const from = findZone(band, fieldId);
  if (!from) return band;

  const field = zones[from].find((f) => f.id === fieldId);
  if (!field) return band;

  const without: BandZones = {
    left: zones.left.filter((f) => f.id !== fieldId),
    center: zones.center.filter((f) => f.id !== fieldId),
    right: zones.right.filter((f) => f.id !== fieldId),
  };

  const target = without[toZone];
  const at = beforeId ? target.findIndex((f) => f.id === beforeId) : -1;
  const next = at >= 0 ? [...target.slice(0, at), field, ...target.slice(at)] : [...target, field];

  return { ...band, zones: { ...without, [toZone]: next } };
}

/**
 * Header and footer presets, traced from `real_life_reference/`.
 *
 * A preset is only an initial value: it produces plain bands with fresh ids, and nothing
 * downstream ever looks the preset up again — the same rule `DIAGRAM_TEMPLATES` follows.
 * That is what lets a teacher take one as a starting point and then edit any part of it
 * on the page without the preset trying to reassert itself.
 *
 * They exist because the alternative is an empty row: a teacher who has never built a
 * header does not know that "school name, paper title, then a Name rule" is the shape,
 * and every one of these is the same six drags every time.
 */
export interface HeaderFooterPreset {
  id: string;
  name: string;
  /** Which of the two it is meant for; a footer preset in a header is just odd. */
  edge: 'header' | 'footer';
  build: () => Band[];
}

const bold = (text: BiText, fontSize?: number): BandField => ({
  ...createTextField(text),
  format: fontSize ? { bold: true, fontSize } : { bold: true },
});

export const HEADER_FOOTER_PRESETS: HeaderFooterPreset[] = [
  {
    id: 'assessment',
    name: 'Course, title and name line',
    edge: 'header',
    // head1.png: a centred course line, then the paper title with a Name rule beside it.
    build: () => [
      createBand({
        center: [bold({ en: [{ text: 'Economics Enhancement Class (2025-26)' }], zh: [] }, 14)],
      }),
      createBand({
        center: [bold({ en: [{ text: 'Assessment 1' }], zh: [] }, 14)],
        right: [createFillInField({ en: [{ text: 'Name:' }], zh: [{ text: '姓名：' }] })],
      }),
    ],
  },
  {
    id: 'exam',
    name: 'Exam paper (school, paper, date)',
    edge: 'header',
    // head2.png: an exam line beside the page number, three centred title rows, then
    // the marks total beside a date rule.
    build: () => [
      createBand({
        left: [createTextField({ en: [{ text: '2025-2026 S6 Mock Examination' }], zh: [] })],
        right: [createPageNumberField('plain')],
      }),
      createBand({ center: [bold({ en: [{ text: 'SCHOOL NAME' }], zh: [] })] }),
      createBand({ center: [bold({ en: [{ text: '2025 – 2026 S.6 MOCK EXAMINATION' }], zh: [] })] }),
      createBand({ center: [bold({ en: [{ text: 'ECONOMICS I' }], zh: [] })] }),
      createBand({
        left: [createTotalMarksField()],
        right: [createFillInField({ en: [{ text: 'Date:' }], zh: [{ text: '日期：' }] }, 10)],
      }),
    ],
  },
  {
    id: 'title-only',
    name: 'Three centred title lines',
    edge: 'header',
    // head3.png: the plainest of the three — school, paper, subject, nothing else.
    build: () => [
      createBand({ center: [bold({ en: [{ text: 'SCHOOL NAME' }], zh: [] })] }),
      createBand({ center: [bold({ en: [{ text: 'S.6 Term Test (2025 - 2026)' }], zh: [] })] }),
      createBand({ center: [bold({ en: [{ text: 'ECONOMICS II' }], zh: [] })] }),
    ],
  },
  {
    id: 'paper-line',
    name: 'Paper name and page',
    edge: 'footer',
    // foot1.png: one centred line carrying the paper's name and "P.5".
    build: () => [
      createBand({
        center: [
          createTextField({ en: [{ text: 'Mock Examination S6 Economics Paper 1 2025-2026' }], zh: [] }),
          createPageNumberField('pDot'),
        ],
      }),
    ],
  },
  {
    id: 'publisher',
    name: 'Title, page, copyright',
    edge: 'footer',
    // foot2.png: a three-zone footer — source on the left, page centred, rights right.
    build: () => [
      createBand({
        left: [
          { ...createTextField({ en: [{ text: 'NSS Exploring Economics' }], zh: [] }), format: { italic: true } },
        ],
        center: [createPageNumberField('plain')],
        right: [createTextField({ en: [{ text: '© Publisher Limited 2026' }], zh: [] })],
      }),
    ],
  },
];

/**
 * The masthead of a typical assessment paper, as one band per printed row.
 *
 * Mirrors the layout real papers use: the title centred with a name field beside it, then
 * the mark total and time allowed on the left. Offered as a preset because building it by
 * hand is the same six drags every time.
 */
export function assessmentTitleBlock(title: BiText, subtitle: BiText): Band[] {
  return [
    createBand({
      center: [{ ...createTextField(title), format: { fontSize: 14, bold: true } }],
      right: [createFillInField({ en: [{ text: 'Name:' }], zh: [{ text: '姓名：' }] })],
    }),
    createBand({
      center: [{ ...createTextField(subtitle), format: { bold: true } }],
    }),
    // "Full marks" and "Time allowed" print on their own lines, so they are separate
    // bands rather than two fields sharing one — a band is one printed row.
    createBand({ left: [createTotalMarksField()] }),
    createBand({
      left: [
        createTextField({
          en: [{ text: 'Time allowed: 60 minutes' }],
          zh: [{ text: '時限：60分鐘' }],
        }),
      ],
    }),
  ];
}
