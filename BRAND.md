# Puente — guía de marca

> **Puente** — *Lo que une civilizaciones.*  
> Traducción de voz en tiempo real. Sin internet. Gratis. Código abierto.

Esta es la fuente de verdad pública para el diseño y la voz de Puente. Antes de
añadir colores, tipografía, iconos o textos en la app o la web, consulta esta
guía.

## Propósito

Puente traduce conversaciones en el propio teléfono con Whisper y NLLB. Nació
viajando, cuando el idioma era la única frontera que quedaba, y de una necesidad
concreta: entenderse sin depender de internet, cuentas ni servidores ajenos.

El nombre procede del puente romano de Cangas de Onís: piedra que lleva siglos
uniendo dos orillas. El producto hace lo mismo entre personas y culturas.

Puente es y seguirá siendo gratuito, libre y de código abierto. La comunidad no
es un canal de adquisición: es parte del proyecto.

## Identidad verbal

| Pieza | Uso |
|---|---|
| Nombre | **Puente** en texto; **PUENTE** solo como wordmark |
| Eslogan ES | *Lo que une civilizaciones* |
| Eslogan CA | *El que uneix civilitzacions* |
| Eslogan EN | *A bridge between civilizations* |
| Descripción corta | Traducción de voz en tiempo real. Sin internet. Gratis. Código abierto. |

### Voz y tono

1. Frases cortas y declarativas.
2. La privacidad se explica como un hecho técnico, no como una promesa.
3. Nada de jerga de marketing como «revolucionario» o «potenciado por IA».
4. Primera persona honesta: una persona y una comunidad, no una corporación.
5. El humor es seco, escaso y dirigido a la burocracia, nunca a otros
   desarrolladores.
6. Se invita a contribuir sin pedir estrellas ni recurrir a urgencia artificial.

| Sí | No |
|---|---|
| «Tu voz no sale del teléfono.» | «Nos tomamos tu privacidad muy en serio.» |
| «Habla. Escucha. Entiende.» | «Traducción revolucionaria impulsada por IA.» |
| «¿Quieres ayudar? El código está abierto.» | «¡Danos una estrella y comparte!» |

La referencia a subvenciones vive en una sola sección institucional de la web.
RTranslator se acredita como proyecto relacionado y trabajo previo; la ironía
se dirige al ciclo de financiación, no a quien escribió el software.

## Color

| Token | Hex | Rol |
|---|---|---|
| Cream | `#F2F6D0` | Fondo base, pantallas y splash |
| Honeydew | `#D0E1D4` | Tarjetas, controles y secciones alternas |
| Sand Dune | `#D9D2B6` | Bordes y superficies estructurales |
| Desert Sand | `#E4BE9E` | Acento exclusivamente decorativo |
| Dim Grey | `#71697A` | Texto secundario y acciones principales |
| Ink | `#4A4452` | Texto principal y titulares |
| Error | `#A6453F` | Errores y avisos críticos |

**Desert Sand nunca es color de texto sobre fondos claros.** Su contraste con
Cream es insuficiente; úsalo en líneas, subrayados y detalles. El texto se
compone en Ink o Dim Grey.

La identidad actual es deliberadamente clara y diurna. Un futuro modo oscuro
requerirá un juego completo de tokens, no una inversión automática de colores.

## Tipografía

Mulish es la única familia tipográfica.

- 500 Medium: cuerpo, descripciones y etiquetas.
- 700 Bold: énfasis y etiquetas destacadas.
- 800 ExtraBold: titulares y botones.
- 900 Black: solo wordmark y grandes elementos de marca.

El wordmark y los pequeños antetítulos pueden usar mayúsculas con espaciado
amplio. Los titulares grandes llevan un espaciado ligeramente cerrado. El texto
corrido conserva su caja natural.

## Logo y forma

- `puente/assets/icon.png` es la ilustración maestra: icono de app, splash y
  piezas sociales. No se estira, recolorea ni recorta por dentro del arco.
- La marca simplificada de `puente-web/public/favicon.svg` se reserva para
  tamaños pequeños y usos monocromos.
- Web: 14 px en controles, 24–48 px en paneles editoriales y arcos completos
  para las piezas inspiradas en el puente.
- App: 12 px en controles compactos, 20 px en tarjetas y 28 px en paneles.
- La profundidad se construye primero con superficies y bordes. Solo se admite
  una sombra ambiental muy suave en elementos flotantes como la navegación.
- El grano sutil de la web es una firma visual y debe mantenerse discreto.

## Principios de composición

- **Editorial, no plantilla**: títulos de gran escala, espacio negativo y
  composiciones asimétricas antes que una sucesión de bloques idénticos.
- **El arco como gesto propio**: marcos de imagen, sellos y formas circulares
  recuerdan al puente sin convertir la interfaz en una ilustración temática.
- **Jerarquía antes que decoración**: cada pantalla tiene una acción dominante,
  un estado legible y grupos claros.
- **Técnico, pero humano**: Whisper, NLLB, local y MIT aparecen como pruebas de
  confianza, no como una pared de jerga.

## Aplicación técnica

- Web: los tokens canónicos viven en `puente-web/src/styles/global.css`.
- App: los tokens canónicos viven en `puente/src/constants/theme.ts`.
- No se introducen hexadecimales sueltos en componentes.
- No se introduce otra familia tipográfica.
- La web actual es la referencia visual para tono, jerarquía y ritmo.

## Próximos pasos comunitarios

La internacionalización completa de la interfaz móvil queda fuera del primer
rediseño. Es una futura línea de contribución especialmente apropiada para la
comunidad multilingüe de Puente.
