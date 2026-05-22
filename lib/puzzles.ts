export type Hotspot = {
  id: string;
  x: number;
  y: number;
  r: number;
  hint?: string;
};

export type Puzzle = {
  id: string;
  title: string;
  imageA: string;
  imageB: string;
  hotspots: Hotspot[];
  tokenCost: number;
  timeLimitSec: number;
};

const PLACEHOLDER_A = 'https://picsum.photos/seed/bar-a/800/1000';
const PLACEHOLDER_B = 'https://picsum.photos/seed/bar-b/800/1000';

export const SAMPLE_PUZZLES: Puzzle[] = [
  {
    id: 'sample-neon-dive',
    title: 'Neon Dive',
    imageA: PLACEHOLDER_A,
    imageB: PLACEHOLDER_B,
    tokenCost: 1,
    timeLimitSec: 120,
    hotspots: [
      { id: 'h1', x: 0.18, y: 0.22, r: 0.06, hint: 'upper left' },
      { id: 'h2', x: 0.62, y: 0.31, r: 0.06, hint: 'near the window' },
      { id: 'h3', x: 0.74, y: 0.58, r: 0.06, hint: 'behind the bar' },
      { id: 'h4', x: 0.28, y: 0.71, r: 0.06, hint: 'on the stool' },
      { id: 'h5', x: 0.5, y: 0.88, r: 0.06, hint: 'lower middle' },
    ],
  },
];

export function getPuzzle(id: string): Puzzle | undefined {
  return SAMPLE_PUZZLES.find((p) => p.id === id);
}
