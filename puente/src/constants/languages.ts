import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

export type Language = {
  code: string;
  label: string;
};

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'ace_Latn', label: 'Acehnese' },
  { code: 'ace_Arab', label: 'Acehnese (Arabic script)' },
  { code: 'afr_Latn', label: 'Afrikaans' },
  { code: 'aka_Latn', label: 'Akan' },
  { code: 'amh_Ethi', label: 'Amharic (Ethiopic)' },
  { code: 'hye_Armn', label: 'Armenian (Armenian)' },
  { code: 'asm_Beng', label: 'Assamese (Bengali)' },
  { code: 'ast_Latn', label: 'Asturian' },
  { code: 'awa_Deva', label: 'Awadhi (Devanagari)' },
  { code: 'quy_Latn', label: 'Ayacucho Quechua' },
  { code: 'ind_Latn', label: 'Bahasa Indonesia' },
  { code: 'ban_Latn', label: 'Balinese' },
  { code: 'bam_Latn', label: 'Bambara' },
  { code: 'bjn_Latn', label: 'Banjar' },
  { code: 'bjn_Arab', label: 'Banjar (Arabic script)' },
  { code: 'jav_Latn', label: 'Basa Jawa' },
  { code: 'bak_Cyrl', label: 'Bashkir (Cyrillic)' },
  { code: 'eus_Latn', label: 'Basque' },
  { code: 'bel_Cyrl', label: 'Belarusian (Cyrillic)' },
  { code: 'bem_Latn', label: 'Bemba' },
  { code: 'bho_Deva', label: 'Bhojpuri (Devanagari)' },
  { code: 'bos_Latn', label: 'Bosnian' },
  { code: 'bug_Latn', label: 'Buginese' },
  { code: 'bul_Cyrl', label: 'Bulgarian (Cyrillic)' },
  { code: 'yue_Hant', label: 'Cantonese (Traditional)' },
  { code: 'cat_Latn', label: 'Catalan' },
  { code: 'ceb_Latn', label: 'Cebuano' },
  { code: 'tzm_Tfng', label: 'Central Atlas Tamazight (Tifinagh)' },
  { code: 'ayr_Latn', label: 'Central Aymara' },
  { code: 'knc_Latn', label: 'Central Kanuri' },
  { code: 'knc_Arab', label: 'Central Kanuri (Arabic script)' },
  { code: 'ckb_Arab', label: 'Central Kurdish (Arabic script)' },
  { code: 'hne_Deva', label: 'Chhattisgarhi (Devanagari)' },
  { code: 'cjk_Latn', label: 'Chokwe' },
  { code: 'crh_Latn', label: 'Crimean Tatar' },
  { code: 'hrv_Latn', label: 'Croatian' },
  { code: 'dan_Latn', label: 'Danish' },
  { code: 'prs_Arab', label: 'Dari (Arabic script)' },
  { code: 'deu_Latn', label: 'Deutsch' },
  { code: 'dyu_Latn', label: 'Dyula' },
  { code: 'dzo_Tibt', label: 'Dzongkha (Tibetan)' },
  { code: 'ydd_Hebr', label: 'Eastern Yiddish (Hebrew)' },
  { code: 'arz_Arab', label: 'Egyptian Arabic (Arabic script)' },
  { code: 'eng_Latn', label: 'English' },
  { code: 'spa_Latn', label: 'Español' },
  { code: 'epo_Latn', label: 'Esperanto' },
  { code: 'est_Latn', label: 'Estonian' },
  { code: 'ewe_Latn', label: 'Ewe' },
  { code: 'fao_Latn', label: 'Faroese' },
  { code: 'fij_Latn', label: 'Fijian' },
  { code: 'fin_Latn', label: 'Finnish' },
  { code: 'fon_Latn', label: 'Fon' },
  { code: 'fra_Latn', label: 'Français' },
  { code: 'fur_Latn', label: 'Friulian' },
  { code: 'glg_Latn', label: 'Galician' },
  { code: 'lug_Latn', label: 'Ganda' },
  { code: 'kat_Geor', label: 'Georgian (Georgian)' },
  { code: 'grn_Latn', label: 'Guarani' },
  { code: 'hat_Latn', label: 'Haitian Creole' },
  { code: 'khk_Cyrl', label: 'Halh Mongolian (Cyrillic)' },
  { code: 'hau_Latn', label: 'Hausa' },
  { code: 'isl_Latn', label: 'Icelandic' },
  { code: 'ibo_Latn', label: 'Igbo' },
  { code: 'ilo_Latn', label: 'Ilocano' },
  { code: 'gle_Latn', label: 'Irish' },
  { code: 'ita_Latn', label: 'Italiano' },
  { code: 'kac_Latn', label: 'Jingpho' },
  { code: 'kbp_Latn', label: 'Kabiyè' },
  { code: 'kea_Latn', label: 'Kabuverdianu' },
  { code: 'kab_Latn', label: 'Kabyle' },
  { code: 'kam_Latn', label: 'Kamba' },
  { code: 'kas_Arab', label: 'Kashmiri (Arabic script)' },
  { code: 'kas_Deva', label: 'Kashmiri (Devanagari)' },
  { code: 'kaz_Cyrl', label: 'Kazakh (Cyrillic)' },
  { code: 'kik_Latn', label: 'Kikuyu' },
  { code: 'kmb_Latn', label: 'Kimbundu' },
  { code: 'kin_Latn', label: 'Kinyarwanda' },
  { code: 'kon_Latn', label: 'Kongo' },
  { code: 'kir_Cyrl', label: 'Kyrgyz (Cyrillic)' },
  { code: 'ltg_Latn', label: 'Latgalian' },
  { code: 'lvs_Latn', label: 'Latvian' },
  { code: 'lij_Latn', label: 'Ligurian' },
  { code: 'lim_Latn', label: 'Limburgish' },
  { code: 'lin_Latn', label: 'Lingala' },
  { code: 'lit_Latn', label: 'Lithuanian' },
  { code: 'lmo_Latn', label: 'Lombard' },
  { code: 'lua_Latn', label: 'Luba-Kasai' },
  { code: 'luo_Latn', label: 'Luo' },
  { code: 'ltz_Latn', label: 'Luxembourgish' },
  { code: 'mkd_Cyrl', label: 'Macedonian (Cyrillic)' },
  { code: 'mag_Deva', label: 'Magahi (Devanagari)' },
  { code: 'hun_Latn', label: 'Magyar' },
  { code: 'mai_Deva', label: 'Maithili (Devanagari)' },
  { code: 'mlt_Latn', label: 'Maltese' },
  { code: 'mri_Latn', label: 'Maori' },
  { code: 'mni_Beng', label: 'Meitei (Bengali)' },
  { code: 'acm_Arab', label: 'Mesopotamian Arabic (Arabic script)' },
  { code: 'min_Latn', label: 'Minangkabau' },
  { code: 'lus_Latn', label: 'Mizo' },
  { code: 'ary_Arab', label: 'Moroccan Arabic (Arabic script)' },
  { code: 'mos_Latn', label: 'Mossi' },
  { code: 'ars_Arab', label: 'Najdi Arabic (Arabic script)' },
  { code: 'nld_Latn', label: 'Nederlands' },
  { code: 'fuv_Latn', label: 'Nigerian Fulfulde' },
  { code: 'azj_Latn', label: 'North Azerbaijani' },
  { code: 'apc_Arab', label: 'North Levantine Arabic (Arabic script)' },
  { code: 'kmr_Latn', label: 'Northern Kurdish' },
  { code: 'nso_Latn', label: 'Northern Sotho' },
  { code: 'uzn_Latn', label: 'Northern Uzbek' },
  { code: 'nob_Latn', label: 'Norwegian Bokmål' },
  { code: 'nno_Latn', label: 'Norwegian Nynorsk' },
  { code: 'nus_Latn', label: 'Nuer' },
  { code: 'nya_Latn', label: 'Nyanja' },
  { code: 'oci_Latn', label: 'Occitan' },
  { code: 'ory_Orya', label: 'Odia (Odia)' },
  { code: 'pag_Latn', label: 'Pangasinan' },
  { code: 'pap_Latn', label: 'Papiamento' },
  { code: 'plt_Latn', label: 'Plateau Malagasy' },
  { code: 'pol_Latn', label: 'Polski' },
  { code: 'por_Latn', label: 'Português' },
  { code: 'ron_Latn', label: 'Română' },
  { code: 'run_Latn', label: 'Rundi' },
  { code: 'smo_Latn', label: 'Samoan' },
  { code: 'sag_Latn', label: 'Sango' },
  { code: 'san_Deva', label: 'Sanskrit (Devanagari)' },
  { code: 'sat_Beng', label: 'Santali (Bengali)' },
  { code: 'srd_Latn', label: 'Sardinian' },
  { code: 'gla_Latn', label: 'Scottish Gaelic' },
  { code: 'srp_Cyrl', label: 'Serbian (Cyrillic)' },
  { code: 'shn_Mymr', label: 'Shan (Myanmar)' },
  { code: 'sna_Latn', label: 'Shona' },
  { code: 'scn_Latn', label: 'Sicilian' },
  { code: 'szl_Latn', label: 'Silesian' },
  { code: 'snd_Arab', label: 'Sindhi (Arabic script)' },
  { code: 'slk_Latn', label: 'Slovak' },
  { code: 'slv_Latn', label: 'Slovenian' },
  { code: 'som_Latn', label: 'Somali' },
  { code: 'azb_Arab', label: 'South Azerbaijani (Arabic script)' },
  { code: 'ajp_Arab', label: 'South Levantine Arabic (Arabic script)' },
  { code: 'pbt_Arab', label: 'Southern Pashto (Arabic script)' },
  { code: 'sot_Latn', label: 'Southern Sotho' },
  { code: 'dik_Latn', label: 'Southwestern Dinka' },
  { code: 'zsm_Latn', label: 'Standard Malay' },
  { code: 'sun_Latn', label: 'Sundanese' },
  { code: 'swe_Latn', label: 'Svenska' },
  { code: 'swh_Latn', label: 'Swahili' },
  { code: 'ssw_Latn', label: 'Swati' },
  { code: 'acq_Arab', label: 'Ta\'izzi-Adeni Arabic (Arabic script)' },
  { code: 'tgl_Latn', label: 'Tagalog' },
  { code: 'tgk_Cyrl', label: 'Tajik (Cyrillic)' },
  { code: 'taq_Latn', label: 'Tamasheq' },
  { code: 'taq_Tfng', label: 'Tamasheq (Tifinagh)' },
  { code: 'tat_Cyrl', label: 'Tatar (Cyrillic)' },
  { code: 'bod_Tibt', label: 'Tibetan (Tibetan)' },
  { code: 'tir_Ethi', label: 'Tigrinya (Ethiopic)' },
  { code: 'vie_Latn', label: 'Tiếng Việt' },
  { code: 'tpi_Latn', label: 'Tok Pisin' },
  { code: 'als_Latn', label: 'Tosk Albanian' },
  { code: 'tso_Latn', label: 'Tsonga' },
  { code: 'tsn_Latn', label: 'Tswana' },
  { code: 'tum_Latn', label: 'Tumbuka' },
  { code: 'aeb_Arab', label: 'Tunisian Arabic (Arabic script)' },
  { code: 'tuk_Latn', label: 'Turkmen' },
  { code: 'twi_Latn', label: 'Twi' },
  { code: 'tur_Latn', label: 'Türkçe' },
  { code: 'umb_Latn', label: 'Umbundu' },
  { code: 'uig_Arab', label: 'Uyghur (Arabic script)' },
  { code: 'vec_Latn', label: 'Venetian' },
  { code: 'war_Latn', label: 'Waray' },
  { code: 'cym_Latn', label: 'Welsh' },
  { code: 'gaz_Latn', label: 'West Central Oromo' },
  { code: 'wol_Latn', label: 'Wolof' },
  { code: 'xho_Latn', label: 'Xhosa' },
  { code: 'yor_Latn', label: 'Yoruba' },
  { code: 'zul_Latn', label: 'Zulu' },
  { code: 'ces_Latn', label: 'Čeština' },
  { code: 'ell_Grek', label: 'Ελληνικά' },
  { code: 'rus_Cyrl', label: 'Русский' },
  { code: 'ukr_Cyrl', label: 'Українська' },
  { code: 'heb_Hebr', label: 'עברית' },
  { code: 'urd_Arab', label: 'اردو' },
  { code: 'arb_Arab', label: 'العربية' },
  { code: 'pes_Arab', label: 'فارسی' },
  { code: 'npi_Deva', label: 'नेपाली' },
  { code: 'mar_Deva', label: 'मराठी' },
  { code: 'hin_Deva', label: 'हिन्दी' },
  { code: 'ben_Beng', label: 'বাংলা' },
  { code: 'pan_Guru', label: 'ਪੰਜਾਬੀ' },
  { code: 'guj_Gujr', label: 'ગુજરાતી' },
  { code: 'tam_Taml', label: 'தமிழ்' },
  { code: 'tel_Telu', label: 'తెలుగు' },
  { code: 'kan_Knda', label: 'ಕನ್ನಡ' },
  { code: 'mal_Mlym', label: 'മലയാളം' },
  { code: 'sin_Sinh', label: 'සිංහල' },
  { code: 'tha_Thai', label: 'ไทย' },
  { code: 'lao_Laoo', label: 'ລາວ' },
  { code: 'mya_Mymr', label: 'မြန်မာ' },
  { code: 'khm_Khmr', label: 'ខ្មែរ' },
  { code: 'zho_Hans', label: '中文 (简体)' },
  { code: 'zho_Hant', label: '中文 (繁體)' },
  { code: 'jpn_Jpan', label: '日本語' },
  { code: 'kor_Hang', label: '한국어' },

];

