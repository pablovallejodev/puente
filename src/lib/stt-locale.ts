export function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

/** BCP-47 exact match only — regional variants are not interchangeable. */
export function localeMatches(installed: string, target: string): boolean {
  return normalizeLocale(installed) === normalizeLocale(target);
}

export function isLocaleInstalled(
  installedLocales: string[],
  locale: string,
): boolean {
  return installedLocales.some((installed) =>
    localeMatches(installed, locale),
  );
}

export function isLocaleSupported(
  supportedLocales: string[],
  locale: string,
): boolean {
  return supportedLocales.some((supported) =>
    localeMatches(supported, locale),
  );
}
