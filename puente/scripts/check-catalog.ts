/**
 * Invariants of the model catalog and the error system.
 *
 * These are not style checks. The byte sizes below are compared against the
 * real download and a wrong one makes the model refuse to install; the runtime
 * file names are looked up inside the installed directory and a typo turns into
 * a runtime crash on a device, after a user waited for a gigabyte. Everything
 * here fails in CI instead.
 *
 * Run: pnpm check:catalog
 */

import assert from "node:assert/strict";

import {
  ALL_LANGUAGE_IDS,
  ALL_MODELS,
  ASR_MODELS,
  ENGINE_LABEL,
  exceedsPairBudget,
  getAsrModelSpec,
  getModelSpec,
  getMtModelSpec,
  MT_MODELS,
  pairBudgetBytes,
  pairPeakRamBytes,
  PAIR_BUDGET_FRACTION,
  PRESET_MODES,
  presetModePeakBytes,
  RAM_TIER,
  requireModelSpec,
  resolveActiveMode,
  VAD_MODELS,
  type ModelRamTier,
  type ModelSpec,
} from "../src/constants/model-catalog";
import { MODEL_ERROR_CODES } from "../src/lib/model-errors";
import { WHISPER_ERROR_CODES } from "../src/lib/whisper-errors";
import { TRANSLATOR_ERROR_CODES } from "../src/lib/translator-errors";
import { ENGINE_ERROR_CODES } from "../src/lib/engine-errors";
import { describeCode } from "../src/lib/errors/error-catalog";
import type { DiagnosticDomain } from "../src/lib/errors/diagnostic";

const GB = 1024 * 1024 * 1024;
const RAM_TIERS: ModelRamTier[] = [1, 2, 3, 4];

function testIdsAreUniqueAndResolvable(): void {
  const seen = new Set<string>();
  for (const spec of ALL_MODELS) {
    assert.ok(!seen.has(spec.id), `duplicate model id: ${spec.id}`);
    seen.add(spec.id);
    assert.equal(getModelSpec(spec.id)?.id, spec.id);
    // Ids are directory names on disk and, for sherpa, part of native model
    // detection. Anything outside this alphabet is a portability bug waiting.
    assert.match(spec.id, /^[a-z0-9][a-z0-9.-]*$/, `unsafe id: ${spec.id}`);
    assert.match(
      spec.storage,
      /^[a-z0-9-]+$/,
      `unsafe storage: ${spec.storage}`,
    );
  }

  assert.equal(
    ALL_MODELS.length,
    ASR_MODELS.length + MT_MODELS.length + VAD_MODELS.length,
  );
  // Narrowed lookups must not cross tasks.
  assert.equal(getAsrModelSpec(MT_MODELS[0].id), undefined);
  assert.equal(getMtModelSpec(ASR_MODELS[0].id), undefined);
}

function testFiles(): void {
  for (const spec of ALL_MODELS) {
    assert.ok(spec.files.length > 0, `${spec.id} has no files`);

    const relativePaths = new Set<string>();
    for (const file of spec.files) {
      assert.ok(
        !relativePaths.has(file.relativePath),
        `${spec.id}: two files land on ${file.relativePath}`,
      );
      relativePaths.add(file.relativePath);

      // Flattened on install, so a nested relativePath would silently create a
      // directory the runtime never looks in.
      assert.ok(
        !file.relativePath.includes("/"),
        `${spec.id}: nested relativePath ${file.relativePath}`,
      );
      assert.ok(
        file.url.startsWith(
          `https://huggingface.co/${spec.hfRepoId}/resolve/main/`,
        ),
        `${spec.id}: ${file.url} does not come from ${spec.hfRepoId}`,
      );
      assert.ok(
        file.url.endsWith(`/${file.relativePath}`),
        `${spec.id}: ${file.url} does not end in ${file.relativePath}`,
      );
      assert.ok(
        file.expectedBytes > 0,
        `${spec.id}: ${file.relativePath} has no expected size`,
      );
    }

    const sum = spec.files.reduce((total, f) => total + f.expectedBytes, 0);
    assert.equal(spec.diskBytes, sum, `${spec.id}: diskBytes != sum(files)`);
    assert.equal(spec.hfRepoUrl, `https://huggingface.co/${spec.hfRepoId}`);
  }
}

