# Puente

Puente listens to speech in any supported language, detects the source language, and translates each complete utterance into a user-chosen **base language**. All inference runs **on-device** after the translation model is downloaded once.

Puente is built with Expo SDK 56 and requires a **development build** — it does not run in Expo Go because it depends on native modules for speech recognition and ONNX inference.

## Features

- Continuous on-device speech recognition with language detection (Android 14+)
- On-device NLLB-200 translation via Transformers.js and ONNX Runtime
- 202 supported languages (FLORES-200 codes)
- Base language auto-detected from device locale on every cold start
- Session-only language override via searchable picker
- Light and dark mode

## First run

On the first cold start, Puente downloads the `Xenova/nllb-200-distilled-600M` model (int8 ONNX pair + tokenizer):

| Component | Approx. size |
|-----------|--------------|
| `encoder_model_int8.onnx` + `decoder_model_merged_int8.onnx` | ~1.9 GB |
| Tokenizer + SentencePiece model | ~17 MB |
| Config files | < 1 MB |

**Use Wi‑Fi and ensure you have at least 2 GB of free storage.** Subsequent launches skip download when cached files are present.

Model files are stored under the app document directory and are not committed to git.

## Development build

Native modules require a dev client. From the `puente/` directory:

```bash
pnpm install
npx expo run:android
# or
npx expo run:ios
```

Then start Metro:

```bash
pnpm start
```

### Android build

`babel-preset-expo` must be a direct devDependency for release builds — pnpm strict resolution and EAS local builds need it when Gradle runs `export:embed`. Verify bundling before a full build:

```bash
npx expo export:embed --platform android --dev false --bundle-output /tmp/index.android.bundle --assets-dest /tmp/assets
```

`onnxruntime-react-native@1.24.3` is patched via `pnpm patch` (see `pnpm-workspace.yaml` → `patchedDependencies`) because its Gradle script uses `VersionNumber.parse()`, which breaks on Gradle 9 (Expo SDK 56). Upstream fix: [microsoft/onnxruntime#27281](https://github.com/microsoft/onnxruntime/issues/27281) / [#27385](https://github.com/microsoft/onnxruntime/pull/27385). Remove the patch when npm ships a version newer than 1.24.3 with the fix.

### Required permissions

| Platform | Permission | Purpose |
|----------|------------|---------|
| Android / iOS | Microphone | Speech input |
| Android / iOS | Speech recognition | Transcription |
| Android | Internet | First-time model download only |

### Native configuration

`app.json` includes:

- `expo-speech-recognition` — microphone and speech recognition permission strings
- `@automatalabs/react-native-transformers` — composes `onnxruntime-react-native`

Metro is configured via `metro.config.js` to resolve ONNX assets. Babel enables `import.meta` transform for Transformers.js.

## Platform notes

| Platform | Support |
|----------|---------|
| Android | Primary — full speech + translation pipeline |
| iOS | Primary — speech recognition; auto language detection may fall back to device locale |
| Web | Fallback message only — native modules unavailable |

**Android language detection** requires Android 14+ with the on-device Google speech service (`com.google.android.as`). On older Android versions, Puente estimates source language from the device locale.

## Scripts

```bash
pnpm start          # Start Expo dev server
pnpm android        # Start with Android
pnpm ios            # Start with iOS
pnpm exec tsc --noEmit
```

## Architecture

| Route | Screen |
|-------|--------|
| `/` | Bootstrap — model download + ONNX load |
| `/home` | Main translation UI |
| `/languages` | Base language picker |

State is managed with React Context (`AppProvider`) — no external state library. Base language resets from device locale on every app launch; picker changes apply for the current session only.
