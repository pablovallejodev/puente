# puente

Traducción offline en tiempo real: **Whisper ONNX** (STT on-device, tiny/base/small) + **NLLB-200 ONNX** (traducción, 600M Q8).

Los modelos **no van empaquetados** en el APK: el usuario los descarga desde Hugging Face en la pantalla `/modelos` (primera apertura obligatoria). Catálogo en [`puente/src/constants/model-catalog.ts`](puente/src/constants/model-catalog.ts).

Ver [TESTING.md](puente/TESTING.md) para development build y códigos de error. Los scripts `check:nllb` / `check:whisper` requieren `NLLB_MODEL_DIR` / `WHISPER_MODEL_DIR` y cargan modelos grandes en RAM: úsalos solo con la máquina desocupada.
