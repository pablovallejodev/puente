export type SpeechDisableMode = "abort" | "pause";

/**
 * Mute on an active, hydrated screen → soft pause (drain ASR).
 * Blur / not hydrated → hard abort.
 */
export function resolveSpeechDisableMode(opts: {
  micPaused: boolean;
  isFocused: boolean;
  baseHydrated: boolean;
}): SpeechDisableMode {
  if (opts.micPaused && opts.isFocused && opts.baseHydrated) return "pause";
  return "abort";
}
