export type ClassicLanguage = {
  id: string;
  label: string;
  speechLocale: string;
  floresCode: string;
  flagEmoji: string;
};

export const CLASSIC_LANGUAGES: ClassicLanguage[] = [
  {
    id: "en",
    label: "English",
    speechLocale: "en-GB",
    floresCode: "eng_Latn",
    flagEmoji: "🇬🇧",
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

export const DEFAULT_INPUT_LANGUAGE = CLASSIC_LANGUAGES[0];
export const DEFAULT_OUTPUT_LANGUAGE = CLASSIC_LANGUAGES[1];

export function findClassicLanguageByLocale(
  locale: string,
): ClassicLanguage | undefined {
  const normalized = normalizeLocale(locale);
  return CLASSIC_LANGUAGES.find(
    (lang) => normalizeLocale(lang.speechLocale) === normalized,
  );
}

export function findClassicLanguageById(
  id: string,
): ClassicLanguage | undefined {
  return CLASSIC_LANGUAGES.find((lang) => lang.id === id);
}

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}
