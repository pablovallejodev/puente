/**
 * User-facing model modes: fixed ASR+MT pairs, plus Personalizado.
 *
 * Active mode is derived from the selected pair — never persisted separately.
 * Peak RAM helpers live in index.ts (they need the catalog lookup).
 */

export type PresetModeId = 'universal' | 'europeo' | 'asiatico' | 'bajos-recursos';

export type ModelModeId = PresetModeId | 'personalizado';

export type PresetMode = {
  id: PresetModeId;
  label: string;
  /** Optional secondary line under the label (e.g. "Ultra rápido"). */
  subtitle?: string;
  asrId: string;
  mtId: string;
};

export const PRESET_MODES: readonly PresetMode[] = [
  {
    id: 'universal',
    label: 'Universal',
    asrId: 'sherpa-whisper-turbo-int8',
    mtId: 'nllb-600m-q8',
  },
  {
    id: 'europeo',
    label: 'Europeo',
    asrId: 'sherpa-whisper-turbo-int8',
    mtId: 'salamandrata-2b-instruct-q4',
  },
  {
    id: 'asiatico',
    label: 'Asiático',
    asrId: 'sherpa-sense-voice-multi-int8',
    mtId: 'nllb-600m-q8',
  },
  {
    id: 'bajos-recursos',
    label: 'Bajos recursos',
    subtitle: 'Ultra rápido',
    asrId: 'whisper-base-q',
    mtId: 'nllb-600m-q8',
  },
] as const;

/**
 * Which mode button should look active given the current selection.
 * Incomplete pairs → null (nothing selected yet).
 */
export function resolveActiveMode(selectedAsr: string | null, selectedMt: string | null): ModelModeId | null {
  if (!selectedAsr || !selectedMt) return null;
  const preset = PRESET_MODES.find((m) => m.asrId === selectedAsr && m.mtId === selectedMt);
  return preset?.id ?? 'personalizado';
}