/** Every file a runtime names must actually be downloaded. */
function testRuntimeFilesExist(): void {
  const filesOf = (spec: ModelSpec) =>
    new Set(spec.files.map((f) => f.relativePath));

  for (const spec of ALL_MODELS) {
    const available = filesOf(spec);
    const required: string[] = [];
    const runtime = spec.runtime;

    switch (runtime.kind) {
      case "whisper":
        required.push(
          runtime.encoderFile,
          runtime.decoderFile,
          runtime.configFile,
          runtime.generationConfigFile,
          runtime.preprocessorFile,
          runtime.tokenizerFile,
          runtime.tokenizerConfigFile,
        );
        break;
      case "nllb":
        required.push(
          runtime.encoderFile,
          runtime.decoderFile,
          runtime.configFile,
          runtime.generationConfigFile,
          runtime.tokenizerFile,
          runtime.tokenizerConfigFile,
        );
        break;
      case "silero-vad":
        required.push(runtime.modelFile);
        // Silero v5 is trained on fixed 32 ms windows; any other value makes
        // the graph reject the tensor at runtime.
        assert.equal(runtime.frameSamples, 512, `${spec.id}: wrong frame size`);
        break;
      case "gguf-mt":
        required.push(runtime.ggufFile);
        assert.ok(runtime.contextSize >= 512, `${spec.id}: context too small`);
        assert.ok(
          runtime.maxTokens > 0 && runtime.maxTokens < runtime.contextSize,
        );
        break;
      case "offline-asr":
        // sherpa is handed the whole directory and picks its own files, but its
        // native detector reads the directory name, which is the model id.
        assert.ok(
          available.has("tokens.txt") ||
            [...available].some((f) => f.endsWith("tokens.txt")),
          `${spec.id}: a sherpa model needs a tokens file`,
        );
        assert.ok(
          spec.id.includes(
            {
              transducer: "zipformer",
              nemo_transducer: "parakeet",
              whisper: "whisper",
              sense_voice: "sense",
              moonshine: "moonshine",
            }[runtime.modelType],
          ),
          `${spec.id}: the id must contain the keyword sherpa's detector looks for`,
        );
        break;
    }

    for (const file of required) {
      assert.ok(
        available.has(file),
        `${spec.id}: runtime needs ${file}, which is not downloaded`,
      );
    }
  }
}

function testMetadata(): void {
  const languageIds = new Set(ALL_LANGUAGE_IDS);

  for (const spec of ALL_MODELS) {
    assert.ok(spec.label.length > 0, `${spec.id}: no label`);
    assert.ok(spec.shortLabel.length > 0, `${spec.id}: no short label`);
    assert.ok(spec.qualityTag.length > 0, `${spec.id}: no quality tag`);
    assert.ok(spec.sourceNote.length > 20, `${spec.id}: source note too thin`);
    assert.ok(
      ENGINE_LABEL[spec.runtime.engine],
      `${spec.id}: unlabelled engine`,
    );
    assert.ok(
      spec.license.url.startsWith("https://"),
      `${spec.id}: licence url`,
    );

    assert.ok(spec.languageIds.length > 0, `${spec.id}: no languages`);
    for (const id of spec.languageIds) {
      assert.ok(languageIds.has(id), `${spec.id}: unknown language ${id}`);
    }

    assert.ok(spec.peakRamBytes > 0, `${spec.id}: no peak RAM`);
    assert.ok(
      RAM_TIERS.includes(spec.ramTier),
      `${spec.id}: ramTier must be 1–4`,
    );
    assert.ok(
      Object.values(RAM_TIER).includes(spec.minRecommendedRamBytes),
      `${spec.id}: minRecommendedRamBytes is not one of the declared tiers`,
    );
    // A model whose peak alone exceeds the device tier we advertise would be
    // offered as fitting a phone it cannot fit even alone.
    assert.ok(
      spec.peakRamBytes < spec.minRecommendedRamBytes,
      `${spec.id}: needs ${spec.peakRamBytes} B but is offered at ${spec.minRecommendedRamBytes} B`,
    );
  }

  // Tiers must be strictly increasing.
  const tiers = [
    RAM_TIER.entry,
    RAM_TIER.low,
    RAM_TIER.mid,
    RAM_TIER.high,
    RAM_TIER.flagship,
  ];
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i] > tiers[i - 1], "RAM tiers are not increasing");
  }
  // Calibrated below the round number they gate: reported memory sits 4-8%
  // under the marketed capacity.
  assert.ok(RAM_TIER.flagship < 12 * GB && RAM_TIER.flagship > 10 * GB);
  assert.ok(RAM_TIER.high < 8 * GB && RAM_TIER.high > 6 * GB);
}

