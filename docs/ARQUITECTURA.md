# Arquitectura

Fenix es un monorepo de npm workspaces con cinco paquetes. Las dependencias siempre apuntan
**hacia adentro**: las reglas del juego no conocen la red, el dibujo ni la base de datos.

```
                    ┌──────────────────────────┐
                    │      @fenix/shared       │  dominio puro + protocolo
                    └──────────────────────────┘
                      ▲          ▲          ▲
        ┌─────────────┴──┐  ┌────┴───────┐  ┌┴─────────────┐
        │ @fenix/content │  │ @fenix/art │  │              │
        │ mapas Tiled    │  │ pixel art  │  │              │
        └────────────────┘  └────────────┘  │              │
                ▲                  ▲        │              │
        ┌───────┴────────┐  ┌──────┴────────┴─┐            │
        │ @fenix/server  │◄─┤ @fenix/client   │ (solo el modo solo usa el servidor embebido)
        └────────────────┘  └─────────────────┘
```

Las reglas de capas están en `eslint.config.js` (`no-restricted-imports`): si un módulo importa
una capa que no debe, el lint falla.

## @fenix/shared

Código que cliente y servidor deben compartir exactamente. No tiene dependencias externas.

| Módulo                              | Contenido                                                              |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `domain/geometry`                   | `Position`, `Direction` (numeración de UO), pasos y distancias         |
| `domain/world`                      | `Terrain`, `TileMap`                                                   |
| `domain/rules`                      | Movimiento (`canStep`, tiempos de paso), chat (límites, limpieza)      |
| `domain/character`                  | Apariencia y validación de nombres                                     |
| `domain/items`                      | Catálogo de objetos, lugares del equipo, alcance y límites de mochila  |
| `domain/combat`, `domain/creatures` | Vitales, armas, armaduras, golpe y daño; catálogo de criaturas y botín |
| `domain/skills`, `domain/magic`     | Habilidades (suben de a 0,1 con tope total) y hechizos con reactivos   |
| `domain/economy`                    | Comerciantes y precios, recursos por objeto fijo, recetas de herrería  |
| `protocol`                          | Mensajes cliente↔servidor tipados y su codec con validación            |

Que `canStep` sea compartido es clave: el cliente predice con la **misma regla** que valida el
servidor, por eso las correcciones son raras.

## @fenix/art

Pixel art generado por código sobre un buffer RGBA (`PixelImage`), sin DOM: terreno con bordes
mezclados, personajes en 8 direcciones y objetos fijos. Lo usan el cliente (convertido a texturas)
y la herramienta que exporta los tilesets de Tiled.

## @fenix/content

Datos del mundo editables con Tiled: el pueblo (`maps/`) y los tilesets generados (`tilesets/`).
Exporta los archivos como `unknown`; el servidor los valida al cargarlos. Ver
[MAPAS.md](MAPAS.md).

## @fenix/server

Servidor **autoritativo**: decide todo. El cliente solo envía intenciones.

```
infrastructure ──► application ──► domain
 (ws, http,        (casos de uso,   (Player, World:
  config, mapa)     puertos)          reglas puras)
```

