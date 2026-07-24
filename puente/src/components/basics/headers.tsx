import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Href, router } from 'expo-router';
import { HEADER_HEIGHT, STANDARD_HORIZONTAL_PADDING } from '@/constants/ui';

const arrowLeftWhiteImage = require("@/assets/icons/arrows/white/left.png");
const arrowLeftBlackImage = require("@/assets/icons/arrows/black/left.png");

export const ChatHeadComponent = React.memo<{
  titleText: string,
  textWhite?: boolean,
  onSettingsPress?: () => void,
}>(({
  titleText,
  textWhite,
  onSettingsPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.standardPropertyColumn} />
      <View style={styles.standardTitleColumn}>
        <Text style={{
          ...styles.standardTitle,
          ...(!!textWhite ? { color: "white" } : {})
        }}>
          {titleText}
        </Text>
      </View>
      <View style={styles.standardPropertyColumn}>
        {onSettingsPress ? (
          <TouchableOpacity
            style={styles.standardPropertyButton}
            onPress={onSettingsPress}
            accessibilityLabel="Modelos"
          >
            <Text style={{
              ...styles.settingsGlyph,
              ...(!!textWhite ? { color: "white" } : {})
            }}>
              ⚙
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

export const StandardHeadComponent = React.memo<{
  urlTo?: Href,
  onBack?: () => void,
  titleText: string,
  loading: boolean,
  textWhite?: boolean,
}>(({
  urlTo,
  onBack,
  titleText,
  loading,
  textWhite,
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
        >
          <Image
            source={!!textWhite ? arrowLeftWhiteImage : arrowLeftBlackImage}
            style={styles.standardImageBack}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.standardTitleColumn}>
        <Text style={{
          ...styles.standardTitle,
          ...(!!textWhite ? { color: "white" } : {})
        }}>
          {titleText}
        </Text>
      </View>
      <View style={styles.standardPropertyColumn} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: HEADER_HEIGHT,

    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignContent: "flex-start",

    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
  },
  standardPropertyColumn: {
    width: 24,
    height: "auto",

    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignContent: "center",
  },
  standardPropertyButton: {
    width: "auto",
    height: "auto",
  },
  standardImageBack: {
    width: 24,
    height: 24,
  },
  standardTitleColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignContent: "center",
  },
  standardTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 24,
    color: "black",
    alignSelf: "center",
    textAlign: "center",
    verticalAlign: "middle",
  },
  settingsGlyph: {
    fontSize: 22,
    color: "black",
    textAlign: "center",
    lineHeight: 24,
  },
});
