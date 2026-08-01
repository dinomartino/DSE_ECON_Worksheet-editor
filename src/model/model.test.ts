import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  KNOWN_KEYS,
  migrate,
  SchemaError,
  serializeWorksheet,
} from './migrations';
import { partMarks, questionMarks, worksheetMarks } from './marks';
import { computeNumbering, toLowerLetter, toLowerRoman } from './numbering';
import {
  applyRunFormat,
  commonRunFormat,
  hasLineBreak,
  sourceOffsetToText,
  parseRuns,
  plain,
  replaceRichTextRange,
  runLines,
  serializeRuns,
  toRunPatch,
} from './text';
import { createMcqQuestion, createWorksheet } from './factories';
import { resolveFlow } from './flow';
import { MARGIN_PRESETS, cmToTwips, contentWidth, twipsToCm } from './page';
import { DEFAULT_FIELD_WORDING } from './bandSegments';
import { bandFieldText } from '@/render/worksheet';
import type { BiText } from './types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import type { StructuredQuestion, Worksheet } from './types';

describe('marks totalling (§3.5, §11.10)', () => {
  it('derives part totals from sub-parts and question totals from parts', () => {
    const worksheet = buildAcceptanceWorksheet();
    const structured = worksheet.questions[5] as StructuredQuestion;

    // Part (b) has sub-parts 2 + 2 + 3; its own `marks` is absent.
    expect(structured.parts[1].marks).toBeUndefined();
    expect(partMarks(structured.parts[1])).toBe(7);
    expect(questionMarks(structured)).toBe(15);
  });

  it('recomputes when a sub-part changes, since totals are never stored', () => {
    const worksheet = buildAcceptanceWorksheet();
    const structured = worksheet.questions[5] as StructuredQuestion;
    structured.parts[1].subParts![0].marks = 10;
    expect(questionMarks(structured)).toBe(23);
  });

  it('totals the whole worksheet across sections', () => {
    const worksheet = buildAcceptanceWorksheet();
    // 5 MCQs at 1 mark each + 15 + 4.
    expect(worksheetMarks(worksheet)).toBe(24);
  });
});

describe('derived numbering (§4, §11.10)', () => {
  it('renumbers instantly when questions are reordered', () => {
    const worksheet = buildAcceptanceWorksheet();
    const first = worksheet.questions[0].id;
    const second = worksheet.questions[1].id;

    expect(computeNumbering(worksheet).byQuestionId.get(first)!.number).toBe(1);

    const reordered: Worksheet = {
      ...worksheet,
      questions: [worksheet.questions[1], worksheet.questions[0], ...worksheet.questions.slice(2)],
    };

    const plan = computeNumbering(reordered);
    expect(plan.byQuestionId.get(second)!.number).toBe(1);
    expect(plan.byQuestionId.get(first)!.number).toBe(2);
  });

  it('restarts per section only when configured, otherwise runs continuously', () => {
    const worksheet = buildAcceptanceWorksheet();
    const structuredFirst = worksheet.questions[5].id;

    expect(computeNumbering(worksheet).byQuestionId.get(structuredFirst)!.number).toBe(1);

    const sectionB = worksheet.layout.filter((element) => element.kind === 'section')[1];
    if (sectionB.kind === 'section') sectionB.restartNumbering = false;
    expect(computeNumbering(worksheet).byQuestionId.get(structuredFirst)!.number).toBe(6);
  });

  it('formats part and sub-part labels', () => {
    expect([0, 1, 25, 26].map(toLowerLetter)).toEqual(['a', 'b', 'z', 'aa']);
    expect([1, 3, 4, 9].map(toLowerRoman)).toEqual(['i', 'iii', 'iv', 'ix']);
  });
});

describe('rich text round-trip', () => {
  it('parses and re-serialises inline formatting', () => {
    const source = 'Real **GDP** rises *sharply*, __note__ H_{2}O and x^{2}';
    const runs = parseRuns(source);
    expect(runs.find((r) => r.bold)?.text).toBe('GDP');
    expect(runs.find((r) => r.italic)?.text).toBe('sharply');
    expect(runs.find((r) => r.underline)?.text).toBe('note');
    expect(runs.find((r) => r.vertAlign === 'subscript')?.text).toBe('2');
    expect(runs.find((r) => r.vertAlign === 'superscript')?.text).toBe('2');
    expect(serializeRuns(runs)).toBe(source);
    expect(plain(runs)).toBe('Real GDP rises sharply, note H2O and x2');
  });

  it('handles CJK and mixed-script text unchanged', () => {
    const runs = parseRuns('GDP平減物價指數(GDP deflator)');
    expect(plain(runs)).toBe('GDP平減物價指數(GDP deflator)');
  });
});

/**
 * Per-run formatting: a range inside one element, not the whole element.
 *
 * This is the model half of "different sizes in the same text box". The range maths is
 * pure, so it is pinned here without a DOM — the editing surface only has to report two
 * offsets, and everything below is exercised directly.
 */
