import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BRAND, PALETTE } from '@/constants/brand';
import { SAMPLE_PUZZLES } from '@/lib/puzzles';
import { useWallet } from '@/lib/wallet';

type GameEntry = {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  enabled: boolean;
};

// Each Photo Hunt puzzle gets its own card so visitors can try
// different scenes without burning through tokens on the same image.
const PHOTO_HUNT_GAMES: GameEntry[] = SAMPLE_PUZZLES.map((p) => ({
  id: `photo-hunt-${p.id}`,
  title: `Photo Hunt · ${p.title}`,
  subtitle: `Spot ${p.hotspots.length} differences before time runs out.`,
  route: `/games/photo-hunt/${p.id}`,
  enabled: true,
}));

const GAMES: GameEntry[] = [
  ...PHOTO_HUNT_GAMES,
  {
    id: 'coming-soon-1',
    title: 'Trivia Last Call',
    subtitle: 'Coming soon.',
    route: '',
    enabled: false,
  },
  {
    id: 'coming-soon-2',
    title: 'Dice & Dares',
    subtitle: 'Coming soon.',
    route: '',
    enabled: false,
  },
];

export default function GamesScreen() {
  const { tokens } = useWallet();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.publisher}>{BRAND.studio} · {BRAND.publisher}</Text>
          <Text style={styles.title}>{BRAND.app}</Text>
          <Text style={styles.tagline}>{BRAND.tagline}</Text>
        </View>

        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>Tokens</Text>
          <Text style={styles.walletValue}>🪙 {tokens}</Text>
        </View>

        <Text style={styles.sectionHeader}>Games</Text>

        {GAMES.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function GameCard({ game }: { game: GameEntry }) {
  const card = (
    <View style={[styles.card, !game.enabled && styles.cardDisabled]}>
      <Text style={styles.cardTitle}>{game.title}</Text>
      <Text style={styles.cardSubtitle}>{game.subtitle}</Text>
    </View>
  );

  if (!game.enabled) return card;

  return (
    <Link href={game.route as never} asChild>
      <Pressable>{card}</Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { marginTop: 16, marginBottom: 24 },
  publisher: { color: PALETTE.textDim, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: PALETTE.text, fontSize: 36, fontWeight: '800', marginTop: 6 },
  tagline: { color: PALETTE.accent, fontSize: 14, marginTop: 4, fontStyle: 'italic' },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  walletLabel: { color: PALETTE.textDim, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  walletValue: { color: PALETTE.accent, fontSize: 18, fontWeight: '700' },
  sectionHeader: {
    color: PALETTE.textDim,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  cardDisabled: { opacity: 0.4 },
  cardTitle: { color: PALETTE.text, fontSize: 20, fontWeight: '700' },
  cardSubtitle: { color: PALETTE.textDim, fontSize: 13, marginTop: 4 },
});
