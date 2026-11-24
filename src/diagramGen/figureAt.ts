/**
 * Where a figure of a several-figure question goes (k-0545): the stem, a cell of the stem's
 * grid, or under an option. Its own module, free of the diagram maker, so the studio's
 * writer can name the places without loading the drawing code (`diagramGen` is loaded lazily).
 */
export const FIGURE_ATS = ['stem', '(1)', '(2)', '(3)', '(4)', 'A', 'B', 'C', 'D'] as const;
export type FigureAt = (typeof FIGURE_ATS)[number];

/** The writer's ask for one figure: where it goes and what to draw (never printed). */
export interface FigureAsk {
  at: FigureAt;
  note: string;
}

export const isGridCell = (at: string): boolean => /^\([1-4]\)$/.test(at);
export const isOptionAt = (at: string): boolean => /^[A-D]$/.test(at);
