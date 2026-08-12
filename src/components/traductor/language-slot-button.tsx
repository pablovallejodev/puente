import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { TraductorLanguage } from '@/constants/traductor-languages';
import { getDeviceLocaleTag } from '@/constants/languages';
import { LanguageFlag } from '@/components/shared/language-flag';
import type { LanguagePickerSlot } from '@/lib/blocked-language-ids';
import { getTraductorLanguageDisplayName, resolveUiLocale } from '@/lib/language-display-name';
import { theme } from '@/constants/theme';

type LanguageSlotButtonProps =
  | {
      slot: 'input';
      kind: 'universal' | 'fixed';
      language?: TraductorLanguage;
      slotLabel?: string;
    }
  | {
      slot: 'output' | 'lang2';
      language: TraductorLanguage;
      slotLabel: string;
    };

export function LanguageSlotButton(props: LanguageSlotButtonProps) {
  const router = useRouter();
  const pickerSlot: LanguagePickerSlot = props.slot;

  const goToLanguages = () => {
    router.push({
      pathname: '/languages',
      params: { slot: pickerSlot },
    });
  };

  const isUniversal = props.slot === 'input' && props.kind === 'universal';
  const language = props.slot === 'input' ? (props.kind === 'fixed' ? props.language : undefined) : props.language;

  const label = isUniversal
    ? 'Universal'
    : language
      ? getTraductorLanguageDisplayName(language, resolveUiLocale(getDeviceLocaleTag()))
      : '—';

  const slotLabel =
    props.slotLabel ?? (props.slot === 'input' ? 'Origen' : props.slot === 'output' ? 'Traduce a' : 'Idioma 2');

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={goToLanguages}
      accessibilityRole="button"
      accessibilityLabel={`${slotLabel}: ${label}`}
    >
      <View style={styles.flagWrap}>
        {isUniversal || !language ? (
          <Text style={styles.globe}>🌐</Text>
        ) : (
          <LanguageFlag language={language} size={24} />
        )}
      </View>
      <View style={styles.labelColumn}>
        <Text style={styles.slotLabel}>{slotLabel}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.chevron}>⌄</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 78,
    paddingVertical: theme.spacing.ml,
    paddingHorizontal: theme.spacing.ml,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
  },
  rowPressed: {
    backgroundColor: theme.colors.pressed,
    transform: [{ scale: 0.985 }],
  },
  flagWrap: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globe: {
    fontSize: 20,
    textAlign: 'center',
  },
  labelColumn: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  slotLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  label: {
    fontFamily: theme.font.heading,
    fontSize: 14,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  chevron: {
    fontFamily: theme.font.heading,
    fontSize: 16,
    color: theme.colors.textMuted,
    marginLeft: theme.spacing.xs,
    marginTop: -4,
  },
});
