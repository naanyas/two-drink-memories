/**
 * Generate a photo-hunt image pair using Google's Nano Banana
 * (Gemini 2.5 Flash Image) free tier — with auto-detected hotspot coords.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/generate-pair.ts \
 *     --prompt "crowded neon dive bar, jukebox in corner, pool table, photoreal" \
 *     --out ./assets/puzzles/neon-dive \
 *     --diffs 5
 *
 * Pipeline:
 *   1. Generate image A from prompt.
 *   2. Ask the model for N candidate "subtle differences" (text).
 *   3. For each difference, inpaint image A → produces image B variants.
 *   4. Show Gemini Vision both images + diff descriptions, get JSON
 *      coordinates back for each diff (instead of placeholder 0.5/0.5).
 *   5. Write imageA.png, imageB.png, and hotspots.json with real coords.
 *
 * Get a free API key at https://aistudio.google.com/apikey
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

const PROMPT = args.prompt ?? 'crowded neon dive bar at night, photoreal, eye-level';
const OUT_DIR = args.out ?? `./assets/puzzles/${Date.now()}`;
const DIFF_COUNT = Number(args.diffs ?? 5);

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Missing GEMINI_API_KEY. Get one at https://aistudio.google.com/apikey');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function generateBase(prompt: string): Promise<Buffer> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
  const result = await model.generateContent([
    { text: `Generate a single photorealistic scene. Prompt: ${prompt}` },
  ]);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) throw new Error('No image in response for base');
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function editWithDiff(baseImage: Buffer, diffInstruction: string): Promise<Buffer> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/png', data: baseImage.toString('base64') } },
    {
      text:
        `Edit this image to apply ONLY the following subtle change. Keep everything else identical pixel for pixel. ` +
        `Change: ${diffInstruction}`,
    },
  ]);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) throw new Error(`No image in response for diff: ${diffInstruction}`);
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function proposeDiffs(prompt: string, count: number): Promise<string[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent([
    {
      text:
        `I'm making a spot-the-difference game. The scene is: "${prompt}".\n` +
        `Suggest exactly ${count} small visual changes that would be subtle but fair.\n` +
        `Each change should target a small, localized region (not whole-image color shifts).\n` +
        `Return as a numbered list, one change per line, no preamble.`,
    },
  ]);
  const text = result.response.text();
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, count);
}

/**
 * Ask Gemini Vision to compare the two images and return hotspot coordinates
 * (normalized 0..1) for each described difference. Falls back to centered
 * placeholders if the model can't parse a clean JSON response.
 */
async function locateDiffs(
  imageA: Buffer,
  imageB: Buffer,
  diffs: string[],
): Promise<Hotspot[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const listed = diffs.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/png', data: imageA.toString('base64') } },
    { inlineData: { mimeType: 'image/png', data: imageB.toString('base64') } },
    {
      text:
        `These are two photo-hunt images. Image B has ${diffs.length} differences from image A. ` +
        `The differences are:\n${listed}\n\n` +
        `For each difference, return the center coordinates and radius of a tappable hotspot ` +
        `that surrounds the changed region, as normalized values (0.0 = top/left, 1.0 = bottom/right). ` +
        `Use a radius small enough to feel precise but big enough to forgive tap accuracy (typically 0.06-0.10).\n\n` +
        `Respond with ONLY a JSON array, no markdown fences, no commentary, in this exact shape:\n` +
        `[{"id":"h1","x":0.42,"y":0.31,"r":0.07,"hint":"<short hint>"}, ...]`,
    },
  ]);
  const text = result.response.text().trim();
  // Strip any accidental ```json fences
  const jsonText = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(jsonText) as Hotspot[];
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map((h, i) => ({
      id: h.id ?? `h${i + 1}`,
      x: clamp01(Number(h.x)),
      y: clamp01(Number(h.y)),
      r: clamp(Number(h.r) || 0.07, 0.03, 0.15),
      hint: h.hint ?? diffs[i] ?? '',
    }));
  } catch (err) {
    console.warn('   ! Failed to parse hotspot JSON, using centered fallbacks. Raw response:');
    console.warn('     ', text.slice(0, 300));
    return diffs.map((hint, i) => ({
      id: `h${i + 1}`,
      x: 0.5,
      y: 0.5,
      r: 0.08,
      hint,
    }));
  }
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

  console.log('1. Proposing differences…');
  const diffs = await proposeDiffs(PROMPT, DIFF_COUNT);
  diffs.forEach((d, i) => console.log(`   ${i + 1}. ${d}`));

  console.log('2. Generating base image (A)…');
  const baseImg = await generateBase(PROMPT);
  await writeFile(join(OUT_DIR, 'imageA.png'), baseImg);

  console.log('3. Applying diffs sequentially → image B…');
  let currentImg = baseImg;
  for (const diff of diffs) {
    console.log('   ·', diff);
    currentImg = await editWithDiff(currentImg, diff);
  }
  await writeFile(join(OUT_DIR, 'imageB.png'), currentImg);

  console.log('4. Asking Gemini Vision to locate the diffs…');
  const hotspots = await locateDiffs(baseImg, currentImg, diffs);
  hotspots.forEach((h) => console.log(`   ${h.id}: (${h.x.toFixed(2)}, ${h.y.toFixed(2)}) r=${h.r.toFixed(2)} — ${h.hint}`));

  await writeFile(
    join(OUT_DIR, 'hotspots.json'),
    JSON.stringify(
      {
        prompt: PROMPT,
        diffs,
        hotspots,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`\nDone. Wrote to ${OUT_DIR}`);
  console.log('Files: imageA.png, imageB.png, hotspots.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
