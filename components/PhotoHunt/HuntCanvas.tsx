import { Image } from 'expo-image';
import { useCallback, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';

import { PALETTE } from '@/constants/brand';
import type { Hotspot } from '@/lib/puzzles';

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
  // We track the wrap's onscreen rect so we can compute click position
  // even when the synthetic event doesn't fill in locationX/Y (which can
  // happen on react-native-web when the click target is a nested child).
  const wrapRef = useRef<View>(null);
  const layoutRef = useRef({ pageX: 0, pageY: 0, width: 0, height: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    // Seed with the layout-event size in case measureInWindow hasn't run yet.
    layoutRef.current.width = e.nativeEvent.layout.width;
    layoutRef.current.height = e.nativeEvent.layout.height;
    if (wrapRef.current) {
      // measureInWindow gives viewport-relative coords on both native and web.
      wrapRef.current.measureInWindow((x, y, w, h) => {
        layoutRef.current = { pageX: x, pageY: y, width: w, height: h };
      });
    }
  }, []);

  const handlePress = useCallback(
    (e: { nativeEvent: { locationX?: number; locationY?: number; pageX?: number; pageY?: number } }) => {
      const ev = e.nativeEvent;
      const { width, height, pageX: wrapX, pageY: wrapY } = layoutRef.current;
      if (!width || !height) return;

      // Prefer locationX/Y (relative to the view); fall back to
      // pageX/Y - wrap position. Either gives us pixels within the canvas.
      let xPx: number | undefined;
      let yPx: number | undefined;
      if (typeof ev.locationX === 'number' && !Number.isNaN(ev.locationX)) {
        xPx = ev.locationX;
        yPx = ev.locationY;
      } else if (typeof ev.pageX === 'number' && !Number.isNaN(ev.pageX)) {
        xPx = ev.pageX - wrapX;
        yPx = ev.pageY - wrapY;
      }
      if (xPx === undefined || yPx === undefined) return;

      const xPct = xPx / width;
      const yPct = yPx / height;

      // Skip clicks that landed outside the visible canvas (shouldn't happen
      // but possible with stale layout refs during quick resizes).
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
    [hotspots, foundIds, onHit, onMiss],
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