function testModesAndPairBudget(): void {
  assert.equal(PRESET_MODES.length, 4);
  for (const mode of PRESET_MODES) {
    assert.equal(getAsrModelSpec(mode.asrId)?.task, "asr", mode.id);
    assert.equal(getMtModelSpec(mode.mtId)?.task, "mt", mode.id);
    assert.ok(presetModePeakBytes(mode) > 0, `${mode.id}: no peak`);
  }

  assert.equal(
    resolveActiveMode("sherpa-whisper-turbo-int8", "nllb-600m-q8"),
    "universal",
  );
  assert.equal(
    resolveActiveMode(
      "sherpa-whisper-turbo-int8",
      "salamandrata-2b-instruct-q4",
    ),
    "europeo",
  );
  assert.equal(
    resolveActiveMode("sherpa-sense-voice-multi-int8", "nllb-600m-q8"),
    "asiatico",
  );
  assert.equal(
    resolveActiveMode("whisper-base-q", "nllb-600m-q8"),
    "bajos-recursos",
  );
  assert.equal(
    resolveActiveMode("whisper-tiny-q", "nllb-600m-q8"),
    "personalizado",
  );
  assert.equal(resolveActiveMode("whisper-tiny-q", null), null);
  assert.equal(resolveActiveMode(null, "nllb-600m-q8"), null);

  // Removed ORT Whisper sizes must stay gone.
  assert.equal(getModelSpec("whisper-small-q"), undefined);
  assert.equal(getModelSpec("whisper-large-v3-turbo-q"), undefined);

  assert.equal(PAIR_BUDGET_FRACTION, 0.35);
  assert.equal(pairBudgetBytes(8 * GB), 8 * GB * PAIR_BUDGET_FRACTION);
  assert.equal(pairBudgetBytes(null), null);
  assert.equal(pairBudgetBytes(0), null);

  const tiny = requireModelSpec("whisper-tiny-q").peakRamBytes;
  const nllb = requireModelSpec("nllb-600m-q8").peakRamBytes;
  assert.equal(exceedsPairBudget(tiny, nllb, 16 * GB), false);
  assert.equal(
    exceedsPairBudget(
      requireModelSpec("sherpa-whisper-turbo-int8").peakRamBytes,
      nllb,
      8 * GB,
    ),
    true,
  );
  assert.equal(exceedsPairBudget(3 * GB, 2 * GB, null), false);

  const peak = pairPeakRamBytes(tiny, nllb);
  assert.ok(peak >= tiny + nllb, "pair peak includes at least ASR+MT");
}

/** Every declared code must be documented, or a log line stays a mystery. */
function testErrorCatalogCoverage(): void {
  const domains: [DiagnosticDomain, readonly string[]][] = [
    ["model", MODEL_ERROR_CODES],
    ["whisper", WHISPER_ERROR_CODES],
    ["translator", TRANSLATOR_ERROR_CODES],
    ["engine", ENGINE_ERROR_CODES],
  ];

  for (const [domain, codes] of domains) {
    assert.ok(codes.length > 0, `${domain}: no codes declared`);
    for (const code of codes) {
      const doc = describeCode(domain, code);
      assert.ok(doc, `${domain}:${code} has no entry in the error catalog`);
      assert.ok(doc.summary.length > 0, `${domain}:${code} has no summary`);
      assert.ok(doc.cause.length > 0, `${domain}:${code} has no cause`);
      // The fix is the whole point: a code that does not say what to do next
      // is just a different way of writing "something failed".
      assert.ok(doc.fix.length > 10, `${domain}:${code} has no actionable fix`);
    }
  }

  assert.equal(describeCode("engine", "NOT_A_REAL_CODE"), undefined);
}

function main(): void {
  testIdsAreUniqueAndResolvable();
  testFiles();
  testRuntimeFilesExist();
  testMetadata();
  testModesAndPairBudget();
  testErrorCatalogCoverage();
  console.log(
    `check:catalog ok (${ALL_MODELS.length} modelos, ${ASR_MODELS.length} ASR, ${MT_MODELS.length} MT, ${VAD_MODELS.length} VAD)`,
  );
}

try {
  main();
} catch (err) {
  console.error("check:catalog failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