const LANGUAGE_BY_CODE = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));
const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));

const ISO639_1_TO_FLORES: Record<string, string> = {
  af: 'afr_Latn',
  am: 'amh_Ethi',
  ar: 'arb_Arab',
  az: 'azj_Latn',
  be: 'bel_Cyrl',
  bg: 'bul_Cyrl',
  bn: 'ben_Beng',
  bs: 'bos_Latn',
  ca: 'cat_Latn',
  cs: 'ces_Latn',
  cy: 'cym_Latn',
  da: 'dan_Latn',
  de: 'deu_Latn',
  el: 'ell_Grek',
  en: 'eng_Latn',
  es: 'spa_Latn',
  et: 'est_Latn',
  eu: 'eus_Latn',
  fa: 'pes_Arab',
  fi: 'fin_Latn',
  fil: 'tgl_Latn',
  fr: 'fra_Latn',
  ga: 'gle_Latn',
  gd: 'gla_Latn',
  gl: 'glg_Latn',
  gu: 'guj_Gujr',
  he: 'heb_Hebr',
  hi: 'hin_Deva',
  hr: 'hrv_Latn',
  hu: 'hun_Latn',
  hy: 'hye_Armn',
  id: 'ind_Latn',
  is: 'isl_Latn',
  it: 'ita_Latn',
  iw: 'heb_Hebr',
  ja: 'jpn_Jpan',
  jv: 'jav_Latn',
  ka: 'kat_Geor',
  kk: 'kaz_Cyrl',
  km: 'khm_Khmr',
  kn: 'kan_Knda',
  ko: 'kor_Hang',
  lo: 'lao_Laoo',
  lt: 'lit_Latn',
  lv: 'lvs_Latn',
  mk: 'mkd_Cyrl',
  ml: 'mal_Mlym',
  mn: 'khk_Cyrl',
  mr: 'mar_Deva',
  ms: 'zsm_Latn',
  my: 'mya_Mymr',
  nb: 'nob_Latn',
  ne: 'npi_Deva',
  nl: 'nld_Latn',
  nn: 'nno_Latn',
  pa: 'pan_Guru',
  pl: 'pol_Latn',
  ps: 'pbt_Arab',
  pt: 'por_Latn',
  ro: 'ron_Latn',
  ru: 'rus_Cyrl',
  si: 'sin_Sinh',
  sk: 'slk_Latn',
  sl: 'slv_Latn',
  sq: 'als_Latn',
  sr: 'srp_Cyrl',
  sv: 'swe_Latn',
  sw: 'swh_Latn',
  ta: 'tam_Taml',
  te: 'tel_Telu',
  th: 'tha_Thai',
  tl: 'tgl_Latn',
  tr: 'tur_Latn',
  uk: 'ukr_Cyrl',
  ur: 'urd_Arab',
  vi: 'vie_Latn',
  yo: 'yor_Latn',
  zh: 'zho_Hans',
  zu: 'zul_Latn',
};

