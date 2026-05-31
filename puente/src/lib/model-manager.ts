import { Platform } from 'react-native';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { env, pipeline, type TranslationPipeline } from '@huggingface/transformers';

import {
  downloadFileToDestination,
  requestDownloadPermissions,
} from '@/lib/android-background-download';
import { configureTransformersForNative } from '@/lib/transformers-native-setup';

export const MODEL_ID = 'nllb-200-distilled-600M';
const HF_BASE = 'https://huggingface.co/Xenova/nllb-200-distilled-600M/resolve/main';

export const MODEL_FILES = [
  {
    path: 'onnx/encoder_model_int8.onnx',
    estimatedBytes: 415_346_576,
    minBytes: 411_193_110,
  },
  {
    path: 'onnx/decoder_model_merged_int8.onnx',
    estimatedBytes: 1_516_432_837,
    minBytes: 1_501_268_509,
  },
  {
    path: 'sentencepiece.bpe.model',
    estimatedBytes: 17_000_000,
    minBytes: 16_000_000,
  },
  { path: 'config.json', estimatedBytes: 4_000, minBytes: 100 },
  { path: 'generation_config.json', estimatedBytes: 4_000, minBytes: 100 },
  {
    path: 'tokenizer.json',
    estimatedBytes: 17_000_000,
    minBytes: 16_000_000,
  },
  { path: 'tokenizer_config.json', estimatedBytes: 4_000, minBytes: 100 },
  { path: 'special_tokens_map.json', estimatedBytes: 4_000, minBytes: 50 },
] as const;

export type ModelFilePath = (typeof MODEL_FILES)[number]['path'];

const ONNX_PATHS = MODEL_FILES.filter(({ path }) => path.endsWith('.onnx')).map(({ path }) => path);

const ONNX_HEADER_BYTES = 16;

export const ESTIMATED_TOTAL_BYTES = MODEL_FILES.reduce((sum, file) => sum + file.estimatedBytes, 0);

let translatorPromise: Promise<TranslationPipeline> | null = null;

export function getModelDirectory(): Directory {
  return new Directory(Paths.document, 'models', MODEL_ID);
}

export function getModelFile(relativePath: string): File {
  const segments = relativePath.split('/');
  return new File(getModelDirectory(), ...segments);
}

function fileUrl(relativePath: string): string {
  return `${HF_BASE}/${relativePath}?download=true`;
}

