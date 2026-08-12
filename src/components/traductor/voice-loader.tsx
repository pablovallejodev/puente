import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { theme } from '@/constants/theme';

const SIZE = 48;

type VoiceLoaderProps = {
  accessibilityLabel: string;
};

function VoiceLoaderComponent({ accessibilityLabel }: VoiceLoaderProps) {
  return (
    <View
      style={styles.frame}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
    >
      <LottieView
        source={require('@/assets/lottie/voice-loader.json')}
        autoPlay
        loop
        style={styles.lottie}
        colorFilters={[{ keypath: '**', color: theme.colors.text }]}
      />
    </View>
  );
}

export const VoiceLoader = memo(VoiceLoaderComponent);

const styles = StyleSheet.create({
  frame: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: SIZE,
    height: SIZE,
  },
});
