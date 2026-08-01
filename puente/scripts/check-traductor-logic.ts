import assert from "node:assert/strict";

import {
  FALLBACK_OUTPUT_LANGUAGE,
  findTraductorLanguageById,
  findTraductorLanguageByLocale,
  getRecommendedLanguages,
  resolveDeviceTraductorLanguage,
  TRADUCTOR_LANGUAGES,
  UNIVERSAL_INPUT,
  type InputLanguageSelection,
} from "../src/constants/traductor-languages";
import {
  getTraductorLanguageDisplayName,
  resolveUiLocale,
} from "../src/lib/language-display-name";
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
  ENERGY_FRAME_SAMPLES,
  EnergyDetector,
} from "../src/lib/vad/energy-detector";
import type { SpeechDetector } from "../src/lib/vad/detector";
import {
  MAX_CHUNK_MS,
  MIN_SPEECH_MS,
  msToSamples,
  SAMPLE_RATE,
  SILENCE_MS,
  SpeechSegmenter,
} from "../src/lib/vad/segmenter";
import {
  detectLoopPeriod,
  selectNextToken,
  TRANSLATION_GUARDS,
  WHISPER_GUARDS,
} from "../src/lib/ort/decode-guards";
import {
  LatestFirstPreserveScheduler,
  translationJobKey,
} from "../src/lib/translation-scheduler";
import { DEFAULT_PREPROCESSOR, extractWhisperMel } from "../src/lib/whisper-mel";
import {
  lookupPhrase,
  normalizePhrase,
  phrasePairCount,
} from "../src/lib/mt/phrase-lookup";
import { resolveSpeechDisableMode } from "../src/lib/speech-disable-mode";

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

const FRAME_SAMPLES = ENERGY_FRAME_SAMPLES;
const FRAME_MS = (FRAME_SAMPLES * 1000) / SAMPLE_RATE;
const MIN_ACTIVE_FRAMES = Math.ceil(msToSamples(MIN_SPEECH_MS) / FRAME_SAMPLES);

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

/**
 * The segmenter pump awaits the detector once per frame, so even a synchronous
 * detector finishes on the microtask queue. A macrotask tick drains all of it.
 */
