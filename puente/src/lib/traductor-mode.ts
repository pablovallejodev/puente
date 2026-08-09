/** Product translator modes on the main screen. */
export type TraductorMode = "one_way" | "conversation";

export const DEFAULT_TRADUCTOR_MODE: TraductorMode = "one_way";

export function parseTraductorMode(raw: string | null): TraductorMode | null {
  if (raw === "one_way" || raw === "conversation") return raw;
  return null;
}
