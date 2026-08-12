import {
  FALLBACK_OUTPUT_LANGUAGE,
  findTraductorLanguageById,
  TRADUCTOR_LANGUAGES,
  type TraductorLanguage,
} from '@/constants/traductor-languages';

/** De-facto Idioma 2 defaults: Catalán, then Español. */
export const LANGUAGE_TWO_DEFAULT_IDS = ['ca', 'es'] as const;

export function resolveDefaultLanguageTwo(languageOneId: string): TraductorLanguage {
  for (const id of LANGUAGE_TWO_DEFAULT_IDS) {
    if (id === languageOneId) continue;
    const lang = findTraductorLanguageById(id);
    if (lang) return lang;
  }
  return TRADUCTOR_LANGUAGES.find((lang) => lang.id !== languageOneId) ?? FALLBACK_OUTPUT_LANGUAGE;
}

/** Prefer a saved id when valid and not colliding with Idioma 1. */
export function resolveLanguageTwo(savedId: string | null, languageOneId: string): TraductorLanguage {
  if (savedId && savedId !== languageOneId) {
    const saved = findTraductorLanguageById(savedId);
    if (saved) return saved;
  }
  return resolveDefaultLanguageTwo(languageOneId);
}
