// papers — bars 28–32, day. PLACEHOLDER until built (FILM.md §3).
import { COPY } from '../../timeline.mjs';
import { placeholder, sheetSubject } from './_placeholder.js';

const c = COPY.papers;
export default placeholder({
  id: 'papers',
  world: 'day',
  cards: [
    { at: 0.5, until: 6.2, en: c.headline, zh: c.headlineZh, size: 96 },
    { at: 1.4, until: 6.2, en: c.sub, kind: 'sub', y: 990 },
  ],
  subject: sheetSubject(),
});
