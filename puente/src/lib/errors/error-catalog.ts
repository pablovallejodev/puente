/**
 * Documentation for every error code the app can raise.
 *
 * Purpose: turn a log line into an action. When a user reports
 * `[SESSION_ENCODER_FAILED@session.encoder] …`, `describeCode()` answers what
 * broke, why it usually breaks, and what to do — without reading the source.
 *
 * Entries are keyed `${domain}:${CODE}`; the same code name may appear in more
 * than one domain (e.g. `DECODE_FAILED` for both Whisper and the translator)
 * and each gets its own entry.
 *
 * Invariant: every code in the domain unions has an entry here. `check:errors`
 * fails the build otherwise, so this file cannot silently drift.
 */

import type { DiagnosticDomain } from "@/lib/errors/diagnostic";

export type ErrorDoc = {
  /** One line: what failed, in user-facing terms. */
  summary: string;
  /** Why this normally happens. */
  cause: string;
  /** The concrete next step for whoever is debugging. */
  fix: string;
};

export type ErrorDocKey = `${DiagnosticDomain}:${string}`;

const MODEL_DOCS: Record<string, ErrorDoc> = {
  MODEL_UNKNOWN_ID: {
    summary: "El id de modelo no existe en el catálogo.",
    cause:
      "Una preferencia guardada apunta a un modelo retirado del catálogo, o el id está mal escrito en el código.",
    fix: "Vuelve a elegir un modelo en Ajustes → Modelos. Si persiste, borra las preferencias con clearModelPreferences().",
  },
  MODEL_NOT_INSTALLED: {
    summary: "El modelo seleccionado no está descargado.",
    cause:
      "Falta el marcador .complete: la descarga nunca terminó o los ficheros se borraron desde fuera de la app.",
    fix: "Descarga el modelo desde la pantalla Modelos.",
  },
  MODEL_INCOMPLETE: {
    summary: "Falta algún fichero del modelo instalado.",
    cause:
      "La carpeta se borró parcialmente, o el catálogo añadió un fichero nuevo a un modelo ya instalado.",
    fix: "Borra el modelo y vuelve a descargarlo; la instalación es atómica y se rehará entera.",
  },
  MODEL_SIZE_MISMATCH: {
    summary: "Un fichero descargado no tiene el tamaño esperado.",
    cause:
      "Descarga truncada, un proxy que reescribe la respuesta, o el repositorio de Hugging Face publicó una revisión nueva del fichero.",
    fix: "Reintenta la descarga. Si se repite con la misma diferencia de bytes, el catálogo está desactualizado: compara con la API de HF y corrige expectedBytes.",
  },
  MODEL_ALREADY_DOWNLOADING: {
    summary: "Ya hay una descarga en curso para ese modelo.",
    cause: "Doble pulsación o dos pantallas pidiendo la misma descarga.",
    fix: "Espera a que termine, o cancélala con cancelModelDownload().",
  },
  MODEL_DOWNLOAD_OFFLINE: {
    summary: "No hay conexión para descargar.",
    cause: "El dispositivo está sin red o sin acceso real a Internet.",
    fix: "Conéctate a una red. Los modelos ya instalados siguen funcionando sin conexión.",
  },
  MODEL_DOWNLOAD_HTTP: {
    summary: "Hugging Face respondió con un código de error.",
    cause:
      "401/403 en un repositorio con licencia aceptada manualmente, 404 si la ruta cambió, 5xx si el CDN falla.",
    fix: "Revisa httpStatus y url en el contexto. Un 404 significa que el catálogo apunta a una ruta que ya no existe.",
  },
  MODEL_DOWNLOAD_FAILED: {
    summary: "La descarga se interrumpió.",
    cause: "Corte de red, cambio de Wi-Fi a datos, o la app pasó a segundo plano.",
    fix: "Reintenta. La carpeta parcial se limpia sola en cada intento.",
  },
  MODEL_DOWNLOAD_CANCELLED: {
    summary: "Descarga cancelada por el usuario.",
    cause: "Flujo normal, no es un fallo.",
    fix: "Ninguna acción necesaria.",
  },
  MODEL_DOWNLOAD_TIMEOUT: {
    summary: "La descarga superó el tiempo máximo.",
    cause: "Red muy lenta para un modelo de varios cientos de megabytes.",
    fix: "Reintenta con mejor cobertura, o elige un modelo más pequeño.",
  },
  MODEL_DISK_FULL: {
    summary: "No queda espacio en el dispositivo.",
    cause:
      "Los modelos necesitan hasta el doble de su tamaño durante la instalación: se descargan en .partial y luego se mueven.",
    fix: "Libera espacio o borra un modelo que no uses.",
  },
  MODEL_FINALIZE_FAILED: {
    summary: "No se pudo mover la descarga a su carpeta final.",
    cause:
      "Otro proceso tenía la carpeta abierta, o el sistema de ficheros rechazó el move.",
    fix: "Reintenta. Si persiste, borra el modelo y vuelve a descargarlo.",
  },
  MODEL_SELECT_NOT_INSTALLED: {
    summary: "No se puede activar un modelo que no está instalado.",
    cause: "La UI ofreció seleccionar antes de que terminase la verificación.",
    fix: "Descarga el modelo primero.",
  },
  MODEL_SELECT_FAILED: {
    summary: "No se pudo guardar el modelo activo.",
    cause: "El almacén seguro rechazó la escritura.",
    fix: "Revisa el error envuelto; suele ser el mismo caso que MODEL_PREFS_WRITE_FAILED.",
  },
  MODEL_PREFS_READ_FAILED: {
    summary: "No se pudieron leer las preferencias.",
    cause:
      "expo-secure-store no está disponible, o el llavero del dispositivo está bloqueado.",
    fix: "Reinicia la app. Si persiste, la app arranca con los valores por defecto sin perder los modelos descargados.",
  },
  MODEL_PREFS_WRITE_FAILED: {
    summary: "No se pudieron guardar las preferencias.",
    cause: "Igual que la lectura: almacén seguro no disponible.",
    fix: "La elección no se recordará entre arranques, pero la sesión actual sigue funcionando.",
  },
  MODEL_DELETE_ACTIVE_FORBIDDEN: {
    summary: "No se puede borrar el modelo que está en uso.",
    cause: "Protección: borrarlo dejaría la app sin motor.",
    fix: "Selecciona otro modelo de la misma tarea y vuelve a intentarlo.",
  },
  MODEL_ENGINE_PATH_MISSING: {
    summary: "Falta una ruta que el motor necesita.",
    cause:
      "El directorio de documentos no está disponible, o el fichero desapareció entre la verificación y la carga.",
    fix: "Revisa path en el contexto. Si el fichero no está, reinstala el modelo.",
  },
  MODEL_GATE_INCOMPLETE: {
    summary: "Faltan modelos para poder usar el traductor.",
    cause: "Se necesita un modelo de transcripción y uno de traducción activos.",
    fix: "Completa la configuración en la pantalla Modelos.",
  },
};

