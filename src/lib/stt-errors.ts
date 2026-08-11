export type SttErrorCode =
  | "STT_FETCH_LOCALES_FAILED"
  | "STT_REFRESH_FAILED"
  | "STT_CHECK_FAILED"
  | "STT_DOWNLOAD_UNAVAILABLE"
  | "STT_LOCALE_NOT_SUPPORTED"
  | "STT_DOWNLOAD_TRIGGER_FAILED"
  | "STT_POLL_TIMEOUT"
  | "STT_IOS_ON_DEVICE_UNAVAILABLE"
  | "STT_ON_DEVICE_UNAVAILABLE"
  | "STT_OFFLINE_MODELS_MISSING";

export type SttError = { code: SttErrorCode; message: string };

export function sttError(code: SttErrorCode, message: string): SttError {
  return { code, message };
}

export function formatSttError(e: SttError): string {
  return `[${e.code}] ${e.message}`;
}
