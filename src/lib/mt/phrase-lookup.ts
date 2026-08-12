/**
 * Short-phrase override for machine translation.
 *
 * NLLB (and most neural MT) is weak on single words and fixed greetings: it
 * invents context that is not there. A tiny offline table of human translations
 * — greetings, courtesy, yes/no, travel basics — catches those before any model
 * runs. Exact match only; anything longer or unknown falls through to the
 * engine. Seeded from high-frequency conversational forms (Tatoeba / common
 * travel glossaries), not a full dictionary.
 *
 * Expand the table, do not grow the matching logic: fuzzy match and stemming
 * would invent false positives mid-conversation, which is worse than letting
 * the neural model try.
 */

import { findTraductorLanguageByLocale } from '@/constants/traductor-languages';

/** Maximum tokens (whitespace-split) that still qualify as a "short phrase". */
const MAX_WORDS = 4;

type PhrasePair = {
  /** Normalised source text (lowercase, no trailing punctuation). */
  src: string;
  /** Target language id (ISO 639-1 / app id). */
  tgt: string;
  /** Human translation. */
  out: string;
};

/**
 * Seed table. Keys are language-id pairs `srcId|tgtId` → list of phrases.
 *
 * Kept inline (not a downloaded asset) so the override works with zero
 * network and zero setup. A few hundred entries cover the failure mode;
 * full-dictionary scale belongs in a future downloadable pack.
 */
