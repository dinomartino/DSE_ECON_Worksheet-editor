import { it } from 'vitest';
import raw from '@/glossary/data/edb-economics-2020.json';
import { parseGlossary } from '@/glossary/parse';
import { foldZh } from '@/glossary/fold';
it('audit', () => {
  const e = parseGlossary(raw as never);
  const senses = e.reduce((a, x) => a + x.senses.length, 0);
  const vs = e.flatMap((x) => x.senses.flatMap((s) => s.ranks.flat()));
  const distinct = new Set(vs.map((v) => foldZh(v).folded)).size;
  const three = e.filter((x) => x.senses.some((s) => s.ranks.length >= 3)).length;
  console.log({ n: e.length, senses, variants: vs.length, distinct, multi: e.filter((x) => x.senses.length > 1).length, three });
  console.log(e.filter((x) => x.senses.some((s) => s.ranks.flat().some((v) => /[\s()（）；，/0-9]/.test(v)))).map((x) => x.en + ' ' + JSON.stringify(x.senses)));
  console.log(e.filter((x) => x.senses.some((s) => s.note)).map((x) => x.en + ' ' + JSON.stringify(x.senses)).join('\n'));
  console.log(e.filter((x) => x.enForms.length > 1 || x.enForms[0] !== x.en).map((x) => x.en + ' => ' + x.enForms.join(' | ')).join('\n'));
});
