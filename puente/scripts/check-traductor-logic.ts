import assert from "node:assert/strict";

import {
  FALLBACK_OUTPUT_LANGUAGE,
  findTraductorLanguageById,
  findTraductorLanguageByLocale,
  resolveDeviceTraductorLanguage,
  TRADUCTOR_LANGUAGES,
  UNIVERSAL_INPUT,
  type InputLanguageSelection,
} from "../src/constants/traductor-languages";
import {
  speechLocaleToWhisperLang,
  whisperLangToSpeechLocale,
  UNIVERSAL_CANDIDATE_LANGS,
} from "../src/constants/whisper-languages";
import {
  LANG_DETECT_MIN_PROB,
  softmaxLangAmong,
} from "../src/lib/whisper-inference";
import type { OrtTensor } from "../src/lib/nllb-inference";
import {
  isLocaleInstalled,
  isLocaleSupported,
  localeMatches,
  normalizeLocale,
} from "../src/lib/stt-locale";
import { formatSttError, sttError } from "../src/lib/stt-errors";
import { getMissingInputLocales } from "../src/lib/traductor-offline";

function testLocaleMatching(): void {
  assert.equal(normalizeLocale("en_US"), "en-us");
  assert.equal(localeMatches("en-GB", "en-gb"), true);
  assert.equal(localeMatches("en-GB", "en-US"), false);
  assert.equal(isLocaleInstalled(["en-GB", "es-ES"], "en-US"), false);
  assert.equal(isLocaleInstalled(["en-GB", "es-ES"], "en-GB"), true);
  assert.equal(isLocaleSupported(["ca-ES"], "ca-ES"), true);
  assert.equal(isLocaleSupported(["ca-ES"], "eu-ES"), false);
}

function translationKey(
  messageId: string,
  text: string,
  inputLocale: string,
  outputLanguage: string,
  isFinal: boolean,
): string {
  return `${messageId}:${text.trim()}:${inputLocale}:${outputLanguage}:${isFinal ? "f" : "p"}`;
}

function testTranslationKeys(): void {
  const a = translationKey("m1", "hola", "es-ES", "en-US", false);
  const b = translationKey("m1", "hola", "es-ES", "en-US", true);
  const c = translationKey("m2", "hola", "es-ES", "en-US", true);
  const d = translationKey("m1", "hola", "ca-ES", "en-US", true);

  assert.notEqual(a, b, "final must differ from partial for same text");
  assert.notEqual(b, c, "different messages must differ");
  assert.notEqual(b, d, "language change must differ");
}

function testMessageIsolation(): void {
  type Msg = { id: string; translated: string };

  const messages: Msg[] = [
    { id: "a", translated: "Hello Dallas" },
    { id: "b", translated: "" },
  ];

  const apply = (messageId: string, text: string) =>
    messages.map((m) => (m.id === messageId ? { ...m, translated: text } : m));

  const next = apply("b", "Hello, how are you?");
  assert.equal(next.find((m) => m.id === "a")?.translated, "Hello Dallas");
  assert.equal(next.find((m) => m.id === "b")?.translated, "Hello, how are you?");
}

function testStaleRequestGuard(): void {
  let currentRequestId = 0;
  let translated = "old";

  const start = () => {
    currentRequestId += 1;
    return currentRequestId;
  };

  const complete = (requestId: number, value: string) => {
    if (requestId !== currentRequestId) return;
    translated = value;
  };

  const r1 = start();
  const r2 = start();
  complete(r1, "stale");
  assert.equal(translated, "old");
  complete(r2, "fresh");
  assert.equal(translated, "fresh");
}

function testPerMessageGeneration(): void {
  const gens = new Map<string, number>();
  const bump = (id: string) => {
    const next = (gens.get(id) ?? 0) + 1;
    gens.set(id, next);
    return next;
  };
  const isCurrent = (id: string, g: number) => gens.get(id) === g;

  const g1 = bump("a");
  const g2 = bump("a");
  assert.equal(isCurrent("a", g1), false);
  assert.equal(isCurrent("a", g2), true);
}

function testFinalTranslationFreeze(): void {
  type Msg = {
    id: string;
    isFinal: boolean;
    translated: string;
    isTranslating: boolean;
  };

  const apply = (
    m: Msg,
    text: string,
    options?: { force?: boolean },
  ): Msg => {
    if (!options?.force && m.isFinal && m.translated && !m.isTranslating && text) {
      return m;
    }
    return { ...m, translated: text, isTranslating: false };
  };

  const frozen = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      isTranslating: false,
    },
    "Bonjour",
  );
  assert.equal(frozen.translated, "Hello");

  const forced = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      isTranslating: false,
    },
    "Bonjour",
    { force: true },
  );
  assert.equal(forced.translated, "Bonjour");
}

