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
const WIDTH = Number(args.width ?? 800);
const HEIGHT = Number(args.height ?? 1000);
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
    `?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true&model=flux`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
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
    r: clamp(Number(h.r) || 0.09, 0.04, 0.18),
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
  const a = await pollinations(BASE!, SEED);
  await writeFile(join(OUT_DIR, 'imageA.jpg'), a);

  console.log(`[${SLUG}] 2. Generating image B (same seed, mutated prompt)…`);
  const b = await pollinations(VARIANT!, SEED);
  await writeFile(join(OUT_DIR, 'imageB.jpg'), b);

  console.log(`[${SLUG}] 3. Asking Gemini Vision to find diffs and locate them…`);
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
