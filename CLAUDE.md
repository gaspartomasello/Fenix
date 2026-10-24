# Fenix — guía para trabajar en el repo

MMORPG web inspirado en Ultima Online / Sphere. Leé `docs/ARQUITECTURA.md` antes de cambiar algo.

## Reglas

- **Arquitectura limpia**: las dependencias apuntan hacia adentro. `shared` no depende de nada;
  en el servidor `domain` ← `application` ← `infrastructure`; en el cliente `core` no conoce
  Pixi, DOM ni red. Las reglas están en `eslint.config.js`; no las desactives.
- **Servidor autoritativo**: toda regla de juego se valida en el servidor. Si el cliente predice,
  usa la misma función de `@fenix/shared`.
- **Módulos aislados**: una funcionalidad nueva entra como módulo nuevo con su caso de uso, sin
  tocar por dentro a los existentes. En el servidor: `application/features/<nombre>/` con su
  `<nombre>.module.ts`, sumado a `ALL_MODULES` en `game.ts`. Lo que necesita de otro módulo lo
  pide al núcleo (`kernel/`: eventos, servicios, reglas, usos de objetos), nunca con un import
  cruzado; el lint lo impide. No se cablea nada en `GameApplication`.
- **Arte y contenido**: el arte es procedural en `@fenix/art` (sin DOM); los mapas se editan con
  Tiled en `@fenix/content` (ver `docs/MAPAS.md`). Si cambia el arte, regenerar los tilesets.
- **Referencias sí, copia no**: la estética se inspira en Ultima Online, Diablo y Helbreath, y sus
  gráficos se pueden usar como referencia (para entender el estilo, la silueta o el clima). Lo que
  entra al juego tiene que ser propio: no se incluye material de esos juegos (gráficos, mapas,
  sonidos, música, nombres), y el resultado no puede ser reconocible como un gráfico concreto de
  ellos. Las referencias no se usan como entrada directa de un generador, salvo con influencia
  baja y comparando el resultado lado a lado. Arte propio: procedural, hecho con IA a partir de
  descripciones propias, o con licencia libre verificada. Dirección de arte: `docs/ARTE.md`. Ideas pendientes: `docs/IDEAS.md`.
- **Trabajo por etapas**: cada etapa en su rama y Pull Request.
- Código en inglés; comentarios, UI y docs en español.
- **Todo lo que ve el jugador va en español claro**, sin jerga de UO ni anglicismos. Glosario:

  | En vez de… | Usar…                         |
  | ---------- | ----------------------------- |
  | paperdoll  | ventana de equipo / personaje |
  | gump       | ventana                       |
  | skills     | habilidades                   |
  | reagents   | reactivos                     |
  | item       | objeto                        |
  | spawn      | aparición                     |
  | party      | grupo                         |
  | guild      | gremio                        |
  | PvP        | combate entre jugadores       |
  | GM         | administrador del juego       |
  | zoom       | acercar / alejar              |

## Antes de commitear

Mientras se trabaja, alcanza con el chequeo rápido: formato, tipos y solo las pruebas de los
módulos que cambiaron (y de los que dependen de ellos). Vitest las encuentra solo, siguiendo los
imports: por eso importa que los módulos no estén atados entre sí.

```bash
npm run check:fast   # formato + tipos + pruebas de lo que cambió
```

La batería completa (`npm run check` y `npm run build`) la corre la integración continua en cada
Pull Request; localmente, solo antes de abrir el PR o si el rápido no alcanza.
