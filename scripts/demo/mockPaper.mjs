// The import film's paper: an invented school's S5 test and its answers file, written as
// two .docx files the way a teacher types them in Word (a first-page header with Name and
// Class, a running header, a footer with a PAGE field, a title block, Word's own list
// numbering, a data table), never through this app's exporter. Every word is invented:
// no real school, person or past-paper item. The copy is the data below; edit it there.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export const MOCK = {
  files: { paper: 'S5 Econ UT1.docx', answers: 'S5 Econ UT1 answers.docx' },
  school: 'Harbourside College',
  title: 'S5 Economics Uniform Test 1 (2026-27)',
  footer: '© 2026 Economics Department',
  time: '40 minutes',

  partA: {
    heading: 'Part A  Multiple-choice questions',
    instruction: 'Choose the best answer for each question. Each question carries 1 mark.',
      },
  /** [stem, statements (may be empty), options A–D, answer]. */
  mcqs: [
    ['Which of the following is a free good?', [], ['Seawater in the open sea', 'Tap water in a public housing flat', 'Sand bought for a building site', 'Air in a diving tank'], 'A'],
    ['Mandy gave up a part-time job paying $80 an hour to attend a three-hour economics workshop. The workshop fee of $200 was paid by her school. What is her opportunity cost of attending the workshop?', [], ['$0', '$200', '$240', '$440'], 'C'],
    ['Which of the following would shift the demand curve for electric cars to the right?', ['A fall in the price of electric cars', 'More public charging stations', 'A rise in the price of petrol'], ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'], 'C'],
    ['The price of good X rises by 10% and its quantity demanded falls by 5%. Over this price range, the demand for good X is', [], ['perfectly inelastic.', 'relatively inelastic.', 'unitarily elastic.', 'relatively elastic.'], 'B'],
    ['The government sets a legal maximum price for rice below its equilibrium price. Which of the following is likely to result?', [], ['A surplus of rice', 'A shortage of rice', 'A rise in the quantity of rice supplied', 'A rise in the market price of rice'], 'B'],
    ['Which of the following are rights that come with owning a flat?', ['Renting the flat out to a tenant', 'Selling the flat to a buyer', 'Voting in a District Council election'], ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'], 'A'],
    ['Which of the following is a fixed cost for a bakery in the short run?', [], ['Flour', 'Electricity for the ovens', 'Rent for the shop', 'Wages of staff paid by the hour'], 'C'],
    ['A firm produces 200 units at a total cost of $5,000. Its total fixed cost is $1,000. What is its average variable cost?', [], ['$5', '$20', '$25', '$30'], 'B'],
    ['Which of the following describes a sole proprietorship?', [], ['Its owner enjoys limited liability.', 'It must publish its accounts every year.', 'Its owner bears unlimited liability.', 'It can raise funds by issuing shares to the public.'], 'C'],
    ['A unit tax is imposed on a good whose demand is perfectly inelastic. Which of the following is correct?', ['Consumers bear the whole tax.', 'The quantity transacted is unchanged.', 'The government collects no tax revenue.'], ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'], 'A'],
    ['Which of the following is a positive statement?', [], ['The government should lower the salaries tax.', 'The unemployment rate in Hong Kong rose last quarter.', 'Bus fares are too high for the elderly.', 'More public housing ought to be built.'], 'B'],
    ['The supply of durians increases and the demand for durians falls at the same time. Which of the following must be true?', [], ['The equilibrium price rises.', 'The equilibrium price falls.', 'The equilibrium quantity rises.', 'The equilibrium quantity falls.'], 'B'],
  ],

  partB: {
    heading: 'Part B  Short questions',
    instruction: 'Answer ALL questions in the spaces provided.',
  },
  /**
   * Written questions: a stem, an optional table (header row first, every cell filled),
   * then parts [text, marks, scheme points [text, marks]].
   */
  written: [
    {
      stem: 'Kelvin owns a small noodle shop in Tai Kok Tsui. He is thinking of opening a second shop.',
      parts: [
        ['Explain whether the money Kelvin spends on the shop rent each month is a cost of production.', 2, [
          ['Yes, the rent is paid to use the shop, an input in production', 1],
          ['so it is part of the cost of producing noodles', 1],
        ]],
        ['Kelvin pays his workers a fixed monthly salary. Explain why his average fixed cost falls as he serves more bowls of noodles.', 4, [
          ['Total fixed cost does not change with output', 1],
          ['Average fixed cost is total fixed cost divided by output', 1],
          ['As output rises, the same total fixed cost is spread over more bowls', 1],
          ['so average fixed cost falls', 1],
        ]],
      ],
    },
    {
      stem: 'The table below shows the market for bubble tea in a district.',
      table: [
        ['Price per cup ($)', 'Quantity demanded (cups)', 'Quantity supplied (cups)'],
        ['20', '700', '300'],
        ['25', '600', '400'],
        ['30', '500', '500'],
        ['35', '400', '600'],
      ],
      parts: [
        ['Find the equilibrium price and quantity of bubble tea.', 2, [
          ['Equilibrium price is $30', 1],
          ['Equilibrium quantity is 500 cups', 1],
        ]],
        ['If the price of bubble tea is fixed at $25 per cup, explain what will happen in the market.', 4, [
          ['At $25, quantity demanded is 600 cups and quantity supplied is 400 cups', 1],
          ['There is a shortage of 200 cups', 1],
          ['Some buyers cannot buy bubble tea at this price', 1],
          ['so non-price allocation such as queuing may be used', 1],
        ]],
      ],
    },
    {
      stem: 'Many restaurants in Hong Kong now use tablets for customers to place orders.',
      parts: [
        ['State one advantage of division of labour to a restaurant.', 2, [
          ['Workers become more skilful at their own task', 1],
          ['so output per worker rises', 1],
        ]],
        ['Explain how using tablets for orders may affect the number of waiters a restaurant hires.', 6, [
          ['Tablets can take orders that waiters used to take', 1],
          ['Capital replaces labour in taking orders', 1],
          ['The restaurant needs fewer waiters to serve the same number of customers', 1],
          ['so the number of waiters hired may fall', 1],
          ['But waiters may still be needed to serve food and clean tables', 1],
          ['so the fall may be small', 1],
        ]],
      ],
    },
  ],
};

/** Full marks as printed in the title block: 1 per MC (the importer gives each MC 1 mark) plus the written parts. */
export const fullMarks = (m = MOCK) => m.mcqs.length + m.written.reduce((n, q) => n + q.parts.reduce((k, p) => k + p[1], 0), 0);

// ---- OOXML ----

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS = `xmlns:w="${W}" xmlns:r="${R}"`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A run: TABs become w:tab. */
function run(text, { b = false, sz, u = false } = {}) {
  const rPr = `${b ? '<w:b/>' : ''}${u ? '<w:u w:val="single"/>' : ''}${sz ? `<w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/>` : ''}`;
  const body = text.split('\t').map((t) => (t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : '')).join('<w:tab/>');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${body}</w:r>`;
}

/** A paragraph: `pPr` is raw paragraph properties. */
const para = (runs, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
const tabs = (...stops) => `<w:tabs>${stops.map(([v, pos]) => `<w:tab w:val="${v}" w:pos="${pos}"/>`).join('')}</w:tabs>`;
const ind = (left, hanging) => `<w:ind w:left="${left}" w:hanging="${hanging}"/>`;
const numbered = (numId) => `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`;
const field = (code, shown) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const blank = () => '<w:p/>';

/** A4, 2 cm margins: the text column is 9638 twips. */
const TEXT_WIDTH = 9638;
const RIGHT = ['right', TEXT_WIDTH];

function table(rows) {
  const width = Math.floor(TEXT_WIDTH / rows[0].length);
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
  const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`;
  const grid = `<w:tblGrid>${rows[0].map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
  const tr = rows.map((cells, k) => `<w:tr>${cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${para(run(c, { b: k === 0 }), '<w:jc w:val="center"/>')}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${width * rows[0].length}" w:type="dxa"/><w:jc w:val="center"/>${borders}</w:tblPr>${grid}${tr}</w:tbl>`;
}

const STYLES = `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4819"/><w:tab w:val="right" w:pos="9638"/></w:tabs></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4819"/><w:tab w:val="right" w:pos="9638"/></w:tabs></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>'
  + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>';

/** Word's own question numbers: "1." hanging at 567, restarted per Part by a new w:num. */
const NUMBERING = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="567"/></w:pPr></w:lvl></w:abstractNum>`
  + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
  + '<w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';

const SECT = (refs) => `<w:sectPr>${refs}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr>`;

function packageOf({ body, sectPr, parts = {}, rels = {}, numbering, title }) {
  const zip = new JSZip();
  const overrides = {
    '/word/document.xml': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    '/word/styles.xml': 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
    '/word/settings.xml': 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
    '/docProps/core.xml': 'application/vnd.openxmlformats-package.core-properties+xml',
    ...(numbering ? { '/word/numbering.xml': 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml' } : {}),
  };
  for (const name of Object.keys(parts)) {
    overrides[`/word/${name}`] = `application/vnd.openxmlformats-officedocument.wordprocessingml.${name.startsWith('header') ? 'header' : 'footer'}+xml`;
  }
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${Object.entries(overrides).map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><dc:creator>Economics Department</dc:creator></cp:coreProperties>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sectPr}</w:body></w:document>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>${STYLES}</w:styles>`);
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS}><w:defaultTabStop w:val="567"/></w:settings>`);
  if (numbering) zip.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>${numbering}</w:numbering>`);
  const allRels = {
    rIdStyles: ['styles', 'styles.xml'],
    rIdSettings: ['settings', 'settings.xml'],
    ...(numbering ? { rIdNumbering: ['numbering', 'numbering.xml'] } : {}),
    ...rels,
  };
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.entries(allRels).map(([id, [type, target]]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`);
  for (const [name, xml] of Object.entries(parts)) zip.file(`word/${name}`, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const LETTERS = 'ABCD';
const marksLabel = (n) => `(${n} mark${n === 1 ? '' : 's'})`;

/** The question paper. */
export function paperDocx(m = MOCK) {
  const header = (content) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${content}</w:hdr>`;
  const footer = (content) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${content}</w:ftr>`;
  const hdr = (text) => para(run(text), '<w:pStyle w:val="Header"/>');
  const parts = {
    // Page 1: the school, and lines for the student's name and class.
    'header1.xml': header(hdr(`${m.school}\t\tName: ${'_'.repeat(18)}  Class: ${'_'.repeat(6)}`)),
    // Later pages: the test's name and the school.
    'header2.xml': header(hdr(`${m.title}\t\t${m.school}`)),
    'footer1.xml': footer(para(`${run(`${m.footer}\t\tPage `)}${field('PAGE', '1')}`, '<w:pStyle w:val="Footer"/>')),
  };
  const rels = { rIdH1: ['header', 'header1.xml'], rIdH2: ['header', 'header2.xml'], rIdF1: ['footer', 'footer1.xml'] };
  const sectPr = SECT('<w:headerReference w:type="default" r:id="rIdH2"/><w:headerReference w:type="first" r:id="rIdH1"/><w:footerReference w:type="default" r:id="rIdF1"/><w:footerReference w:type="first" r:id="rIdF1"/>');

  const out = [];
  // The title block.
  out.push(para(run(m.title, { b: true, sz: 14 }), '<w:jc w:val="center"/>'));
  out.push(para(run(`Full marks: ${fullMarks(m)} marks\tTime allowed: ${m.time}`, { b: true }), tabs(RIGHT)));
  out.push(blank());

  // Part A.
  out.push(para(run(m.partA.heading, { b: true, u: true })));
  out.push(para(run(m.partA.instruction)));
  out.push(blank());
  for (const [stem, statements, options] of m.mcqs) {
    out.push(para(run(stem), `${numbered(1)}${tabs(RIGHT)}`));
    statements.forEach((s, k) => out.push(para(run(`(${k + 1})\t${s}`), ind(1134, 567))));
    options.forEach((o, k) => out.push(para(run(`${LETTERS[k]}.\t${o}`), ind(1134, 567))));
    out.push(blank());
  }

  // Part B, on a new page.
  out.push(para('<w:r><w:br w:type="page"/></w:r>'));
  out.push(para(run(m.partB.heading, { b: true, u: true })));
  out.push(para(run(m.partB.instruction)));
  out.push(blank());
  for (const q of m.written) {
    out.push(para(run(q.stem), numbered(2)));
    if (q.table) {
      out.push(blank());
      out.push(table(q.table));
    }
    out.push(blank());
    q.parts.forEach(([text, marks], k) => {
      out.push(para(run(`(${String.fromCharCode(97 + k)})\t${text}\t${marksLabel(marks)}`), `${tabs(RIGHT)}${ind(1134, 567)}`));
      out.push(blank());
    });
  }
  out.push(para(run('END OF PAPER', { b: true }), '<w:jc w:val="center"/>'));

  return packageOf({ body: out.join(''), sectPr, parts, rels, numbering: NUMBERING, title: m.title });
}

/** The answers file: the MC key, then each written part's marking scheme, one point a line. */
export function answersDocx(m = MOCK) {
  const out = [];
  out.push(para(run(m.title, { b: true, sz: 14 }), '<w:jc w:val="center"/>'));
  out.push(para(run('Marking Scheme', { b: true }), '<w:jc w:val="center"/>'));
  out.push(blank());
  out.push(para(run('Part A', { b: true, u: true })));
  // The key, five to a line.
  for (let i = 0; i < m.mcqs.length; i += 5) {
    out.push(para(run(m.mcqs.slice(i, i + 5).map((q, k) => `${i + k + 1}. ${q[3]}`).join('\t')), tabs(...[1, 2, 3, 4].map((k) => ['left', k * 1700]))));
  }
  out.push(blank());
  out.push(para(run('Part B', { b: true, u: true })));
  m.written.forEach((q, n) => {
    out.push(blank());
    q.parts.forEach(([, , points], k) => {
      const label = `${n + 1}(${String.fromCharCode(97 + k)})`;
      points.forEach(([text, mark], j) => {
        out.push(para(run(`${j === 0 ? label : ''}\t${text} (${mark})`), ind(851, 851)));
      });
    });
  });
  const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  return packageOf({ body: out.join(''), sectPr, title: `${m.title} Marking Scheme` });
}

/** Write both files into `dir`; returns their paths. */
export async function writeMockPaper(dir, m = MOCK) {
  fs.mkdirSync(dir, { recursive: true });
  const files = { paper: path.join(dir, m.files.paper), answers: path.join(dir, m.files.answers) };
  fs.writeFileSync(files.paper, await paperDocx(m));
  fs.writeFileSync(files.answers, await answersDocx(m));
  return files;
}
