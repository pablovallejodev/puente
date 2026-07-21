import assert from "node:assert/strict";

import {
  isLocaleInstalled,
  isLocaleSupported,
  localeMatches,
  normalizeLocale,
} from "../src/lib/stt-locale";

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
  inputLanguage: string,
  outputLanguage: string,
  isFinal: boolean,
): string {
  return `${messageId}:${text.trim()}:${inputLanguage}:${outputLanguage}:${isFinal ? "f" : "p"}`;
}

function testTranslationKeys(): void {
  const a = translationKey("m1", "hola", "es-ES", "en-GB", false);
  const b = translationKey("m1", "hola", "es-ES", "en-GB", true);
  const c = translationKey("m2", "hola", "es-ES", "en-GB", true);
  const d = translationKey("m1", "hola", "ca-ES", "en-GB", true);

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

testLocaleMatching();
testTranslationKeys();
testMessageIsolation();
testStaleRequestGuard();

console.log("check:traductor-logic ok");
