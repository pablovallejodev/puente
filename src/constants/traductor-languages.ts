export type TraductorLanguage = {
  id: string;
  label: string;
  speechLocale: string;
  floresCode: string;
};

/** Product sentinel — not a BCP-47 locale. */
export type InputLanguageSelection = { kind: 'universal' } | { kind: 'fixed'; language: TraductorLanguage };

export const UNIVERSAL_INPUT: InputLanguageSelection = { kind: 'universal' };

/**
 * Shared input+output catalog: Whisper ∩ NLLB.
 * Same list for forced STT origin and MT destination.
 */
export const TRADUCTOR_LANGUAGES: TraductorLanguage[] = [
  {
    id: 'af',
    label: 'Afrikaans',
    speechLocale: 'af-ZA',
    floresCode: 'afr_Latn',
  },
  {
    id: 'am',
    label: 'Amharic',
    speechLocale: 'am-ET',
    floresCode: 'amh_Ethi',
  },
  {
    id: 'ar',
    label: 'Arabic',
    speechLocale: 'ar-SA',
    floresCode: 'arb_Arab',
  },
  {
    id: 'hy',
    label: 'Armenian',
    speechLocale: 'hy-AM',
    floresCode: 'hye_Armn',
  },
  {
    id: 'as',
    label: 'Assamese',
    speechLocale: 'as-IN',
    floresCode: 'asm_Beng',
  },
  {
    id: 'az',
    label: 'Azerbaijani',
    speechLocale: 'az-AZ',
    floresCode: 'azj_Latn',
  },
  {
    id: 'ba',
    label: 'Bashkir',
    speechLocale: 'ba-RU',
    floresCode: 'bak_Cyrl',
  },
  {
    id: 'be',
    label: 'Belarusian',
    speechLocale: 'be-BY',
    floresCode: 'bel_Cyrl',
  },
  {
    id: 'bn',
    label: 'Bengali',
    speechLocale: 'bn-BD',
    floresCode: 'ben_Beng',
  },
  {
    id: 'bs',
    label: 'Bosnian',
    speechLocale: 'bs-BA',
    floresCode: 'bos_Latn',
  },
  {
    id: 'bg',
    label: 'Bulgarian',
    speechLocale: 'bg-BG',
    floresCode: 'bul_Cyrl',
  },
  {
    id: 'es',
    label: 'Español',
    speechLocale: 'es-ES',
    floresCode: 'spa_Latn',
  },
  {
    id: 'ca',
    label: 'Catalán',
    speechLocale: 'ca-ES',
    floresCode: 'cat_Latn',
  },
  {
    id: 'hr',
    label: 'Croatian',
    speechLocale: 'hr-HR',
    floresCode: 'hrv_Latn',
  },
  {
    id: 'cs',
    label: 'Czech',
    speechLocale: 'cs-CZ',
    floresCode: 'ces_Latn',
  },
  {
    id: 'da',
    label: 'Danish',
    speechLocale: 'da-DK',
    floresCode: 'dan_Latn',
  },
  {
    id: 'de',
    label: 'Deutsch',
    speechLocale: 'de-DE',
    floresCode: 'deu_Latn',
  },
  {
    id: 'en',
    label: 'English',
    speechLocale: 'en-US',
    floresCode: 'eng_Latn',
  },
  {
    id: 'et',
    label: 'Estonian',
    speechLocale: 'et-EE',
    floresCode: 'est_Latn',
  },
  {
    id: 'eu',
    label: 'Euskera',
    speechLocale: 'eu-ES',
    floresCode: 'eus_Latn',
  },
  {
    id: 'fo',
    label: 'Faroese',
    speechLocale: 'fo-FO',
    floresCode: 'fao_Latn',
  },
  {
    id: 'fi',
    label: 'Finnish',
    speechLocale: 'fi-FI',
    floresCode: 'fin_Latn',
  },
  {
    id: 'fr',
    label: 'Français',
    speechLocale: 'fr-FR',
    floresCode: 'fra_Latn',
  },
  {
    id: 'gl',
    label: 'Galego',
    speechLocale: 'gl-ES',
    floresCode: 'glg_Latn',
  },
  {
    id: 'ka',
    label: 'Georgian',
    speechLocale: 'ka-GE',
    floresCode: 'kat_Geor',
  },
  {
    id: 'el',
    label: 'Greek',
    speechLocale: 'el-GR',
    floresCode: 'ell_Grek',
  },
  {
    id: 'gu',
    label: 'Gujarati',
    speechLocale: 'gu-IN',
    floresCode: 'guj_Gujr',
  },
  {
    id: 'ht',
    label: 'Haitian Creole',
    speechLocale: 'ht-HT',
    floresCode: 'hat_Latn',
  },
  {
    id: 'ha',
    label: 'Hausa',
    speechLocale: 'ha-NG',
    floresCode: 'hau_Latn',
  },
  {
    id: 'he',
    label: 'Hebrew',
    speechLocale: 'he-IL',
    floresCode: 'heb_Hebr',
  },
  {
    id: 'hi',
    label: 'Hindi',
    speechLocale: 'hi-IN',
    floresCode: 'hin_Deva',
  },
  {
    id: 'hu',
    label: 'Hungarian',
    speechLocale: 'hu-HU',
    floresCode: 'hun_Latn',
  },
  {
    id: 'is',
    label: 'Icelandic',
    speechLocale: 'is-IS',
    floresCode: 'isl_Latn',
  },
  {
    id: 'id',
    label: 'Indonesian',
    speechLocale: 'id-ID',
    floresCode: 'ind_Latn',
  },
  {
    id: 'it',
    label: 'Italiano',
    speechLocale: 'it-IT',
    floresCode: 'ita_Latn',
  },
  {
    id: 'jw',
    label: 'Javanese',
    speechLocale: 'jw-ID',
    floresCode: 'jav_Latn',
  },
  {
    id: 'kn',
    label: 'Kannada',
    speechLocale: 'kn-IN',
    floresCode: 'kan_Knda',
  },
  {
    id: 'kk',
    label: 'Kazakh',
    speechLocale: 'kk-KZ',
    floresCode: 'kaz_Cyrl',
  },
  {
    id: 'km',
    label: 'Khmer',
    speechLocale: 'km-KH',
    floresCode: 'khm_Khmr',
  },
  {
    id: 'lo',
    label: 'Lao',
    speechLocale: 'lo-LA',
    floresCode: 'lao_Laoo',
  },
  {
    id: 'lv',
    label: 'Latvian',
    speechLocale: 'lv-LV',
    floresCode: 'lvs_Latn',
  },
  {
    id: 'ln',
    label: 'Lingala',
    speechLocale: 'ln-CD',
    floresCode: 'lin_Latn',
  },
  {
    id: 'lt',
    label: 'Lithuanian',
    speechLocale: 'lt-LT',
    floresCode: 'lit_Latn',
  },
  {
    id: 'lb',
    label: 'Luxembourgish',
    speechLocale: 'lb-LU',
    floresCode: 'ltz_Latn',
  },
  {
    id: 'mk',
    label: 'Macedonian',
    speechLocale: 'mk-MK',
    floresCode: 'mkd_Cyrl',
  },
  {
    id: 'mg',
    label: 'Malagasy',
    speechLocale: 'mg-MG',
    floresCode: 'plt_Latn',
  },
  {
    id: 'ms',
    label: 'Malay',
    speechLocale: 'ms-MY',
    floresCode: 'zsm_Latn',
  },
  {
    id: 'ml',
    label: 'Malayalam',
    speechLocale: 'ml-IN',
    floresCode: 'mal_Mlym',
  },
  {
    id: 'mt',
    label: 'Maltese',
    speechLocale: 'mt-MT',
    floresCode: 'mlt_Latn',
  },
  {
    id: 'mr',
    label: 'Marathi',
    speechLocale: 'mr-IN',
    floresCode: 'mar_Deva',
  },
  {
    id: 'mn',
    label: 'Mongolian',
    speechLocale: 'mn-MN',
    floresCode: 'khk_Cyrl',
  },
  {
    id: 'my',
    label: 'Myanmar',
    speechLocale: 'my-MM',
    floresCode: 'mya_Mymr',
  },
  {
    id: 'mi',
    label: 'Māori',
    speechLocale: 'mi-NZ',
    floresCode: 'mri_Latn',
  },
  {
    id: 'nl',
    label: 'Nederlands',
    speechLocale: 'nl-NL',
    floresCode: 'nld_Latn',
  },
  {
    id: 'ne',
    label: 'Nepali',
    speechLocale: 'ne-NP',
    floresCode: 'npi_Deva',
  },
  {
    id: 'no',
    label: 'Norwegian',
    speechLocale: 'no-NO',
    floresCode: 'nob_Latn',
  },
  {
    id: 'nn',
    label: 'Nynorsk',
    speechLocale: 'nn-NO',
    floresCode: 'nno_Latn',
  },
  {
    id: 'oc',
    label: 'Occitan',
    speechLocale: 'oc-FR',
    floresCode: 'oci_Latn',
  },
  {
    id: 'ps',
    label: 'Pashto',
    speechLocale: 'ps-AF',
    floresCode: 'pbt_Arab',
  },
  {
    id: 'fa',
    label: 'Persian',
    speechLocale: 'fa-IR',
    floresCode: 'pes_Arab',
  },
  {
    id: 'pl',
    label: 'Polish',
    speechLocale: 'pl-PL',
    floresCode: 'pol_Latn',
  },
  {
    id: 'pt',
    label: 'Português',
    speechLocale: 'pt-PT',
    floresCode: 'por_Latn',
  },
  {
    id: 'pa',
    label: 'Punjabi',
    speechLocale: 'pa-IN',
    floresCode: 'pan_Guru',
  },
  {
    id: 'ro',
    label: 'Romanian',
    speechLocale: 'ro-RO',
    floresCode: 'ron_Latn',
  },
  {
    id: 'sa',
    label: 'Sanskrit',
    speechLocale: 'sa-IN',
    floresCode: 'san_Deva',
  },
  {
    id: 'sr',
    label: 'Serbian',
    speechLocale: 'sr-RS',
    floresCode: 'srp_Cyrl',
  },
  {
    id: 'sn',
    label: 'Shona',
    speechLocale: 'sn-ZW',
    floresCode: 'sna_Latn',
  },
  {
    id: 'sq',
    label: 'Shqip',
    speechLocale: 'sq-AL',
    floresCode: 'als_Latn',
  },
  {
    id: 'sd',
    label: 'Sindhi',
    speechLocale: 'sd-PK',
    floresCode: 'snd_Arab',
  },
  {
    id: 'si',
    label: 'Sinhala',
    speechLocale: 'si-LK',
    floresCode: 'sin_Sinh',
  },
  {
    id: 'sk',
    label: 'Slovak',
    speechLocale: 'sk-SK',
    floresCode: 'slk_Latn',
  },
  {
    id: 'sl',
    label: 'Slovenian',
    speechLocale: 'sl-SI',
    floresCode: 'slv_Latn',
  },
  {
    id: 'so',
    label: 'Somali',
    speechLocale: 'so-SO',
    floresCode: 'som_Latn',
  },
  {
    id: 'su',
    label: 'Sundanese',
    speechLocale: 'su-ID',
    floresCode: 'sun_Latn',
  },
  {
    id: 'sv',
    label: 'Svenska',
    speechLocale: 'sv-SE',
    floresCode: 'swe_Latn',
  },
  {
    id: 'sw',
    label: 'Swahili',
    speechLocale: 'sw-KE',
    floresCode: 'swh_Latn',
  },
  {
    id: 'tl',
    label: 'Tagalog',
    speechLocale: 'tl-PH',
    floresCode: 'tgl_Latn',
  },
  {
    id: 'tg',
    label: 'Tajik',
    speechLocale: 'tg-TJ',
    floresCode: 'tgk_Cyrl',
  },
  {
    id: 'ta',
    label: 'Tamil',
    speechLocale: 'ta-IN',
    floresCode: 'tam_Taml',
  },
  {
    id: 'tt',
    label: 'Tatar',
    speechLocale: 'tt-RU',
    floresCode: 'tat_Cyrl',
  },
  {
    id: 'te',
    label: 'Telugu',
    speechLocale: 'te-IN',
    floresCode: 'tel_Telu',
  },
  {
    id: 'bo',
    label: 'Tibetan',
    speechLocale: 'bo-CN',
    floresCode: 'bod_Tibt',
  },
  {
    id: 'vi',
    label: 'Tiếng Việt',
    speechLocale: 'vi-VN',
    floresCode: 'vie_Latn',
  },
  {
    id: 'tk',
    label: 'Turkmen',
    speechLocale: 'tk-TM',
    floresCode: 'tuk_Latn',
  },
  {
    id: 'tr',
    label: 'Türkçe',
    speechLocale: 'tr-TR',
    floresCode: 'tur_Latn',
  },
  {
    id: 'uk',
    label: 'Ukrainian',
    speechLocale: 'uk-UA',
    floresCode: 'ukr_Cyrl',
  },
  {
    id: 'ur',
    label: 'Urdu',
    speechLocale: 'ur-PK',
    floresCode: 'urd_Arab',
  },
  {
    id: 'uz',
    label: 'Uzbek',
    speechLocale: 'uz-UZ',
    floresCode: 'uzn_Latn',
  },
  {
    id: 'cy',
    label: 'Welsh',
    speechLocale: 'cy-GB',
    floresCode: 'cym_Latn',
  },
  {
    id: 'yi',
    label: 'Yiddish',
    speechLocale: 'yi-IL',
    floresCode: 'ydd_Hebr',
  },
  {
    id: 'yo',
    label: 'Yoruba',
    speechLocale: 'yo-NG',
    floresCode: 'yor_Latn',
  },
  {
    id: 'ru',
    label: 'Русский',
    speechLocale: 'ru-RU',
    floresCode: 'rus_Cyrl',
  },
  {
    id: 'th',
    label: 'ไทย',
    speechLocale: 'th-TH',
    floresCode: 'tha_Thai',
  },
  {
    id: 'zh',
    label: '中文',
    speechLocale: 'zh-CN',
    floresCode: 'zho_Hans',
  },
  {
    id: 'ja',
    label: '日本語',
    speechLocale: 'ja-JP',
    floresCode: 'jpn_Jpan',
  },
  {
    id: 'yue',
    label: '粵語',
    speechLocale: 'yue-HK',
    floresCode: 'yue_Hant',
  },
  {
    id: 'ko',
    label: '한국어',
    speechLocale: 'ko-KR',
    floresCode: 'kor_Hang',
  },
];

