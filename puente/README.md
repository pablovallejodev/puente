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

`onnxruntime-react-native@1.24.3` is patched via `pnpm patch` (see `pnpm-workspace.yaml` → `patchedDependencies`) because its Gradle script uses `VersionNumber.parse()`, which breaks on Gradle 9 (Expo SDK 56). Upstream fix: [microsoft/onnxruntime#27281](https://github.com/microsoft/onnxruntime/issues/27281) / [#27385](https://github.com/microsoft/onnxruntime/pull/27385). Remove the Gradle hunks from the patch when npm ships a version that includes that fix.

`OnnxruntimePackage` is registered in `MainApplication.kt` via the `withOnnxruntime` plugin in `app.config.js` (required on npm **1.24.3**; upstream [PR #28266](https://github.com/microsoft/onnxruntime/pull/28266) adds the same to `onnxruntime-react-native/app.plugin.js` in a future release). After `npx expo prebuild`, confirm:

```bash
grep -n OnnxruntimePackage android/app/src/main/java/**/MainApplication.kt
```

### Troubleshooting (Android bootstrap)

Model download and ONNX load log with the `[puente]` prefix. On a connected device:

```bash
./scripts/android-logcat-puente.sh
```

Common failures:

| Symptom | Likely cause |
|---------|----------------|
| Download fails right after 100% on large `.onnx` files | Validation used to read entire files into memory; fixed by reading only the first 16 bytes of the header |
| `OrtApi is not initialized` / `install` of null | Dev build missing `OnnxruntimePackage()` — run `npx expo prebuild --clean` and rebuild |
| `Remote model fetch is disabled` | Local model paths missing; re-download or check `document/models/` |
| `Protobuf parsing failed` | Corrupt or truncated ONNX — tap Retry to re-download |

### Upgrading `onnxruntime-react-native` (when npm > 1.24.3)

When a release includes [PR #28266](https://github.com/microsoft/onnxruntime/pull/28266) (`react-native.config.js` + `withMainApplication` in the official Expo plugin):

1. `pnpm update onnxruntime-react-native` and confirm `node_modules/onnxruntime-react-native/react-native.config.js` exists.
2. Remove the custom `withOnnxruntime` plugin from `app.config.js` and delete project-root `react-native.config.js` (keep `@automatalabs/react-native-transformers` in `app.json`).
3. Trim `patches/onnxruntime-react-native@*.patch` to only what upstream still lacks (bridgeless `getJSCallInvokerHolder`, `binding.ts` `Module != null` guard for `export:embed`).
4. `npx expo prebuild --clean` and verify a single `add(OnnxruntimePackage())` in `MainApplication.kt`.

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
