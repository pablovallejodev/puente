# Puente

<p align="center">
  <img src="puente/assets/icon.png" width="180" alt="Puente romano entre vegetación, símbolo de Puente" />
</p>

> **Lo que une civilizaciones.**

Traducción de voz en tiempo real. Sin internet. Gratis. Código abierto.

[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-71697A)](LICENSE)
[![Expo](https://img.shields.io/badge/Expo-SDK%2056-4A4452)](puente/package.json)

Puente procesa la voz en el teléfono con **Whisper ONNX** (STT on-device,
tiny/base/small) y traduce con **NLLB-200 ONNX** (600M Q8). El audio no sale del
dispositivo ni se guarda.

La identidad, la voz y las reglas de diseño están documentadas en
[`BRAND.md`](BRAND.md).

## Cómo funciona

**Idioma input** por defecto = **Universal** (Whisper detecta el idioma y lo pasa a NLLB). Override opcional a un idioma fijo. **Idioma base** inicial = locale del teléfono.

Los modelos **no van empaquetados** en el APK: el usuario los descarga desde Hugging Face en la pantalla `/modelos` (primera apertura obligatoria). Catálogo en [`puente/src/constants/model-catalog.ts`](puente/src/constants/model-catalog.ts).

## Contribuir

¿Quieres ayudar? El código está abierto. Revisa los issues, abre uno si has
encontrado un problema o propón un cambio pequeño y concreto. La futura
traducción de la interfaz será una buena puerta de entrada para la comunidad.

## Proyectos relacionados

[RTranslator](https://github.com/niedev/RTranslator) demostró el valor de la
traducción local y en tiempo real, y es trabajo previo relevante para este
espacio. Puente comparte ese objetivo desde una implementación y una identidad
propias.

## Desarrollo

Ver [TESTING.md](puente/TESTING.md) para development build y códigos de error. Los scripts `check:nllb` / `check:whisper` requieren `NLLB_MODEL_DIR` / `WHISPER_MODEL_DIR` y cargan modelos grandes en RAM: úsalos solo con la máquina desocupada.
