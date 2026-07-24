/** BCP-47 speech locale → Whisper language token (without <| |>). */
const LOCALE_TO_WHISPER: Record<string, string> = {
  "en-US": "en",
  "es-ES": "es",
  "ca-ES": "ca",
  "eu-ES": "eu",
  "it-IT": "it",
  "de-DE": "de",
  "fr-FR": "fr",
};

export function speechLocaleToWhisperLang(locale: string): string {
  const exact = LOCALE_TO_WHISPER[locale];
  if (exact) return exact;
  const prefix = locale.split("-")[0]?.toLowerCase();
  if (prefix && Object.values(LOCALE_TO_WHISPER).includes(prefix)) {
    return prefix;
  }
  return "en";
}
