/**
 * Whisper language tokens ↔ BCP-47 speech locales.
 *
 * Official multilingual Whisper list: openai/whisper tokenizer.py LANGUAGES (100 codes incl. yue).
 * Product forceable set = Whisper ∩ NLLB (excludes la, br, haw — no FLORES in app).
 * Tiny / Base / Small share the same language tokens.
 * UNIVERSAL_CANDIDATE_LANGS is a curated detect subset (not the full product list).
 */

/** Official Whisper multilingual codes (tokenizer order). */
export const WHISPER_OFFICIAL_LANGS: readonly string[] = [
  "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca",
  "nl", "ar", "sv", "it", "id", "hi", "fi", "vi", "he", "uk", "el", "ms",
  "cs", "ro", "da", "hu", "ta", "no", "th", "ur", "hr", "bg", "lt", "la",
  "mi", "ml", "cy", "sk", "te", "fa", "lv", "bn", "sr", "az", "sl", "kn",
  "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw",
  "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc", "ka", "be",
  "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn",
  "mt", "sa", "lb", "my", "bo", "tl", "mg", "as", "tt", "haw", "ln", "ha",
  "ba", "jw", "su", "yue",
];

/** Whisper codes with no NLLB mapping in this app. */
export const WHISPER_EXCLUDED_FROM_PRODUCT: readonly string[] = ["la", "br", "haw"];

const WHISPER_TO_LOCALE: Record<string, string> = {
  af: "af-ZA",
  am: "am-ET",
  ar: "ar-SA",
  as: "as-IN",
  az: "az-AZ",
  ba: "ba-RU",
  be: "be-BY",
  bg: "bg-BG",
  bn: "bn-BD",
  bo: "bo-CN",
  bs: "bs-BA",
  ca: "ca-ES",
  cs: "cs-CZ",
  cy: "cy-GB",
  da: "da-DK",
  de: "de-DE",
  el: "el-GR",
  en: "en-US",
  es: "es-ES",
  et: "et-EE",
  eu: "eu-ES",
  fa: "fa-IR",
  fi: "fi-FI",
  fo: "fo-FO",
  fr: "fr-FR",
  gl: "gl-ES",
  gu: "gu-IN",
  ha: "ha-NG",
  he: "he-IL",
  hi: "hi-IN",
  hr: "hr-HR",
  ht: "ht-HT",
  hu: "hu-HU",
  hy: "hy-AM",
  id: "id-ID",
  is: "is-IS",
  it: "it-IT",
  ja: "ja-JP",
  jw: "jw-ID",
  ka: "ka-GE",
  kk: "kk-KZ",
  km: "km-KH",
  kn: "kn-IN",
  ko: "ko-KR",
  lb: "lb-LU",
  ln: "ln-CD",
  lo: "lo-LA",
  lt: "lt-LT",
  lv: "lv-LV",
  mg: "mg-MG",
  mi: "mi-NZ",
  mk: "mk-MK",
  ml: "ml-IN",
  mn: "mn-MN",
  mr: "mr-IN",
  ms: "ms-MY",
  mt: "mt-MT",
  my: "my-MM",
  ne: "ne-NP",
  nl: "nl-NL",
  nn: "nn-NO",
  no: "no-NO",
  oc: "oc-FR",
  pa: "pa-IN",
  pl: "pl-PL",
  ps: "ps-AF",
  pt: "pt-PT",
  ro: "ro-RO",
  ru: "ru-RU",
  sa: "sa-IN",
  sd: "sd-PK",
  si: "si-LK",
  sk: "sk-SK",
  sl: "sl-SI",
  sn: "sn-ZW",
  so: "so-SO",
  sq: "sq-AL",
  sr: "sr-RS",
  su: "su-ID",
  sv: "sv-SE",
  sw: "sw-KE",
  ta: "ta-IN",
  te: "te-IN",
  tg: "tg-TJ",
  th: "th-TH",
  tk: "tk-TM",
  tl: "tl-PH",
  tr: "tr-TR",
  tt: "tt-RU",
  uk: "uk-UA",
  ur: "ur-PK",
  uz: "uz-UZ",
  vi: "vi-VN",
  yi: "yi-IL",
  yo: "yo-NG",
  yue: "yue-HK",
  zh: "zh-CN",
};

const LOCALE_TO_WHISPER: Record<string, string> = Object.fromEntries(
  Object.entries(WHISPER_TO_LOCALE).map(([lang, locale]) => [locale, lang]),
);

/** Curated candidates for Universal language detection (not full product set). */
export const UNIVERSAL_CANDIDATE_LANGS: readonly string[] = [
  "en", "es", "ca", "eu", "it", "de", "fr", "sq", "th",
];

const UNIVERSAL_CANDIDATE_SET = new Set(UNIVERSAL_CANDIDATE_LANGS);

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
  return UNIVERSAL_CANDIDATE_SET.has(code);
}