describe('per-run formatting over a character range', () => {
  it('formats only the selected characters, splitting the run', () => {
    const runs = parseRuns('Real GDP rises');
    // "GDP" is characters 5..8.
    const next = applyRunFormat(runs, 5, 8, { fontSize: 14, color: 'C00000' });

    expect(plain(next)).toBe('Real GDP rises');
    expect(next.map((r) => r.text)).toEqual(['Real ', 'GDP', ' rises']);
    expect(next[1]).toMatchObject({ text: 'GDP', fontSize: 14, color: 'C00000' });
    // The untouched neighbours carry no size of their own — they inherit.
    expect(next[0].fontSize).toBeUndefined();
    expect(next[2].fontSize).toBeUndefined();
  });

  it('preserves formatting already on the runs it splits', () => {
    const runs = parseRuns('Real **GDP deflator** rises');
    // Size only the word "GDP" inside the bold run.
    const start = plain(runs).indexOf('GDP');
    const next = applyRunFormat(runs, start, start + 3, { fontSize: 18 });

    const sized = next.find((r) => r.fontSize === 18);
    expect(sized).toMatchObject({ text: 'GDP', bold: true, fontSize: 18 });
    // The rest of the bold run stays bold and unsized.
    expect(next.find((r) => r.text === ' deflator')).toMatchObject({ bold: true });
    expect(next.find((r) => r.text === ' deflator')?.fontSize).toBeUndefined();
    expect(plain(next)).toBe('Real GDP deflator rises');
  });

  it('clears an attribute with null and merges the runs back together', () => {
    const runs = applyRunFormat(parseRuns('Real GDP rises'), 5, 8, { fontSize: 14 });
    expect(runs.length).toBe(3);

    // Clearing the override should leave one run again, not three identical ones.
    const cleared = applyRunFormat(runs, 5, 8, { fontSize: null });
    expect(cleared.length).toBe(1);
    expect(cleared[0].text).toBe('Real GDP rises');
    expect(cleared[0].fontSize).toBeUndefined();
  });

  it('treats an empty or reversed range as a no-op', () => {
    const runs = parseRuns('Real GDP rises');
    // A caret with no selection must not reformat the whole element.
    expect(applyRunFormat(runs, 5, 5, { bold: true })).toBe(runs);
    // A backwards drag reports end < start; it selects the same characters.
    const backwards = applyRunFormat(runs, 8, 5, { bold: true });
    expect(backwards.find((r) => r.bold)?.text).toBe('GDP');
  });

  it('clamps a range that runs past the end of the text', () => {
    const runs = parseRuns('Short');
    const next = applyRunFormat(runs, 0, 999, { bold: true });
    expect(plain(next)).toBe('Short');
    expect(next.every((r) => r.bold)).toBe(true);
  });

  it('reports only the formatting every covered run agrees on', () => {
    const runs = applyRunFormat(parseRuns('Real GDP rises'), 5, 8, { fontSize: 14 });

    // Inside the sized word: the size is common.
    expect(commonRunFormat(runs, 5, 8).fontSize).toBe(14);
    // Spanning sized and unsized text: no single size describes the selection, so the
    // toolbar must show none rather than claiming the first run's value.
    expect(commonRunFormat(runs, 0, 14).fontSize).toBeUndefined();
  });

  it('keeps every run attribute when text is edited around it', () => {
    /*
     * The on-page editor renders runs directly and commits a *range* edit, rather than
     * re-parsing a marker string. That is the whole reason size and colour survive
     * typing: `serializeRuns` never spelled them, so the old round-trip dropped them
     * silently and a 14pt red phrase reverted to body text the moment the field closed.
     */
    const runs = applyRunFormat(parseRuns('Real GDP rises'), 5, 8, {
      fontSize: 14,
      color: 'C00000',
    });

    // Type at the very start; the sized, coloured word is untouched.
    const next = replaceRichTextRange(runs, 0, 0, 'The ');
    expect(plain(next)).toBe('The Real GDP rises');
    const sized = next.find((run) => run.fontSize === 14);
    expect(sized?.text).toBe('GDP');
    expect(sized?.color).toBe('C00000');
  });

  it('continues the run to the left of the caret, as Word does', () => {
    const runs = applyRunFormat(parseRuns('Real GDP rises'), 5, 8, { bold: true });

    // Typing at the *end* of the bold word continues it in bold.
    const inside = replaceRichTextRange(runs, 8, 8, 'X');
    expect(inside.find((run) => run.bold)?.text).toBe('GDPX');

    // Typing at offset 0 has nothing on the left, so it takes the run on the right.
    const atStart = replaceRichTextRange(parseRuns('**GDP**'), 0, 0, 'X');
    expect(plain(atStart)).toBe('XGDP');
    expect(atStart.every((run) => run.bold)).toBe(true);
  });

  it('applies the fallback format only when there is no run to inherit from', () => {
    // "Turn bold on, then type" in an empty field: nothing to inherit, so the pending
    // format from the toolbar supplies the first character's attributes.
    const fresh = replaceRichTextRange([], 0, 0, 'Hi', { bold: true });
    expect(fresh).toEqual([{ bold: true, text: 'Hi' }]);

    // With text present the neighbour wins, so the fallback cannot override a run the
    // caret is sitting inside.
    const existing = replaceRichTextRange(parseRuns('plain'), 5, 5, '!', { bold: true });
    expect(existing.some((run) => run.bold)).toBe(false);
  });

  it('deletes a range and merges the neighbours back into one run', () => {
    const runs = parseRuns('Real GDP rises');
    const next = replaceRichTextRange(runs, 4, 8, '');
    expect(plain(next)).toBe('Real rises');
    // Identical formatting either side of the cut, so it must not stay fragmented.
    expect(next).toHaveLength(1);
  });

  it('stores a hard break as a newline inside the run', () => {
    const next = replaceRichTextRange(parseRuns('one two'), 3, 3, '\n');
    expect(plain(next)).toBe('one\n two');
    expect(hasLineBreak(next)).toBe(true);
  });

  it('maps a selection in the marker source onto plain-text offsets', () => {
    // The editor's textarea holds the serialized form, which contains markers the model
    // does not. Selecting "deflator" there is a different pair of numbers than in the
    // plain text, and formatting the wrong range is invisible until export.
    const source = 'Real **GDP** deflator';
    expect(plain(parseRuns(source))).toBe('Real GDP deflator');

    // Offset 0 and pure-text spans before any marker are unchanged.
    expect(sourceOffsetToText(source, 0)).toBe(0);
    expect(sourceOffsetToText(source, 5)).toBe(5);

    // "deflator" starts at source index 13, text index 9.
    expect(source.indexOf('deflator')).toBe(13);
    expect(sourceOffsetToText(source, 13)).toBe(9);
    expect(sourceOffsetToText(source, source.length)).toBe('Real GDP deflator'.length);

    // A selection landing inside the marked word maps to the word itself.
    expect(sourceOffsetToText(source, source.indexOf('GDP'))).toBe(5);
  });

  it('maps every offset consistently, including after a closing marker', () => {
    /*
     * The regression that produced a visibly wrong export: selecting a word *after* a
     * bolded one formatted a range shifted one character left, splitting the next word
     * mid-way. It survived a spot check because the offsets before the first marker were
     * right — only the ones past a closing `**` were wrong.
     */
    for (const source of [
      'Explain how **price ceiling** affects',
      'Real **GDP** deflator',
      'a *b* c __d__ e',
      '**all bold**',
      'plain text only',
    ]) {
      const text = plain(parseRuns(source));

      // The whole string maps to the whole text, and the mapping never goes backwards.
      expect(sourceOffsetToText(source, source.length)).toBe(text.length);
      let previous = 0;
      for (let i = 0; i <= source.length; i++) {
        const mapped = sourceOffsetToText(source, i);
        expect(mapped).toBeGreaterThanOrEqual(previous);
        expect(mapped).toBeLessThanOrEqual(text.length);
        previous = mapped;
      }

      // Every word starts at the same place in both coordinate systems.
      for (const word of text.split(' ').filter(Boolean)) {
        const at = source.indexOf(word);
        if (at < 0) continue;
        expect(sourceOffsetToText(source, at), `${word} in ${source}`).toBe(text.indexOf(word));
      }
    }
  });

  it('maps offsets across superscript and subscript markers', () => {
    const source = 'H_{2}O and x^{2}';
    expect(plain(parseRuns(source))).toBe('H2O and x2');
    expect(sourceOffsetToText(source, source.length)).toBe('H2O and x2'.length);
    // "O and" begins after the subscript token.
    expect(sourceOffsetToText(source, source.indexOf('O and'))).toBe(2);
  });

  it('cannot express size or colour in the marker string', () => {
    /*
     * The trap behind the one real bug in this feature.
     *
     * `serializeRuns` spells bold/italic/underline/sup/sub and nothing else, so a run's
     * size and colour survive only as long as nobody re-parses the string. The in-place
     * editor holds exactly that string, which is why it must not re-parse an unchanged
     * one: doing so silently erased formatting the toolbar had just applied.
     */
    const runs = applyRunFormat(parseRuns('Real GDP rises'), 5, 8, {
      fontSize: 14,
      color: 'C00000',
    });
    const source = serializeRuns(runs);
    expect(source).toBe('Real GDP rises');

    const reparsed = parseRuns(source);
    expect(plain(reparsed)).toBe(plain(runs));
    // The round trip is lossy for run-level values — asserted so the guard in
    // `InlineEditable.commit` is never removed as a redundant optimisation.
    expect(reparsed.some((r) => r.fontSize !== undefined)).toBe(false);
    expect(runs.some((r) => r.fontSize === 14)).toBe(true);
  });

  it('keeps per-run sizes through a save/load round trip', () => {
    // The runs are stored as-is, so this is really a guard on `KNOWN_KEYS` and the
    // migration chain leaving unknown run attributes alone.
    const runs = applyRunFormat(parseRuns('Real GDP rises'), 5, 8, {
      fontSize: 14,
      color: 'C00000',
    });
    const round = JSON.parse(JSON.stringify(runs)) as typeof runs;
    expect(round[1]).toMatchObject({ text: 'GDP', fontSize: 14, color: 'C00000' });
  });
});

