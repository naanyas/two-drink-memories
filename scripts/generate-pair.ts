/**
 * Generate a photo-hunt image pair using Google's Nano Banana
 * (Gemini 2.5 Flash Image) free tier.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/generate-pair.ts \
 *     --prompt "crowded neon dive bar, jukebox in corner, pool table, photoreal" \
 *     --out ./assets/puzzles/neon-dive
 *
 * Pipeline:
 *   1. Generate image A from prompt.
 *   2. Ask the model for N candidate "subtle differences" (text).
 *   3. For each difference, inpaint image A → produces image B variants.
 *   4. Write imageA.png, imageB.png, and hotspots.json (best-effort coords
 *      parsed from the model's response — you'll want to review/adjust).
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
    {
      inlineData: {
        mimeType: 'image/png',
        data: baseImage.toString('base64'),
      },
    },
    {
      text: `Edit this image to apply ONLY the following subtle change. Keep everything else identical pixel for pixel. Change: ${diffInstruction}`,
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
      text: `I'm making a spot-the-difference game. The scene is: "${prompt}".
Suggest exactly ${count} small visual changes that would be subtle but fair.
Each change should target a small, localized region.
Return as a numbered list, one change per line, no preamble.`,
    },
  ]);
  const text = result.response.text();
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, count);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('1. Proposing differences…');
  const diffs = await proposeDiffs(PROMPT, DIFF_COUNT);
  console.log('   ', diffs);

  console.log('2. Generating base image…');
  const baseImg = await generateBase(PROMPT);
  await writeFile(join(OUT_DIR, 'imageA.png'), baseImg);

  console.log('3. Applying diffs sequentially (each on previous)…');
  let currentImg = baseImg;
  for (const diff of diffs) {
    console.log('   ·', diff);
    currentImg = await editWithDiff(currentImg, diff);
  }
  await writeFile(join(OUT_DIR, 'imageB.png'), currentImg);

  const hotspots: Hotspot[] = diffs.map((hint, i) => ({
    id: `h${i + 1}`,
    x: 0.5,
    y: 0.5,
    r: 0.08,
    hint,
  }));

  await writeFile(
    join(OUT_DIR, 'hotspots.json'),
    JSON.stringify(
      {
        note: 'Hotspot coordinates are placeholders. Open imageB.png, locate each difference, and set x/y (0..1) and r (0..1).',
        prompt: PROMPT,
        hotspots,
      },
      null,
      2,
    ),
  );

  console.log(`\nDone. Wrote to ${OUT_DIR}`);
  console.log('Next: review images, then edit hotspots.json with real coords.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
