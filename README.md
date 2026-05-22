# 2 Drink Memories

A photo-hunt / spot-the-differences bar game.

**Publisher:** Tangled Webb Entertainment (Groveport, OH)
**Studio:** Fly Trapp Games

## Getting started

```bash
npm install
npm run web        # or npm run ios / npm run android
```

## Structure

```
app/
  (tabs)/index.tsx            Games picker
  (tabs)/explore.tsx          Token store (IAP stubbed)
  games/photo-hunt/[id].tsx   Photo Hunt game screen
components/PhotoHunt/         Game UI (canvas + HUD)
constants/brand.ts            Brand/palette constants
lib/puzzles.ts                Puzzle schema + sample puzzle
lib/wallet.tsx                Token wallet (React context stub)
scripts/generate-pair.ts      Nano Banana image pair generator
```

## Content generation (photo pairs)

Uses [Nano Banana / Gemini 2.5 Flash Image](https://aistudio.google.com) on the free tier.

1. Get a free API key at https://aistudio.google.com/apikey
2. Install the SDK (one-time): `npm i -D @google/generative-ai tsx`
3. Run:

```bash
GEMINI_API_KEY=xxx npx tsx scripts/generate-pair.ts \
  --prompt "crowded neon dive bar, jukebox, pool table, photoreal" \
  --out ./assets/puzzles/neon-dive \
  --diffs 5
```

Output:
- `imageA.png` — base image
- `imageB.png` — image with sequential diffs applied
- `hotspots.json` — placeholder coords you need to edit after reviewing

Then add the puzzle to `lib/puzzles.ts`.

## TODO before shipping

- [ ] Wire `react-native-iap` for token bundles (stub in `app/(tabs)/explore.tsx`)
- [ ] Persist wallet to AsyncStorage (currently resets on reload)
- [ ] Supabase backend: users, token_balances, puzzles, plays (mirror GigHive pattern)
- [ ] Content pipeline: generate ~30 pairs for launch
- [ ] App Store / Play Console: use Groveport, OH address under Tangled Webb Entertainment
- [ ] Replace default icon/splash with Tangled Webb / Fly Trapp / 2 Drink Memories branding
- [ ] Age gate (alcohol-adjacent content)
