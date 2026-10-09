# Fenix — guía para trabajar en el repo

MMORPG web inspirado en Ultima Online / Sphere. Leé `docs/ARQUITECTURA.md` antes de cambiar algo.

## Reglas

- **Arquitectura limpia**: las dependencias apuntan hacia adentro. `shared` no depende de nada;
  en el servidor `domain` ← `application` ← `infrastructure`; en el cliente `core` no conoce
  Pixi, DOM ni red. Las reglas están en `eslint.config.js`; no las desactives.
- **Servidor autoritativo**: toda regla de juego se valida en el servidor. Si el cliente predice,
  usa la misma función de `@fenix/shared`.
- **Módulos aislados**: una funcionalidad nueva entra como módulo nuevo con su caso de uso, sin
  tocar por dentro a los existentes.
- **Arte y contenido**: el arte es procedural en `@fenix/art` (sin DOM); los mapas se editan con
  Tiled en `@fenix/content` (ver `docs/MAPAS.md`). Si cambia el arte, regenerar los tilesets.
- **Sin assets de EA**: nada de gráficos, mapas, sonidos o nombres de Ultima Online. Arte propio
  (procedural) o con licencia libre verificada.
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

```bash
npm run check   # formato + lint + tipos + tests
npm run build
```
