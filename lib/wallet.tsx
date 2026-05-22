import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type WalletState = {
  tokens: number;
  spend: (n: number) => boolean;
  grant: (n: number) => void;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState(5);

  const spend = useCallback((n: number) => {
    let ok = false;
    setTokens((current) => {
      if (current < n) return current;
      ok = true;
      return current - n;
    });
    return ok;
  }, []);

  const grant = useCallback((n: number) => {
    setTokens((current) => current + n);
  }, []);

  const value = useMemo(() => ({ tokens, spend, grant }), [tokens, spend, grant]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

export const TOKEN_BUNDLES = [
  { id: 'bundle_10', tokens: 10, priceUsd: 1.99, label: 'Round of 10' },
  { id: 'bundle_30', tokens: 30, priceUsd: 4.99, label: 'Round of 30 — best value' },
  { id: 'bundle_100', tokens: 100, priceUsd: 12.99, label: 'Open Tab (100)' },
] as const;
