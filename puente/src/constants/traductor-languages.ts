export type TraductorLanguage = {
  id: string;
  label: string;
  speechLocale: string;
  floresCode: string;
  flagEmoji: string;
};

export const MAX_INPUT_LANGUAGES = 5;

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
];

export const DEFAULT_INPUT_LANGUAGE = TRADUCTOR_LANGUAGES[0];
export const DEFAULT_OUTPUT_LANGUAGE = TRADUCTOR_LANGUAGES[1];
export const DEFAULT_INPUT_LANGUAGES = [DEFAULT_INPUT_LANGUAGE];

export function inputSpeechLocalesKey(langs: TraductorLanguage[]): string {
  return langs.map((l) => l.speechLocale).join("|");
}

export function resolveInputLanguageFromDetection(
  detectedLocale: string,
  inputLanguages: TraductorLanguage[],
): TraductorLanguage {
  const exact = findTraductorLanguageByLocale(detectedLocale);
  if (exact && inputLanguages.some((l) => l.id === exact.id)) return exact;

  const prefix = detectedLocale.split("-")[0]?.toLowerCase();
  const byPrefix = inputLanguages.find(
    (l) =>
      l.id === prefix || l.speechLocale.toLowerCase().startsWith(`${prefix}-`),
  );
  return byPrefix ?? inputLanguages[0];
}

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

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}
