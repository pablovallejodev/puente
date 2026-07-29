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
  WHISPER_OFFICIAL_LANGS,
  WHISPER_EXCLUDED_FROM_PRODUCT,
} from "../src/constants/whisper-languages";
import {
  LANG_DETECT_MIN_PROB,
  noSpeechProbFromLogits,
  softmaxLangAmong,
} from "../src/lib/whisper-inference";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { OrtTensor } from "../src/lib/nllb-inference";
import {
  isLocaleInstalled,
  isLocaleSupported,
  localeMatches,
  normalizeLocale,
} from "../src/lib/stt-locale";
import { formatSttError, sttError } from "../src/lib/stt-errors";
import { getMissingInputLocales } from "../src/lib/traductor-offline";
import {
  acceptTranscript,
  stripBracketAnnotations,
} from "../src/lib/transcript-filter";
import {
  ENERGY_FLOOR,
  FRAME_SAMPLES,
  MAX_CHUNK_MS,
  MIN_ACTIVE_FRAMES,
  WhisperAudioEndpoint,
  WHISPER_SAMPLE_RATE,
  msToSamples,
} from "../src/lib/whisper-audio-endpoint";
import {
  LatestFirstPreserveScheduler,
  translationJobKey,
} from "../src/lib/translation-scheduler";
import { DEFAULT_PREPROCESSOR, extractWhisperMel } from "../src/lib/whisper-mel";

function testLocaleMatching(): void {
  assert.equal(normalizeLocale("en_US"), "en-us");
  assert.equal(localeMatches("en-GB", "en-gb"), true);
  assert.equal(localeMatches("en-GB", "en-US"), false);
  assert.equal(isLocaleInstalled(["en-GB", "es-ES"], "en-US"), false);
  assert.equal(isLocaleInstalled(["en-GB", "es-ES"], "en-GB"), true);
  assert.equal(isLocaleSupported(["ca-ES"], "ca-ES"), true);
  assert.equal(isLocaleSupported(["ca-ES"], "eu-ES"), false);
}

function testTranscriptFilter(): void {
  assert.equal(acceptTranscript(""), null);
  assert.equal(acceptTranscript("   "), null);
  assert.equal(acceptTranscript("..."), null);
  assert.equal(acceptTranscript("123"), null);
  assert.equal(acceptTranscript("♪ ♫"), null);
  assert.equal(acceptTranscript("[risas]"), null);
  assert.equal(acceptTranscript("[música]"), null);
  assert.equal(acceptTranscript("[tos]"), null);
  assert.equal(acceptTranscript("[risas] [aplausos]"), null);
  assert.equal(acceptTranscript("Hola [risas]"), "Hola");
  assert.equal(acceptTranscript("[música] Hola mundo"), "Hola mundo");
  assert.equal(acceptTranscript("Hola [risas] adiós"), "Hola adiós");
  assert.equal(stripBracketAnnotations("a [x] b"), "a b");

  // Unicode letters from supported product languages must pass.
  assert.equal(acceptTranscript("Καλημέρα"), "Καλημέρα");
  assert.equal(acceptTranscript("สวัสดี"), "สวัสดี");
  assert.equal(acceptTranscript("Përshëndetje"), "Përshëndetje");
  assert.equal(acceptTranscript("你好"), "你好");
}

function tone(frames: number, amplitude: number): Float32Array {
  const n = frames * FRAME_SAMPLES;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin(i * 0.37);
  }
  return out;
}

function silence(frames: number): Float32Array {
  return new Float32Array(frames * FRAME_SAMPLES);
}

function testEndpointRejectsBriefNoise(): void {
  const chunks: Float32Array[] = [];
  const ep = new WhisperAudioEndpoint({
    onSpeechChunk: (pcm) => chunks.push(pcm),
  });
  // One loud frame then silence — below MIN_ACTIVE_FRAMES.
  ep.push(tone(1, 0.2));
  ep.push(silence(30));
  assert.equal(chunks.length, 0, "brief spike must not form a chunk");
}

function testEndpointAcceptsSustainedSpeech(): void {
  const chunks: Float32Array[] = [];
  const ep = new WhisperAudioEndpoint({
    onSpeechChunk: (pcm) => chunks.push(pcm),
  });
  ep.push(tone(MIN_ACTIVE_FRAMES + 2, 0.15));
  ep.push(silence(Math.ceil(900 / 50) + 2));
  assert.equal(chunks.length, 1, "sustained speech must form a chunk");
  assert.ok(chunks[0].length >= msToSamples(350));
}

function testEndpointKeepsRemainderAndCapsMax(): void {
  const chunks: Float32Array[] = [];
  const ep = new WhisperAudioEndpoint({
    onSpeechChunk: (pcm) => chunks.push(pcm),
  });
  const maxFrames = Math.ceil(MAX_CHUNK_MS / 50) + 4;
  ep.push(tone(maxFrames, 0.15));
  assert.ok(chunks.length >= 1, "max length must cut");
  for (const c of chunks) {
    assert.ok(
      c.length <= msToSamples(MAX_CHUNK_MS),
      `chunk exceeded max: ${c.length}`,
    );
  }
}

