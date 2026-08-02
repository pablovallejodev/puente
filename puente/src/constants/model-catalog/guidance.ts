/**
 * Shared rules for the model catalog — copy and constants the UI and
 * recommenders reuse so cards stay consistent.
 *
 * Peak RAM multipliers used when calibrating models.ts (not applied at
 * runtime; values there are already the max):
 *
 *   ORT Whisper / NLLB   ~2.5× on-disk graphs (arena + KV + dual sessions)
 *   sherpa-onnx          ~2× on-disk (ORT arena inside native)
 *   llama.rn GGUF Q4     ~1.2× on-disk with mmap + small KV (ctx 1024)
 *
 * Device.totalMemory is kernel-visible total, not free RAM. expo-device does
 * not expose availMem; a "12 GB" phone often reports ~10.5–11.5 GB here.
 */

/** Fraction of Device.totalMemory that ASR + MT + VAD may occupy together. */
export const PAIR_BUDGET_FRACTION = 0.35;

/**
 * Headroom already reserved by PAIR_BUDGET_FRACTION (the other 65% covers OS,
 * RN, audio buffers). Kept as documentation — not added again on top of peaks.
 */
export const APP_OVERHEAD_BYTES = 0;

export const GUIDANCE = {
  universalAsr:
    "Necesita detección de idioma: Whisper o SenseVoice. No uses Parakeet en modo Universal.",
  europeanAsr:
    "Europa con idioma fijo: Parakeet suele acertar más y alucinar menos que Whisper.",
  cjkAsr:
    "Chino, japonés, coreano o cantonés: SenseVoice es más rápido y fiable que Whisper en esos idiomas.",
  englishAsr:
    "Solo inglés: Moonshine (media) o Zipformer (baja) responden antes que Whisper.",
  defaultMt:
    "NLLB cubre todos los idiomas de la app; es el traductor por defecto.",
  europeanMt:
    "Pares europeos (incl. catalán, euskera, gallego, occitano): SalamandraTA traduce mejor si hay RAM.",
  pairBudget:
    "La memoria que importa es la suma del transcriptor y del traductor, no cada modelo por separado.",
} as const;
