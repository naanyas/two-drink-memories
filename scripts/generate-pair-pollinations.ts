/**
 * Generate a photo-hunt image pair using Pollinations.ai (free, no API key)
 * + Gemini Vision (free) for diff detection + coordinate localization.
 *
 * Why this hybrid:
 *   - Pollinations is fully free and unmetered, but doesn't support
 *     image-to-image. We coax related pairs by reusing the same seed and
 *     mutating the prompt — Flux + a stable seed produces broadly
 *     identical compositions with the new element folded in.
 *   - Gemini Vision (free on text/vision endpoints) does the real work
 *     of finding and localizing the diffs against image B.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/generate-pair-pollinations.ts \
 *     --slug neon-dive \
 *     --title "Neon Dive" \
 *     --base "crowded neon dive bar at night photoreal jukebox pool table beer signs" \
 *     --variant "crowded neon dive bar at night photoreal vintage record player pool table vintage posters" \
 *     --seed 42
 *
 * Output:
 *   assets/puzzles/<slug>/imageA.jpg
 *   assets/puzzles/<slug>/imageB.jpg
 *   assets/puzzles/<slug>/hotspots.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
const VARIANT = args.variant;
const SEED = args.seed ?? String(Math.floor(Math.random() * 100000));
// Bump resolution: 1280x1600 (same 4:5 ratio, sharper detail). Pollinations'
// flux-realism handles this well and the larger files are still under 200KB.
const WIDTH = Number(args.width ?? 1280);
const HEIGHT = Number(args.height ?? 1600);
// flux-realism for photoreal bar/arcade scenes; flux is more generic.
const MODEL = args.model ?? 'flux-realism';
const OUT_DIR = `./assets/puzzles/${SLUG}`;

if (!BASE || !VARIANT) {
  console.error('Required: --base "<prompt>" and --variant "<prompt>"');
  process.exit(1);
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Missing GEMINI_API_KEY. Get one at https://aistudio.google.com/apikey');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function pollinations(prompt: string, seed: string): Promise<Buffer> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true&model=${MODEL}&enhance=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Pollinations' free tier caps output at ~686x858 regardless of the size
 * we request. Upscale 2x with Lanczos resampling and apply an unsharp mask
 * so the final image renders crisp at modern phone/desktop resolutions.
 */
async function upscaleAndSharpen(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const targetW = (meta.width ?? 686) * 2;
  return await sharp(input)
    .resize(targetW, undefined, { kernel: 'lanczos3', withoutEnlargement: false })
    .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function locateDiffs(imageA: Buffer, imageB: Buffer): Promise<Hotspot[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent([
    {
      text:
        `These are two photo-hunt images from a spot-the-difference game. ` +
        `Identify 3 to 6 small visible differences between image A and image B. ` +
        `For each difference, return the center coordinates and radius of a circular ` +
        `tappable hotspot that surrounds the changed region in image B, as normalized ` +
        `values (0.0 = top/left, 1.0 = bottom/right). Use a radius small enough to feel ` +
        `precise but big enough to forgive tap accuracy (typically 0.07-0.12).\n\n` +
        `Respond with ONLY a JSON array, no markdown fences, no commentary, in this exact shape:\n` +
        `[{"id":"h1","x":0.42,"y":0.31,"r":0.09,"hint":"short user-facing hint"}]`,
    },
    { inlineData: { mimeType: 'image/jpeg', data: imageA.toString('base64') } },
    { inlineData: { mimeType: 'image/jpeg', data: imageB.toString('base64') } },
  ]);
  const text = result.response.text().trim();
  const jsonText = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(jsonText) as Hotspot[];
  return parsed.map((h, i) => ({
    id: h.id ?? `h${i + 1}`,
    x: clamp01(Number(h.x)),
    y: clamp01(Number(h.y)),
    // Generous radius floor (0.13) — Gemini's coord detection isn't
    // pixel-precise, so we widen the tappable target. Players still need
    // to identify the right area; they just don't have to nail dead-center.
    r: clamp(Number(h.r) || 0.13, 0.13, 0.20),
    hint: h.hint ?? '',
  }));
}

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number) {
  return clamp(n, 0, 1);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[${SLUG}] 1. Generating image A from Pollinations…`);
  const aRaw = await pollinations(BASE!, SEED);
  console.log(`[${SLUG}]    upscaling + sharpening A…`);
  const a = await upscaleAndSharpen(aRaw);
  await writeFile(join(OUT_DIR, 'imageA.jpg'), a);

  console.log(`[${SLUG}] 2. Generating image B (same seed, mutated prompt)…`);
  const bRaw = await pollinations(VARIANT!, SEED);
  console.log(`[${SLUG}]    upscaling + sharpening B…`);
  const b = await upscaleAndSharpen(bRaw);
  await writeFile(join(OUT_DIR, 'imageB.jpg'), b);

  console.log(`[${SLUG}] 3. Asking Gemini Vision to find diffs and locate them…`);
  // Send the upscaled images so Gemini's hotspot coords reference the
  // same image the player will see.
  const hotspots = await locateDiffs(a, b);
  hotspots.forEach((h) =>
    console.log(`  ${h.id}: (${h.x.toFixed(2)}, ${h.y.toFixed(2)}) r=${h.r.toFixed(2)} — ${h.hint}`),
  );

  await writeFile(
    join(OUT_DIR, 'hotspots.json'),
    JSON.stringify(
      {
        title: TITLE,
        slug: SLUG,
        basePrompt: BASE,
        variantPrompt: VARIANT,
        seed: SEED,
        width: WIDTH,
        height: HEIGHT,
        hotspots,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`[${SLUG}] Done. ${hotspots.length} hotspots written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