/**
 * Shift+Enter inside one field.
 *
 * The break used to survive storage and then be flattened by every renderer, which is
 * the worst shape of bug: the editor accepted it, the document saved it, and it silently
 * became a space on the page and in Word. These pin the storage half.
 */
describe('hard line breaks (Shift+Enter)', () => {
  it('keeps a newline through the parse/serialise round trip', () => {
    const source = 'First line\nSecond line';
    const runs = parseRuns(source);
    expect(plain(runs)).toBe(source);
    expect(serializeRuns(runs)).toBe(source);
    expect(hasLineBreak(runs)).toBe(true);
  });

  it('keeps a break that falls inside a formatted span', () => {
    const runs = parseRuns('**Bold first\nbold second**');
    expect(runs.find((r) => r.bold)?.text).toBe('Bold first\nbold second');
    expect(serializeRuns(runs)).toBe('**Bold first\nbold second**');
  });

  it('splits a run into its lines, keeping empty segments so blank lines survive', () => {
    expect(runLines('a\nb')).toEqual(['a', 'b']);
    expect(runLines('a\n\nb')).toEqual(['a', '', 'b']);
    expect(runLines('no break')).toEqual(['no break']);
  });

  it('normalises Windows and classic-Mac newlines, which paste from Word carries', () => {
    expect(runLines('a\r\nb')).toEqual(['a', 'b']);
    expect(runLines('a\rb')).toEqual(['a', 'b']);
  });

  it('reports no break for ordinary text', () => {
    expect(hasLineBreak(parseRuns('one line'))).toBe(false);
  });
});

