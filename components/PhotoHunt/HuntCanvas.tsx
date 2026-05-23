import { Image } from 'expo-image';
import { useCallback, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';

import { PALETTE } from '@/constants/brand';
import type { Hotspot } from '@/lib/puzzles';

const IS_WEB = Platform.OS === 'web';

type Props = {
  // Either a require() bundled asset or a remote URI string.
  imageSource: ImageSourcePropType | string;
  hotspots: Hotspot[];
  foundIds: Set<string>;
  misses: { x: number; y: number; id: number }[];
  onHit: (hotspotId: string) => void;
  onMiss: (xPct: number, yPct: number) => void;
  label: string;
  imageAspectRatio?: number;
  hintsVisible?: boolean;
};

export function HuntCanvas({
  imageSource,
  hotspots,
  foundIds,
  misses,
  onHit,
  onMiss,
  label,
  imageAspectRatio = 800 / 1000,
  hintsVisible = false,
}: Props) {
  // On native we cache layout dimensions from onLayout and use the event's
  // locationX/Y. On web that approach is unreliable — the layout can shift
  // after onLayout fires (image load, font load, aspect-ratio kicking in)
  // so the cached height is stale and hits land too high. Instead, on web
  // we read the DOM rect synchronously on every click.
  const wrapRef = useRef<View>(null);
  const layoutRef = useRef({ width: 0, height: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    layoutRef.current.width = e.nativeEvent.layout.width;
    layoutRef.current.height = e.nativeEvent.layout.height;
  }, []);

  const computeClickPercent = useCallback(
    (ev: { locationX?: number; locationY?: number; pageX?: number; pageY?: number }):
      | { xPct: number; yPct: number }
      | null => {
      // On web: read the wrap's current bounding rect at click time. This is
      // never stale — it's the actual rendered position of the element now.
      if (IS_WEB && wrapRef.current && (wrapRef.current as unknown as HTMLElement).getBoundingClientRect) {
        const rect = (wrapRef.current as unknown as HTMLElement).getBoundingClientRect();
        // react-native-web sets nativeEvent.pageX/Y from the underlying
        // event.pageX/Y, which includes window.scrollX/Y. getBoundingClientRect
        // returns viewport coords (no scroll). So subtract scroll to align.
        const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
        const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
        if (typeof ev.pageX === 'number' && typeof ev.pageY === 'number') {
          const xPx = ev.pageX - rect.left - scrollX;
          const yPx = ev.pageY - rect.top - scrollY;
          if (rect.width > 0 && rect.height > 0) {
            return { xPct: xPx / rect.width, yPct: yPx / rect.height };
          }
        }
      }

      // Native path (or web fallback): use cached layout + locationX/Y.
      const { width, height } = layoutRef.current;
      if (!width || !height) return null;
      const lx = typeof ev.locationX === 'number' && !Number.isNaN(ev.locationX) ? ev.locationX : null;
      const ly = typeof ev.locationY === 'number' && !Number.isNaN(ev.locationY) ? ev.locationY : null;
      if (lx === null || ly === null) return null;
      return { xPct: lx / width, yPct: ly / height };
    },
    [],
  );

  const handlePress = useCallback(
    (e: { nativeEvent: { locationX?: number; locationY?: number; pageX?: number; pageY?: number } }) => {
      const result = computeClickPercent(e.nativeEvent);
      if (!result) return;
      const { xPct, yPct } = result;
      if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;

      const hit = hotspots.find((h) => {
        if (foundIds.has(h.id)) return false;
        const dx = h.x - xPct;
        const dy = h.y - yPct;
        return Math.sqrt(dx * dx + dy * dy) <= h.r;
      });

      if (hit) onHit(hit.id);
      else onMiss(xPct, yPct);
    },
    [hotspots, foundIds, onHit, onMiss, computeClickPercent],
  );

  return (
    <View
      ref={wrapRef}
      style={[styles.wrap, { aspectRatio: imageAspectRatio }]}
      onLayout={onLayout}
      collapsable={false}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={handlePress}>
        {/* pointerEvents="none" so clicks pass through to the Pressable.
            Without this, react-native-web sometimes routes the click to
            the Image and locationX/Y comes through as undefined. */}
        <Image
          source={typeof imageSource === 'string' ? { uri: imageSource } : imageSource}
          style={styles.image}
          contentFit="fill"
          pointerEvents="none"
        />
      </Pressable>

      {/* Label is rendered LAST so it sits visually above the image but
          pointer-events stay none so it doesn't eat clicks. */}
      <View style={styles.labelWrap} pointerEvents="none">
        <View style={styles.labelPill}>
          <Text style={styles.labelText}>{label}</Text>
        </View>
      </View>

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

      {hintsVisible &&
        hotspots
          .filter((h) => !foundIds.has(h.id))
          .map((h) => (
            <View
              key={`hint-${h.id}`}
              pointerEvents="none"
              style={[
                styles.hintMark,
                {
                  left: `${(h.x - h.r) * 100}%`,
                  top: `${(h.y - h.r) * 100}%`,
                  width: `${h.r * 2 * 100}%`,
                  aspectRatio: 1,
                },
              ]}
            />
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: PALETTE.bgElevated,
  },
  image: { width: '100%', height: '100%' },
  labelWrap: { position: 'absolute', top: 8, left: 8, zIndex: 2 },
  labelPill: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelText: { color: PALETTE.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  foundMark: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: PALETTE.success,
    borderRadius: 999,
    backgroundColor: 'rgba(88, 196, 139, 0.25)',
    shadowColor: PALETTE.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  missMark: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: PALETTE.danger,
    backgroundColor: 'rgba(229, 105, 91, 0.35)',
  },
  hintMark: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: PALETTE.accent,
    borderRadius: 999,
    backgroundColor: 'rgba(217, 119, 87, 0.18)',
    borderStyle: 'dashed',
  },
});