const SHARED_ORT_DOCS: Record<string, ErrorDoc> = {
  ASSET_UNAVAILABLE: {
    summary: "Un recurso empaquetado no se pudo resolver.",
    cause: "El registro de assets de Metro no lo incluyó en el bundle.",
    fix: "Reinicia Metro con --reset-cache y reconstruye.",
  },
  ASSET_COPY_FAILED: {
    summary: "No se pudo copiar un recurso al almacenamiento local.",
    cause: "Sin espacio, o permisos de escritura denegados.",
    fix: "Libera espacio y reintenta.",
  },
  ASSET_INCOMPLETE: {
    summary: "El recurso copiado está incompleto.",
    cause: "La copia se interrumpió a mitad.",
    fix: "Borra el modelo y vuelve a instalarlo.",
  },
  TOKENIZER_LOAD_FAILED: {
    summary: "No se pudo construir el tokenizador.",
    cause:
      "tokenizer.json o tokenizer_config.json corrupto o incompatible con @huggingface/tokenizers.",
    fix: "Reinstala el modelo. Si el repositorio de HF cambió el formato, hay que actualizar el catálogo.",
  },
  SESSION_ENCODER_FAILED: {
    summary: "ONNX Runtime no pudo crear la sesión del encoder.",
    cause:
      "Fichero .onnx corrupto, operadores no soportados por esta build, o memoria insuficiente para mapear el grafo.",
    fix: "Mira el mensaje nativo. Si menciona memoria, elige un modelo más pequeño; si menciona un operador, el modelo no es compatible con esta versión de ORT.",
  },
  SESSION_DECODER_FAILED: {
    summary: "ONNX Runtime no pudo crear la sesión del decoder.",
    cause: "Igual que el encoder; el decoder suele ser el fichero más grande.",
    fix: "Suele ser falta de memoria: prueba un modelo con menor requisito de RAM.",
  },
  ORT_NOT_REGISTERED: {
    summary: "El módulo nativo de ONNX Runtime no está enlazado.",
    cause:
      "Se instalaron dependencias nativas nuevas sin regenerar el proyecto nativo.",
    fix: "pnpm install && npx expo prebuild --clean, y reconstruye la app.",
  },
  LANGUAGE_UNSUPPORTED: {
    summary: "El modelo no admite ese idioma.",
    cause:
      "El par origen/destino no está en el vocabulario del modelo activo. Cada modelo cubre un conjunto distinto.",
    fix: "Elige otro idioma, o cambia a un modelo con mayor cobertura (NLLB y MADLAD son los más amplios).",
  },
  ENCODE_FAILED: {
    summary: "Falló la pasada del encoder.",
    cause: "Entrada con forma inesperada, o el runtime se quedó sin memoria.",
    fix: "Revisa el contexto. Si se repite solo con audios largos, es memoria.",
  },
  DECODE_FAILED: {
    summary: "Falló un paso del decoder.",
    cause:
      "Desajuste en la caché KV, o memoria insuficiente a mitad de la generación.",
    fix: "Revisa step en el contexto: fallar en el paso 0 apunta a formas del modelo; fallar tarde apunta a memoria.",
  },
  DECODE_EMPTY: {
    summary: "El modelo no generó ningún token.",
    cause:
      "Entrada vacía tras el filtrado, o el modelo emitió fin de secuencia de inmediato.",
    fix: "Normalmente es benigno con audio sin voz. Si ocurre con voz clara, el modelo no cubre ese idioma.",
  },
  ENGINE_LOAD_FAILED: {
    summary: "No se pudo cargar el motor.",
    cause: "Se agotaron los reintentos de creación de sesión.",
    fix: "Revisa el modelCode del contexto: apunta al fallo real de la cadena.",
  },
  OUT_OF_MEMORY: {
    summary: "Memoria insuficiente para ejecutar el modelo.",
    cause:
      "Android mató la asignación. Otras apps en segundo plano reducen mucho la memoria realmente disponible.",
    fix: "Cierra apps en segundo plano o elige un modelo con menor requisito de RAM. Este error no es recuperable reintentando.",
  },
};