function resolveChineseFlores(locale: string): string {
  const normalized = locale.toLowerCase();
  if (normalized.includes('hant') || /-(tw|hk|mo)(-|$)/.test(normalized)) {
    return 'zho_Hant';
  }
  if (normalized.includes('hans') || /-(cn|sg)(-|$)/.test(normalized)) {
    return 'zho_Hans';
  }
  return 'zho_Hans';
}

function findByLanguagePrefix(prefix: string): string | null {
  const match = SUPPORTED_LANGUAGES.find((language) => language.code.startsWith(`${prefix}_`));
  return match?.code ?? null;
}

export function getLanguageLabel(code: string): string {
  return LANGUAGE_BY_CODE.get(code)?.label ?? code;
}

export function mapSpeechLocaleToFlores(detectedLocale: string): string | null {
  const normalized = detectedLocale.trim().replace(/_/g, '-');
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const [primary] = lower.split('-');

  if (primary === 'zh' || primary === 'yue') {
    const chinese = primary === 'yue' ? 'yue_Hant' : resolveChineseFlores(lower);
    return SUPPORTED_CODES.has(chinese) ? chinese : null;
  }

  const isoMatch = ISO639_1_TO_FLORES[primary];
  if (isoMatch && SUPPORTED_CODES.has(isoMatch)) {
    return isoMatch;
  }

  const prefixMatch = findByLanguagePrefix(primary);
  if (prefixMatch) {
    return prefixMatch;
  }

  return null;
}

export function getDeviceLocaleTag(): string {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.language;
  }

  return getLocales()[0]?.languageTag ?? 'en';
}

export function resolveDeviceBaseLanguage(): string {
  const mapped = mapSpeechLocaleToFlores(getDeviceLocaleTag());
  return mapped && SUPPORTED_CODES.has(mapped) ? mapped : 'eng_Latn';
}
