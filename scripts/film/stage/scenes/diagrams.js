// diagrams — bars 16–24, night. PLACEHOLDER until built (FILM.md §3).
import { COPY } from '../../timeline.mjs';
import { placeholder, tileSubject } from './_placeholder.js';

const c = COPY.diagrams;
export default placeholder({
  id: 'diagrams',
  world: 'night',
  cards: [
    { at: 0.25, until: 3.4, en: c.word },
    { at: 4.0, until: 9.4, en: c.headline, zh: c.headlineZh },
    { at: 10.0, until: 15.2, en: c.layers, zh: c.layersZh },
  ],
  subject: tileSubject(),
});
