/**
 * Single acceptance boundary for Whisper transcripts before UI / NLLB.
 * Strips bracket annotations ([risas], [música], …) and requires real letters.
 */

const HAS_LETTER = /\p{L}/u;

/** Remove bracket annotations and collapse whitespace. */
export function stripBracketAnnotations(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[") {
      const end = text.indexOf("]", i + 1);
      if (end === -1) {
        out += text[i];
      } else {
        out += " ";
        i = end;
      }
      continue;
    }
    out += text[i];
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Returns cleaned speech text, or null when there is nothing worth translating.
 * Examples: "[risas]" → null; "Hola [risas]" → "Hola"; "..." → null.
 */
export function acceptTranscript(text: string): string | null {
  const cleaned = stripBracketAnnotations(text);
  if (!cleaned) return null;
  if (!HAS_LETTER.test(cleaned)) return null;
  return cleaned;
}
