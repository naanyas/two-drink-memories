import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PALETTE } from '@/constants/brand';
import { TOKEN_BUNDLES, useWallet } from '@/lib/wallet';

export default function StoreScreen() {
  const { tokens, grant } = useWallet();

  const handlePurchase = (bundleId: string, amount: number, label: string) => {
    Alert.alert('Stub purchase', `${label}\n\nIAP not yet wired. Adding ${amount} tokens locally.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Grant', onPress: () => grant(amount) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.header}>Token Store</Text>
        <Text style={styles.subtitle}>Current balance: 🪙 {tokens}</Text>

        <Text style={styles.note}>
          Note: App Store rules require IAP for digital goods. Bundles below are stubs — wire to
          react-native-iap before shipping.
        </Text>

        {TOKEN_BUNDLES.map((b) => (
          <Pressable
            key={b.id}
            style={styles.bundle}
            onPress={() => handlePurchase(b.id, b.tokens, b.label)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bundleLabel}>{b.label}</Text>
              <Text style={styles.bundleDetail}>{b.tokens} tokens</Text>
            </View>
            <Text style={styles.bundlePrice}>${b.priceUsd.toFixed(2)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { color: PALETTE.text, fontSize: 28, fontWeight: '800', marginTop: 16 },
  subtitle: { color: PALETTE.accent, fontSize: 15, marginTop: 4, marginBottom: 20 },
  note: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 20,
    lineHeight: 18,
  },
  bundle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.bgElevated,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  bundleLabel: { color: PALETTE.text, fontSize: 17, fontWeight: '700' },
  bundleDetail: { color: PALETTE.textDim, fontSize: 13, marginTop: 2 },
  bundlePrice: { color: PALETTE.accent, fontSize: 18, fontWeight: '700' },
});