export const DEFAULT_INPUT_LANGUAGE: InputLanguageSelection = UNIVERSAL_INPUT;

/** Fallback if device locale is not in the UI list. */
export const FALLBACK_OUTPUT_LANGUAGE = TRADUCTOR_LANGUAGES.find((l) => l.id === 'es') ?? TRADUCTOR_LANGUAGES[0];

export function findTraductorLanguageByLocale(locale: string): TraductorLanguage | undefined {
  const normalized = normalizeLocale(locale);
  return TRADUCTOR_LANGUAGES.find((lang) => normalizeLocale(lang.speechLocale) === normalized);
}

export function findTraductorLanguageById(id: string): TraductorLanguage | undefined {
  return TRADUCTOR_LANGUAGES.find((lang) => lang.id === id);
}

export function resolveDeviceTraductorLanguage(languageTag: string): TraductorLanguage {
  const normalized = languageTag.trim().replace(/_/g, '-').toLowerCase();
  const primary = normalized.split('-')[0] ?? '';
  const byId = findTraductorLanguageById(primary);
  if (byId) return byId;

  const byPrefix = TRADUCTOR_LANGUAGES.find((lang) => normalizeLocale(lang.speechLocale).startsWith(`${primary}-`));
  if (byPrefix) return byPrefix;

  return FALLBACK_OUTPUT_LANGUAGE;
}

/** Fixed product pins; device language is prepended by getRecommendedLanguages. */
export const BASE_RECOMMENDED_LANGUAGE_IDS = ['es', 'ca', 'en'] as const;

/**
 * Device language first, then es/ca/en without duplicates.
 * 3 items when device is already in the base; 4 when device is another catalog language.
 */
export function getRecommendedLanguages(deviceTag: string): TraductorLanguage[] {
  const device = resolveDeviceTraductorLanguage(deviceTag);
  const out: TraductorLanguage[] = [device];
  const seen = new Set<string>([device.id]);

  for (const id of BASE_RECOMMENDED_LANGUAGE_IDS) {
    if (seen.has(id)) continue;
    const lang = findTraductorLanguageById(id);
    if (!lang) continue;
    out.push(lang);
    seen.add(id);
  }

  return out;
}

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, '-').toLowerCase();
}
