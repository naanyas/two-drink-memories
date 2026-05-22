import { StyleSheet, Text, View } from 'react-native';

import { PALETTE } from '@/constants/brand';

type Props = {
  found: number;
  total: number;
  secondsLeft: number;
};

export function Hud({ found, total, secondsLeft }: Props) {
  const mm = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, '0');
  const ss = (secondsLeft % 60).toString().padStart(2, '0');
  const lowTime = secondsLeft <= 15;

  return (
    <View style={styles.wrap}>
      <View style={styles.cell}>
        <Text style={styles.label}>Found</Text>
        <Text style={styles.value}>
          {found} / {total}
        </Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.label}>Time</Text>
        <Text style={[styles.value, lowTime && { color: PALETTE.danger }]}>
          {mm}:{ss}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cell: {
    flex: 1,
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 12,
    padding: 12,
  },
  label: { color: PALETTE.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  value: { color: PALETTE.text, fontSize: 22, fontWeight: '700', marginTop: 4 },
});
