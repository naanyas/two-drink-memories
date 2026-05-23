/**
 * Generate a photo-hunt image pair with EXACTLY N differences.
 *
 * Why this approach:
 *   Earlier versions generated A and B from same-seed + slightly-different
 *   prompts. That produces broadly-similar but not-identical images — many
 *   incidental textural/positional variations the player can see but can't
 *   "catch" because they're not in the hotspot list. Frustrating UX.
 *
 *   Now: generate ONE photoreal scene, save as imageA. Composite N colored
 *   markers onto a copy of that same image, save as imageB. The N markers
 *   are the ONLY differences. Hotspots match marker positions exactly.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/generate-pair-pollinations.ts \
 *     --slug neon-dive \
 *     --title "Neon Dive" \
 *     --base "crowded neon dive bar at night, photoreal, ..." \
 *     --seed 42 \
 *     --diffs 5
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

type Hotspot = { id: string; x: number; y: number; r: number; hint: string };

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce<string[][]>((acc, cur, i, arr) => {
      if (cur.startsWith('--') && arr[i + 1] && !arr[i + 1].startsWith('--')) {
        acc.push([cur.slice(2), arr[i + 1]]);
      }
      return acc;
    }, []),
);

const SLUG = args.slug ?? `puzzle-${Date.now()}`;
const TITLE = args.title ?? SLUG;
const BASE = args.base;
const SEED = args.seed ?? String(Math.floor(Math.random() * 100000));
const WIDTH = Number(args.width ?? 1280);
const HEIGHT = Number(args.height ?? 1600);
const MODEL = args.model ?? 'flux-realism';
const DIFF_COUNT = Number(args.diffs ?? 5);
const OUT_DIR = `./assets/puzzles/${SLUG}`;

if (!BASE) {
  console.error('Required: --base "<prompt>"');
  process.exit(1);
}

async function pollinations(prompt: string, seed: string): Promise<Buffer> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true&model=${MODEL}&enhance=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function upscaleAndSharpen(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const targetW = (meta.width ?? 686) * 2;
  return await sharp(input)
    .resize(targetW, undefined, { kernel: 'lanczos3', withoutEnlargement: false })
    .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

// Five distinct color/shape combinations for the markers. Each is sized to
// be clearly findable but small enough that it doesn't dominate the scene.
// White outline ensures visibility against both dark and light backgrounds.
type Marker = { color: string; shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star'; label: string };
const MARKERS: Marker[] = [
  { color: '#ff5a5f', shape: 'circle', label: 'red circle' },
  { color: '#4ecdc4', shape: 'square', label: 'teal square' },
  { color: '#ffd93d', shape: 'star', label: 'yellow star' },
  { color: '#a78bfa', shape: 'diamond', label: 'purple diamond' },
  { color: '#34d399', shape: 'triangle', label: 'green triangle' },
];

function shapeSvg(shape: Marker['shape'], size: number, color: string): string {
  const s = size;
  const c = s / 2;
  const r = s / 2 - 2;
  switch (shape) {
    case 'circle':
      return `<circle cx="${c}" cy="${c}" r="${r}" fill="${color}" fill-opacity="0.92" stroke="white" stroke-width="2"/>`;
    case 'square': {
      const pad = 2;
      return `<rect x="${pad}" y="${pad}" width="${s - 2 * pad}" height="${s - 2 * pad}" fill="${color}" fill-opacity="0.92" stroke="white" stroke-width="2" rx="3"/>`;
    }
    case 'triangle':
      return `<polygon points="${c},2 ${s - 2},${s - 2} 2,${s - 2}" fill="${color}" fill-opacity="0.92" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
    case 'diamond':
      return `<polygon points="${c},2 ${s - 2},${c} ${c},${s - 2} 2,${c}" fill="${color}" fill-opacity="0.92" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
    case 'star': {
      const o = c;
      const outer = c - 2;
      const inner = outer * 0.45;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? outer : inner;
        pts.push(`${o + radius * Math.cos(angle)},${o + radius * Math.sin(angle)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${color}" fill-opacity="0.92" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
    }
  }
}

function markerSvg(marker: Marker, size: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shapeSvg(marker.shape, size, marker.color)}</svg>`,
  );
}

/**
 * Deterministic PRNG so each puzzle slug gives reproducible marker layout.
 * Tiny mulberry32 implementation seeded from the slug.
 */
