import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as Haptics from "expo-haptics";

import type { TraductorMode } from "@/lib/traductor-mode";
import { theme } from "@/constants/theme";

const MENU_ESTIMATED_HEIGHT = 104;
const MENU_GAP = 8;
const MENU_WIDTH = 168;

const MODE_OPTIONS: { mode: TraductorMode; label: string }[] = [
  { mode: "one_way", label: "∞ → 1" },
  { mode: "conversation", label: "Conversación" },
];

type ModeMenuButtonProps = {
  mode: TraductorMode;
  onChangeMode: (mode: TraductorMode) => void;
  initiallyOpen?: boolean;
};

export function ModeMenuButton({
  mode,
  onChangeMode,
  initiallyOpen = false,
}: ModeMenuButtonProps) {
  const buttonRef = useRef<View>(null);
  const introStartedRef = useRef(false);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const measureAndOpen = useCallback(() => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  // Hydration may flip initiallyOpen true after first layout.
  useEffect(() => {
    if (!initiallyOpen || introStartedRef.current) return;
    introStartedRef.current = true;
    const id = requestAnimationFrame(() => {
      measureAndOpen();
    });
    return () => cancelAnimationFrame(id);
  }, [initiallyOpen, measureAndOpen]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const selectMode = useCallback(
    (next: TraductorMode) => {
      if (next !== mode) {
        onChangeMode(next);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setOpen(false);
    },
    [mode, onChangeMode],
  );

  const placeAbove =
    anchor != null && anchor.y >= MENU_ESTIMATED_HEIGHT + MENU_GAP;
  const menuTop =
    anchor == null
      ? 0
      : placeAbove
        ? anchor.y - MENU_ESTIMATED_HEIGHT - MENU_GAP
        : Math.min(
            anchor.y + anchor.height + MENU_GAP,
            windowHeight - MENU_ESTIMATED_HEIGHT - MENU_GAP,
          );
  const menuLeft =
    anchor == null
      ? 0
      : Math.max(
          theme.spacing.md,
          Math.min(
            anchor.x + anchor.width / 2 - MENU_WIDTH / 2,
            windowWidth - MENU_WIDTH - theme.spacing.md,
          ),
        );

  return (
    <>
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            open && styles.buttonOpen,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            if (open) {
              close();
              return;
            }
            measureAndOpen();
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="Modo de traducción"
          hitSlop={8}
        >
          <Text style={styles.buttonGlyph}>∞</Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú de modos"
          />
          {anchor ? (
            <View
              style={[
                styles.menu,
                {
                  top: menuTop,
                  left: menuLeft,
                  width: MENU_WIDTH,
                },
              ]}
            >
              {MODE_OPTIONS.map((option) => {
                const selected = option.mode === mode;
                return (
                  <Pressable
                    key={option.mode}
                    style={({ pressed }) => [
                      styles.menuRow,
                      selected && styles.menuRowSelected,
                      pressed && styles.menuRowPressed,
                    ]}
                    onPress={() => selectMode(option.mode)}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.menuLabel}>{option.label}</Text>
                    {selected ? (
                      <Text style={styles.menuCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  buttonOpen: {
    borderColor: theme.colors.action,
  },
  buttonPressed: {
    backgroundColor: theme.colors.pressed,
    transform: [{ scale: 0.96 }],
  },
  buttonGlyph: {
    fontFamily: theme.font.heading,
    fontSize: 16,
    color: theme.colors.text,
    marginTop: -1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  menu: {
    position: "absolute",
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    paddingVertical: theme.spacing.xs,
    overflow: "hidden",
  },
  menuRow: {
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuRowSelected: {
    backgroundColor: theme.colors.pressed,
  },
  menuRowPressed: {
    backgroundColor: theme.colors.pressed,
  },
  menuLabel: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  menuCheck: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
});
