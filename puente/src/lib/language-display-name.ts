export type UiLocale = "es" | "ca" | "en";

/** Product voice — Intl would say "español", not "Castellano". */
const PRODUCT_OVERRIDES: Record<string, Record<UiLocale, string>> = {
  es: { es: "Castellano", ca: "Castellà", en: "Spanish" },
  ca: { es: "Catalán", ca: "Català", en: "Catalan" },
  en: { es: "Inglés", ca: "Anglès", en: "English" },
};

export function resolveUiLocale(languageTag: string = "en"): UiLocale {
  const primary =
    languageTag.trim().replace(/_/g, "-").toLowerCase().split("-")[0] ?? "";
  if (primary === "es" || primary === "ca" || primary === "en") return primary;
  return "en";
}

function capitalizeDisplayName(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function getTraductorLanguageDisplayName(
  language: { id: string; label: string },
  uiLocale: UiLocale = "en",
): string {
  const override = PRODUCT_OVERRIDES[language.id]?.[uiLocale];
  if (override) return override;

  try {
    const name = new Intl.DisplayNames([uiLocale], { type: "language" }).of(
      language.id,
    );
    if (name) return capitalizeDisplayName(name);
  } catch {
    // Hermes / older engines without DisplayNames
  }

  return language.label;
}
