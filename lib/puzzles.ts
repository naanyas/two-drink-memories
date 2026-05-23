import neonDiveHotspots from '../assets/puzzles/neon-dive/hotspots.json';
import retroArcadeHotspots from '../assets/puzzles/retro-arcade/hotspots.json';
import sportsBarHotspots from '../assets/puzzles/sports-bar/hotspots.json';

import type { ImageSourcePropType } from 'react-native';

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
  imageA: ImageSourcePropType;
  imageB: ImageSourcePropType;
  hotspots: Hotspot[];
  tokenCost: number;
  timeLimitSec: number;
};

// require() instead of URI so Metro/Expo bundles the asset for both
// mobile (number id) and web (hashed URL in dist/_expo/static/).
export const SAMPLE_PUZZLES: Puzzle[] = [
  {
    id: 'neon-dive',
    title: 'Neon Dive',
    imageA: require('../assets/puzzles/neon-dive/imageA.jpg'),
    imageB: require('../assets/puzzles/neon-dive/imageB.jpg'),
    hotspots: neonDiveHotspots.hotspots as Hotspot[],
    tokenCost: 1,
    timeLimitSec: 120,
  },
  {
    id: 'retro-arcade',
    title: 'Retro Arcade',
    imageA: require('../assets/puzzles/retro-arcade/imageA.jpg'),
    imageB: require('../assets/puzzles/retro-arcade/imageB.jpg'),
    hotspots: retroArcadeHotspots.hotspots as Hotspot[],
    tokenCost: 1,
    timeLimitSec: 120,
  },
  {
    id: 'sports-bar',
    title: 'Sports Bar Saturday',
    imageA: require('../assets/puzzles/sports-bar/imageA.jpg'),
    imageB: require('../assets/puzzles/sports-bar/imageB.jpg'),
    hotspots: sportsBarHotspots.hotspots as Hotspot[],
    tokenCost: 1,
    timeLimitSec: 120,
  },
];

export function getPuzzle(id: string): Puzzle | undefined {
  return SAMPLE_PUZZLES.find((p) => p.id === id);
}
