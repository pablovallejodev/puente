import { Image } from "expo-image";
import { StyleSheet, type StyleProp, type ImageStyle } from "react-native";

import type { TraductorLanguage } from "@/constants/traductor-languages";
import { LANGUAGE_FLAGS } from "@/constants/language-flags";
import { theme } from "@/constants/theme";

type LanguageFlagProps = {
  language: TraductorLanguage;
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function LanguageFlag({
  language,
  size = 22,
  style,
}: LanguageFlagProps) {
  const source = LANGUAGE_FLAGS[language.id];
  if (!source) return null;

  return (
    <Image
      source={source}
      style={[styles.flag, { width: size, height: size * 0.75 }, style]}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  flag: {
    borderRadius: 3,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.hairline,
  },
});
