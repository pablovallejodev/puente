# Pruebas NLLB + Whisper Tiny (Puente)

Assets:
- `assets/models/nllb/` — NLLB-200 distilled 600M Q8
- `assets/models/whisper-tiny/` — Whisper Tiny INT8 (encoder + decoder_merged)

STT: Whisper on-device (no Google/ASI).

## Check local (sin dispositivo)

Desde `puente/`:

```bash
pnpm install
pnpm check:nllb      # ~870 MB en RAM — no ejecutar si la máquina está cargada
pnpm check:whisper  # más ligero (~40 MB modelos + mel)
```

- `check:nllb`: 3 fixtures en→es, es→en, ca→en.
- `check:whisper`: transcribe `scripts/fixtures/jfk.wav` con Whisper Tiny INT8.

**Cuidado:** `check:nllb` y `expo export` / builds locales son pesados. Ejecútalos solo con VS Code/contenedores/otros agentes parados.

**Nota:** estos checks validan inferencia ONNX y parseo de `tokenizer.jsondata`. **No** validan el registro de assets de Metro en el APK.

## Verificar empaquetado Metro (sin APK)

Opcional y **pesado** (bundle completo). Solo con máquina libre:

```bash
cd puente
npx expo export --platform android --output-dir /tmp/puente-export
grep -E 'nllb/|whisper-tiny/|tokenizer\.jsondata|encoder_model|decoder_model' /tmp/puente-export/metadata.json
```

Deben aparecer assets bajo `nllb/` y `whisper-tiny/`. Si falta alguno, no generes APK todavía.

## Development build (Android)

Requisito: **no funciona en Expo Go** (módulo nativo ONNX).

```bash
cd puente
pnpm install
npx expo prebuild --clean
npx expo run:android
```

O con EAS (perfil `development` en `eas.json`):

```bash
eas build -p android --profile development
```

## APK de prueba

```bash
eas build -p android --profile preview
```

**Importante:** tras corregir el tokenizer (`tokenizer.jsondata`), debes **generar e instalar una APK nueva**. Desinstala la anterior o borra datos de la app. El botón **Reintentar** no puede reparar un asset que no estaba en el registro de una APK antigua.

## Qué probar en el móvil

1. Arranque: carga Whisper (~40 MB) + NLLB (~870 MB la primera vez) → **Listo · Whisper on-device**.
2. Hablar en el idioma de entrada → aparece texto → NLLB traduce.
3. Modo avión **después** de la primera carga: STT + traducción siguen funcionando (GrapheneOS sin Google STT OK).
4. Si falla, la pantalla muestra `[CODIGO@etapa] mensaje` o código `whisper_*`. `ASSET_UNAVAILABLE` → rebuild APK.

## Códigos de error frecuentes

| Código | Etapa | Significado |
|--------|-------|-------------|
| `ASSET_UNAVAILABLE` | `tokenizer.load` | Tokenizer no empaquetado o APK antigua → **nueva APK** |
| `ORT_NOT_REGISTERED` | `session.encoder` | ONNX no autolinked → `npx expo prebuild --clean` y rebuild |
| `ASSET_INCOMPLETE` | `asset.prepare` | Copia de modelo corrupta → borrar datos app y reinstalar |
| `DECODE_FAILED` | `decode.run` | Fallo en inferencia decoder (memoria o modelo) |
| `OUT_OF_MEMORY` | `decode.run` | RAM insuficiente para NLLB-600M |

## Tokenizer como asset raw

Los tokenizers grandes están en `assets/models/nllb/tokenizer.jsondata` y `assets/models/whisper-tiny/tokenizer.jsondata` (extensión `jsondata` en Metro). Los JSON pequeños (`config.json`, etc.) se importan como módulos normales. **No** uses `Asset.fromModule(require('*.json'))`: Metro devuelve un objeto parseado y fallará con `[object Object]`.

## Parche ONNX (Expo SDK 56)

El parche en `patches/onnxruntime-react-native@1.24.3.patch` elimina `unimodule.json` (autolinking Expo) y el bloque Gradle 9 obsoleto. Tras `pnpm install`, verificar que el parche se aplica.

Tras `npx expo prebuild --clean`, comprobar en Android que `PackageList` incluye `OnnxruntimePackage` (no usar el config plugin oficial de ORT en Expo 56).
