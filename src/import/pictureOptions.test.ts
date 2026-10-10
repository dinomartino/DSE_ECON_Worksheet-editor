import { describe, expect, it } from 'vitest';
import { pairByCell, pairByPlace, type Box, type GridCell, type PlacedLetter } from './pictureOptions';

const SIZE = 11;
/** An option letter whose box's top-left is at (x, top), y up. */
const letter = (value: number, x: number, top: number): PlacedLetter => ({ value, family: 'A.', size: SIZE, box: { x, y: top - SIZE, w: 11, h: SIZE } });
const pic = (x: number, y: number, w = 200, h = 140): Box => ({ x, y, w, h });

describe('pairByPlace', () => {
  it('pairs a 2 × 2 grid whose letters sit at each picture’s top-left corner (DSE 2021 Q36)', () => {
    const figures = [pic(330, 520), pic(90, 520), pic(330, 330), pic(90, 330)];
    const letters = [letter(1, 78, 668), letter(2, 318, 668), letter(3, 78, 478), letter(4, 318, 478)];
    expect(pairByPlace(letters, figures)).toEqual([[[0, 1], [1, 0], [2, 3], [3, 2]]]);
  });

  it('pairs letters centred under their pictures, row by row, never with the row below', () => {
    // Letters under the top row are 6 pt from it and 23 pt over the bottom row.
    const figures = [pic(90, 520), pic(330, 520), pic(90, 340), pic(330, 340)];
    const letters = [letter(1, 185, 514), letter(2, 425, 514), letter(3, 185, 334), letter(4, 425, 334)];
    expect(pairByPlace(letters, figures)).toEqual([[[0, 0], [1, 1], [2, 2], [3, 3]]]);
  });

  it('pairs a 1 × 4 row with the letters above, and letters on the left', () => {
    const row = [0, 1, 2, 3].map((k) => pic(60 + k * 130, 500, 110, 120));
    expect(pairByPlace([0, 1, 2, 3].map((k) => letter(k + 1, 110 + k * 130, 632)), row)).toEqual([[[0, 0], [1, 1], [2, 2], [3, 3]]]);
    const column = [0, 1].map((k) => pic(100, 600 - k * 160));
    expect(pairByPlace([letter(1, 80, 680), letter(2, 80, 520)], column)).toEqual([[[0, 0], [1, 1]]]);
  });

  it('pairs nothing for letters far from every picture, out of order, or on mixed sides', () => {
    const figures = [pic(90, 520), pic(330, 520)];
    expect(pairByPlace([letter(1, 185, 400), letter(2, 425, 400)], figures)).toEqual([]);
    expect(pairByPlace([letter(2, 185, 514), letter(1, 425, 514)], figures)).toEqual([]);
    // A under its picture, B over its picture.
    expect(pairByPlace([letter(1, 185, 514), letter(2, 425, 676)], figures)).toEqual([]);
    // One letter alone is not a set.
    expect(pairByPlace([letter(1, 185, 514)], figures)).toEqual([]);
  });
});

describe('pairByCell', () => {
  const cell = (text: string, pictures: string[] = []): GridCell<string> => {
    const m = /^([A-D])\.(.*)$/.exec(text.trim());
    return { text, ...(m ? { option: { value: m[1].charCodeAt(0) - 64, family: 'A.' as const, lone: !m[2].trim() } } : {}), pictures };
  };

  it('pairs a letter with the picture in its cell, beside it, or under it', () => {
    expect(pairByCell([[cell('A.', ['a']), cell('B.', ['b'])], [cell('C.', ['c']), cell('D.', ['d'])]])).toEqual([
      { row: 0, col: 0, pictures: ['a'] },
      { row: 0, col: 1, pictures: ['b'] },
      { row: 1, col: 0, pictures: ['c'] },
      { row: 1, col: 1, pictures: ['d'] },
    ]);
    expect(pairByCell([[cell('A.'), cell('', ['a']), cell('B.'), cell('', ['b'])]])?.map((o) => o.pictures)).toEqual([['a'], ['b']]);
    expect(pairByCell([[cell('A.'), cell('B.')], [cell('', ['a']), cell('', ['b'])]])?.map((o) => o.pictures)).toEqual([['a'], ['b']]);
    expect(pairByCell([[cell('', ['a']), cell('', ['b'])], [cell('A.'), cell('B.')]])?.map((o) => o.pictures)).toEqual([['a'], ['b']]);
  });

  it('leaves a table that is not picture options alone', () => {
    // Pictures with captions, a data table, a letter without a picture, a picture without a letter.
    expect(pairByCell([[cell('Figure 1', ['a']), cell('Figure 2', ['b'])]])).toBeNull();
    expect(pairByCell([[cell('A.'), cell('Output')], [cell('B.'), cell('40')]])).toBeNull();
    expect(pairByCell([[cell('A.', ['a']), cell('B.')]])).toBeNull();
    expect(pairByCell([[cell('A.', ['a']), cell('B.', ['b']), cell('', ['c'])]])).toBeNull();
  });
});
