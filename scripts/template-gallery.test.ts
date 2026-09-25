/**
 * Not a unit test: writes every diagram template as SVG into one HTML page, a seeded
 * worksheet (one question per template) and its .docx, for `scripts/template-gallery.mjs`.
 * Run with `npx vitest run scripts/template-gallery.test.ts` (GALLERY_DIR sets the folder).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { createDiagramBlock, createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { DIAGRAM_TEMPLATES, DIAGRAM_TEMPLATE_GROUPS, buildFromTemplate } from '@/model/diagramTemplates';
import { bi, plain } from '@/model/text';
import { diagramSize, diagramSvg } from '@/render/diagram';
import type { LanguageMode } from '@/model/types';

const OUT = process.env.GALLERY_DIR ?? '/tmp/template-gallery';
const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

it('emits the template gallery page', () => {
  mkdirSync(OUT, { recursive: true });
  const cards = DIAGRAM_TEMPLATES.map((template) => {
    const diagram = buildFromTemplate(template.id);
    const svgs = LANGUAGES.map((language) => {
      const size = diagramSize(diagram, 400, language);
      return `<div class="svg" data-lang="${language}">${diagramSvg(diagram, { ...size, language })}</div>`;
    }).join('');
    const group = DIAGRAM_TEMPLATE_GROUPS.find((g) => g.id === template.group);
    return (
      `<section class="card" id="${template.id}"><h2>${template.id} — ${plain(template.name.en)} ` +
      `<small>(${plain(group?.name.en)})</small></h2><div class="row">${svgs}</div></section>`
    );
  });
  writeFileSync(
    `${OUT}/gallery.html`,
    `<!doctype html><meta charset="utf-8"><style>body{font:13px sans-serif;margin:12px;background:#eee}` +
      `.card{background:#fff;margin:0 0 12px;padding:8px;display:inline-block}.row{display:flex;gap:12px;align-items:flex-start}` +
      `h2{font-size:13px;margin:0 0 6px}.svg{outline:1px solid #ddd}</style>${cards.join('')}`,
  );
});

it('emits a worksheet with one diagram question per template, and its .docx', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = createWorksheet();
  worksheet.title = bi('Diagram template gallery', '圖表範本');
  worksheet.questions = DIAGRAM_TEMPLATES.map((template) => {
    const question = createStructuredQuestion();
    question.blocks = [createParagraphBlock(template.name), createDiagramBlock(template.id)];
    return question;
  });
  writeFileSync(`${OUT}/gallery.worksheet.json`, JSON.stringify(worksheet));
  const bytes = await exportDocxBuffer(worksheet, { language: 'bilingual', version: 'student' });
  writeFileSync(`${OUT}/gallery.docx`, bytes);
});
