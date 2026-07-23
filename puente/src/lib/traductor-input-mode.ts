import {
  MAX_INPUT_LANGUAGES,
  type TraductorLanguage,
} from "@/constants/traductor-languages";
import type { SttDownloadState } from "@/hooks/use-offline-stt-download";

export type InputSttMode = "internet" | "downloaded";

export function isLocaleInstalledState(state: SttDownloadState): boolean {
  return state.status === "installed";
}

export function getInputSttMode(
  inputLanguages: TraductorLanguage[],
  getDownloadState: (locale: string) => SttDownloadState,
  onDeviceAvailable = true,
): InputSttMode {
  if (inputLanguages.length === 0) return "internet";
  if (!onDeviceAvailable) return "internet";
  const allInstalled = inputLanguages.every((lang) =>
    isLocaleInstalledState(getDownloadState(lang.speechLocale)),
  );
  return allInstalled ? "downloaded" : "internet";
}

export function applyInputLanguageSelection(
  prev: TraductorLanguage[],
  lang: TraductorLanguage,
  installed: boolean,
  getDownloadState: (locale: string) => SttDownloadState,
  onDeviceAvailable = true,
): TraductorLanguage[] {
  const trulyInstalled = installed && onDeviceAvailable;
  const mode = getInputSttMode(prev, getDownloadState, onDeviceAvailable);

  if (trulyInstalled) {
    if (mode === "internet") {
      return [lang];
    }
    if (prev.some((item) => item.id === lang.id)) return prev;
    if (prev.length >= MAX_INPUT_LANGUAGES) return prev;
    return [...prev, lang];
  }

  return [lang];
}

export function sanitizeInputLanguages(
  langs: TraductorLanguage[],
  getDownloadState: (locale: string) => SttDownloadState,
  onDeviceAvailable = true,
): TraductorLanguage[] {
  if (langs.length === 0) return langs;

  if (!onDeviceAvailable) {
    return langs.length === 1 ? langs : [langs[0]];
  }

  const mode = getInputSttMode(langs, getDownloadState, onDeviceAvailable);
  if (mode === "internet") {
    return langs.length === 1 ? langs : [langs[0]];
  }

  const installed = langs.filter((lang) =>
    isLocaleInstalledState(getDownloadState(lang.speechLocale)),
  );
  if (installed.length === 0) return [langs[0]];
  return installed;
}

export function removeDownloadedInputLanguage(
  prev: TraductorLanguage[],
  id: string,
  getDownloadState: (locale: string) => SttDownloadState,
  onDeviceAvailable = true,
): TraductorLanguage[] {
  if (prev.length <= 1) return prev;
  if (getInputSttMode(prev, getDownloadState, onDeviceAvailable) !== "downloaded") {
    return prev;
  }
  return prev.filter((lang) => lang.id !== id);
}
