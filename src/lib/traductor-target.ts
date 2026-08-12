import {
  findTraductorLanguageById,
  findTraductorLanguageByLocale,
  type TraductorLanguage,
} from '@/constants/traductor-languages';
import type { TraductorMode } from '@/lib/traductor-mode';

function languageIdFromLocale(locale: string): string {
  const byLocale = findTraductorLanguageByLocale(locale);
  if (byLocale) return byLocale.id;
  const prefix = locale.split('-')[0]?.toLowerCase();
  if (prefix) {
    const byId = findTraductorLanguageById(prefix);
    if (byId) return byId.id;
    return prefix;
  }
  return 'und';
}

/**
 * Pick MT target speechLocale for the current mode.
 * Conversation: opposite of the detected pair language; else Idioma 1.
 */
export function resolveTranslationTarget(params: {
  mode: TraductorMode;
  detectedLocale: string;
  languageOne: TraductorLanguage;
  languageTwo: TraductorLanguage;
}): string {
  if (params.mode === 'one_way') return params.languageOne.speechLocale;

  const detectedId = languageIdFromLocale(params.detectedLocale);
  if (detectedId === params.languageOne.id) {
    return params.languageTwo.speechLocale;
  }
  if (detectedId === params.languageTwo.id) {
    return params.languageOne.speechLocale;
  }
  return params.languageOne.speechLocale;
}
