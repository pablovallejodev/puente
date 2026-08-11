import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Href, router } from 'expo-router';
import { HEADER_HEIGHT, STANDARD_HORIZONTAL_PADDING } from '@/constants/ui';
import { theme } from '@/constants/theme';

const arrowLeftBlackImage = require("@/assets/icons/arrows/black/left.png");

export const ChatHeadComponent = React.memo<{
  titleText: string,
  onSettingsPress?: () => void,
}>(({
  titleText,
  onSettingsPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.standardPropertyColumn}>
        <Text style={styles.brandMark}>PUENTE</Text>
      </View>
      <View style={styles.standardTitleColumn}>
        <Text style={styles.standardTitle}>{titleText}</Text>
      </View>
      <View style={[styles.standardPropertyColumn, styles.propertyColumnEnd]}>
        {onSettingsPress ? (
          <TouchableOpacity
            style={[styles.standardPropertyButton, styles.settingsButton]}
            onPress={onSettingsPress}
            accessibilityLabel="Configuración"
            accessibilityRole="button"
            activeOpacity={0.65}
          >
            <Text style={styles.settingsLabel}>Configuración</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});
ChatHeadComponent.displayName = "ChatHeadComponent";

export const StandardHeadComponent = React.memo<{
  urlTo?: Href,
  onBack?: () => void,
  titleText: string,
  loading: boolean,
}>(({
  urlTo,
  onBack,
  titleText,
  loading,
}) => {
  const goToUrl = () => {
    if (loading) return;
    if (onBack) {
      onBack();
      return;
    }
    if (urlTo) router.push(urlTo);
  };

  return (
    <View style={styles.container}>
      <View style={styles.standardPropertyColumn}>
        <TouchableOpacity
          style={styles.standardPropertyButton}
          onPress={goToUrl}
          disabled={loading}
          accessibilityLabel="Volver"
          accessibilityRole="button"
          activeOpacity={0.65}
        >
          <Image
            source={arrowLeftBlackImage}
            style={[
              styles.standardImageBack,
              { tintColor: theme.colors.text },
            ]}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.standardTitleColumn}>
        <Text style={styles.standardTitle}>{titleText}</Text>
      </View>
      <View style={styles.standardPropertyColumn} />
    </View>
  );
});
StandardHeadComponent.displayName = "StandardHeadComponent";

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: HEADER_HEIGHT + 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.hairline,
  },
  standardPropertyColumn: {
    width: 96,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  propertyColumnEnd: {
    alignItems: "flex-end",
  },
  standardPropertyButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  standardImageBack: {
    width: 18,
    height: 18,
  },
  standardTitleColumn: {
    flex: 1,
    justifyContent: "center",
  },
  standardTitle: {
    fontFamily: theme.font.heading,
    fontSize: 18,
    color: theme.colors.text,
    alignSelf: "center",
    textAlign: "center",
  },
  brandMark: {
    fontFamily: theme.font.display,
    fontSize: 10,
    letterSpacing: 1.8,
    color: theme.colors.text,
  },
  settingsButton: {
    width: 88,
    borderRadius: theme.radius.md,
  },
  settingsLabel: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 0.3,
    color: theme.colors.text,
  },
});
