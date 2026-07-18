import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { StatusBarHiddenComponent } from "@/utils/statusbar";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";

export default function MenuComponent() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <View style={styles.content}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Puente</Text>
          <Text style={styles.subtitle}>El puente entre civilizaciones</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.classicCard,
            pressed && styles.classicCardPressed,
          ]}
          onPress={() => router.push("/classic")}
        >
          <View style={styles.classicHeader}>
            <Text style={styles.classicTitle}>Classic</Text>
            <Text style={styles.classicArrow}>→</Text>
          </View>

          <View style={styles.classicFlow}>
            <Text style={styles.classicFlowLine}>idioma → idioma</Text>
            <Text style={styles.classicFlowArrow}>↓</Text>
            <Text style={styles.classicFlowLine}>uno a uno</Text>
          </View>

          <View style={styles.classicDivider} />

          <Text style={styles.classicDescription}>
            Sin descargas adicionales. Internet opcional para transcripción sin
            modelo offline.
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    justifyContent: "center",
  },
  headerBlock: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontFamily: "Mulish_900Black",
    fontSize: 36,
    color: "#000000",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "#666666",
    marginTop: 8,
    textAlign: "center",
  },
  classicCard: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 12,
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  classicCardPressed: {
    backgroundColor: "#F5F5F5",
  },
  classicHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  classicTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 20,
    color: "#000000",
  },
  classicArrow: {
    fontFamily: "Mulish_500Medium",
    fontSize: 18,
    color: "#000000",
  },
  classicFlow: {
    alignItems: "center",
    marginBottom: 16,
  },
  classicFlowLine: {
    fontFamily: "Mulish_500Medium",
    fontSize: 14,
    color: "#666666",
  },
  classicFlowArrow: {
    fontFamily: "Mulish_500Medium",
    fontSize: 14,
    color: "#666666",
    marginVertical: 4,
  },
  classicDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5E5",
    marginBottom: 16,
  },
  classicDescription: {
    fontFamily: "Mulish_500Medium",
    fontSize: 13,
    color: "#666666",
    lineHeight: 20,
  },
});