const WHISPER_DOCS: Record<string, ErrorDoc> = {
  ...SHARED_ORT_DOCS,
  MEL_FAILED: {
    summary: "No se pudo calcular el espectrograma mel.",
    cause: "Buffer de audio con longitud inválida o valores no finitos.",
    fix: "Revisa la captura de audio: se esperan muestras float32 mono a 16 kHz en el rango [-1, 1].",
  },
  AUDIO_FAILED: {
    summary: "Fallo en la captura de audio.",
    cause: "El micrófono lo tomó otra app, o se revocó el permiso en caliente.",
    fix: "Comprueba el permiso de micrófono y reinicia la escucha.",
  },
  LANG_DETECT_FAILED: {
    summary: "Falló la sonda de detección de idioma.",
    cause: "El decoder no completó el paso inicial.",
    fix: "Mismo diagnóstico que DECODE_FAILED en el paso 0.",
  },
  LANG_DETECT_EMPTY: {
    summary: "No hay tokens de idioma candidatos.",
    cause:
      "generation_config.json sin lang_to_id, típico de un modelo Whisper solo-inglés usado en modo Universal.",
    fix: "Fija el idioma de origen, o usa un modelo multilingüe.",
  },
  LANG_DETECT_LOW_CONFIDENCE: {
    summary: "Confianza insuficiente al detectar el idioma.",
    cause: "Audio corto, ruidoso o con mezcla de idiomas.",
    fix: "Benigno: el fragmento se descarta. Si es constante, fija el idioma de origen.",
  },
  LANG_DETECT_AUDIO_TOO_SHORT: {
    summary: "Audio demasiado corto para detectar idioma.",
    cause: "El fragmento no llega al mínimo de muestras necesario.",
    fix: "Benigno. Habla algo más seguido, o fija el idioma de origen.",
  },
  LANG_DETECT_UNSUPPORTED: {
    summary: "El idioma detectado no tiene locale en el catálogo.",
    cause:
      "Whisper reconoce más idiomas de los que la app puede traducir después.",
    fix: "Fija el idioma de origen a uno de la lista de la app.",
  },
};

const TRANSLATOR_DOCS: Record<string, ErrorDoc> = {
  ...SHARED_ORT_DOCS,
  INPUT_TOO_LONG: {
    summary: "El texto supera la ventana del modelo.",
    cause: "Un turno de habla muy largo generó más tokens de los admitidos.",
    fix: "Se corta la escucha en fragmentos; si aparece, baja MAX_CHUNK_MS en el segmentador.",
  },
  TRANSLATE_FAILED: {
    summary: "La traducción falló por una causa no clasificada.",
    cause: "Error inesperado del motor activo.",
    fix: "Revisa el mensaje envuelto y el motor del modelo seleccionado.",
  },
};

