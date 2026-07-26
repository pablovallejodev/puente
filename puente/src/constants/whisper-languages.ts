/**
 * BCP-47 speech locale ↔ Whisper language token (without <| |>).
 * Candidates for Universal detect = product UI languages.
 */

const LOCALE_TO_WHISPER: Record<string, string> = {
  "en-US": "en",
  "es-ES": "es",
  "ca-ES": "ca",
  "eu-ES": "eu",
  "it-IT": "it",
  "de-DE": "de",
  "fr-FR": "fr",
  "sq-AL": "sq",
  "th-TH": "th",
};

const WHISPER_TO_LOCALE: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  ca: "ca-ES",
  eu: "eu-ES",
  it: "it-IT",
  de: "de-DE",
  fr: "fr-FR",
  sq: "sq-AL",
  th: "th-TH",
};

/** Whisper ISO codes considered during Universal language detection. */
export const UNIVERSAL_CANDIDATE_LANGS: readonly string[] = Object.keys(
  WHISPER_TO_LOCALE,
);

export function speechLocaleToWhisperLang(locale: string): string {
  const exact = LOCALE_TO_WHISPER[locale];
  if (exact) return exact;
  const prefix = locale.split("-")[0]?.toLowerCase();
  if (prefix && prefix in WHISPER_TO_LOCALE) {
    return prefix;
  }
  return "en";
}

export function whisperLangToSpeechLocale(language: string): string | null {
  const code = language.replace(/^<\|/, "").replace(/\|>$/, "").toLowerCase();
  return WHISPER_TO_LOCALE[code] ?? null;
}

export function isUniversalCandidateLang(language: string): boolean {
  const code = language.replace(/^<\|/, "").replace(/\|>$/, "").toLowerCase();
  return code in WHISPER_TO_LOCALE;
}