const PHRASES: Record<string, PhrasePair[]> = buildIndex([
  // English ↔ Spanish
  ['en', 'es', 'hello', 'hola'],
  ['en', 'es', 'hi', 'hola'],
  ['en', 'es', 'good morning', 'buenos días'],
  ['en', 'es', 'good afternoon', 'buenas tardes'],
  ['en', 'es', 'good evening', 'buenas noches'],
  ['en', 'es', 'good night', 'buenas noches'],
  ['en', 'es', 'goodbye', 'adiós'],
  ['en', 'es', 'bye', 'adiós'],
  ['en', 'es', 'please', 'por favor'],
  ['en', 'es', 'thank you', 'gracias'],
  ['en', 'es', 'thanks', 'gracias'],
  ['en', 'es', "you're welcome", 'de nada'],
  ['en', 'es', 'yes', 'sí'],
  ['en', 'es', 'no', 'no'],
  ['en', 'es', 'excuse me', 'perdón'],
  ['en', 'es', 'sorry', 'lo siento'],
  ['en', 'es', 'how are you', '¿cómo estás?'],
  ['en', 'es', "what's your name", '¿cómo te llamas?'],
  ['en', 'es', 'my name is', 'me llamo'],
  ['en', 'es', "i don't understand", 'no entiendo'],
  ['en', 'es', 'do you speak english', '¿hablas inglés?'],
  ['en', 'es', 'where is the bathroom', '¿dónde está el baño?'],
  ['en', 'es', 'how much is it', '¿cuánto cuesta?'],
  ['en', 'es', 'help', 'ayuda'],
  ['en', 'es', 'water', 'agua'],
  ['en', 'es', 'food', 'comida'],
  ['es', 'en', 'hola', 'hello'],
  ['es', 'en', 'buenos días', 'good morning'],
  ['es', 'en', 'buenas tardes', 'good afternoon'],
  ['es', 'en', 'buenas noches', 'good night'],
  ['es', 'en', 'adiós', 'goodbye'],
  ['es', 'en', 'por favor', 'please'],
  ['es', 'en', 'gracias', 'thank you'],
  ['es', 'en', 'de nada', "you're welcome"],
  ['es', 'en', 'sí', 'yes'],
  ['es', 'en', 'no', 'no'],
  ['es', 'en', 'perdón', 'excuse me'],
  ['es', 'en', 'lo siento', 'sorry'],
  ['es', 'en', 'cómo estás', 'how are you'],
  ['es', 'en', 'cómo te llamas', "what's your name"],
  ['es', 'en', 'me llamo', 'my name is'],
  ['es', 'en', 'no entiendo', "i don't understand"],
  ['es', 'en', 'hablas inglés', 'do you speak english'],
  ['es', 'en', 'dónde está el baño', 'where is the bathroom'],
  ['es', 'en', 'cuánto cuesta', 'how much is it'],
  ['es', 'en', 'ayuda', 'help'],
  ['es', 'en', 'agua', 'water'],
  ['es', 'en', 'comida', 'food'],

  // English ↔ French
  ['en', 'fr', 'hello', 'bonjour'],
  ['en', 'fr', 'hi', 'salut'],
  ['en', 'fr', 'good morning', 'bonjour'],
  ['en', 'fr', 'good evening', 'bonsoir'],
  ['en', 'fr', 'goodbye', 'au revoir'],
  ['en', 'fr', 'please', "s'il vous plaît"],
  ['en', 'fr', 'thank you', 'merci'],
  ['en', 'fr', 'thanks', 'merci'],
  ['en', 'fr', "you're welcome", 'de rien'],
  ['en', 'fr', 'yes', 'oui'],
  ['en', 'fr', 'no', 'non'],
  ['en', 'fr', 'excuse me', 'excusez-moi'],
  ['en', 'fr', 'sorry', 'désolé'],
  ['en', 'fr', 'how are you', 'comment allez-vous'],
  ['en', 'fr', "i don't understand", 'je ne comprends pas'],
  ['en', 'fr', 'where is the bathroom', 'où sont les toilettes'],
  ['en', 'fr', 'help', 'aide'],
  ['fr', 'en', 'bonjour', 'hello'],
  ['fr', 'en', 'salut', 'hi'],
  ['fr', 'en', 'bonsoir', 'good evening'],
  ['fr', 'en', 'au revoir', 'goodbye'],
  ['fr', 'en', "s'il vous plaît", 'please'],
  ['fr', 'en', 'merci', 'thank you'],
  ['fr', 'en', 'de rien', "you're welcome"],
  ['fr', 'en', 'oui', 'yes'],
  ['fr', 'en', 'non', 'no'],
  ['fr', 'en', 'excusez-moi', 'excuse me'],
  ['fr', 'en', 'désolé', 'sorry'],
  ['fr', 'en', 'comment allez-vous', 'how are you'],
  ['fr', 'en', 'je ne comprends pas', "i don't understand"],
  ['fr', 'en', 'où sont les toilettes', 'where is the bathroom'],
  ['fr', 'en', 'aide', 'help'],

  // English ↔ German
  ['en', 'de', 'hello', 'hallo'],
  ['en', 'de', 'good morning', 'guten morgen'],
  ['en', 'de', 'good evening', 'guten abend'],
  ['en', 'de', 'goodbye', 'auf wiedersehen'],
  ['en', 'de', 'please', 'bitte'],
  ['en', 'de', 'thank you', 'danke'],
  ['en', 'de', 'thanks', 'danke'],
  ['en', 'de', "you're welcome", 'bitte'],
  ['en', 'de', 'yes', 'ja'],
  ['en', 'de', 'no', 'nein'],
  ['en', 'de', 'excuse me', 'entschuldigung'],
  ['en', 'de', 'sorry', 'tut mir leid'],
  ['en', 'de', 'how are you', "wie geht's"],
  ['en', 'de', "i don't understand", 'ich verstehe nicht'],
  ['en', 'de', 'where is the bathroom', 'wo ist die toilette'],
  ['en', 'de', 'help', 'hilfe'],
  ['de', 'en', 'hallo', 'hello'],
  ['de', 'en', 'guten morgen', 'good morning'],
  ['de', 'en', 'guten abend', 'good evening'],
  ['de', 'en', 'auf wiedersehen', 'goodbye'],
  ['de', 'en', 'bitte', 'please'],
  ['de', 'en', 'danke', 'thank you'],
  ['de', 'en', 'ja', 'yes'],
  ['de', 'en', 'nein', 'no'],
  ['de', 'en', 'entschuldigung', 'excuse me'],
  ['de', 'en', 'tut mir leid', 'sorry'],
  ['de', 'en', "wie geht's", 'how are you'],
  ['de', 'en', 'ich verstehe nicht', "i don't understand"],
  ['de', 'en', 'wo ist die toilette', 'where is the bathroom'],
  ['de', 'en', 'hilfe', 'help'],

  // English ↔ Portuguese
  ['en', 'pt', 'hello', 'olá'],
  ['en', 'pt', 'good morning', 'bom dia'],
  ['en', 'pt', 'good evening', 'boa noite'],
  ['en', 'pt', 'goodbye', 'adeus'],
  ['en', 'pt', 'please', 'por favor'],
  ['en', 'pt', 'thank you', 'obrigado'],
  ['en', 'pt', 'thanks', 'obrigado'],
  ['en', 'pt', 'yes', 'sim'],
  ['en', 'pt', 'no', 'não'],
  ['en', 'pt', 'excuse me', 'com licença'],
  ['en', 'pt', 'sorry', 'desculpe'],
  ['en', 'pt', 'how are you', 'como vai'],
  ['en', 'pt', "i don't understand", 'não entendo'],
  ['en', 'pt', 'help', 'ajuda'],
  ['pt', 'en', 'olá', 'hello'],
  ['pt', 'en', 'bom dia', 'good morning'],
  ['pt', 'en', 'boa noite', 'good evening'],
  ['pt', 'en', 'adeus', 'goodbye'],
  ['pt', 'en', 'por favor', 'please'],
  ['pt', 'en', 'obrigado', 'thank you'],
  ['pt', 'en', 'obrigada', 'thank you'],
  ['pt', 'en', 'sim', 'yes'],
  ['pt', 'en', 'não', 'no'],
  ['pt', 'en', 'com licença', 'excuse me'],
  ['pt', 'en', 'desculpe', 'sorry'],
  ['pt', 'en', 'como vai', 'how are you'],
  ['pt', 'en', 'não entendo', "i don't understand"],
  ['pt', 'en', 'ajuda', 'help'],

  // English ↔ Italian
  ['en', 'it', 'hello', 'ciao'],
  ['en', 'it', 'good morning', 'buongiorno'],
  ['en', 'it', 'good evening', 'buonasera'],
  ['en', 'it', 'goodbye', 'arrivederci'],
  ['en', 'it', 'please', 'per favore'],
  ['en', 'it', 'thank you', 'grazie'],
  ['en', 'it', 'thanks', 'grazie'],
  ['en', 'it', "you're welcome", 'prego'],
  ['en', 'it', 'yes', 'sì'],
  ['en', 'it', 'no', 'no'],
  ['en', 'it', 'excuse me', 'scusi'],
  ['en', 'it', 'sorry', 'mi dispiace'],
  ['en', 'it', 'how are you', 'come stai'],
  ['en', 'it', "i don't understand", 'non capisco'],
  ['en', 'it', 'help', 'aiuto'],
  ['it', 'en', 'ciao', 'hello'],
  ['it', 'en', 'buongiorno', 'good morning'],
  ['it', 'en', 'buonasera', 'good evening'],
  ['it', 'en', 'arrivederci', 'goodbye'],
  ['it', 'en', 'per favore', 'please'],
  ['it', 'en', 'grazie', 'thank you'],
  ['it', 'en', 'prego', "you're welcome"],
  ['it', 'en', 'sì', 'yes'],
  ['it', 'en', 'no', 'no'],
  ['it', 'en', 'scusi', 'excuse me'],
  ['it', 'en', 'mi dispiace', 'sorry'],
  ['it', 'en', 'come stai', 'how are you'],
  ['it', 'en', 'non capisco', "i don't understand"],
  ['it', 'en', 'aiuto', 'help'],

  // Spanish ↔ Catalan (high value for this project)
  ['es', 'ca', 'hola', 'hola'],
  ['es', 'ca', 'buenos días', 'bon dia'],
  ['es', 'ca', 'buenas tardes', 'bona tarda'],
  ['es', 'ca', 'buenas noches', 'bona nit'],
  ['es', 'ca', 'adiós', 'adéu'],
  ['es', 'ca', 'por favor', 'si us plau'],
  ['es', 'ca', 'gracias', 'gràcies'],
  ['es', 'ca', 'de nada', 'de res'],
  ['es', 'ca', 'sí', 'sí'],
  ['es', 'ca', 'no', 'no'],
  ['es', 'ca', 'perdón', 'perdó'],
  ['es', 'ca', 'lo siento', 'ho sento'],
  ['es', 'ca', 'cómo estás', 'com estàs'],
  ['es', 'ca', 'no entiendo', 'no entenc'],
  ['es', 'ca', 'ayuda', 'ajuda'],
  ['ca', 'es', 'hola', 'hola'],
  ['ca', 'es', 'bon dia', 'buenos días'],
  ['ca', 'es', 'bona tarda', 'buenas tardes'],
  ['ca', 'es', 'bona nit', 'buenas noches'],
  ['ca', 'es', 'adéu', 'adiós'],
  ['ca', 'es', 'si us plau', 'por favor'],
  ['ca', 'es', 'gràcies', 'gracias'],
  ['ca', 'es', 'de res', 'de nada'],
  ['ca', 'es', 'sí', 'sí'],
  ['ca', 'es', 'no', 'no'],
  ['ca', 'es', 'perdó', 'perdón'],
  ['ca', 'es', 'ho sento', 'lo siento'],
  ['ca', 'es', 'com estàs', 'cómo estás'],
  ['ca', 'es', 'no entenc', 'no entiendo'],
  ['ca', 'es', 'ajuda', 'ayuda'],

  // English ↔ Catalan
  ['en', 'ca', 'hello', 'hola'],
  ['en', 'ca', 'good morning', 'bon dia'],
  ['en', 'ca', 'goodbye', 'adéu'],
  ['en', 'ca', 'please', 'si us plau'],
  ['en', 'ca', 'thank you', 'gràcies'],
  ['en', 'ca', 'yes', 'sí'],
  ['en', 'ca', 'no', 'no'],
  ['en', 'ca', 'help', 'ajuda'],
  ['ca', 'en', 'hola', 'hello'],
  ['ca', 'en', 'bon dia', 'good morning'],
  ['ca', 'en', 'adéu', 'goodbye'],
  ['ca', 'en', 'si us plau', 'please'],
  ['ca', 'en', 'gràcies', 'thank you'],
  ['ca', 'en', 'sí', 'yes'],
  ['ca', 'en', 'no', 'no'],
  ['ca', 'en', 'ajuda', 'help'],
]);

