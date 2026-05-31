import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORTED_LANGUAGES } from '@/constants/languages';
import { Spacing } from '@/constants/theme';
import { useAppContext } from '@/context/app-context';
import { useTheme } from '@/hooks/use-theme';

export default function LanguagesComponent() {
  const router = useRouter();
  const theme = useTheme();
  const { baseLanguage, setBaseLanguage } = useAppContext();
  const [query, setQuery] = useState('');

  const languages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return SUPPORTED_LANGUAGES;
    }

    return SUPPORTED_LANGUAGES.filter(
      (language) =>
        language.label.toLowerCase().includes(normalized) ||
        language.code.toLowerCase().includes(normalized),
    );
  }, [query]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Base language
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Applies for this session only
          </ThemedText>
        </View>

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          placeholder="Search languages"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.searchInput,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.backgroundSelected,
            },
          ]}
          value={query}
          onChangeText={setQuery}
        />

        <FlatList
          data={languages}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const selected = item.code === baseLanguage;

            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setBaseLanguage(item.code);
                  router.back();
                }}
                style={({ pressed }) => [
                  styles.languageRow,
                  {
                    backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: selected ? '#3c87f7' : 'transparent',
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type={selected ? 'smallBold' : 'small'}>{item.label}</ThemedText>
                {selected ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Selected
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
});
