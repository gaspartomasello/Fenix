# Arquitectura

Fenix es un monorepo de npm workspaces con tres paquetes. Las dependencias siempre apuntan
**hacia adentro**: las reglas del juego no conocen la red, el dibujo ni la base de datos.

```
            ┌──────────────────────────┐
            │      @fenix/shared       │  dominio puro + protocolo
            └──────────────────────────┘
                 ▲                ▲
   ┌─────────────┴───┐      ┌─────┴──────────────┐
   │  @fenix/server  │      │   @fenix/client    │
   └─────────────────┘      └────────────────────┘
```

Las reglas de capas están en `eslint.config.js` (`no-restricted-imports`): si un módulo importa
una capa que no debe, el lint falla.

## @fenix/shared

Código que cliente y servidor deben compartir exactamente. No tiene dependencias externas.

| Módulo             | Contenido                                                         |
| ------------------ | ----------------------------------------------------------------- |
| `domain/geometry`  | `Position`, `Direction` (numeración de UO), pasos y distancias    |
| `domain/world`     | `Terrain`, `TileMap`                                              |
| `domain/rules`     | Movimiento (`canStep`, tiempos de paso), chat (límites, limpieza) |
| `domain/character` | Apariencia y validación de nombres                                |
| `protocol`         | Mensajes cliente↔servidor tipados y su codec con validación       |

Que `canStep` sea compartido es clave: el cliente predice con la **misma regla** que valida el
servidor, por eso las correcciones son raras.

## @fenix/server

Servidor **autoritativo**: decide todo. El cliente solo envía intenciones.

```
infrastructure ──► application ──► domain
 (ws, http,        (casos de uso,   (Player, World:
  config, mapa)     puertos)          reglas puras)
```

- **domain/**: `Player` (movimiento con control de cadencia anti-speedhack) y `World` (agregado
  raíz: mapa + jugadores). Sin dependencias de Node ni de red.
- **application/**: un caso de uso por acción (`JoinWorld`, `MovePlayer`, `SendChat`,
  `LeaveWorld`) y la fachada `GameApplication`. Habla con el exterior solo mediante **puertos**
  (`Clock`, `IdGenerator`, `RandomSource`, `Notifier`), lo que permite testear sin red.
- **infrastructure/**: adaptadores concretos.
  - `network/`: `GameSocketServer` (WebSocket, rate limit, heartbeat) y `SessionRegistry`
    (implementa `Notifier`).
  - `http/`: sirve el cliente compilado y `/health`.
  - `content/`: generador procedural del mapa (se reemplazará por mapas diseñados).
  - `system/`: reloj, ids, PRNG.
- **main.ts**: raíz de composición del servidor en red (HTTP + WebSocket).
- **embedded.ts**: segunda raíz de composición, sin red ni dependencias de Node, para correr el
  servidor dentro del navegador (modo solo). Es el único punto que el cliente puede importar
  (`@fenix/server/embedded`).

`ClientSession` concentra el ciclo de vida de un cliente (ingreso, mensajes, salida) y lo usan
los dos transportes, así el comportamiento es idéntico en red y en modo solo.

## @fenix/client

```
app (orquestación)
 ├── core       estado del juego y reglas del cliente (sin DOM ni Pixi)
 ├── network    adaptadores del puerto ServerGateway: WebSocket o servidor embebido
 ├── input      teclado/mouse → intenciones de movimiento
 ├── rendering  Pixi: proyección isométrica, terreno, personajes, cámara
 ├── assets     arte procedural (canvas puro, sin Pixi)
 └── ui         interfaz HTML: login, chat, barra de estado
```

- **core/** es el corazón: `ClientGame` aplica mensajes del servidor y acciones del jugador sobre
  `Entity`. `MovementPredictor` hace la predicción local. No importa Pixi, DOM ni red (lo
  verifica el lint), así que se testea en Node.
- **rendering/** solo **lee** el estado del core y lo dibuja. `TextureCache` es el único punto
  donde el arte generado (`assets/`) se convierte en texturas de Pixi.
- **ui/** usa DOM nativo, separado del canvas. Los componentes reciben callbacks; no conocen la red.
- **network/** elige el transporte al compilar: `WebSocketGateway` (online) o `EmbeddedGateway`
  (modo solo, `vite --mode solo`). Es la única capa que puede importar el servidor embebido; en
  el build online ese código ni siquiera se incluye.
- **app/GameSession** conecta todo y corre el loop: input → core → render.

## Flujo de un paso

```
Cliente                                   Servidor
───────                                   ────────
input: flecha → intención
ClientGame.requestStep
  MovementPredictor: canStep ✓
  mueve la entidad al instante  ──move{dir,mode,seq}──►  MovePlayer
                                                          Player.tryMove (cadencia + canStep)
                               ◄──moveAck{seq,pos}──      ✓ confirma al jugador
                                                          └─playerMoved──► resto de jugadores
                               ◄──moveRejected{pos}──     ✗ corrige (el cliente vuelve atrás)
```

Los demás jugadores se interpolan entre tiles durante la duración del paso (400 ms caminando,
200 ms corriendo, como en UO).

## Arte

Todo el arte se genera por código en `client/src/assets/`:

- Terreno: rombos de 22×22 escalados ×2 (44×44 en pantalla, el tamaño de tile de UO).
- Personajes: 20×35 escalados ×2, 5 vistas dibujadas + 3 espejadas = 8 direcciones,
  con ciclo de caminata de 4 frames y colores de ropa, piel y pelo.

## Convenciones

- TypeScript estricto en todo el repo; `import type` para tipos.
- Tests junto al código (`*.test.ts`), con Vitest.
- Cada etapa entra por Pull Request con `npm run check` en verde.
- Código e identificadores en inglés; comentarios, textos de UI y documentación en español.