const ENGINE_DOCS: Record<string, ErrorDoc> = {
  ENGINE_MODULE_UNAVAILABLE: {
    summary: "El módulo nativo de ese motor no está en esta build.",
    cause:
      "Los motores se cargan de forma perezosa. sherpa-onnx y llama.rn requieren código nativo: si se añadieron al package.json sin regenerar el proyecto, el import falla en tiempo de ejecución.",
    fix: "pnpm install && npx expo prebuild --clean && pnpm android. Mientras tanto, usa un modelo del motor ORT, que sí está enlazado.",
  },
  ENGINE_TASK_MISMATCH: {
    summary: "El modelo no sirve para la tarea pedida.",
    cause: "Se intentó cargar un modelo de traducción como transcriptor, o al revés.",
    fix: "Fallo de programación: revisa qué id se pasó al registro de motores.",
  },
  ENGINE_UNSUPPORTED_MODEL: {
    summary: "Ningún motor sabe ejecutar este modelo.",
    cause: "La entrada del catálogo declara una combinación motor/tarea sin adaptador.",
    fix: "Fallo de programación: añade el adaptador o corrige la entrada del catálogo.",
  },
  ENGINE_INIT_FAILED: {
    summary: "El motor no pudo inicializarse con este modelo.",
    cause:
      "Ficheros que el motor nativo no reconoce, o memoria insuficiente al cargar los pesos.",
    fix: "Revisa engine y modelId en el contexto. En sherpa-onnx, comprueba que el nombre de la carpeta conserva su palabra clave (whisper, moonshine, sense, parakeet): la detección nativa depende de ella.",
  },
  ENGINE_RUN_FAILED: {
    summary: "El motor falló durante la inferencia.",
    cause: "Error nativo a mitad de la transcripción o la traducción.",
    fix: "Revisa el mensaje nativo del contexto.",
  },
  ENGINE_LANGUAGE_UNSUPPORTED: {
    summary: "El modelo activo no cubre ese idioma.",
    cause:
      "Cada modelo declara su propia cobertura: Parakeet cubre 25 idiomas europeos, SenseVoice 5, Moonshine solo inglés, salamandraTA idiomas europeos.",
    fix: "Cambia de idioma o elige un modelo con más cobertura. La ficha de cada modelo lista sus idiomas.",
  },
  ENGINE_OUTPUT_EMPTY: {
    summary: "El motor devolvió texto vacío.",
    cause: "Fragmento sin voz reconocible.",
    fix: "Benigno: el fragmento se descarta.",
  },
  ENGINE_NO_LANGUAGE_DETECTION: {
    summary: "Este modelo no detecta el idioma por sí solo.",
    cause:
      "Los transductores como Parakeet transcriben sin decir en qué idioma lo hicieron, así que el modo Universal no puede saber a qué idioma traducir.",
    fix: "Fija el idioma de origen, o usa un modelo Whisper o SenseVoice, que sí lo detectan.",
  },
  ENGINE_DISPOSED: {
    summary: "Se usó un motor ya liberado.",
    cause: "Carrera al cambiar de modelo mientras había una inferencia en vuelo.",
    fix: "Benigno: la operación se descarta y la siguiente usa el motor nuevo.",
  },
  ENGINE_OUT_OF_MEMORY: {
    summary: "Memoria insuficiente para este motor.",
    cause: "Los modelos GGUF y los encoders int8 grandes reservan la memoria de golpe al cargar.",
    fix: "Cierra apps en segundo plano o elige un modelo más ligero. No es recuperable reintentando.",
  },
  VAD_MODEL_MISSING: {
    summary: "El detector de voz no está instalado.",
    cause: "Silero VAD es una descarga aparte de 2 MB.",
    fix: "Descárgalo en Modelos. Sin él se usa el detector por energía, que deja pasar ruido y hace alucinar a Whisper.",
  },
  VAD_INIT_FAILED: {
    summary: "No se pudo cargar el detector de voz.",
    cause: "Fichero del VAD corrupto o sesión ORT no creable.",
    fix: "Reinstala el modelo VAD. La escucha sigue funcionando con el detector por energía.",
  },
  VAD_RUN_FAILED: {
    summary: "Falló la inferencia del detector de voz.",
    cause: "Error nativo procesando un fotograma de audio.",
    fix: "Se degrada automáticamente al detector por energía; revisa el mensaje si es constante.",
  },
};

const CATALOG: Record<DiagnosticDomain, Record<string, ErrorDoc>> = {
  model: MODEL_DOCS,
  whisper: WHISPER_DOCS,
  translator: TRANSLATOR_DOCS,
  engine: ENGINE_DOCS,
};

export function describeCode(
  domain: DiagnosticDomain,
  code: string,
): ErrorDoc | undefined {
  return CATALOG[domain]?.[code];
}

export function hasDoc(domain: DiagnosticDomain, code: string): boolean {
  return describeCode(domain, code) !== undefined;
}

/** All documented codes, for the catalog coverage check. */
export function documentedCodes(domain: DiagnosticDomain): string[] {
  return Object.keys(CATALOG[domain] ?? {});
}