function buildIndex(rows: [string, string, string, string][]): Record<string, PhrasePair[]> {
  const index: Record<string, PhrasePair[]> = {};
  for (const [srcLang, tgtLang, src, out] of rows) {
    const key = `${srcLang}|${tgtLang}`;
    const list = index[key] ?? (index[key] = []);
    list.push({ src: normalizePhrase(src), tgt: tgtLang, out });
  }
  return index;
}

/**
 * Strip punctuation and collapse whitespace so "¡Hola!" and "hola" match.
 * Accents are kept: "sí" ≠ "si", and collapsing them would create collisions.
 */
export function normalizePhrase(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[¿?¡!.,;:…""''«»()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(normalized: string): number {
  if (!normalized) return 0;
  return normalized.split(' ').length;
}

/**
 * Look up a short phrase before invoking a neural translator.
 *
 * Returns null when the text is too long, the language pair is unknown, or
 * there is no exact match — the caller then runs the model as usual.
 */
export function lookupPhrase(text: string, srcLocale: string, tgtLocale: string): string | null {
  const src = findTraductorLanguageByLocale(srcLocale);
  const tgt = findTraductorLanguageByLocale(tgtLocale);
  if (!src || !tgt || src.id === tgt.id) return null;

  const normalized = normalizePhrase(text);
  if (!normalized) return null;
  if (wordCount(normalized) > MAX_WORDS) return null;

  const list = PHRASES[`${src.id}|${tgt.id}`];
  if (!list) return null;

  for (const entry of list) {
    if (entry.src === normalized) return entry.out;
  }
  return null;
}

/** Exposed for the self-check script. */
export function phrasePairCount(): number {
  let total = 0;
  for (const list of Object.values(PHRASES)) total += list.length;
  return total;
}