function downloadTaskId(relativePath: string): string {
  return `puente-model-${relativePath.replace(/\//g, '-')}`;
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function isOnnxLoadError(message: string): boolean {
  return (
    message.includes('Protobuf parsing failed') ||
    message.includes('Load model from') ||
    message.includes('Failed to load model')
  );
}

async function readFilePrefix(file: File, length: number): Promise<Uint8Array | null> {
  try {
    const handle = file.open(FileMode.ReadOnly);
    try {
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

async function looksLikeOnnxFile(file: File): Promise<boolean> {
  if (!file.exists || file.size === 0) {
    return false;
  }

  const header = await readFilePrefix(file, ONNX_HEADER_BYTES);
  if (!header || header.length === 0) {
    return false;
  }

  const prefix = String.fromCharCode(...header.slice(0, Math.min(ONNX_HEADER_BYTES, header.length)));
  if (prefix.startsWith('<') || prefix.startsWith('{') || prefix.startsWith('version')) {
    return false;
  }
  return true;
}

async function validateModelFile(
  file: File,
  relativePath: string,
  minBytes: number,
): Promise<boolean> {
  if (!file.exists || file.size < minBytes) {
    console.log('[puente] validateModelFile:invalid', relativePath, file.exists ? file.size : 'missing');
    return false;
  }

  if (relativePath.endsWith('.onnx') && !(await looksLikeOnnxFile(file))) {
    console.log('[puente] validateModelFile:invalid-onnx-header', relativePath, file.size);
    return false;
  }

  console.log('[puente] validateModelFile:ok', relativePath, file.size);
  return true;
}

export async function validateModelFiles(): Promise<{
  valid: boolean;
  invalidPaths: ModelFilePath[];
}> {
  const invalidPaths: ModelFilePath[] = [];

  for (const { path, minBytes } of MODEL_FILES) {
    const file = getModelFile(path);
    if (!file.exists || file.size < minBytes) {
      console.log('[puente] validateModelFiles:invalid', path, file.exists ? file.size : 'missing');
      invalidPaths.push(path);
      continue;
    }

    if (path.endsWith('.onnx') && !(await looksLikeOnnxFile(file))) {
      console.log('[puente] validateModelFiles:invalid-onnx-header', path, file.size);
      invalidPaths.push(path);
      continue;
    }

    console.log('[puente] validateModelFiles:ok', path, file.size);
  }

  return { valid: invalidPaths.length === 0, invalidPaths };
}

export function getModelDownloadProgress(): number {
  let completedBytes = 0;

  for (const { path, estimatedBytes, minBytes } of MODEL_FILES) {
    const file = getModelFile(path);
    if (file.exists && file.size >= minBytes) {
      completedBytes += estimatedBytes;
    } else if (file.exists) {
      completedBytes += file.size;
    }
  }

  return Math.min(100, Math.round((completedBytes / ESTIMATED_TOTAL_BYTES) * 100));
}

export function clearModelFiles(paths?: string[]): void {
  const toClear = paths ?? MODEL_FILES.map(({ path }) => path);

  for (const path of toClear) {
    const file = getModelFile(path);
    if (file.exists) {
      console.log('[puente] clearModelFiles', path, file.size);
      file.delete();
    }
  }
}

export async function checkModelReady(): Promise<boolean> {
  const { valid } = await validateModelFiles();
  return valid;
}

async function prepareModelDirectory(): Promise<void> {
  const modelDir = getModelDirectory();
  if (!modelDir.exists) {
    modelDir.create({ intermediates: true, idempotent: true });
  }
}

async function prepareDestination(relativePath: string): Promise<File> {
  const destination = getModelFile(relativePath);
  const parent = destination.parentDirectory;

  if (!parent.exists) {
    parent.create({ intermediates: true, idempotent: true });
  }

  if (destination.exists) {
    console.log('[puente] downloadModel:delete-invalid', relativePath, destination.size);
    destination.delete();
  }

  return destination;
}

async function downloadModelExpoFs(onProgress: (pct: number) => void): Promise<void> {
  console.log('[puente] downloadModel:expo-fs:start', { fileCount: MODEL_FILES.length });

  await prepareModelDirectory();

  let completedBytes = 0;

  for (const { path, estimatedBytes, minBytes } of MODEL_FILES) {
    const destination = getModelFile(path);

    if (await validateModelFile(destination, path, minBytes)) {
      console.log('[puente] downloadModel:skip', path, destination.size);
      completedBytes += estimatedBytes;
      onProgress(Math.min(100, Math.round((completedBytes / ESTIMATED_TOTAL_BYTES) * 100)));
      continue;
    }

    await prepareDestination(path);

    console.log('[puente] downloadModel:file', path);

    const task = File.createDownloadTask(fileUrl(path), destination, {
      sessionType: 'background',
      onProgress: ({ bytesWritten, totalBytes }) => {
        const fileTotal = totalBytes > 0 ? totalBytes : estimatedBytes;
        const aggregate = completedBytes + Math.min(bytesWritten, fileTotal);
        onProgress(Math.min(100, Math.round((aggregate / ESTIMATED_TOTAL_BYTES) * 100)));
      },
    });

    await task.downloadAsync();
    if (!(await validateModelFile(destination, path, minBytes))) {
      if (destination.exists) {
        destination.delete();
      }
      throw new Error(`Download failed or produced an invalid file: ${path}`);
    }

    console.log('[puente] downloadModel:done', path, destination.size);
    completedBytes += estimatedBytes;
    onProgress(Math.min(100, Math.round((completedBytes / ESTIMATED_TOTAL_BYTES) * 100)));
  }

  console.log('[puente] downloadModel:expo-fs:complete');
  onProgress(100);
}

async function downloadModelAndroid(onProgress: (pct: number) => void): Promise<void> {
  console.log('[puente] downloadModel:android:start', { fileCount: MODEL_FILES.length });

  await requestDownloadPermissions();
  await prepareModelDirectory();

  let completedBytes = 0;

  for (const { path, estimatedBytes, minBytes } of MODEL_FILES) {
    const destination = getModelFile(path);

    if (await validateModelFile(destination, path, minBytes)) {
      console.log('[puente] downloadModel:skip', path, destination.size);
      completedBytes += estimatedBytes;
      onProgress(Math.min(100, Math.round((completedBytes / ESTIMATED_TOTAL_BYTES) * 100)));
      continue;
    }

    if (destination.exists) {
      await prepareDestination(path);
    } else {
      const parent = destination.parentDirectory;
      if (!parent.exists) {
        parent.create({ intermediates: true, idempotent: true });
      }
    }

    console.log('[puente] downloadModel:file', path);

    await downloadFileToDestination({
      id: downloadTaskId(path),
      url: fileUrl(path),
      destinationUri: destination.uri,
      onProgress: (bytesWritten, totalBytes) => {
        const fileTotal = totalBytes > 0 ? totalBytes : estimatedBytes;
        const aggregate = completedBytes + Math.min(bytesWritten, fileTotal);
        onProgress(Math.min(100, Math.round((aggregate / ESTIMATED_TOTAL_BYTES) * 100)));
      },
    });

    if (!(await validateModelFile(destination, path, minBytes))) {
      if (destination.exists) {
        destination.delete();
      }
      throw new Error(`Download failed or produced an invalid file: ${path}`);
    }

    console.log('[puente] downloadModel:done', path, destination.size);
    completedBytes += estimatedBytes;
    onProgress(Math.min(100, Math.round((completedBytes / ESTIMATED_TOTAL_BYTES) * 100)));
  }

  console.log('[puente] downloadModel:android:complete');
  onProgress(100);
}

export async function downloadModel(onProgress: (pct: number) => void): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Model download is not supported on web.');
  }

  console.log('[puente] downloadModel:start', { platform: Platform.OS, fileCount: MODEL_FILES.length });

  if (Platform.OS === 'android') {
    await downloadModelAndroid(onProgress);
    return;
  }

  await downloadModelExpoFs(onProgress);
}

export async function loadTranslator(): Promise<TranslationPipeline> {
  if (Platform.OS === 'web') {
    throw new Error('On-device translation is not supported on web.');
  }

  if (!(await checkModelReady())) {
    throw new Error('Translation model files are not ready.');
  }

  if (!translatorPromise) {
    translatorPromise = createTranslator().catch((error) => {
      translatorPromise = null;
      throw error;
    });
  }

  return translatorPromise;
}

async function createTranslator(): Promise<TranslationPipeline> {
  configureTransformersForNative();

  const modelDir = getModelDirectory();

  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useFS = true;
  env.useCustomCache = false;
  env.customCache = null;

  console.log('[puente] createTranslator:start', {
    modelUri: modelDir.uri,
    useFS: env.useFS,
    allowRemoteModels: env.allowRemoteModels,
    useCustomCache: env.useCustomCache,
  });

  for (const path of ONNX_PATHS) {
    const file = getModelFile(path);
    console.log('[puente] createTranslator:onnx-file', path, file.exists ? file.size : 'missing');
  }

  try {
    const translator = await pipeline('translation', modelDir.uri, {
      device: 'cpu',
      dtype: 'int8',
      local_files_only: true,
    });

    console.log('[puente] createTranslator:complete');
    return translator;
  } catch (error) {
    const message = toErrorMessage(error);
    console.error('[puente] createTranslator:failed', message);

    if (isOnnxLoadError(message)) {
      for (const path of ONNX_PATHS) {
        const file = getModelFile(path);
        console.error('[puente] createTranslator:corrupt-onnx', path, file.exists ? file.size : 'missing');
      }
      clearModelFiles(ONNX_PATHS);
      throw new Error('Model files were corrupt and have been cleared. Tap Retry to re-download.');
    }

    throw error instanceof Error ? error : new Error(message);
  }
}

export function resetTranslatorCache(): void {
  translatorPromise = null;
}

export function getBootstrapErrorMessage(error: unknown): string {
  const message = toErrorMessage(error);

  if (message.includes('corrupt and have been cleared')) {
    return message;
  }
  if (isOnnxLoadError(message)) {
    return 'Model files may be corrupt. Tap Retry to re-download.';
  }
  if (/invalid file|interrupted|abort|cancel/i.test(message)) {
    return 'Download interrupted. Tap Retry to continue.';
  }
  if (/network|fetch|timeout|connection/i.test(message)) {
    return 'Could not download the model. Check your connection and try again.';
  }
  if (message) {
    return message;
  }
  return 'Something went wrong while preparing Puente. Check your connection and storage, then retry.';
}
