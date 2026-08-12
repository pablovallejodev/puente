/**
 * Golden check: encoder + decoder KV cache + short translations.
 * Run: pnpm check:nllb
 *
 * Validates model inference and tokenizer parse — not Metro asset registry.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Tokenizer } from '@huggingface/tokenizers';
import { InferenceSession, Tensor } from 'onnxruntime-node';

import { SESSION_OPTIONS, translateText, type ModelConfig, type GenerationConfig } from '../src/lib/nllb-inference';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = process.env.NLLB_MODEL_DIR?.trim() || path.join(ROOT, 'assets', 'models', 'nllb');

/** Minimum expected size for tokenizer (~17 MB). */
const MIN_TOKENIZER_BYTES = 1_000_000;

type Fixture = {
  name: string;
  text: string;
  srcLang: string;
  tgtLang: string;
  minOutputLen: number;
};

const FIXTURES: Fixture[] = [
  {
    name: 'en→es',
    text: 'Hello, how are you?',
    srcLang: 'eng_Latn',
    tgtLang: 'spa_Latn',
    minOutputLen: 3,
  },
  {
    name: 'es→en',
    text: 'Hola, ¿cómo estás?',
    srcLang: 'spa_Latn',
    tgtLang: 'eng_Latn',
    minOutputLen: 3,
  },
  {
    name: 'ca→en',
    text: 'Bon dia, com estàs?',
    srcLang: 'cat_Latn',
    tgtLang: 'eng_Latn',
    minOutputLen: 3,
  },
];

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(MODELS, filename), 'utf8')) as T;
}

function loadTokenizerJson(): Record<string, unknown> {
  const json = path.join(MODELS, 'tokenizer.json');
  const jsondata = path.join(MODELS, 'tokenizer.jsondata');
  let tokenizerPath = jsondata;
  try {
    statSync(json);
    tokenizerPath = json;
  } catch {
    /* use jsondata */
  }
  const stat = statSync(tokenizerPath);
  if (stat.size < MIN_TOKENIZER_BYTES) {
    throw new Error(`tokenizer too small (${stat.size} bytes, expected >= ${MIN_TOKENIZER_BYTES})`);
  }
  const parsed = JSON.parse(readFileSync(tokenizerPath, 'utf8')) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('tokenizer parsed to invalid value');
  }
  console.log(`${path.basename(tokenizerPath)}: ${stat.size} bytes, parse OK`);
  return parsed;
}

async function main(): Promise<void> {
  if (!process.env.NLLB_MODEL_DIR?.trim()) {
    console.error(
      'NLLB_MODEL_DIR no definido.\n' +
        'Los modelos ya no están en assets/. Descarga NLLB 600M Q8 (Xenova) y apunta la variable al directorio\n' +
        'con encoder_model_quantized.onnx, decoder_model_merged_quantized.onnx, configs y tokenizer.json.\n' +
        'Ver TESTING.md y src/constants/model-catalog.ts.',
    );
    process.exit(2);
  }

  const started = Date.now();
  console.log('NLLB golden check');
  console.log(`models: ${MODELS}`);
  console.log(`session options: ${JSON.stringify(SESSION_OPTIONS)}`);

  const modelConfig = loadJson<ModelConfig>('config.json');
  const generationConfig = loadJson<GenerationConfig>('generation_config.json');
  const tokenizerJson = loadTokenizerJson();
  const tokenizerConfig = loadJson<Record<string, unknown>>('tokenizer_config.json');

  const encoderPath = path.join(MODELS, 'encoder_model_quantized.onnx');
  const decoderPath = path.join(MODELS, 'decoder_model_merged_quantized.onnx');

  console.log('loading tokenizer…');
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  const eosTokenId = tokenizer.token_to_id('</s>') ?? generationConfig.eos_token_id;

  console.log('creating encoder session…');
  const encoderSession = await InferenceSession.create(encoderPath, SESSION_OPTIONS);
  console.log('encoder inputs:', encoderSession.inputNames);
  console.log('encoder outputs:', encoderSession.outputNames);

  console.log('creating decoder session…');
  const decoderSession = await InferenceSession.create(decoderPath, SESSION_OPTIONS);
  console.log('decoder inputs:', decoderSession.inputNames.slice(0, 6), '…');
  console.log('decoder outputs:', decoderSession.outputNames.slice(0, 4), '…');

  let passed = 0;
  for (const fixture of FIXTURES) {
    const t0 = Date.now();
    const result = await translateText({
      text: fixture.text,
      srcLang: fixture.srcLang,
      tgtLang: fixture.tgtLang,
      tokenizer,
      encoderSession,
      decoderSession,
      modelConfig,
      eosTokenId,
      TensorCtor: Tensor as unknown as import('../src/lib/nllb-inference').TensorConstructor,
    });
    const ms = Date.now() - t0;

    if (result === null || result.length < fixture.minOutputLen) {
      throw new Error(`${fixture.name}: output too short (${result?.length ?? 0} chars): "${result}"`);
    }

    console.log(`✓ ${fixture.name} (${ms}ms)`);
    console.log(`  in : ${fixture.text}`);
    console.log(`  out: ${result}`);
    passed += 1;
  }

  encoderSession.release();
  decoderSession.release();

  console.log(`\n${passed}/${FIXTURES.length} fixtures passed in ${Date.now() - started}ms`);
}

main().catch((err) => {
  console.error('\n✗ golden check failed');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
