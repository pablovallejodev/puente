import { Platform } from 'react-native';
import { env } from '@huggingface/transformers';

let configured = false;

function blockRemoteModelFetch(): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    throw new Error(
      `Remote model fetch is disabled in Puente. Attempted to fetch: ${url}. Ensure local model files exist and env.useFS is enabled.`,
    );
  }) as typeof fetch;
}

export function configureTransformersForNative(): void {
  if (configured || Platform.OS === 'web') {
    return;
  }

  env.useFS = true;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.useWasmCache = false;
  env.useCustomCache = false;
  env.customCache = null;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.fetch = blockRemoteModelFetch();

  configured = true;

  console.log('[puente] transformers env configured', {
    useFS: env.useFS,
    allowLocalModels: env.allowLocalModels,
    allowRemoteModels: env.allowRemoteModels,
    useCustomCache: env.useCustomCache,
  });
}

if (Platform.OS !== 'web') {
  configureTransformersForNative();
}
