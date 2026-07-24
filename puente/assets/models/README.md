# Models (runtime downloads)

ONNX models are **not** bundled in the app anymore.

- Catalog + Hugging Face URLs: [`src/constants/model-catalog.ts`](../../src/constants/model-catalog.ts)
- On device they live under `FileSystem.documentDirectory/models/{whisper|nllb}/{modelId}/`
- User manages downloads on the `/modelos` screen

Only the validated `*_quantized` / `decoder_model_merged_quantized` format is used.
