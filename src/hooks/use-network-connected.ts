import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

export function useNetworkConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const apply = (state: Network.NetworkState) => {
      if (!mounted) return;
      setConnected(state.isConnected === true && state.isInternetReachable !== false);
    };

    void Network.getNetworkStateAsync()
      .then(apply)
      .catch(() => {
        if (mounted) setConnected(false);
      });

    const subscription = Network.addNetworkStateListener(apply);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return connected;
}
