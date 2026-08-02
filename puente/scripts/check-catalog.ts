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
  isBelowRecommendedRam,
  MT_MODELS,
  pairBudgetBytes,
  pairFitsDevice,
  pairPeakRamBytes,
  PAIR_BUDGET_FRACTION,
  RAM_TIER,
  recommendForDevice,
  requireModelSpec,
  SILERO_VAD_MODEL_ID,
  VAD_MODELS,
  type ModelRamTier,
  type ModelSpec,
  type ModelTask,
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
    assert.match(spec.storage, /^[a-z0-9-]+$/, `unsafe storage: ${spec.storage}`);
  }

  assert.equal(ALL_MODELS.length, ASR_MODELS.length + MT_MODELS.length + VAD_MODELS.length);
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
        file.url.startsWith(`https://huggingface.co/${spec.hfRepoId}/resolve/main/`),
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
        assert.ok(runtime.maxTokens > 0 && runtime.maxTokens < runtime.contextSize);
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
    assert.ok(ENGINE_LABEL[spec.runtime.engine], `${spec.id}: unlabelled engine`);
    assert.ok(spec.license.url.startsWith("https://"), `${spec.id}: licence url`);

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

  // Tiers must be strictly increasing, or the ladder in recommendForDevice
  // silently skips a step.
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

function testRecommendations(): void {
  const lightestOf = (task: ModelTask) =>
    ALL_MODELS.filter((m) => m.task === task).sort(
      (a, b) => a.peakRamBytes - b.peakRamBytes,
    )[0];

  for (const ram of [null, 2 * GB, 4 * GB, 6 * GB, 8 * GB, 12 * GB, 16 * GB]) {
    const rec = recommendForDevice(ram);
    assert.equal(getAsrModelSpec(rec.asrId)?.task, "asr");
    assert.equal(getMtModelSpec(rec.mtId)?.task, "mt");
    assert.equal(rec.vadId, SILERO_VAD_MODEL_ID);
    // One-tap never auto-picks Small or Turbos.
    assert.ok(
      rec.asrId === "whisper-tiny-q" || rec.asrId === "whisper-base-q",
      `one-tap ASR must be tiny/base, got ${rec.asrId}`,
    );
    assert.equal(rec.mtId, "nllb-600m-q8");

    const asr = requireModelSpec(rec.asrId);
    const mt = requireModelSpec(rec.mtId);
    const vad = requireModelSpec(rec.vadId);
    // Prefer a fitting pair; only fall back to the lightest when nothing fits.
    if (ram != null && ram >= RAM_TIER.entry) {
      const fits = pairFitsDevice(
        asr.peakRamBytes,
        mt.peakRamBytes,
        ram,
        vad.peakRamBytes,
      );
      assert.ok(
        fits || rec.asrId === "whisper-tiny-q",
        `recommended pair exceeds a ${ram} B device while tiny is available`,
      );
    }

    for (const id of [rec.asrId, rec.mtId, rec.vadId]) {
      const spec = getModelSpec(id);
      assert.ok(spec, `recommendation ${id} is not in the catalog`);
      assert.ok(
        !isBelowRecommendedRam(spec, ram) ||
          spec.id === "whisper-tiny-q" ||
          spec.id === "nllb-600m-q8" ||
          spec.id === SILERO_VAD_MODEL_ID ||
          spec.id === lightestOf(spec.task).id,
        `recommended ${id} exceeds a ${ram} B device while a lighter ${spec.task} model exists`,
      );
    }
  }

  // More memory must never downgrade the transcriber; ceiling is Base.
  const order = ["whisper-tiny-q", "whisper-base-q"];
  let previous = -1;
  for (const ram of [2 * GB, 6 * GB, 8 * GB, 12 * GB]) {
    const index = order.indexOf(recommendForDevice(ram).asrId);
    assert.ok(index >= 0, `unexpected ASR for ${ram}`);
    assert.ok(index >= previous, "a bigger phone was offered a smaller model");
    previous = index;
  }

  assert.equal(PAIR_BUDGET_FRACTION, 0.35);
  assert.equal(pairBudgetBytes(8 * GB), 8 * GB * PAIR_BUDGET_FRACTION);
  assert.equal(pairBudgetBytes(null), null);
  assert.equal(pairBudgetBytes(0), null);

  const tiny = requireModelSpec("whisper-tiny-q").peakRamBytes;
  const nllb = requireModelSpec("nllb-600m-q8").peakRamBytes;
  assert.equal(exceedsPairBudget(tiny, nllb, 16 * GB), false);
  assert.equal(
    exceedsPairBudget(
      requireModelSpec("whisper-small-q").peakRamBytes,
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
  testRecommendations();
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