function settle(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function energySegmenter(chunks: Float32Array[]): SpeechSegmenter {
  return new SpeechSegmenter(new EnergyDetector(), {
    onSpeechChunk: (pcm) => chunks.push(pcm),
  });
}

async function testSegmenterRejectsBriefNoise(): Promise<void> {
  const chunks: Float32Array[] = [];
  const seg = energySegmenter(chunks);
  // One loud frame then silence — below MIN_ACTIVE_FRAMES.
  seg.push(tone(1, 0.2));
  seg.push(silence(30));
  await settle();
  assert.equal(chunks.length, 0, "brief spike must not form a chunk");
}

async function testSegmenterAcceptsSustainedSpeech(): Promise<void> {
  const chunks: Float32Array[] = [];
  const seg = energySegmenter(chunks);
  seg.push(tone(MIN_ACTIVE_FRAMES + 2, 0.15));
  seg.push(silence(Math.ceil(SILENCE_MS / FRAME_MS) + 2));
  await settle();
  assert.equal(chunks.length, 1, "sustained speech must form a chunk");
  assert.ok(chunks[0].length >= msToSamples(MIN_SPEECH_MS));
}

async function testSegmenterCapsMaxChunk(): Promise<void> {
  const chunks: Float32Array[] = [];
  const seg = energySegmenter(chunks);
  seg.push(tone(Math.ceil(MAX_CHUNK_MS / FRAME_MS) + 4, 0.15));
  await settle();
  assert.ok(chunks.length >= 1, "max length must cut");
  for (const c of chunks) {
    assert.ok(
      c.length <= msToSamples(MAX_CHUNK_MS),
      `chunk exceeded max: ${c.length}`,
    );
  }
}

async function testSegmenterFlushRequiresActiveSpeech(): Promise<void> {
  const chunks: Float32Array[] = [];
  const seg = energySegmenter(chunks);
  seg.push(tone(1, 0.2));
  await seg.flush();
  assert.equal(chunks.length, 0, "flush of brief noise must discard");

  seg.push(tone(MIN_ACTIVE_FRAMES + 1, 0.15));
  await seg.flush();
  assert.equal(chunks.length, 1, "flush of real speech must emit");
}

/**
 * Drive the state machine from a scripted verdict list instead of audio, so the
 * segmentation logic is checked independently of whichever detector produced
 * the scores. This is the path a real Silero detector takes: async scoring.
 */
class ScriptedDetector implements SpeechDetector {
  readonly id = "silero" as const;
  readonly frameSamples = 512;
  readonly startThreshold = 0.5;
  readonly continueThreshold = 0.35;
  resets = 0;
  private index = 0;

  constructor(private readonly scores: number[]) {}

  async score(): Promise<number> {
    const value = this.scores[this.index] ?? 0;
    this.index += 1;
    return value;
  }

  reset(): void {
    this.resets += 1;
  }

  dispose(): void {}
}

async function testSegmenterHysteresisAndReset(): Promise<void> {
  const framesFor = (ms: number) => Math.ceil(msToSamples(ms) / 512);
  const speech = framesFor(MIN_SPEECH_MS) + 2;
  const trailing = framesFor(SILENCE_MS) + 2;

  const scores = [
    ...Array<number>(4).fill(0.1), // leading silence
    ...Array<number>(speech).fill(0.9), // speech
    0.4, // below start, above continue: must NOT end the utterance
    ...Array<number>(trailing).fill(0.05), // real silence
  ];
  const detector = new ScriptedDetector(scores);
  const chunks: Float32Array[] = [];
  const seg = new SpeechSegmenter(detector, {
    onSpeechChunk: (pcm) => chunks.push(pcm),
  });

  seg.push(new Float32Array(scores.length * 512));
  await settle();

  assert.equal(chunks.length, 1, "one utterance expected");
  // 0.4 sits between the two thresholds, so it counted as speech and did not
  // restart the silence timer; the chunk therefore spans it.
  assert.ok(
    chunks[0].length >= msToSamples(MIN_SPEECH_MS) + 512,
    "mid-utterance dip must not split the chunk",
  );
  assert.ok(detector.resets >= 1, "recurrent state must reset per utterance");
}

function testLoopDetection(): void {
  assert.equal(detectLoopPeriod([1, 2, 3, 4, 5], WHISPER_GUARDS), null);
  // "Thank you." repeated: period 2, three times.
  assert.equal(detectLoopPeriod([9, 8, 7, 7, 7, 7], WHISPER_GUARDS), 1);
  assert.equal(detectLoopPeriod([9, 1, 2, 1, 2, 1, 2], WHISPER_GUARDS), 2);
  // Repeated once earlier but not looping now.
  assert.equal(detectLoopPeriod([1, 2, 1, 2, 5, 6], WHISPER_GUARDS), null);
  // Truncating by period * loopRepeats leaves exactly the pre-loop text.
  const generated = [9, 1, 2, 1, 2, 1, 2];
  const period = detectLoopPeriod(generated, WHISPER_GUARDS)!;
  assert.deepEqual(
    generated.slice(0, generated.length - period * WHISPER_GUARDS.loopRepeats),
    [9],
  );
}

function logitsOf(values: number[]): OrtTensor {
  return { dims: [1, 1, values.length], data: Float32Array.from(values) };
}

function testDecodeGuards(): void {
  const flat = logitsOf([1, 2, 3, 4]);
  assert.equal(selectNextToken(flat, 4, [], WHISPER_GUARDS), 3);

  // Repetition penalty only demotes; it must not ban. Token 3 wins on its own
  // even penalised, because the runner-up is far behind.
  assert.equal(selectNextToken(flat, 4, [3], WHISPER_GUARDS), 3);
  // With a near-tie, the penalty flips the winner to the unseen token.
  const tie = logitsOf([1, 1, 3.0, 3.1]);
  assert.equal(selectNextToken(tie, 4, [3], WHISPER_GUARDS), 2);

  // no-repeat n-gram is a hard ban: after [1,2,3] -> 0, the prefix [1,2,3]
  // recurring must not pick 0 again even though it has the top logit.
  const guards = { ...WHISPER_GUARDS, repetitionPenalty: 1 };
  const banned = selectNextToken(
    logitsOf([10, 1, 2, 3]),
    4,
    [1, 2, 3, 0, 1, 2, 3],
    guards,
  );
  assert.notEqual(banned, 0, "n-gram continuation must be banned");

  // Every token banned is survivable: fall back to raw argmax.
  const all = selectNextToken(logitsOf([5, 1]), 2, [0, 1, 0, 1, 0, 1], {
    repetitionPenalty: 1,
    noRepeatNgramSize: 2,
    loopRepeats: 3,
    maxLoopPeriod: 8,
  });
  assert.ok(all === 0 || all === 1);

  assert.ok(TRANSLATION_GUARDS.noRepeatNgramSize > WHISPER_GUARDS.noRepeatNgramSize);
  assert.ok(TRANSLATION_GUARDS.repetitionPenalty < WHISPER_GUARDS.repetitionPenalty);
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
    status: Msg["translationStatus"],
    options?: { force?: boolean },
  ): Msg => {
    // Mirrors use-chat-messages.onTranslationUpdate
    if (status === "queued" || status === "translating") {
      if (
        !options?.force &&
        m.translationStatus === "done" &&
        m.translated
      ) {
        return m;
      }
      return { ...m, translationStatus: status };
    }
    if (
      !options?.force &&
      m.translationStatus === "done" &&
      m.translated
    ) {
      return m;
    }
    return { ...m, translated: text, translationStatus: status };
  };

  const frozen = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      translationStatus: "done",
    },
    "Bonjour",
    "done",
  );
  assert.equal(frozen.translated, "Hello");

  const emptyWipe = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      translationStatus: "done",
    },
    "",
    "queued",
  );
  assert.equal(emptyWipe.translated, "Hello");
  assert.equal(emptyWipe.translationStatus, "done");

  const preemptStatusOnly = apply(
    {
      id: "1",
      isFinal: true,
      translated: "",
      translationStatus: "translating",
    },
    "",
    "queued",
  );
  assert.equal(preemptStatusOnly.translated, "");
  assert.equal(preemptStatusOnly.translationStatus, "queued");

  const forced = apply(
    {
      id: "1",
      isFinal: true,
      translated: "Hello",
      translationStatus: "done",
    },
    "Bonjour",
    "done",
    { force: true },
  );
  assert.equal(forced.translated, "Bonjour");
}

