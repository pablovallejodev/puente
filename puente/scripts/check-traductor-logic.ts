import assert from "node:assert/strict";

import {
  DEFAULT_INPUT_LANGUAGES,
  inputSpeechLocalesKey,
  resolveInputLanguageFromDetection,
  TRADUCTOR_LANGUAGES,
  type TraductorLanguage,
} from "../src/constants/traductor-languages";
import {
  isLocaleInstalled,
  isLocaleSupported,
  localeMatches,
  normalizeLocale,
} from "../src/lib/stt-locale";
import { formatSttError, sttError } from "../src/lib/stt-errors";
import { getMissingInputLocales } from "../src/lib/traductor-offline";
import {
  applyInputLanguageSelection,
  getInputSttMode,
  removeDownloadedInputLanguage,
  sanitizeInputLanguages,
} from "../src/lib/traductor-input-mode";
import type { SttDownloadState } from "../src/hooks/use-offline-stt-download";

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

function testInputSpeechLocalesKey(): void {
  const langs: TraductorLanguage[] = [
    TRADUCTOR_LANGUAGES[0],
    TRADUCTOR_LANGUAGES[1],
  ];
  assert.equal(inputSpeechLocalesKey(langs), "en-US|es-ES");
  assert.equal(inputSpeechLocalesKey(DEFAULT_INPUT_LANGUAGES), "en-US");
}

function testResolveInputLanguageFromDetection(): void {
  const inputLanguages = [TRADUCTOR_LANGUAGES[0], TRADUCTOR_LANGUAGES[1]];

  const exact = resolveInputLanguageFromDetection("es-ES", inputLanguages);
  assert.equal(exact.id, "es");

  const prefix = resolveInputLanguageFromDetection("es-MX", inputLanguages);
  assert.equal(prefix.id, "es");

  const fallback = resolveInputLanguageFromDetection("fr-FR", inputLanguages);
  assert.equal(fallback.id, "en");
}

function mockDownloadState(
  installedLocales: string[],
): (locale: string) => SttDownloadState {
  return (locale) =>
    installedLocales.includes(locale)
      ? { status: "installed" }
      : { status: "not_installed" };
}

function testInputSttMode(): void {
  const getState = mockDownloadState(["es-ES"]);
  assert.equal(
    getInputSttMode([TRADUCTOR_LANGUAGES[0]], getState),
    "internet",
  );
  assert.equal(
    getInputSttMode([TRADUCTOR_LANGUAGES[1]], getState),
    "downloaded",
  );
}

function testApplyInputLanguageSelection(): void {
  const getNone = mockDownloadState([]);
  const getEs = mockDownloadState(["es-ES"]);
  const getBoth = mockDownloadState(["en-US", "es-ES"]);

  let langs = [...DEFAULT_INPUT_LANGUAGES];
  langs = applyInputLanguageSelection(
    langs,
    TRADUCTOR_LANGUAGES[1],
    true,
    getEs,
  );
  assert.deepEqual(
    langs.map((lang) => lang.id),
    ["es"],
  );

  langs = applyInputLanguageSelection(
    langs,
    TRADUCTOR_LANGUAGES[0],
    true,
    getBoth,
  );
  assert.deepEqual(
    langs.map((lang) => lang.id),
    ["es", "en"],
  );

  langs = applyInputLanguageSelection(
    langs,
    TRADUCTOR_LANGUAGES[2],
    false,
    getBoth,
  );
  assert.deepEqual(
    langs.map((lang) => lang.id),
    ["ca"],
  );
}

function testSanitizeInputLanguages(): void {
  const getMixed = mockDownloadState(["es-ES"]);
  const sanitized = sanitizeInputLanguages(
    [TRADUCTOR_LANGUAGES[0], TRADUCTOR_LANGUAGES[1]],
    getMixed,
  );
  assert.deepEqual(
    sanitized.map((lang) => lang.id),
    ["en"],
  );
}

function testRemoveDownloadedInputLanguage(): void {
  const getBoth = mockDownloadState(["en-US", "es-ES"]);
  const langs = removeDownloadedInputLanguage(
    [TRADUCTOR_LANGUAGES[0], TRADUCTOR_LANGUAGES[1]],
    "en",
    getBoth,
  );
  assert.deepEqual(
    langs.map((lang) => lang.id),
    ["es"],
  );
}

function testAddRemoveGuards(): void {
  const add = (prev: TraductorLanguage[], lang: TraductorLanguage, max: number) => {
    if (prev.length >= max) return prev;
    if (prev.some((l) => l.id === lang.id)) return prev;
    return [...prev, lang];
  };

  const remove = (prev: TraductorLanguage[], id: string) => {
    if (prev.length <= 1) return prev;
    return prev.filter((l) => l.id !== id);
  };

  let langs = [...DEFAULT_INPUT_LANGUAGES];
  langs = add(langs, TRADUCTOR_LANGUAGES[1], 5);
  assert.equal(langs.length, 2);
  langs = add(langs, TRADUCTOR_LANGUAGES[1], 5);
  assert.equal(langs.length, 2);
  langs = remove(langs, "en");
  assert.equal(langs.length, 1);
  langs = remove(langs, "es");
  assert.equal(langs.length, 1);
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
testInputSpeechLocalesKey();
testResolveInputLanguageFromDetection();
testInputSttMode();
testApplyInputLanguageSelection();
testSanitizeInputLanguages();
testRemoveDownloadedInputLanguage();
testAddRemoveGuards();
testGetMissingInputLocales();
testFormatSttError();
testSourceLanguageFreeze();

console.log("check:traductor-logic ok");
