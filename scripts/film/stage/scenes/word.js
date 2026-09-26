// word — bars 32–36, night. PLACEHOLDER until built (FILM.md §3).
import { COPY } from '../../timeline.mjs';
import { placeholder, sheetSubject } from './_placeholder.js';

const c = COPY.word;
export default placeholder({
  id: 'word',
  world: 'night',
  cards: [
    { at: 0.5, until: 3.5, en: c.headline, zh: c.headlineZh },
    ...c.facts.map((en, i) => ({ at: 5 + i, until: 7.6, en, kind: 'sub', x: 560 + i * 400, y: 900, color: '#F5F5F7' })),
  ],
  subject: sheetSubject({ shadow: false }),
});
