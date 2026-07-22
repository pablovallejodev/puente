import type { SttDownloadState } from "@/hooks/use-offline-stt-download";

export function getMissingInputLocales(
  inputLocales: string[],
  getDownloadState: (locale: string) => SttDownloadState,
): string[] {
  return inputLocales.filter(
    (locale) => getDownloadState(locale).status !== "installed",
  );
}