function testEndpointFlushRequiresActiveSpeech(): void {
  const chunks: Float32Array[] = [];
  const ep = new WhisperAudioEndpoint({
    onSpeechChunk: (pcm) => chunks.push(pcm),
  });
  ep.push(tone(1, 0.2));
  ep.flush();
  assert.equal(chunks.length, 0, "flush of brief noise must discard");

  ep.push(tone(MIN_ACTIVE_FRAMES + 1, 0.15));
  ep.flush();
  assert.equal(chunks.length, 1, "flush of real speech must emit");
}

function testSessionGuard(): void {
  let sessionId = 1;
  const emit: string[] = [];
  const publish = (chunkSession: number, text: string) => {
    if (chunkSession !== sessionId) return;
    emit.push(text);
  };
  publish(1, "old");
  sessionId = 2;
  publish(1, "stale");
  publish(2, "fresh");
  assert.deepEqual(emit, ["old", "fresh"]);
}

async function testLatestFirstPreserve(): Promise<void> {
  const order: string[] = [];
  const scheduler = new LatestFirstPreserveScheduler<{
    id: string;
    key: string;
  }>({
    execute: async (job, isCancelled) => {
      order.push(`start:${job.id}`);
      for (let i = 0; i < 6; i++) {
        if (isCancelled()) {
          order.push(`cancel:${job.id}`);
          return false;
        }
        await new Promise((r) => setTimeout(r, 15));
      }
      order.push(`done:${job.id}`);
      return true;
    },
  });

  scheduler.enqueue({ id: "A", key: "A1" });
  await new Promise((r) => setTimeout(r, 40));
  scheduler.enqueue({ id: "B", key: "B1" });
  await new Promise((r) => setTimeout(r, 400));

  assert.ok(order.includes("start:A"));
  assert.ok(order.includes("cancel:A"));
  assert.ok(order.includes("start:B"));
  assert.ok(order.includes("done:B"));
  assert.ok(order.includes("done:A"));

  const doneB = order.indexOf("done:B");
  const doneA = order.lastIndexOf("done:A");
  assert.ok(doneB < doneA, "B must finish before preserved A");
  assert.equal(order.filter((x) => x === "done:A").length, 1);
  assert.equal(order.filter((x) => x === "done:B").length, 1);
}

function testTranslationJobKey(): void {
  const a = translationJobKey("m1", "hola", "es-ES", "en-US");
  const b = translationJobKey("m1", "hola", "es-ES", "ca-ES");
  const c = translationJobKey("m2", "hola", "es-ES", "en-US");
  assert.notEqual(a, b);
  assert.notEqual(a, c);
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

function testFinalTranslationFreeze(): void {
  type Msg = {
    id: string;
    isFinal: boolean;
    translated: string;
    translationStatus: "queued" | "translating" | "done" | "error";
  };

  const apply = (
    m: Msg,
    text: string,
    options?: { force?: boolean },
  ): Msg => {
    if (
      !options?.force &&
      m.isFinal &&
      m.translated &&
      m.translationStatus === "done" &&
      text
    ) {
      return m;
    }
    return { ...m, translated: text, translationStatus: "done" };
  };

  const frozen = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      translationStatus: "done",
    },
    "Bonjour",
  );
  assert.equal(frozen.translated, "Hello");

  const forced = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      translationStatus: "done",
    },
    "Bonjour",
    { force: true },
  );
  assert.equal(forced.translated, "Bonjour");
}