function testFailPendingAndRemove(): void {
  type Msg = {
    id: string;
    original: string;
    transcriptionStatus: "pending" | "done" | "error";
    transcriptionError?: string;
  };

  let messages: Msg[] = [
    { id: "a", original: "hola", transcriptionStatus: "done" },
    { id: "b", original: "", transcriptionStatus: "pending" },
  ];

  const failPending = (messageId: string, message: string) => {
    messages = messages.map((m) => {
      if (m.id !== messageId || m.transcriptionStatus !== "pending") return m;
      return {
        ...m,
        transcriptionStatus: "error" as const,
        transcriptionError: message,
      };
    });
  };

  const remove = (messageId: string) => {
    messages = messages.filter((m) => m.id !== messageId);
  };

  failPending("b", "No se entendió");
  assert.equal(messages.find((m) => m.id === "b")?.transcriptionStatus, "error");
  assert.equal(messages.find((m) => m.id === "b")?.transcriptionError, "No se entendió");
  assert.equal(messages.find((m) => m.id === "a")?.transcriptionStatus, "done");

  // Only pending can fail — done is untouched.
  failPending("a", "x");
  assert.equal(messages.find((m) => m.id === "a")?.transcriptionStatus, "done");

  remove("b");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "a");
}

function testLatestDoneMessageId(): void {
  type Msg = { id: string; transcriptionStatus: "pending" | "done" | "error" };
  const messages: Msg[] = [
    { id: "a", transcriptionStatus: "done" },
    { id: "b", transcriptionStatus: "done" },
    { id: "c", transcriptionStatus: "pending" },
    { id: "d", transcriptionStatus: "error" },
  ];
  let latest: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].transcriptionStatus === "done") {
      latest = messages[i].id;
      break;
    }
  }
  assert.equal(latest, "b");
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

function testRecommendedLanguages(): void {
  assert.deepEqual(
    getRecommendedLanguages("ca-ES").map((l) => l.id),
    ["ca", "es", "en"],
  );
  assert.deepEqual(
    getRecommendedLanguages("es-ES").map((l) => l.id),
    ["es", "ca", "en"],
  );
  assert.deepEqual(
    getRecommendedLanguages("en-US").map((l) => l.id),
    ["en", "es", "ca"],
  );
  assert.deepEqual(
    getRecommendedLanguages("fr-FR").map((l) => l.id),
    ["fr", "es", "ca", "en"],
  );
  assert.deepEqual(
    getRecommendedLanguages("xx-XX").map((l) => l.id),
    ["es", "ca", "en"],
  );
}