- **domain/**: `Player` (movimiento con control de cadencia anti-speedhack), `World` (agregado
  raíz: mapa + jugadores + objetos, consultas por rango de visión), `WorldClock` (hora del
  mundo) e `Items` (reglas de objetos: alcance de 2 tiles, apilado, límite de mochila, un objeto
  por lugar del cuerpo, comer, beber, equipar). Sin dependencias de Node ni de red.
- **application/**: un caso de uso por acción (`JoinWorld`, `MovePlayer`, `SendChat`,
  `LeaveWorld`) y la fachada `GameApplication`. Habla con el exterior solo mediante **puertos**
  (`Clock`, `IdGenerator`, `RandomSource`, `Notifier`), lo que permite testear sin red.
- **infrastructure/**: adaptadores concretos.
  - `network/`: `GameSocketServer` (WebSocket, rate limit, heartbeat) y `SessionRegistry`
    (implementa `Notifier`).
  - `http/`: sirve el cliente compilado y `/health`.
  - `content/`: cargador de mapas de Tiled (valida y traduce), generador procedural de la isla
    (bosques, rocas, flores) y `buildWorld`, que estampa el pueblo diseñado en el centro.
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
  Las ventanas (mochila, equipo) se arrastran; `DragController` implementa arrastrar y soltar con
  eventos de puntero, así funciona igual con mouse y con el dedo.
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
                                                          └─mobileMoved──► resto de jugadores
                               ◄──moveRejected{pos}──     ✗ corrige (el cliente vuelve atrás)
```

Los demás jugadores se interpolan entre tiles durante la duración del paso (400 ms caminando,
200 ms corriendo, como en UO).

### Objetos

El cliente nunca mueve un objeto por su cuenta: envía `moveItem` (arrastrar y soltar) o
`useItem` (doble clic) y el servidor valida y responde. `ItemNotifications` reparte los cambios:
los del suelo a quienes los ven (`groundItems`), la mochila y el equipo a su dueño (`inventory`)
y lo que alguien tiene puesto a quienes lo ven (`playerEquipment`), que lo dibujan sobre el
personaje. Si algo no se puede, el jugador recibe el motivo en el chat.

### Combate

Jugadores y criaturas son **mobiles** (`Mobile`): tienen un `Combatant` con vida, maná, energía,
objetivo y turno de golpe. El cliente solo elige objetivo (`attack`); el golpe lo da el servidor en
`GameLoop.tick`, que la infraestructura llama cada 100 ms y que también:

- hace actuar a las criaturas (`creature-ai.ts`): buscan al jugador vivo más cercano dentro de su
  rango, lo persiguen y atacan; no entran a zonas con nombre (los pueblos son seguros) y vuelven a
  su lugar si se alejan demasiado;
- resuelve golpes con `resolveAttack` (acierto por destreza, daño del arma, la armadura absorbe);
- regenera vitales, tira el botín de las criaturas muertas y las hace reaparecer a los 30 s;
- resucita a los fantasmas que llegan a 2 tiles del santuario.

`MobileNotifications` avisa vitales al dueño, vida y golpes (`swing`) a quienes ven al mobile.

### Habilidades y magia

Cada jugador tiene un `SkillSet` (valores en décimas). Al pelear, practica el arma y Tácticas (y
Parada si lo atacan con escudo); al regenerar maná, Meditación; al lanzar, Magia. El acierto usa la
fórmula de UO con las habilidades de ambos.

Lanzar (`castSpell`) valida libro, Magia mínima, maná, reactivos y objetivo, y gasta todo de
entrada (`startCast`); el `GameLoop` resuelve el hechizo al terminar su tiempo (`resolveCast`):
tirada de éxito según Magia y efecto (curar, dañar o luz). Los efectos visuales los dibuja
`EffectsLayer` en el cliente a partir de `spellEffect`.

### Economía

Los personajes del pueblo son `Npc` (mobiles que no pelean ni se mueven), cargados desde objetos
de clase `npc` en Tiled. Las reglas de `domain/economy/economy.ts` validan distancia, oro,
herramientas, habilidad y materiales: recolectar de árboles y rocas (cada lugar se agota y se
recupera con `ResourceSpots`), fundir junto a la forja, fabricar junto al yunque, comprar y vender.
El banco es otra ubicación de los objetos (`bank`), que solo se puede tocar cerca de la banquera.
`EconomyActions` publica los cambios y las prácticas de habilidad.

### Social

`World` guarda los grupos (`Parties`, por id de jugador: se disuelven al desconectarse) y los
gremios (`Guilds`, por nombre de personaje: la membresía sobrevive a salir del juego). Cada
`Player` tiene su `Reputation` (fama, karma, muertes de inocentes y marca de criminal); la regla
de reputación (`notorietyOf`) está en `@fenix/shared`. `SocialActions` atiende los comandos
(`social`), `SendChat` reparte por canal y `SocialNotifications` envía el estado social propio
(`social`) y los cambios de nombre visibles (`mobileStatus`). `pvpRefusal` decide si un jugador
puede atacar a otro: nunca dentro de un pueblo ni a alguien del propio grupo o gremio. Atacar a
un inocente marca como criminal por dos minutos; matarlo suma una muerte (con cinco se es
asesino), y cada muerte se olvida a la media hora.

En el cliente, `parseChatInput` (en `core`) traduce los comandos del chat, el modo guerra es
estado local de `ClientGame` y `SocialWindow` muestra todo con botones.

### Persistencia

Un personaje se guarda como datos planos (`SavedCharacter`, en `domain/persistence`):
apariencia, posición, vitales, habilidades, reputación, gremio y sus objetos (mochila, equipo y
banco). `parseSavedCharacter` valida lo leído y descarta lo dañado. La aplicación solo conoce
dos puertos: `CharacterStore` (dónde se guarda) y `PasswordHasher`. `CharacterPersistence`
verifica la contraseña al entrar, guarda al registrarse, cada 30 segundos y al salir.

Implementaciones: `JsonFileCharacterStore` (servidor, escritura atómica y agrupada),
`KeyValueCharacterStore` (modo solo, sobre `localStorage`) y `ScryptPasswordHasher`. El modo
solo no pide contraseña: el servidor embebido se compone sin hasher.

### Rango de visión

Cada jugador solo recibe lo que pasa a 18 tiles o menos (como en UO): al moverse, el servidor
calcula quién entra y quién sale de su rango y envía `mobileAppeared` / `mobileDisappeared` en
ambos sentidos. El chat en voz alta también se oye solo dentro de ese rango (el de grupo y el de
gremio llega a sus miembros estén donde estén).

## Render

- **Terreno** (`TerrainLayer`): rombos de 22×22 escalados ×2 (44×44 en pantalla, el tamaño de
  tile de UO), con bordes mezclados según los vecinos, en bloques de 16×16 que se ocultan fuera
  de cámara.
- **Objetos y personajes** comparten una capa ordenada por profundidad (`x + y`), así se puede
  pasar por detrás de un árbol o una pared. `StaticLayer` solo crea sprites de los bloques
  visibles y vuelve translúcido lo que tapa al personaje.
- **Día y noche** (`Lighting`): el mundo se tiñe según la hora y los faroles y el jugador suman
  luz con mezcla aditiva.
- Personajes: 20×35 escalados ×2, 5 vistas dibujadas + 3 espejadas = 8 direcciones, con ciclo de
  caminata de 4 frames.

## Convenciones

- TypeScript estricto en todo el repo; `import type` para tipos.
- Tests junto al código (`*.test.ts`), con Vitest.
- Cada etapa entra por Pull Request con `npm run check` en verde.
- Código e identificadores en inglés; comentarios, textos de UI y documentación en español.