function rngFromSeed(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick N normalized positions, each at least MIN_DIST apart and inside a
 * safety margin from the edges so the marker can never get clipped.
 */
function pickPositions(seed: string, n: number): { x: number; y: number }[] {
  const rng = rngFromSeed(seed);
  const positions: { x: number; y: number }[] = [];
  const MIN_DIST = 0.18;
  const MARGIN = 0.10;
  let attempts = 0;
  while (positions.length < n && attempts < 500) {
    attempts++;
    const x = MARGIN + rng() * (1 - 2 * MARGIN);
    const y = MARGIN + rng() * (1 - 2 * MARGIN);
    const ok = positions.every((p) => Math.hypot(p.x - x, p.y - y) > MIN_DIST);
    if (ok) positions.push({ x, y });
  }
  if (positions.length < n) {
    throw new Error(`Could not place ${n} markers with min-distance ${MIN_DIST}; got ${positions.length}`);
  }
  return positions;
}

async function applyMarkers(
  baseImg: Buffer,
  positions: { x: number; y: number }[],
): Promise<{ image: Buffer; hotspots: Hotspot[] }> {
  const meta = await sharp(baseImg).metadata();
  const w = meta.width!;
  const h = meta.height!;
  // Marker size scales with image — 4% of the longer edge feels right.
  const markerSize = Math.round(Math.max(w, h) * 0.04);

  const composites = positions.map((pos, i) => {
    const marker = MARKERS[i % MARKERS.length];
    const svg = markerSvg(marker, markerSize);
    const left = Math.max(0, Math.round(pos.x * w - markerSize / 2));
    const top = Math.max(0, Math.round(pos.y * h - markerSize / 2));
    return { input: svg, left, top };
  });

  const image = await sharp(baseImg).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();

  const hotspots: Hotspot[] = positions.map((pos, i) => ({
    id: `h${i + 1}`,
    x: pos.x,
    y: pos.y,
    // Slightly larger than the marker itself so taps near the marker still register.
    r: 0.07,
    hint: MARKERS[i % MARKERS.length].label,
  }));

  return { image, hotspots };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[${SLUG}] 1. Generating base scene from Pollinations…`);
  const baseRaw = await pollinations(BASE!, SEED);
  console.log(`[${SLUG}]    upscaling + sharpening…`);
  const base = await upscaleAndSharpen(baseRaw);
  // Image A is the clean base scene.
  await writeFile(join(OUT_DIR, 'imageA.jpg'), base);

  console.log(`[${SLUG}] 2. Picking ${DIFF_COUNT} marker positions…`);
  const positions = pickPositions(SLUG, DIFF_COUNT);
  positions.forEach((p, i) => {
    const m = MARKERS[i % MARKERS.length];
    console.log(`   ${m.shape} (${m.color}) at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  });

  console.log(`[${SLUG}] 3. Compositing markers onto image B…`);
  const { image: imageB, hotspots } = await applyMarkers(base, positions);
  await writeFile(join(OUT_DIR, 'imageB.jpg'), imageB);

  await writeFile(
    join(OUT_DIR, 'hotspots.json'),
    JSON.stringify(
      {
        title: TITLE,
        slug: SLUG,
        basePrompt: BASE,
        seed: SEED,
        markerCount: DIFF_COUNT,
        hotspots,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`[${SLUG}] Done. ${hotspots.length} markers placed. ${hotspots.length} hotspots written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