function testLanguageDisplayNames(): void {
  assert.equal(resolveUiLocale("es-ES"), "es");
  assert.equal(resolveUiLocale("ca-ES"), "ca");
  assert.equal(resolveUiLocale("en-US"), "en");
  assert.equal(resolveUiLocale("fr-FR"), "en");

  const es = findTraductorLanguageById("es")!;
  const ca = findTraductorLanguageById("ca")!;
  const en = findTraductorLanguageById("en")!;
  assert.equal(getTraductorLanguageDisplayName(es, "es"), "Castellano");
  assert.equal(getTraductorLanguageDisplayName(es, "ca"), "Castellà");
  assert.equal(getTraductorLanguageDisplayName(es, "en"), "Spanish");
  assert.equal(getTraductorLanguageDisplayName(ca, "es"), "Catalán");
  assert.equal(getTraductorLanguageDisplayName(ca, "ca"), "Català");
  assert.equal(getTraductorLanguageDisplayName(en, "es"), "Inglés");
  assert.equal(getTraductorLanguageDisplayName(en, "en"), "English");
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
  assert.ok(SAMPLE_RATE === 16000);
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
  await testSegmenterRejectsBriefNoise();
  await testSegmenterAcceptsSustainedSpeech();
  await testSegmenterCapsMaxChunk();
  await testSegmenterFlushRequiresActiveSpeech();
  await testSegmenterHysteresisAndReset();
  testLoopDetection();
  testDecodeGuards();
  testSessionGuard();
  await testLatestFirstPreserve();
  testTranslationJobKey();
  testMessageIsolation();
  testFinalTranslationFreeze();
  testFailPendingAndRemove();
  testOutputLanguageDoesNotAutoRetranslate();
  testProductLanguagesIncludeSqTh();
  testWhisperNllbProductCatalog();
  testResolveDeviceTraductorLanguage();
  testRecommendedLanguages();
  testLanguageDisplayNames();
  testInputSelectionShape();
  testSoftmaxLangAmong();
  testNoSpeechProbFromLogits();
  testGetMissingInputLocales();
  testFormatSttError();
  testMelSelfCheck();
  testLatestMessageIdDerivation();
  testLatestDoneMessageId();
  testPhraseLookup();
  testResolveSpeechDisableMode();

  console.log("check:traductor-logic ok");
}

function testResolveSpeechDisableMode(): void {
  assert.equal(
    resolveSpeechDisableMode({
      micPaused: true,
      isFocused: true,
      baseHydrated: true,
    }),
    "pause",
  );
  assert.equal(
    resolveSpeechDisableMode({
      micPaused: false,
      isFocused: true,
      baseHydrated: true,
    }),
    "abort",
  );
  assert.equal(
    resolveSpeechDisableMode({
      micPaused: true,
      isFocused: false,
      baseHydrated: true,
    }),
    "abort",
  );
  assert.equal(
    resolveSpeechDisableMode({
      micPaused: true,
      isFocused: true,
      baseHydrated: false,
    }),
    "abort",
  );
}

function testPhraseLookup(): void {
  assert.ok(phrasePairCount() > 50, "phrase seed table is too thin");
  assert.equal(normalizePhrase("¡Hola!"), "hola");
  assert.equal(normalizePhrase("  Thank   you. "), "thank you");
  assert.equal(lookupPhrase("hello", "en-US", "es-ES"), "hola");
  assert.equal(lookupPhrase("¡Hola!", "es-ES", "en-US"), "hello");
  assert.equal(lookupPhrase("gràcies", "ca-ES", "es-ES"), "gracias");
  // Long sentences must fall through to the neural model.
  assert.equal(
    lookupPhrase(
      "hello my friend how are you doing today",
      "en-US",
      "es-ES",
    ),
    null,
  );
  // Unknown phrases fall through.
  assert.equal(lookupPhrase("xylophone", "en-US", "es-ES"), null);
  // Same language: no override.
  assert.equal(lookupPhrase("hello", "en-US", "en-GB"), null);
}

main().catch((err) => {
  console.error("check:traductor-logic failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
