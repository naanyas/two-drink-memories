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

// Photoreal patch distortions. Each one extracts a small patch from the
// scene at a hotspot location, applies a transformation strong enough to
// be findable on a varied background, and composites it back. The change
// is *of* the scene, not on top of it — but the transformation is now
// large enough to read clearly (the previous values were too subtle and
// got lost on uniform textures).
type Distortion = 'flop' | 'rotate180' | 'hueInvert' | 'grayscale' | 'blur';
const DISTORTIONS: { kind: Distortion; label: string }[] = [
  { kind: 'flop', label: 'mirrored patch' },
  { kind: 'rotate180', label: 'rotated patch' },
  { kind: 'hueInvert', label: 'inverted colors' },
  { kind: 'grayscale', label: 'desaturated patch' },
  { kind: 'blur', label: 'blurred patch' },
];

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

async function applyDistortions(
  baseImg: Buffer,
  positions: { x: number; y: number }[],
): Promise<{ image: Buffer; hotspots: Hotspot[] }> {
  const meta = await sharp(baseImg).metadata();
  const w = meta.width!;
  const h = meta.height!;
  // Patch size: ~13% of the longer edge. Big enough that the distortion
  // is visible even on uniform textures (where a 9% patch would blend in).
  const patchSize = Math.round(Math.max(w, h) * 0.13);

  const composites = await Promise.all(
    positions.map(async (pos, i) => {
      const { kind } = DISTORTIONS[i % DISTORTIONS.length];

      // Clamp the extract window so we never read outside the image bounds.
      const left = Math.max(0, Math.min(w - patchSize, Math.round(pos.x * w - patchSize / 2)));
      const top = Math.max(0, Math.min(h - patchSize, Math.round(pos.y * h - patchSize / 2)));

      let patch = sharp(baseImg).extract({ left, top, width: patchSize, height: patchSize });
      switch (kind) {
        case 'flop':
          patch = patch.flop();
          break;
        case 'rotate180':
          patch = patch.rotate(180);
          break;
        case 'hueInvert':
          // 180° hue rotation = the opposite of every color in the patch.
          // Photoreal but immediately wrong-looking to a careful scanner.
          patch = patch.modulate({ hue: 180 });
          break;
        case 'grayscale':
          // Saturation 0.1 = nearly grayscale. Color drains from this
          // patch while the rest of the scene stays vivid.
          patch = patch.modulate({ saturation: 0.1 });
          break;
        case 'blur':
          // Substantial gaussian blur — turns one part of an otherwise
          // sharp image into a soft, out-of-focus spot. Easy to spot
          // on a careful scan, not arcade-obvious.
          patch = patch.blur(6);
          break;
      }

      return { input: await patch.toBuffer(), left, top };
    }),
  );

  // Composite all patches in one pass — order doesn't matter since each is
  // at a different position and we pre-extracted from the original buffer.
  const image = await sharp(baseImg)
    .composite(composites)
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const hotspots: Hotspot[] = positions.map((pos, i) => ({
    id: `h${i + 1}`,
    x: pos.x,
    y: pos.y,
    // Hit radius covers the full patch (13% wide → 0.065 half-width) with
    // tap forgiveness around it.
    r: 0.10,
    hint: DISTORTIONS[i % DISTORTIONS.length].label,
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

  console.log(`[${SLUG}] 2. Picking ${DIFF_COUNT} distortion positions…`);
  const positions = pickPositions(SLUG, DIFF_COUNT);
  positions.forEach((p, i) => {
    const d = DISTORTIONS[i % DISTORTIONS.length];
    console.log(`   ${d.label} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  });

  console.log(`[${SLUG}] 3. Applying distortions to image B patches…`);
  const { image: imageB, hotspots } = await applyDistortions(base, positions);
  await writeFile(join(OUT_DIR, 'imageB.jpg'), imageB);

  await writeFile(
    join(OUT_DIR, 'hotspots.json'),
    JSON.stringify(
      {
        title: TITLE,
        slug: SLUG,
        basePrompt: BASE,
        seed: SEED,
        diffCount: DIFF_COUNT,
        hotspots,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`[${SLUG}] Done. ${hotspots.length} distortions applied. ${hotspots.length} hotspots written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