function testProductLanguagesIncludeSqTh(): void {
  assert.ok(findTraductorLanguageById("sq"));
  assert.ok(findTraductorLanguageById("th"));
  assert.equal(findTraductorLanguageByLocale("sq-AL")?.id, "sq");
  assert.equal(findTraductorLanguageByLocale("th-TH")?.id, "th");
  assert.equal(speechLocaleToWhisperLang("sq-AL"), "sq");
  assert.equal(speechLocaleToWhisperLang("th-TH"), "th");
  assert.equal(whisperLangToSpeechLocale("sq"), "sq-AL");
  assert.equal(whisperLangToSpeechLocale("th"), "th-TH");
  assert.ok(UNIVERSAL_CANDIDATE_LANGS.includes("sq"));
  assert.ok(UNIVERSAL_CANDIDATE_LANGS.includes("th"));
  assert.equal(TRADUCTOR_LANGUAGES.length >= 9, true);
}

function testResolveDeviceTraductorLanguage(): void {
  assert.equal(resolveDeviceTraductorLanguage("es-ES").id, "es");
  assert.equal(resolveDeviceTraductorLanguage("ca-ES").id, "ca");
  assert.equal(resolveDeviceTraductorLanguage("th-TH").id, "th");
  assert.equal(resolveDeviceTraductorLanguage("sq-AL").id, "sq");
  assert.equal(resolveDeviceTraductorLanguage("ja-JP").id, FALLBACK_OUTPUT_LANGUAGE.id);
}

function testInputSelectionShape(): void {
  const universal: InputLanguageSelection = UNIVERSAL_INPUT;
  assert.equal(universal.kind, "universal");
  const fixed: InputLanguageSelection = {
    kind: "fixed",
    language: TRADUCTOR_LANGUAGES[1],
  };
  assert.equal(fixed.kind, "fixed");
  assert.equal(fixed.language.id, "es");
}

function testSoftmaxLangAmong(): void {
  const vocab = 10;
  const data = new Float32Array(vocab);
  data[3] = 5;
  data[7] = 1;
  const logits: OrtTensor = {
    dims: [1, 1, vocab],
    data,
  };
  const { id, prob, index } = softmaxLangAmong(logits, [3, 7]);
  assert.equal(id, 3);
  assert.equal(index, 0);
  assert.ok(prob > 0.9);
  assert.ok(prob >= LANG_DETECT_MIN_PROB);
}

function testGetMissingInputLocales(): void {
  const missing = getMissingInputLocales(["en-US", "es-ES"], (locale) =>
    locale === "en-US" ? { status: "installed" } : { status: "not_installed" },
  );
  assert.deepEqual(missing, ["es-ES"]);
}

function testFormatSttError(): void {
  const err = sttError("STT_OFFLINE_MODELS_MISSING", "Faltan modelos: es-ES");
  assert.equal(
    formatSttError(err),
    "[STT_OFFLINE_MODELS_MISSING] Faltan modelos: es-ES",
  );
}

function testSourceLanguageFreeze(): void {
  type Msg = {
    id: string;
    isFinal: boolean;
    sourceLanguageId: string;
  };

  const applyInterim = (m: Msg, sourceLanguageId: string): Msg =>
    m.isFinal ? m : { ...m, sourceLanguageId };

  const msg: Msg = { id: "1", isFinal: false, sourceLanguageId: "en" };
  const updated = applyInterim(msg, "es");
  assert.equal(updated.sourceLanguageId, "es");

  const finalMsg: Msg = { id: "1", isFinal: true, sourceLanguageId: "en" };
  const frozen = applyInterim(finalMsg, "es");
  assert.equal(frozen.sourceLanguageId, "en");
}

testLocaleMatching();
testTranslationKeys();
testMessageIsolation();
testStaleRequestGuard();
testPerMessageGeneration();
testFinalTranslationFreeze();
testProductLanguagesIncludeSqTh();
testResolveDeviceTraductorLanguage();
testInputSelectionShape();
testSoftmaxLangAmong();
testGetMissingInputLocales();
testFormatSttError();
testSourceLanguageFreeze();

console.log("check:traductor-logic ok");
