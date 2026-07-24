import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useCallback, useState } from "react";

import { StandardHeadComponent } from "@/components/basics/headers";
import {
  formatBytes,
  type ModelSpec,
} from "@/constants/model-catalog";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import { useModelCatalog } from "@/contexts/model-catalog-context";
import { StatusBarHiddenComponent } from "@/utils/statusbar";

function ModelCard({
  spec,
  ramBytes,
}: {
  spec: ModelSpec;
  ramBytes: number | null;
}) {
  const { getModelState, download, select, recommended } = useModelCatalog();
  const state = getModelState(spec.id);
  const [busy, setBusy] = useState(false);
  const lowRam =
    ramBytes != null && ramBytes < spec.minRecommendedRamBytes;
  const isRecommended =
    spec.id === recommended.whisperId || spec.id === recommended.nllbId;

  const onDownload = useCallback(async () => {
    setBusy(true);
    try {
      await download(spec.id);
    } catch {
      /* lastError shown globally */
    } finally {
      setBusy(false);
    }
  }, [download, spec.id]);

  const onSelect = useCallback(async () => {
    setBusy(true);
    try {
      await select(spec.id);
    } catch {
      /* lastError shown globally */
    } finally {
      setBusy(false);
    }
  }, [select, spec.id]);

  const downloading = state.status === "downloading";
  const installed =
    state.status === "installed" || state.status === "selected";
  const selected = state.status === "selected";

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{spec.label}</Text>
      {isRecommended ? (
        <Text style={styles.recommended}>Recomendado para este teléfono</Text>
      ) : null}
      <Text style={styles.cardTag}>{spec.qualityTag}</Text>
      <Text style={styles.cardMeta}>
        Disco ~{formatBytes(spec.diskBytes)}
      </Text>
      <Text style={styles.cardMeta}>
        RAM ~{formatBytes(spec.approxRamBytes)}
      </Text>
      {lowRam ? (
        <Text style={styles.warn}>
          Tu teléfono tiene menos RAM de la recomendada
        </Text>
      ) : null}

      <Pressable
        onPress={() => void Linking.openURL(spec.hfRepoUrl)}
        hitSlop={8}
      >
        <Text style={styles.link}>Hugging Face · {spec.hfRepoId}</Text>
      </Pressable>

      {downloading ? (
        <View style={styles.progressBlock}>
          <ActivityIndicator size="small" color="#000000" />
          <Text style={styles.progressText}>
            Descargando… {Math.round(state.progress * 100)}%
          </Text>
        </View>
      ) : null}

      {state.error ? (
        <Text style={styles.cardError}>{state.error.toDisplayString()}</Text>
      ) : null}

      <View style={styles.cardActions}>
        {!installed ? (
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onDownload}
            disabled={busy || downloading}
          >
            <Text style={styles.buttonText}>Descargar</Text>
          </Pressable>
        ) : selected ? (
          <View style={[styles.button, styles.buttonSelected]}>
            <Text style={styles.buttonText}>En uso</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onSelect}
            disabled={busy}
          >
            <Text style={styles.buttonText}>Seleccionar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function ModelosComponent() {
  const {
    isReady,
    booting,
    deviceModelName,
    totalMemoryBytes,
    lastError,
    clearError,
    downloadRecommended,
    whisperModels,
    nllbModels,
  } = useModelCatalog();

  const [recBusy, setRecBusy] = useState(false);

  const ramGb =
    totalMemoryBytes != null
      ? (totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)
      : null;

  const onRecommended = useCallback(async () => {
    setRecBusy(true);
    clearError();
    try {
      await downloadRecommended();
      router.replace("/traductor" as Href);
    } catch {
      /* lastError */
    } finally {
      setRecBusy(false);
    }
  }, [downloadRecommended, clearError]);

  const goTraductor = useCallback(() => {
    if (!isReady) return;
    router.replace("/traductor" as Href);
  }, [isReady]);

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBarHiddenComponent />
        <View style={styles.boot}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.bootText}>Comprobando modelos…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      {isReady ? (
        <StandardHeadComponent
          titleText="Modelos"
          loading={false}
          onBack={() => router.back()}
        />
      ) : (
        <View style={styles.gateHeader}>
          <Text style={styles.gateHeaderTitle}>Modelos</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Elige tus modelos</Text>
        <Text style={styles.subtitle}>
          Descarga y selecciona el transcriptor y el traductor que usará Puente
          en este teléfono.
        </Text>

        <Text style={styles.deviceLine}>
          {deviceModelName ?? "Dispositivo"}
          {ramGb != null ? ` · ${ramGb} GB de RAM` : ""}
        </Text>

        {!isReady ? (
          <Pressable
            style={[styles.recommendButton, recBusy && styles.buttonDisabled]}
            onPress={onRecommended}
            disabled={recBusy}
          >
            {recBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.recommendButtonText}>
                Descargar lo mejor para este teléfono
              </Text>
            )}
          </Pressable>
        ) : null}

        {lastError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{lastError.toDisplayString()}</Text>
          </View>
        ) : null}

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.columnTitle}>Transcriptor Whisper</Text>
            {whisperModels.map((spec) => (
              <ModelCard
                key={spec.id}
                spec={spec}
                ramBytes={totalMemoryBytes}
              />
            ))}
          </View>
          <View style={styles.column}>
            <Text style={styles.columnTitle}>Traductor NLLB</Text>
            <Text style={styles.columnHint}>
              Un solo tamaño apto para móvil (600M destilado, Q8 validado).
            </Text>
            {nllbModels.map((spec) => (
              <ModelCard
                key={spec.id}
                spec={spec}
                ramBytes={totalMemoryBytes}
              />
            ))}
          </View>
        </View>

        {!isReady ? (
          <Text style={styles.gateFooter}>
            Necesitas al menos un Whisper y el traductor NLLB descargados y
            seleccionados para continuar.
          </Text>
        ) : (
          <Pressable style={styles.continueButton} onPress={goTraductor}>
            <Text style={styles.continueButtonText}>Ir al traductor</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  boot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  bootText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 14,
    color: "#666666",
  },
  gateHeader: {
    height: 64,
    justifyContent: "center",
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
  },
  gateHeaderTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 24,
    color: "#000000",
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    paddingBottom: 32,
  },
  title: {
    fontFamily: "Mulish_900Black",
    fontSize: 22,
    color: "#000000",
    marginTop: 8,
  },
  subtitle: {
    fontFamily: "Mulish_500Medium",
    fontSize: 14,
    color: "#666666",
    marginTop: 8,
    lineHeight: 20,
  },
  deviceLine: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 13,
    color: "#000000",
    marginTop: 16,
    marginBottom: 12,
  },
  recommendButton: {
    backgroundColor: "#000000",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  recommendButtonText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 14,
    color: "#FFFFFF",
    textAlign: "center",
  },
  errorBox: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 12,
    color: "#000000",
  },
  columns: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
  columnTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 13,
    color: "#000000",
    marginBottom: 8,
  },
  columnHint: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    marginBottom: 8,
    lineHeight: 15,
  },
  card: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  cardTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 13,
    color: "#000000",
  },
  recommended: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 10,
    color: "#000000",
    marginTop: 4,
  },
  cardTag: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    marginTop: 4,
  },
  cardMeta: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#000000",
    marginTop: 2,
  },
  warn: {
    fontFamily: "Mulish_500Medium",
    fontSize: 10,
    color: "#CC0000",
    marginTop: 4,
  },
  link: {
    fontFamily: "Mulish_500Medium",
    fontSize: 10,
    color: "#666666",
    textDecorationLine: "underline",
    marginTop: 6,
  },
  progressBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  progressText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#000000",
  },
  cardError: {
    fontFamily: "Mulish_500Medium",
    fontSize: 10,
    color: "#CC0000",
    marginTop: 6,
  },
  cardActions: {
    marginTop: 10,
  },
  button: {
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  buttonSelected: {
    backgroundColor: "#F5F5F5",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 12,
    color: "#000000",
  },
  gateFooter: {
    fontFamily: "Mulish_500Medium",
    fontSize: 12,
    color: "#666666",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
  continueButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  continueButtonText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 14,
    color: "#000000",
  },
});