describe('schema versioning and migrations (§6, §11.11)', () => {
  it('migrates a v1 fixture to the current version', () => {
    // A worksheet as saved by schemaVersion 1: no `fonts` field at all.
    const v1 = {
      schemaVersion: 1,
      id: 'old-doc',
      title: { en: [{ text: 'Legacy paper' }], zh: [] },
      sections: [
        {
          id: 's1',
          heading: { en: [{ text: 'Section A' }], zh: [] },
          questions: [{ ...createMcqQuestion(), id: 'q1' }],
        },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const migrated = migrate(v1);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // The v1->v2 step supplies the historical default font pair.
    expect(migrated.fonts).toEqual({ latin: 'Times New Roman', eastAsia: 'PMingLiU' });
    expect(migrated.questions[0].id).toBe('q1');
    expect(plain(migrated.title.en)).toBe('Legacy paper');
  });

  it('folds a v3 header/footer slot triple into a one-band row', () => {
    // A worksheet as saved by schemaVersion 3: header content in `slots`, and the
    // "Page N of M" idiom hand-assembled from four separate parts.
    const v3 = {
      schemaVersion: 3,
      id: 'v3-doc',
      title: { en: [], zh: [] },
      sections: [],
      fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
      header: {
        enabled: true,
        rule: true,
        slots: {
          left: [{ kind: 'text', id: 'l', text: { en: [{ text: 'Form 5' }], zh: [] } }],
          center: [],
          right: [],
        },
      },
      footer: {
        enabled: true,
        slots: {
          left: [],
          center: [
            { kind: 'text', id: 't1', text: { en: [{ text: 'Page ' }], zh: [] } },
            { kind: 'pageNumber', id: 'p' },
            { kind: 'text', id: 't2', text: { en: [{ text: ' of ' }], zh: [] } },
            { kind: 'pageCount', id: 'n' },
          ],
          right: [],
        },
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const migrated = migrate(v3);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // One row, carrying what the triple carried, in the same zone.
    expect(migrated.header!.bands).toHaveLength(1);
    const migratedField = migrated.header!.bands[0].zones.left[0];
    expect(migratedField.kind).toBe('text');
    if (migratedField.kind === 'text') expect(plain(migratedField.text.en)).toBe('Form 5');
    // Settings on the header itself survive the reshape.
    expect(migrated.header!.rule).toBe(true);
    // And the old shape is gone rather than left beside the new one.
    expect((migrated.header as unknown as { slots?: unknown }).slots).toBeUndefined();

    // The four-part "Page N of M" collapses into the single field that always meant.
    const footerFields = migrated.footer!.bands[0].zones.center;
    expect(footerFields).toHaveLength(1);
    expect(footerFields[0].kind).toBe('pageNumber');
    expect((footerFields[0] as { pattern?: string }).pattern).toBe('longForm');
  });

  it('gives a v5 computed field the wording the renderer used to supply', () => {
    /*
     * Before v6 the phrasing around a computed value lived in `bandFieldText`: a
     * `totalMarks` field stored only a `label` and the renderer added "Full marks: " and
     * " marks" itself. Migrating has to *preserve the printed output* while moving that
     * wording into the document, or every existing worksheet silently reprints.
     */
    const v5 = {
      schemaVersion: 5,
      id: 'v5-doc',
      title: { en: [], zh: [] },
      questions: [],
      layout: [],
      flow: [],
      fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
      bands: [
        {
          id: 'b1',
          zones: {
            left: [{ kind: 'totalMarks', id: 'tm' }],
            center: [],
            right: [{ kind: 'fillIn', id: 'fi', label: { en: [{ text: 'Name:' }], zh: [] }, widthCh: 10 }],
          },
        },
      ],
    };

    const migrated = migrate(v5);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const total = migrated.bands![0].zones.left[0];
    expect(total.kind).toBe('totalMarks');
    // The exact strings the renderer used to concatenate, now stored and editable.
    expect(plain((total as { prefix: BiText }).prefix.en)).toBe('Full marks: ');
    expect(plain((total as { suffix: BiText }).suffix.en)).toBe(' marks');
    expect(plain((total as { prefix: BiText }).prefix.zh)).toBe('總分：');
    // The deprecated field is dropped, not left beside the new one to drift.
    expect((total as { label?: unknown }).label).toBeUndefined();

    // A fill-in's stored label was already its prefix, so it moves across unchanged.
    const fill = migrated.bands![0].zones.right[0];
    expect(plain((fill as { prefix: BiText }).prefix.en)).toBe('Name:');

    // The printed line is byte-identical to what v5 rendered.
    expect(plain(bandFieldText(total, 24).en)).toBe('Full marks: 24 marks');
    expect(plain(bandFieldText(fill, 24).en)).toBe('Name:__________');
  });

  it('does not overwrite wording a teacher has already retyped', () => {
    // Guards re-migration: a v6 document round-tripping through this build must keep its
    // own phrasing rather than being reset to the default.
    const v6 = {
      schemaVersion: 5,
      id: 'x',
      title: { en: [], zh: [] },
      questions: [],
      layout: [],
      flow: [],
      bands: [
        {
          id: 'b',
          zones: {
            left: [
              { kind: 'totalMarks', id: 'tm', prefix: { en: [{ text: 'TOTAL: ' }], zh: [] } },
            ],
            center: [],
            right: [],
          },
        },
      ],
    };
    const field = migrate(v6).bands![0].zones.left[0];
    expect(plain((field as { prefix: BiText }).prefix.en)).toBe('TOTAL: ');
  });

  it('migrates the wording to exactly what a new field ships with', () => {
    /*
     * `migrateFieldWording` inlines its default strings rather than importing
     * `DEFAULT_FIELD_WORDING`, because `bandSegments` reaches `factories` through `page`
     * and `factories` imports `migrations` — closing that cycle would make the chain
     * load-order dependent. This is the guard that would otherwise be the import: an
     * old field and a new field must end up saying the same thing.
     */
    const migrated = migrate({
      schemaVersion: 5,
      id: 'x',
      title: { en: [], zh: [] },
      questions: [],
      layout: [],
      flow: [],
      bands: [{ id: 'b', zones: { left: [{ kind: 'totalMarks', id: 't' }], center: [], right: [] } }],
    });
    const field = migrated.bands![0].zones.left[0];
    expect(plain((field as { prefix: BiText }).prefix.en)).toBe(
      plain(DEFAULT_FIELD_WORDING.totalMarks.prefix.en),
    );
    expect(plain((field as { suffix: BiText }).suffix.zh)).toBe(
      plain(DEFAULT_FIELD_WORDING.totalMarks.suffix.zh),
    );
  });

  it('leaves a header that is already v4 untouched', () => {
    // Guards the migration against running twice — on a document written by this build,
    // or one a newer build already reshaped.
    const v4 = {
      schemaVersion: 3,
      id: 'x',
      title: { en: [], zh: [] },
      sections: [],
      fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
      header: { enabled: true, bands: [{ id: 'kept', zones: { left: [], center: [], right: [] } }] },
    };
    const migrated = migrate(v4);
    expect(migrated.header!.bands).toHaveLength(1);
    expect(migrated.header!.bands[0].id).toBe('kept');
  });

  it('does not mutate the input document', () => {
    const v1 = { schemaVersion: 1, id: 'x', title: { en: [], zh: [] }, sections: [] };
    const snapshot = JSON.stringify(v1);
    migrate(v1);
    expect(JSON.stringify(v1)).toBe(snapshot);
  });

  it('preserves unknown fields from a newer version through load and save', () => {
    const fromFuture = {
      ...serializeWorksheet(createWorksheet()),
      schemaVersion: 99,
      // Fields this build has never heard of.
      gradingRubric: { scale: 'HKDSE', bands: [1, 2, 3] },
      futureFlag: true,
    };

    const loaded = migrate(fromFuture);
    expect(loaded.__unknown).toEqual({
      gradingRubric: { scale: 'HKDSE', bands: [1, 2, 3] },
      futureFlag: true,
    });

    // Round-tripping must not drop them.
    const saved = serializeWorksheet(loaded);
    expect(saved.gradingRubric).toEqual({ scale: 'HKDSE', bands: [1, 2, 3] });
    expect(saved.futureFlag).toBe(true);
    expect(saved.__unknown).toBeUndefined();
    expect(saved.schemaVersion).toBe(99);
  });

  it('round-trips a current worksheet byte-for-byte, images included', () => {
    const worksheet = buildAcceptanceWorksheet();
    const json = JSON.stringify(serializeWorksheet(worksheet));
    const reloaded = migrate(JSON.parse(json));
    expect(JSON.stringify(serializeWorksheet(reloaded))).toBe(json);

    // Images survive as embedded data (§6, §11.11).
    const imageBlock = reloaded.questions[1].blocks.find((b) => b.kind === 'image');
    expect(imageBlock && imageBlock.kind === 'image' && imageBlock.src.startsWith('data:image/png')).toBe(true);

    // Merged table cells survive.
    const tableQuestion = reloaded.questions[2];
    const table = tableQuestion.blocks.find((b) => b.kind === 'table');
    expect(table && table.kind === 'table' && table.rows[0].cells[0].colSpan).toBe(2);
    expect(table && table.kind === 'table' && table.rows[0].cells[1].covered).toBe(true);
  });

  it('rejects input that is not a worksheet', () => {
    expect(() => migrate(null)).toThrow(SchemaError);
    expect(() => migrate('nope')).toThrow(SchemaError);
    expect(() => migrate([])).toThrow(SchemaError);
  });

  /*
   * v4 -> v5: a section stopped being a container.
   *
   * This is the migration most likely to lose a document, because it rewrites the
   * shape every question lives in. What must survive is not the storage layout but
   * the *printed page*: the same order and the same numbers.
   */
  describe('v4 -> v5: sections flatten into the document flow', () => {
    const mcq = (id: string) => ({ ...createMcqQuestion(), id });
    const v4 = () => ({
      schemaVersion: 4,
      id: 'doc',
      title: { en: [{ text: 'T' }], zh: [] },
      fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      sections: [
        {
          id: 'sA',
          heading: { en: [{ text: 'Section A' }], zh: [] },
          restartNumbering: true,
          questions: [mcq('q1'), mcq('q2')],
          layout: [{ kind: 'divider', id: 'd1' }],
          flow: [
            { type: 'question', id: 'q1' },
            { type: 'layout', id: 'd1' },
            { type: 'question', id: 'q2' },
          ],
        },
        {
          id: 'sB',
          heading: { en: [{ text: 'Section B' }], zh: [] },
          restartNumbering: true,
          questions: [mcq('q3')],
        },
      ],
    });

    it('preserves the printed order exactly, layout elements included', () => {
      const migrated = migrate(v4());
      expect(resolveFlow(migrated).map((item) => item.id)).toEqual([
        'sA', 'q1', 'd1', 'q2', 'sB', 'q3',
      ]);
    });

    it('preserves numbering, including the per-section restart', () => {
      const plan = computeNumbering(migrate(v4()));
      expect(plan.questions.map((entry) => entry.number)).toEqual([1, 2, 1]);
    });

    it('carries each heading over as a section element that still restarts', () => {
      const sections = migrate(v4()).layout.filter((element) => element.kind === 'section');
      expect(sections.map((s) => (s.kind === 'section' ? plain(s.text.en) : ''))).toEqual([
        'Section A',
        'Section B',
      ]);
      expect(sections.every((s) => s.kind === 'section' && s.restartNumbering)).toBe(true);
    });

    it('adds no heading row for a section that never had one', () => {
      // A single untitled section is how a plain document was stored; emitting an
      // empty heading for it would print a blank line that was never there.
      const untitled = { ...v4(), sections: [{ id: 's1', questions: [mcq('q1')] }] };
      const migrated = migrate(untitled);
      expect(migrated.layout.filter((element) => element.kind === 'section')).toHaveLength(0);
      expect(resolveFlow(migrated).map((item) => item.id)).toEqual(['q1']);
    });

    it('does not re-flatten a document that is already v5', () => {
      const once = migrate(v4());
      const twice = migrate(JSON.parse(JSON.stringify(once)));
      expect(resolveFlow(twice).map((item) => item.id)).toEqual(
        resolveFlow(once).map((item) => item.id),
      );
    });

    it('keeps the flat lists out of __unknown on reload (§KNOWN_KEYS)', () => {
      // `questions`, `layout` and `flow` are new top-level keys, and a key missing
      // from KNOWN_KEYS saves fine and then vanishes on reload.
      const reloaded = migrate(JSON.parse(JSON.stringify(migrate(v4()))));
      expect(reloaded.questions).toHaveLength(3);
      expect(reloaded.layout.length).toBeGreaterThan(0);
      expect(reloaded.__unknown).toBeUndefined();
    });
  });

});

/**
 * Margin presets and custom margins.
 *
 * Presets are labelled in centimetres but stored in twips, so the risk is a label that
 * says one thing while the exported `w:pgMar` says another. These pin the two together.
 */
describe('margin presets', () => {
  it('offers the worksheet preset at 2.54 cm top/bottom and 1.5 cm sides', () => {
    const preset = MARGIN_PRESETS.find((entry) => entry.label.startsWith('Worksheet'));
    expect(preset, 'the worksheet preset must exist').toBeTruthy();

    // 2.54 cm is exactly one inch, which is exactly 1440 twips.
    expect(preset!.margins.top).toBe(1440);
    expect(preset!.margins.bottom).toBe(1440);
    // 1.5 cm at 1440 twips/inch is 850.39…, stored rounded.
    expect(preset!.margins.left).toBe(cmToTwips(1.5));
    expect(preset!.margins.right).toBe(cmToTwips(1.5));
    expect(preset!.margins.left).toBe(850);
  });

  it('states every preset in twips that match its own centimetre label', () => {
    for (const preset of MARGIN_PRESETS) {
      // Pull the numbers out of "Name (2.54 / 1.5 cm)" or "Name (1.27 cm)".
      const figures = [...preset.label.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      const [vertical, horizontal = vertical] = figures;
      // Within 5 twips (0.009 cm) of the label. Not exact, because the older presets
      // are stated as round twip numbers that Word itself uses — "Moderate" stores
      // 1080, i.e. 1.905 cm, and is labelled 1.91. The tolerance is there to catch a
      // label that is plainly wrong, not to police sub-hair-width rounding.
      expect(Math.abs(preset.margins.top - cmToTwips(vertical)), preset.label).toBeLessThanOrEqual(5);
      expect(Math.abs(preset.margins.left - cmToTwips(horizontal)), preset.label).toBeLessThanOrEqual(5);
      // Top/bottom and left/right always agree within a preset.
      expect(preset.margins.top, preset.label).toBe(preset.margins.bottom);
      expect(preset.margins.left, preset.label).toBe(preset.margins.right);
    }
  });

  it('round-trips a custom centimetre value through twips without drift', () => {
    // What the custom fields do: cm in, twips stored, cm shown back.
    for (const cm of [0, 0.5, 1, 1.5, 1.91, 2.54, 3.7, 5]) {
      expect(twipsToCm(cmToTwips(cm))).toBeCloseTo(cm, 2);
    }
  });

  it('narrows the text column when the sides are pulled in', () => {
    const preset = MARGIN_PRESETS.find((entry) => entry.label.startsWith('Worksheet'))!;
    const normal = MARGIN_PRESETS[0];

    const columnOf = (margins: typeof preset.margins) =>
      contentWidth({ paper: 'A4', orientation: 'portrait', margins });

    // The whole point of the preset: more usable width than Normal for the same paper.
    expect(columnOf(preset.margins)).toBeGreaterThan(columnOf(normal.margins));
  });
});

/**
 * Every top-level worksheet field survives a save/load round trip.
 *
 * `migrate` deletes any key missing from `KNOWN_KEYS` off the worksheet and stashes it
 * in `__unknown`, so an unlisted field is written to disk and then silently dropped on
 * load. That is how `titleFormat` came to save correctly and vanish on reload: the font
 * size was stored, but the reopened document never saw it.
 *
 * These tests are the guard. The first pins the specific regression; the second fails
 * whenever a new optional field is added to `Worksheet` without listing it.
 */
describe('save/load round trip preserves every known field', () => {
  it('keeps per-element formatting and the masthead through migrate()', () => {
    const worksheet: Worksheet = {
      ...createWorksheet(),
      titleFormat: { fontSize: 24, bold: true },
      instructionsFormat: { fontSize: 11, italic: true },
      bands: [{ id: 'b1', zones: { left: [], center: [], right: [] } }],
    };

    const restored = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));

    expect(restored.titleFormat).toEqual({ fontSize: 24, bold: true });
    expect(restored.instructionsFormat).toEqual({ fontSize: 11, italic: true });
    expect(restored.bands).toHaveLength(1);
    // None of it should have been diverted into the unknown-field bucket.
    expect(restored.__unknown).toBeUndefined();
  });

  it('keeps a distinct first-page header through a save/load round trip', () => {
    // `firstPage` is nested inside `header`, so KNOWN_KEYS does not police it — which is
    // exactly why it is pinned here. A field that saves and then vanishes on reload has
    // bitten this document model before.
    const worksheet: Worksheet = {
      ...createWorksheet(),
      header: {
        enabled: true,
        rule: true,
        bands: [{ id: 'run', zones: { left: [], center: [], right: [] } }],
        firstPage: {
          bands: [{ id: 'cover', zones: { left: [], center: [], right: [] } }],
          rule: false,
        },
      },
    };

    const restored = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));

    expect(restored.header?.firstPage?.bands.map((b) => b.id)).toEqual(['cover']);
    expect(restored.header?.firstPage?.rule).toBe(false);
    expect(restored.header?.bands.map((b) => b.id)).toEqual(['run']);
    expect(restored.__unknown).toBeUndefined();
  });

  it('lists every field a fully-populated worksheet carries in KNOWN_KEYS', () => {
    // Built by hand rather than from the type, since types are erased at runtime. Any
    // field added to `Worksheet` should be added here too — that is the point.
    const populated: Worksheet = {
      ...createWorksheet(),
      titleFormat: { bold: true },
      instructions: { en: [], zh: [] },
      instructionsFormat: { bold: true },
      bands: [],
      header: { enabled: true, bands: [] },
      footer: { enabled: true, bands: [] },
    };

    const unlisted = Object.keys(populated).filter((key) => !KNOWN_KEYS.has(key));
    expect(
      unlisted,
      `these worksheet fields would be dropped on load: ${unlisted.join(', ')}`,
    ).toEqual([]);
  });

  it('still stashes genuinely unknown fields from a newer build', () => {
    // The feature KNOWN_KEYS exists for must keep working: a field this build has
    // never heard of is preserved rather than deleted.
    const fromFuture = { ...serializeWorksheet(createWorksheet()), somethingNew: 42 };
    const restored = migrate(JSON.parse(JSON.stringify(fromFuture)));

    expect(restored.__unknown).toEqual({ somethingNew: 42 });
    expect(serializeWorksheet(restored).somethingNew).toBe(42);
  });
});

/*
 * v6 -> v7: tables lost `headerRowCount`.
 *
 * It drove `w:tblHeader`, a grey EFEFEF fill and bold runs, and defaulted to 1 — while no
 * HKDSE table has any of them, so the default printed a grey bold top row a teacher's
 * first action was to undo.
 */
describe('table header rows are dropped (v6 -> v7)', () => {
  const withTables = (headerRowCount: number) => ({
    schemaVersion: 6,
    id: 'x',
    title: { en: [], zh: [] },
    layout: [],
    flow: [],
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        marks: 1,
        options: [],
        answerIndex: 0,
        blocks: [
          {
            kind: 'table',
            id: 't1',
            headerRowCount,
            rows: [{ id: 'r1', cells: [{ id: 'c1', text: { en: [], zh: [] } }] }],
          },
        ],
      },
      {
        id: 'q2',
        type: 'structured',
        blocks: [],
        parts: [
          {
            id: 'p1',
            marks: 2,
            blocks: [
              {
                kind: 'table',
                id: 't2',
                headerRowCount,
                rows: [{ id: 'r2', cells: [{ id: 'c2', text: { en: [], zh: [] } }] }],
              },
            ],
            subParts: [
              {
                id: 's1',
                blocks: [
                  {
                    kind: 'table',
                    id: 't3',
                    headerRowCount,
                    rows: [{ id: 'r3', cells: [{ id: 'c3', text: { en: [], zh: [] } }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  const tablesOf = (worksheet: ReturnType<typeof migrate>) => {
    const found: Record<string, unknown>[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (record.kind === 'table') found.push(record);
      Object.values(record).forEach(walk);
    };
    walk(worksheet.questions);
    return found;
  };

  it('strips the field at every nesting a table can appear in', () => {
    // A table is insertable in a stem, a part and a sub-part, so the migration walks
    // generically rather than following a hand-written path that a new nesting would
    // silently escape.
    const tables = tablesOf(migrate(withTables(1)));
    expect(tables).toHaveLength(3);
    for (const table of tables) expect('headerRowCount' in table).toBe(false);
  });

  it('leaves the rows themselves untouched', () => {
    // Only the dead field goes: a migrated table must print exactly what this build
    // prints for it, which is plain uniform cells.
    const tables = tablesOf(migrate(withTables(2)));
    for (const table of tables) {
      expect((table.rows as unknown[])).toHaveLength(1);
    }
  });

  it('reports the current schema version', () => {
    expect(migrate(withTables(1)).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
  });
});

describe('subscripts survive the editing round trip (§S₁)', () => {
  it('parses a subscript marker into a real run', () => {
    // "S₁" is the naming convention of every DSE diagram. The canvas editor holds the
    // storage form and commits through `parseRuns`, so this is the shape a wrapped
    // selection has to produce.
    const runs = parseRuns('S_{1}');
    expect(runs).toEqual([{ text: 'S' }, { text: '1', vertAlign: 'subscript' }]);
  });

  it('round-trips through the storage form unchanged', () => {
    for (const source of ['S_{1}', 'm^{2}', 'P_{1}+t', 'Q^{d}_{2}']) {
      expect(serializeRuns(parseRuns(source))).toBe(source);
    }
  });

  it('carries vertAlign through a run patch, which is what a toolbar sends', () => {
    // `toRunPatch` silently dropped this: the model, the markers and all three renderers
    // understood a subscript, but it could never be *applied* from a button.
    expect(toRunPatch({ vertAlign: 'subscript' })).toEqual({ vertAlign: 'subscript' });
    // `undefined` means "clear it", which the patch spells as an explicit null.
    expect(toRunPatch({ vertAlign: undefined })).toEqual({ vertAlign: null });
  });

  it('applies a subscript to a character range and re-merges the neighbours', () => {
    const runs = parseRuns('S1');
    const next = applyRunFormat(runs, 1, 2, { vertAlign: 'subscript' });
    expect(serializeRuns(next)).toBe('S_{1}');
  });
});

describe('the toolbar path for a subscript (§the wiring, not the pixels)', () => {
  it('reaches a stored run through the same call the toolbar makes', () => {
    // The toolbar hands `{ vertAlign }` to `onFormatRuns`, which converts it with
    // `toRunPatch` and applies it to the selected characters. This is that chain, minus
    // the DOM — the part that was broken (`toRunPatch` dropped the field silently).
    const runs = parseRuns('S1 shifts right');
    const patched = applyRunFormat(runs, 1, 2, toRunPatch({ vertAlign: 'subscript' }));
    expect(serializeRuns(patched)).toBe('S_{1} shifts right');
  });

  it('clears it again when the active button is toggled off', () => {
    const runs = parseRuns('S_{1}');
    const cleared = applyRunFormat(runs, 1, 2, toRunPatch({ vertAlign: undefined }));
    // Back to one plain run: `normalizeRuns` re-merges the neighbours it split.
    expect(serializeRuns(cleared)).toBe('S1');
  });

  it('reports what the selection carries, which is what lights the button', () => {
    const runs = parseRuns('S_{1}');
    expect(commonRunFormat(runs, 1, 2).vertAlign).toBe('subscript');
    // Spanning both runs, the two disagree, so nothing is reported and neither button
    // shows as active — the same rule bold already follows.
    expect(commonRunFormat(runs, 0, 2).vertAlign).toBeUndefined();
  });
});