function testOutputLanguageDoesNotAutoRetranslate(): void {
  // New jobs capture the language at enqueue time; changing output later
  // must not mutate an already-queued key.
  const keyAtSpeak = translationJobKey("m1", "hola", "es-ES", "en-US");
  const keyAfterUiChange = translationJobKey("m1", "hola", "es-ES", "ca-ES");
  assert.notEqual(keyAtSpeak, keyAfterUiChange);
  assert.equal(keyAtSpeak, translationJobKey("m1", "hola", "es-ES", "en-US"));
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

function testWhisperNllbProductCatalog(): void {
  const official = new Set(WHISPER_OFFICIAL_LANGS);
  const excluded = new Set(WHISPER_EXCLUDED_FROM_PRODUCT);
  assert.equal(WHISPER_OFFICIAL_LANGS.length, 100);
  assert.deepEqual([...excluded].sort(), ["br", "haw", "la"]);

  const flagsDir = join(__dirname, "../assets/flags");

  for (const lang of TRADUCTOR_LANGUAGES) {
    assert.ok(official.has(lang.id), `not in Whisper: ${lang.id}`);
    assert.ok(!excluded.has(lang.id), `excluded leaked: ${lang.id}`);
    assert.equal(speechLocaleToWhisperLang(lang.speechLocale), lang.id);
    assert.equal(whisperLangToSpeechLocale(lang.id), lang.speechLocale);
    assert.match(lang.floresCode, /^[a-z]{3}_[A-Za-z]+$/);
    assert.ok(
      existsSync(join(flagsDir, `${lang.id}.png`)),
      `missing flag ${lang.id}.png`,
    );
  }

  assert.equal(
    TRADUCTOR_LANGUAGES.length,
    WHISPER_OFFICIAL_LANGS.length - WHISPER_EXCLUDED_FROM_PRODUCT.length,
  );

  // Universal detect stays curated (not full product set).
  assert.equal(UNIVERSAL_CANDIDATE_LANGS.length, 9);
  for (const code of UNIVERSAL_CANDIDATE_LANGS) {
    assert.ok(findTraductorLanguageById(code), `universal candidate ${code}`);
  }

  assert.equal(speechLocaleToWhisperLang("jw-ID"), "jw");
  assert.equal(findTraductorLanguageById("jw")?.floresCode, "jav_Latn");
  assert.equal(findTraductorLanguageById("yue")?.floresCode, "yue_Hant");
  assert.ok(findTraductorLanguageById("ca"));
  assert.ok(findTraductorLanguageById("eu"));
}

function testResolveDeviceTraductorLanguage(): void {
  assert.equal(resolveDeviceTraductorLanguage("es-ES").id, "es");
  assert.equal(resolveDeviceTraductorLanguage("ca-ES").id, "ca");
  assert.equal(resolveDeviceTraductorLanguage("th-TH").id, "th");
  assert.equal(resolveDeviceTraductorLanguage("sq-AL").id, "sq");
  assert.equal(resolveDeviceTraductorLanguage("ja-JP").id, "ja");
  assert.equal(
    resolveDeviceTraductorLanguage("xx-XX").id,
    FALLBACK_OUTPUT_LANGUAGE.id,
  );
}

function testInputSelectionShape(): void {
  const universal: InputLanguageSelection = UNIVERSAL_INPUT;
  assert.equal(universal.kind, "universal");
  const es = findTraductorLanguageById("es");
  assert.ok(es);
  const fixed: InputLanguageSelection = {
    kind: "fixed",
    language: es!,
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

function testNoSpeechProbFromLogits(): void {
  const vocab = 8;
  const data = new Float32Array(vocab);
  data[2] = 10; // no_speech
  data[0] = 0;
  const logits: OrtTensor = { dims: [1, 1, vocab], data };
  const p = noSpeechProbFromLogits(logits, 2);
  assert.ok(p > 0.9);
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

function testMelSelfCheck(): void {
  // Sanity: mel features for a short tone are finite and non-degenerate.
  // (Golden HF parity stays in check:whisper when models/fixtures exist.)
  const pcm = tone(20, 0.1);
  const mel = extractWhisperMel(pcm, DEFAULT_PREPROCESSOR);
  assert.equal(mel.length, DEFAULT_PREPROCESSOR.feature_size * DEFAULT_PREPROCESSOR.nb_max_frames);
  let min = Infinity;
  let max = -Infinity;
  let nonzero = 0;
  for (let i = 0; i < mel.length; i++) {
    const v = mel[i];
    assert.ok(Number.isFinite(v));
    if (v !== 0) nonzero += 1;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  assert.ok(nonzero > 100);
  assert.ok(max > min);
  assert.ok(ENERGY_FLOOR > 0);
  assert.ok(WHISPER_SAMPLE_RATE === 16000);
}

function testLatestMessageIdDerivation(): void {
  const messages = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const latest = messages.at(-1)?.id ?? null;
  assert.equal(latest, "c");
  assert.equal(([] as { id: string }[]).at(-1)?.id ?? null, null);
}

async function main(): Promise<void> {
  testLocaleMatching();
  testTranscriptFilter();
  testEndpointRejectsBriefNoise();
  testEndpointAcceptsSustainedSpeech();
  testEndpointKeepsRemainderAndCapsMax();
  testEndpointFlushRequiresActiveSpeech();
  testSessionGuard();
  await testLatestFirstPreserve();
  testTranslationJobKey();
  testMessageIsolation();
  testFinalTranslationFreeze();
  testOutputLanguageDoesNotAutoRetranslate();
  testProductLanguagesIncludeSqTh();
  testWhisperNllbProductCatalog();
  testResolveDeviceTraductorLanguage();
  testInputSelectionShape();
  testSoftmaxLangAmong();
  testNoSpeechProbFromLogits();
  testGetMissingInputLocales();
  testFormatSttError();
  testMelSelfCheck();
  testLatestMessageIdDerivation();

  console.log("check:traductor-logic ok");
}

main().catch((err) => {
  console.error("check:traductor-logic failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
