import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hud } from '@/components/PhotoHunt/Hud';
import { HuntCanvas } from '@/components/PhotoHunt/HuntCanvas';
import { PALETTE } from '@/constants/brand';
import { getPuzzle } from '@/lib/puzzles';
import { useWallet } from '@/lib/wallet';

type Status = 'prompt' | 'playing' | 'won' | 'lost';

export default function PhotoHuntScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const puzzle = useMemo(() => (id ? getPuzzle(id) : undefined), [id]);

  const { tokens, spend } = useWallet();
  const [status, setStatus] = useState<Status>('prompt');
  const [foundIds, setFoundIds] = useState<Set<string>>(() => new Set());
  const [misses, setMisses] = useState<{ x: number; y: number; id: number }[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(puzzle?.timeLimitSec ?? 120);
  const missCounter = useRef(0);

  useEffect(() => {
    if (status !== 'playing') return;
    if (secondsLeft <= 0) {
      setStatus('lost');
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [status, secondsLeft]);

  useEffect(() => {
    if (status === 'playing' && puzzle && foundIds.size === puzzle.hotspots.length) {
      setStatus('won');
    }
  }, [status, foundIds, puzzle]);

  if (!puzzle) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.title}>Puzzle not found</Text>
          <Pressable onPress={() => router.back()} style={styles.ctaSecondary}>
            <Text style={styles.ctaSecondaryText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleStart = () => {
    if (!spend(puzzle.tokenCost)) {
      Alert.alert(
        'Not enough tokens',
        `You need ${puzzle.tokenCost} token to play. Visit the Store to buy more.`,
      );
      return;
    }
    setFoundIds(new Set());
    setMisses([]);
    setSecondsLeft(puzzle.timeLimitSec);
    setStatus('playing');
  };

  const handleHit = (hotspotId: string) => {
    setFoundIds((prev) => {
      const next = new Set(prev);
      next.add(hotspotId);
      return next;
    });
  };

  const handleMiss = (x: number, y: number) => {
    const id = ++missCounter.current;
    setMisses((prev) => [...prev, { x, y, id }]);
    setTimeout(() => {
      setMisses((prev) => prev.filter((m) => m.id !== id));
    }, 600);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.root}>
        <View style={styles.topRow}>
          <Text style={styles.title}>{puzzle.title}</Text>
          <Text style={styles.tokens}>🪙 {tokens}</Text>
        </View>

        {status === 'playing' && (
          <Hud
            found={foundIds.size}
            total={puzzle.hotspots.length}
            secondsLeft={secondsLeft}
          />
        )}

        <View style={styles.canvases}>
          <HuntCanvas
            label="A"
            imageSource={puzzle.imageA}
            hotspots={puzzle.hotspots}
            foundIds={status === 'playing' || status === 'won' ? foundIds : new Set()}
            misses={status === 'playing' ? misses : []}
            onHit={status === 'playing' ? handleHit : () => {}}
            onMiss={status === 'playing' ? handleMiss : () => {}}
          />
          <View style={styles.gap} />
          <HuntCanvas
            label="B"
            imageSource={puzzle.imageB}
            hotspots={puzzle.hotspots}
            foundIds={status === 'playing' || status === 'won' ? foundIds : new Set()}
            misses={status === 'playing' ? misses : []}
            onHit={status === 'playing' ? handleHit : () => {}}
            onMiss={status === 'playing' ? handleMiss : () => {}}
          />
        </View>

        {status === 'prompt' && (
          <Overlay>
            <Text style={styles.overlayTitle}>Ready?</Text>
            <Text style={styles.overlayBody}>
              Find all {puzzle.hotspots.length} differences before time runs out. Costs{' '}
              {puzzle.tokenCost} token.
            </Text>
            <Pressable onPress={handleStart} style={styles.ctaPrimary}>
              <Text style={styles.ctaPrimaryText}>Start</Text>
            </Pressable>
          </Overlay>
        )}

        {status === 'won' && (
          <Overlay>
            <Text style={styles.overlayTitle}>You got 'em all 🎉</Text>
            <Text style={styles.overlayBody}>
              {foundIds.size}/{puzzle.hotspots.length} with {secondsLeft}s to spare.
            </Text>
            <Pressable onPress={handleStart} style={styles.ctaPrimary}>
              <Text style={styles.ctaPrimaryText}>Play Again</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.ctaSecondary}>
              <Text style={styles.ctaSecondaryText}>Back to Games</Text>
            </Pressable>
          </Overlay>
        )}

        {status === 'lost' && (
          <Overlay>
            <Text style={styles.overlayTitle}>Last call.</Text>
            <Text style={styles.overlayBody}>
              Time's up — you found {foundIds.size}/{puzzle.hotspots.length}.
            </Text>
            <Pressable onPress={handleStart} style={styles.ctaPrimary}>
              <Text style={styles.ctaPrimaryText}>Try Again</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.ctaSecondary}>
              <Text style={styles.ctaSecondaryText}>Back to Games</Text>
            </Pressable>
          </Overlay>
        )}
      </View>
    </SafeAreaView>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.overlayCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  root: { flex: 1, padding: 16 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { color: PALETTE.text, fontSize: 22, fontWeight: '800' },
  tokens: { color: PALETTE.accent, fontSize: 16, fontWeight: '700' },
  canvases: { flex: 1, flexDirection: 'column' },
  gap: { height: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  overlayTitle: { color: PALETTE.text, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  overlayBody: {
    color: PALETTE.textDim,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  ctaPrimary: {
    width: '100%',
    backgroundColor: PALETTE.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaPrimaryText: { color: PALETTE.bg, fontSize: 16, fontWeight: '800' },
  ctaSecondary: {
    width: '100%',
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaSecondaryText: { color: PALETTE.text, fontSize: 15, fontWeight: '600' },
});
