# Pruebas de traducción NLLB (Puente)

## Check local (sin dispositivo)

Desde `puente/`:

```bash
pnpm install
pnpm check:nllb
```

Debe pasar 3 fixtures: en→es, es→en, ca→en.

**Nota:** este check valida inferencia ONNX y parseo de `tokenizer.jsondata`. **No** valida el registro de assets de Metro en el APK.

## Verificar empaquetado Metro (sin APK)

Tras cambios en assets o `metro.config.js`:

```bash
cd puente
npx expo export --platform android --output-dir /tmp/puente-export
grep -E 'tokenizer\.jsondata|encoder_model|decoder_model' /tmp/puente-export/metadata.json
```

Deben aparecer `tokenizer.jsondata` y los dos `.onnx`. Si falta `tokenizer.jsondata`, no generes APK todavía.

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

1. Arranque: **Cargando modelo…** → **Listo** (~1–2 min la primera vez por copia de ~870 MB + tokenizer).
2. Hablar en **inglés** → traducción al **español** (por defecto).
3. Modo avión **después** de la primera carga: la traducción sigue funcionando.
4. Si falla, la pantalla muestra `[CODIGO@etapa] mensaje`. Si el error es `ASSET_UNAVAILABLE` con “Reinstala la APK”, **Reintentar** no servirá: necesitas rebuild.

## Códigos de error frecuentes

| Código | Etapa | Significado |
|--------|-------|-------------|
| `ASSET_UNAVAILABLE` | `tokenizer.load` | Tokenizer no empaquetado o APK antigua → **nueva APK** |
| `ORT_NOT_REGISTERED` | `session.encoder` | ONNX no autolinked → `npx expo prebuild --clean` y rebuild |
| `ASSET_INCOMPLETE` | `asset.prepare` | Copia de modelo corrupta → borrar datos app y reinstalar |
| `DECODE_FAILED` | `decode.run` | Fallo en inferencia decoder (memoria o modelo) |
| `OUT_OF_MEMORY` | `decode.run` | RAM insuficiente para NLLB-600M |

## Tokenizer como asset raw

El tokenizer grande (~17 MB) está en `assets/models/tokenizer.jsondata` (extensión `jsondata` en Metro). Los JSON pequeños (`config.json`, etc.) se importan como módulos normales. **No** uses `Asset.fromModule(require('*.json'))`: Metro devuelve un objeto parseado y fallará con `[object Object]`.

## Parche ONNX (Expo SDK 56)

El parche en `patches/onnxruntime-react-native@1.24.3.patch` elimina `unimodule.json` (autolinking Expo) y el bloque Gradle 9 obsoleto. Tras `pnpm install`, verificar que el parche se aplica.

Tras `npx expo prebuild --clean`, comprobar en Android que `PackageList` incluye `OnnxruntimePackage` (no usar el config plugin oficial de ORT en Expo 56).
