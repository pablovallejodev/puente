import type { InputLanguageSelection } from '@/constants/traductor-languages';

export type LanguagePickerSlot = 'input' | 'output' | 'lang2';

export type OccupiedLanguageIds = {
  input?: string;
  output: string;
  lang2: string;
};

/** Fixed language ids across slots. Universal occupies nothing. */
export function occupiedLanguageIds(snapshot: {
  inputLanguage: InputLanguageSelection;
  languageOneId: string;
  languageTwoId: string;
}): OccupiedLanguageIds {
  const occupied: OccupiedLanguageIds = {
    output: snapshot.languageOneId,
    lang2: snapshot.languageTwoId,
  };
  if (snapshot.inputLanguage.kind === 'fixed') {
    occupied.input = snapshot.inputLanguage.language.id;
  }
  return occupied;
}

/** Ids to hide while editing `slot` (current slot's id stays visible). */
export function blockedLanguageIdsForSlot(slot: LanguagePickerSlot, occupied: OccupiedLanguageIds): Set<string> {
  const blocked = new Set<string>();
  if (slot !== 'input' && occupied.input) blocked.add(occupied.input);
  if (slot !== 'output') blocked.add(occupied.output);
  if (slot !== 'lang2') blocked.add(occupied.lang2);
  return blocked;
}
