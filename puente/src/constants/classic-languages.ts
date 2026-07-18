export type ClassicLanguage = {
  id: string;
  label: string;
  speechLocale: string;
  floresCode: string;
  flagEmoji: string;
  sttModelSizeLabel: string;
};

export const CLASSIC_LANGUAGES: ClassicLanguage[] = [
  {
    id: "en",
    label: "English",
    speechLocale: "en-US",
    floresCode: "eng_Latn",
    flagEmoji: "🇬🇧",
    sttModelSizeLabel: "~15 MB",
  },
  {
    id: "es",
    label: "Castellano",
    speechLocale: "es-ES",
    floresCode: "spa_Latn",
    flagEmoji: "🇪🇸",
    sttModelSizeLabel: "~15 MB",
  },
  {
    id: "ca",
    label: "Catalán",
    speechLocale: "ca-ES",
    floresCode: "cat_Latn",
    flagEmoji: "🏴",
    sttModelSizeLabel: "~15 MB",
  },
  {
    id: "eu",
    label: "Euskera",
    speechLocale: "eu-ES",
    floresCode: "eus_Latn",
    flagEmoji: "🏴",
    sttModelSizeLabel: "~15 MB",
  },
  {
    id: "it",
    label: "Italiano",
    speechLocale: "it-IT",
    floresCode: "ita_Latn",
    flagEmoji: "🇮🇹",
    sttModelSizeLabel: "~15 MB",
  },
  {
    id: "de",
    label: "Deutsch",
    speechLocale: "de-DE",
    floresCode: "deu_Latn",
    flagEmoji: "🇩🇪",
    sttModelSizeLabel: "~15 MB",
  },
  {
    id: "fr",
    label: "Français",
    speechLocale: "fr-FR",
    floresCode: "fra_Latn",
    flagEmoji: "🇫🇷",
    sttModelSizeLabel: "~15 MB",
  },
];

export const DEFAULT_INPUT_LANGUAGE = CLASSIC_LANGUAGES[0];
export const DEFAULT_OUTPUT_LANGUAGE = CLASSIC_LANGUAGES[1];

export function findClassicLanguageByLocale(
  locale: string,
): ClassicLanguage | undefined {
  const normalized = locale.trim().replace(/_/g, "-").toLowerCase();
  return CLASSIC_LANGUAGES.find(
    (lang) => lang.speechLocale.toLowerCase() === normalized,
  );
}

export function findClassicLanguageById(
  id: string,
): ClassicLanguage | undefined {
  return CLASSIC_LANGUAGES.find((lang) => lang.id === id);
}
