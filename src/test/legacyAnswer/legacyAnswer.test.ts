import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import legacyDoc from './legacy-answer-diagram.json';
import goldens from './goldens.json';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { ANSWER_KEY_PRESET_IDS } from '@/model/answerKeyLayout';
import { renderWorksheet } from '@/render/worksheet';
import { renderAnswerKey } from '@/render/answerKey';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import type { Worksheet } from '@/model/types';

/**
 * Answers before blocks print exactly as they did (u-0c5q). `legacy-answer-diagram.json` is an
 * old-shape paper (answer text + one `answerDiagram` on an essay, a leaf part, two sub-parts and
 * a part's aggregate row); `goldens.json` is what the build before answer blocks (develop
 * e01f01c2) printed for it, written by `scripts/emit-legacy-answer-goldens.test.ts`. Never
 * regenerate either from a later build: they are the evidence.
 */

const golden = goldens as Record<string, unknown>;
const xml = async (buffer: ArrayBuffer | Buffer | Uint8Array) =>
  (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
/** JSON round trip: the goldens were stored as JSON, so `undefined` keys are gone there too. */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('an old-shape answer (text + model diagram) prints as it did before answer blocks', () => {
  const worksheet = migrate(structuredClone(legacyDoc));

  it('opens unchanged and saves byte for byte, at its old version', () => {
    // 2: an essay's own answer is v2 (§ ANSWER_LAYER_VERSION); model diagrams add nothing.
    expect(legacyDoc.schemaVersion).toBe(2);
    expect(JSON.stringify(serializeWorksheet(worksheet))).toBe(JSON.stringify(legacyDoc));
  });

  for (const language of ['en', 'zh', 'bilingual'] as const) {
    for (const version of ['student', 'teacher'] as const) {
      it(`page and .docx, ${language} ${version}`, async () => {
        expect(plain(renderWorksheet(worksheet, { language, version }).items)).toEqual(golden[`page:${language}:${version}`]);
        expect(await xml(await exportDocxBuffer(worksheet, { language, version }, new Map()))).toBe(golden[`docx:${language}:${version}`]);
      });
    }
    for (const preset of ANSWER_KEY_PRESET_IDS) {
      it(`answer key ${preset}, ${language}`, async () => {
        const keyed = { ...worksheet, answerKeyLayout: { preset } } as Worksheet;
        expect(plain(renderAnswerKey(keyed, language))).toEqual(golden[`key:${preset}:${language}`]);
        expect(await xml(await exportAnswerKeyDocxBuffer(keyed, language, [], new Map()))).toBe(golden[`keydocx:${preset}:${language}`]);
      });
    }
  }
});
