export type TraductorLanguage = {
  id: string;
  label: string;
  speechLocale: string;
  floresCode: string;
  flagEmoji: string;
};

/** Product sentinel — not a BCP-47 locale. */
export type InputLanguageSelection =
  | { kind: "universal" }
  | { kind: "fixed"; language: TraductorLanguage };

export const UNIVERSAL_INPUT: InputLanguageSelection = { kind: "universal" };

export const TRADUCTOR_LANGUAGES: TraductorLanguage[] = [
  {
    id: "en",
    label: "English",
    speechLocale: "en-US",
    floresCode: "eng_Latn",
    flagEmoji: "🇺🇸",
  },
  {
    id: "es",
    label: "Castellano",
    speechLocale: "es-ES",
    floresCode: "spa_Latn",
    flagEmoji: "🇪🇸",
  },
  {
    id: "ca",
    label: "Catalán",
    speechLocale: "ca-ES",
    floresCode: "cat_Latn",
    flagEmoji: "🏴",
  },
  {
    id: "eu",
    label: "Euskera",
    speechLocale: "eu-ES",
    floresCode: "eus_Latn",
    flagEmoji: "🏴",
  },
  {
    id: "it",
    label: "Italiano",
    speechLocale: "it-IT",
    floresCode: "ita_Latn",
    flagEmoji: "🇮🇹",
  },
  {
    id: "de",
    label: "Deutsch",
    speechLocale: "de-DE",
    floresCode: "deu_Latn",
    flagEmoji: "🇩🇪",
  },
  {
    id: "fr",
    label: "Français",
    speechLocale: "fr-FR",
    floresCode: "fra_Latn",
    flagEmoji: "🇫🇷",
  },
  {
    id: "sq",
    label: "Shqip",
    speechLocale: "sq-AL",
    floresCode: "als_Latn",
    flagEmoji: "🇦🇱",
  },
  {
    id: "th",
    label: "ไทย",
    speechLocale: "th-TH",
    floresCode: "tha_Thai",
    flagEmoji: "🇹🇭",
  },
];

export const DEFAULT_INPUT_LANGUAGE: InputLanguageSelection = UNIVERSAL_INPUT;

/** Fallback if device locale is not in the UI list. */
export const FALLBACK_OUTPUT_LANGUAGE =
  TRADUCTOR_LANGUAGES.find((l) => l.id === "es") ?? TRADUCTOR_LANGUAGES[0];

export function findTraductorLanguageByLocale(
  locale: string,
): TraductorLanguage | undefined {
  const normalized = normalizeLocale(locale);
  return TRADUCTOR_LANGUAGES.find(
    (lang) => normalizeLocale(lang.speechLocale) === normalized,
  );
}

export function findTraductorLanguageById(
  id: string,
): TraductorLanguage | undefined {
  return TRADUCTOR_LANGUAGES.find((lang) => lang.id === id);
}

export function resolveDeviceTraductorLanguage(
  languageTag: string,
): TraductorLanguage {
  const normalized = languageTag.trim().replace(/_/g, "-").toLowerCase();
  const primary = normalized.split("-")[0] ?? "";
  const byId = findTraductorLanguageById(primary);
  if (byId) return byId;

  const byPrefix = TRADUCTOR_LANGUAGES.find((lang) =>
    normalizeLocale(lang.speechLocale).startsWith(`${primary}-`),
  );
  if (byPrefix) return byPrefix;

  return FALLBACK_OUTPUT_LANGUAGE;
}

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}
