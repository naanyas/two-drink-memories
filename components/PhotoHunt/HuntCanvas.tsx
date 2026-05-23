import { Image } from 'expo-image';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';

import { PALETTE } from '@/constants/brand';
import type { Hotspot } from '@/lib/puzzles';

type Props = {
  // Accept either a require() bundled asset or a remote URI.
  imageSource: ImageSourcePropType | string;
  hotspots: Hotspot[];
  foundIds: Set<string>;
  misses: { x: number; y: number; id: number }[];
  onHit: (hotspotId: string) => void;
  onMiss: (xPct: number, yPct: number) => void;
  label: string;
};

export function HuntCanvas({
  imageSource,
  hotspots,
  foundIds,
  misses,
  onHit,
  onMiss,
  label,
}: Props) {
  const sizeRef = useRef({ width: 0, height: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    sizeRef.current = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
  }, []);

  const handlePress = useCallback(
    (e: { nativeEvent: { locationX: number; locationY: number } }) => {
      const { width, height } = sizeRef.current;
      if (!width || !height) return;
      const xPct = e.nativeEvent.locationX / width;
      const yPct = e.nativeEvent.locationY / height;

      const hit = hotspots.find((h) => {
        if (foundIds.has(h.id)) return false;
        const dx = h.x - xPct;
        const dy = h.y - yPct;
        return Math.sqrt(dx * dx + dy * dy) <= h.r;
      });

      if (hit) onHit(hit.id);
      else onMiss(xPct, yPct);
    },
    [hotspots, foundIds, onHit, onMiss],
  );

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.labelWrap}>
        <View style={styles.labelPill}>
          <View style={styles.labelDot} />
        </View>
      </View>
      <Pressable style={StyleSheet.absoluteFill} onPress={handlePress}>
        <Image
          source={typeof imageSource === 'string' ? { uri: imageSource } : imageSource}
          style={styles.image}
          contentFit="cover"
        />
      </Pressable>

      {hotspots
        .filter((h) => foundIds.has(h.id))
        .map((h) => (
          <View
            key={h.id}
            pointerEvents="none"
            style={[
              styles.foundMark,
              {
                left: `${(h.x - h.r) * 100}%`,
                top: `${(h.y - h.r) * 100}%`,
                width: `${h.r * 2 * 100}%`,
                aspectRatio: 1,
              },
            ]}
          />
        ))}

      {misses.map((m) => (
        <View
          key={m.id}
          pointerEvents="none"
          style={[styles.missMark, { left: `${m.x * 100}%`, top: `${m.y * 100}%` }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: PALETTE.bgElevated,
  },
  image: { width: '100%', height: '100%' },
  labelWrap: { position: 'absolute', top: 8, left: 8, zIndex: 2 },
  labelPill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 999,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PALETTE.accent },
  foundMark: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: PALETTE.success,
    borderRadius: 999,
    backgroundColor: 'rgba(88, 196, 139, 0.2)',
  },
  missMark: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: PALETTE.danger,
    backgroundColor: 'rgba(229, 105, 91, 0.3)',
  },
});
