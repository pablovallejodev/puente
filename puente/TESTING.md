# Pruebas NLLB + Whisper (Puente)

Los modelos **ya no van en el APK**. Se descargan desde Hugging Face (Xenova) en la pantalla `/modelos` y se guardan en `documentDirectory/models/`.

Catálogo: `src/constants/model-catalog.ts`.

## Check local (sin dispositivo)

Desde `puente/`, apunta a un directorio con los ficheros ya descargados (misma estructura que en el teléfono):

```bash
# Ejemplo tras descargar a mano desde HF:
export WHISPER_MODEL_DIR=/path/to/whisper-tiny-q   # encoder + decoder_merged quantized + configs + tokenizer.json
export NLLB_MODEL_DIR=/path/to/nllb-600m-q8

pnpm check:whisper   # solo si WHISPER_MODEL_DIR está definido
pnpm check:nllb      # solo si NLLB_MODEL_DIR está definido — pesado (~1 GB RAM)
```

**Cuidado:** `check:nllb` carga ~900 MB en RAM. No lo ejecutes si la máquina está justa.

## Development build (Android)

Requisito: **no funciona en Expo Go** (módulo nativo ONNX).

```bash
cd puente
pnpm install
npx expo prebuild --clean
npx expo run:android
```

## Qué probar en el móvil

1. Primera apertura → pantalla **Modelos** (gate). Sin salir hasta Whisper + NLLB descargados y seleccionados.
2. “Descargar lo mejor para este teléfono” o cards individuales.
3. Tras listo → Traductor. Icono ⚙ → volver a Modelos.
4. Hablar → Whisper transcribe → NLLB traduce. Modo avión tras descarga OK.
5. Errores de descarga/selección: `[MODEL_*@stage] …` (ver tabla abajo). Inferencia: códigos Whisper/Translator existentes.

## Códigos de error — modelos (descarga / selección)

Formato: `[CODE@stage] mensaje (context)`

| Código | Stage típico | Significado |
|--------|--------------|-------------|
| `MODEL_UNKNOWN_ID` | `catalog.resolve` | id no está en el catálogo |
| `MODEL_NOT_INSTALLED` | `install.check` / `engine.load` | falta `.complete` o dir |
| `MODEL_INCOMPLETE` | `install.check` / `download.verify` | falta un fichero |
| `MODEL_SIZE_MISMATCH` | `download.verify` | tamaño ≠ esperado HF |
| `MODEL_ALREADY_DOWNLOADING` | `download.start` | descarga duplicada |
| `MODEL_DOWNLOAD_OFFLINE` | `network.check` | sin red |
| `MODEL_DOWNLOAD_HTTP` | `download.file` | HTTP ≠ 2xx |
| `MODEL_DOWNLOAD_FAILED` | `download.file` | fallo FS/red |
| `MODEL_DOWNLOAD_CANCELLED` | `download.file` | cancelada |
| `MODEL_DISK_FULL` | `storage.space` | sin espacio |
| `MODEL_FINALIZE_FAILED` | `download.finalize` | move / `.complete` |
| `MODEL_SELECT_NOT_INSTALLED` | `select.apply` | Select sin instalar |
| `MODEL_SELECT_FAILED` | `select.apply` | fallo al seleccionar |
| `MODEL_PREFS_READ_FAILED` | `prefs.read` | SecureStore |
| `MODEL_PREFS_WRITE_FAILED` | `prefs.write` | SecureStore |
| `MODEL_ENGINE_PATH_MISSING` | `engine.load` | path ORT ausente |
| `MODEL_GATE_INCOMPLETE` | `gate.ready` | onboarding incompleto |

## Códigos de error — inferencia (existentes)

| Código | Etapa | Significado |
|--------|-------|-------------|
| `ORT_NOT_REGISTERED` | `session.encoder` | ONNX no autolinked → prebuild + rebuild |
| `DECODE_FAILED` | `decode.run` | Fallo decoder |
| `OUT_OF_MEMORY` | `decode.run` | RAM insuficiente (p. ej. NLLB) |
| `ENGINE_LOAD_FAILED` | `asset.prepare` | Sin modelo seleccionado / ModelError anidado |

## Tokenizer

Tras la migración, el tokenizer se lee como `tokenizer.json` desde disco (ya no Metro `.jsondata`).
