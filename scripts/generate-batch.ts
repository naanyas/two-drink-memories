/**
 * Generate a batch of photo-hunt puzzles in one shot.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/generate-batch.ts
 *
 * Spawns generate-pair.ts once per prompt, writes each into
 * assets/puzzles/<slug>/, then emits a puzzles-manifest.json that
 * lib/puzzles.ts reads at build time.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Prompt = {
  slug: string;
  title: string;
  prompt: string;
  diffs?: number;
};

const PROMPTS: Prompt[] = [
  {
    slug: 'neon-dive',
    title: 'Neon Dive',
    prompt:
      'a crowded neon dive bar at night, photoreal, eye-level wide shot, ' +
      'jukebox in the corner, pool table with three players, beer signs on brick walls, ' +
      'warm cinematic lighting, sharp detail',
    diffs: 5,
  },
  {
    slug: 'retro-arcade',
    title: 'Retro Arcade',
    prompt:
      'a dimly lit 1980s arcade interior, photoreal, eye-level wide shot, ' +
      'rows of upright cabinets glowing with screens, neon ceiling tubes, ' +
      'carpet in a black geometric pattern, a kid playing in the foreground',
    diffs: 5,
  },
  {
    slug: 'sports-bar',
    title: 'Sports Bar Saturday',
    prompt:
      'a busy sports bar on game night, photoreal, eye-level wide shot, ' +
      'multiple TVs showing different games, fans in jerseys cheering, ' +
      'long wooden bar with bartender pouring a draft, hanging pendant lights',
    diffs: 5,
  },
];

async function runOne(p: Prompt): Promise<void> {
  return new Promise((resolve, reject) => {
    const outDir = `./assets/puzzles/${p.slug}`;
    const child = spawn(
      'npx',
      [
        'tsx',
        'scripts/generate-pair.ts',
        '--prompt', p.prompt,
        '--out', outDir,
        '--diffs', String(p.diffs ?? 5),
      ],
      { stdio: 'inherit', env: process.env },
    );
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`generate-pair.ts exited with code ${code} for ${p.slug}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY. Get one at https://aistudio.google.com/apikey');
    process.exit(1);
  }
  await mkdir('./assets/puzzles', { recursive: true });

  const manifest: Array<{
    id: string;
    title: string;
    imageA: string;
    imageB: string;
    hotspots: unknown[];
    tokenCost: number;
    timeLimitSec: number;
  }> = [];

  for (const p of PROMPTS) {
    console.log(`\n=== ${p.title} (${p.slug}) ===`);
    try {
      await runOne(p);
      const raw = await readFile(`./assets/puzzles/${p.slug}/hotspots.json`, 'utf-8');
      const parsed = JSON.parse(raw) as { hotspots: unknown[] };
      manifest.push({
        id: p.slug,
        title: p.title,
        imageA: `./assets/puzzles/${p.slug}/imageA.png`,
        imageB: `./assets/puzzles/${p.slug}/imageB.png`,
        hotspots: parsed.hotspots,
        tokenCost: 1,
        timeLimitSec: 120,
      });
    } catch (err) {
      console.warn(`! ${p.slug} failed:`, (err as Error).message);
    }
  }

  await writeFile(
    join('./assets/puzzles', 'puzzles-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`\nDone. Generated ${manifest.length}/${PROMPTS.length} puzzles.`);
  console.log('Manifest written to assets/puzzles/puzzles-manifest.json');
  console.log('Next: update lib/puzzles.ts to import from the manifest, then redeploy.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
