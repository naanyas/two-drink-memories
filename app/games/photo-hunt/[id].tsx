import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
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
  // Single-hint mode: at most one hotspot is revealed at a time. Tapping
  // "Show hint" picks a random unfound hotspot; tapping again hides it.
  const [hintTargetId, setHintTargetId] = useState<string | null>(null);

  // Side-by-side on wider screens (tablet + desktop). Stacked on phones.
  const { width: screenWidth } = useWindowDimensions();
  const sideBySide = screenWidth >= 720;

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

  const handleToggleHint = () => {
    if (!puzzle) return;
    // Toggle off if a hint is already showing.
    if (hintTargetId) {
      setHintTargetId(null);
      return;
    }
    // Pick a random unfound hotspot.
    const unfound = puzzle.hotspots.filter((h) => !foundIds.has(h.id));
    if (unfound.length === 0) return;
    const pick = unfound[Math.floor(Math.random() * unfound.length)];
    setHintTargetId(pick.id);
  };

  // Auto-dismiss the hint once the player finds it — no point keeping the
  // hint ring visible after the hotspot has been captured.
  useEffect(() => {
    if (hintTargetId && foundIds.has(hintTargetId)) {
      setHintTargetId(null);
    }
  }, [hintTargetId, foundIds]);

  const isPlayable = status === 'playing';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.rootContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>{puzzle.title}</Text>
          <Text style={styles.tokens}>🪙 {tokens}</Text>
        </View>

        {/* How to play — always visible, contextual to game state */}
        <View style={styles.howTo}>
          <Text style={styles.howToHeader}>How to play</Text>
          <Text style={styles.howToBody}>
            Image <Text style={styles.howToStrong}>A</Text> is the clean scene. Image{' '}
            <Text style={styles.howToStrong}>B</Text> has{' '}
            <Text style={styles.howToStrong}>{puzzle.hotspots.length}</Text> small areas
            subtly altered (mirrored, rotated, hue-shifted, etc.). Tap each altered area
            (on either image) to capture it — a green ring confirms a hit. Stuck? Hit{' '}
            <Text style={styles.howToStrong}>Show a hint</Text> to reveal one location.
          </Text>
        </View>

        {status === 'playing' && (
          <>
            <Hud
              found={foundIds.size}
              total={puzzle.hotspots.length}
              secondsLeft={secondsLeft}
            />
            <View style={styles.controlRow}>
              <Pressable
                onPress={handleToggleHint}
                style={[styles.hintButton, hintTargetId && styles.hintButtonActive]}
              >
                <Text style={styles.hintButtonText}>
                  {hintTargetId ? '👁 Hide hint' : '👁 Show a hint'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <View style={[styles.canvases, sideBySide && styles.canvasesRow]}>
          <View style={[styles.canvasCol, sideBySide && styles.canvasColRow]}>
            <Text style={styles.canvasCaption}>Image A — original</Text>
            <HuntCanvas
              label="A"
              imageSource={puzzle.imageA}
              hotspots={puzzle.hotspots}
              foundIds={isPlayable || status === 'won' ? foundIds : new Set()}
              misses={isPlayable ? misses : []}
              onHit={isPlayable ? handleHit : () => {}}
              onMiss={isPlayable ? handleMiss : () => {}}
              hintTargetId={hintTargetId}
            />
          </View>
          <View style={styles.gap} />
          <View style={[styles.canvasCol, sideBySide && styles.canvasColRow]}>
            <Text style={styles.canvasCaption}>
              Image B — <Text style={styles.canvasCaptionStrong}>tap the differences</Text>
            </Text>
            <HuntCanvas
              label="B"
              imageSource={puzzle.imageB}
              hotspots={puzzle.hotspots}
              foundIds={isPlayable || status === 'won' ? foundIds : new Set()}
              misses={isPlayable ? misses : []}
              onHit={isPlayable ? handleHit : () => {}}
              onMiss={isPlayable ? handleMiss : () => {}}
              hintTargetId={hintTargetId}
            />
          </View>
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
            <Text style={styles.overlayTitle}>You got &apos;em all 🎉</Text>
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
              Time&apos;s up — you found {foundIds.size}/{puzzle.hotspots.length}.
            </Text>
            <Pressable onPress={handleStart} style={styles.ctaPrimary}>
              <Text style={styles.ctaPrimaryText}>Try Again</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.ctaSecondary}>
              <Text style={styles.ctaSecondaryText}>Back to Games</Text>
            </Pressable>
          </Overlay>
        )}
      </ScrollView>
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
  root: { flex: 1 },
  rootContent: { padding: 16, paddingBottom: 32 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { color: PALETTE.text, fontSize: 22, fontWeight: '800' },
  tokens: { color: PALETTE.accent, fontSize: 16, fontWeight: '700' },
  howTo: {
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  howToHeader: {
    color: PALETTE.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '800',
    marginBottom: 6,
  },
  howToBody: { color: PALETTE.text, fontSize: 14, lineHeight: 20 },
  howToStrong: { color: PALETTE.accent, fontWeight: '800' },
  // Vertical stack by default (phone); side-by-side on >=720px (tablet/web).
  canvases: { flexDirection: 'column' },
  canvasesRow: { flexDirection: 'row', alignItems: 'flex-start' },
  canvasCol: { width: '100%' },
  canvasColRow: { flex: 1 },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  hintButton: {
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hintButtonActive: {
    backgroundColor: 'rgba(217, 119, 87, 0.18)',
    borderColor: PALETTE.accent,
  },
  hintButtonText: { color: PALETTE.text, fontSize: 13, fontWeight: '600' },
  canvasCaption: {
    color: PALETTE.textDim,
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 4,
  },
  canvasCaptionStrong: { color: PALETTE.accent, fontWeight: '700' },
  gap: { height: 12, width: 12 },
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
