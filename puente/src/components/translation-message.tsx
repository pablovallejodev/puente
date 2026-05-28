import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { TranslationMessage } from '@/context/app-context';

type TranslationMessageItemProps = {
  message: TranslationMessage;
};

export function TranslationMessageItem({ message }: TranslationMessageItemProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {message.sourceLabel}
      </ThemedText>
      <ThemedText type="default">{message.translatedText}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128, 128, 128, 0.25)',
  },
});
