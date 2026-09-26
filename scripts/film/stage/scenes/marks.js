// marks — bars 24–28, day. PLACEHOLDER until built (FILM.md §3).
import { COPY } from '../../timeline.mjs';
import { placeholder, sheetSubject } from './_placeholder.js';

const c = COPY.marks;
export default placeholder({
  id: 'marks',
  world: 'day',
  cards: [
    { at: 0.5, until: 3.6, en: c.headline, zh: c.headlineZh },
    { at: 4.0, until: 7.6, en: c.teacher, zh: c.teacherZh },
  ],
  subject: sheetSubject(),
});
