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
mezclados, personajes en 8 direcciones y objetos fijos, todo a resolución de pantalla (sin
agrandar). Lo usan el cliente (convertido a texturas)
y la herramienta que exporta los tilesets de Tiled.

Personajes y criaturas usan el motor de volumen (`volume.ts`): cada uno es un modelo 3D muy simple
(esferas, elipsoides, extremidades y planos) armado sobre un esqueleto animado (`humanoidRig`).
`Camera` lo gira según la dirección y lo inclina como la vista isométrica; `VolumeCanvas` lo pinta
pixel a pixel con profundidad, luz en cinco tonos (`ramp`), detalles pegados a la superficie
(`decal`: ojos, boca) y contornos. Los materiales son funciones que deciden el color de cada pixel
según su posición y normal en el modelo (cinturón, malla, pelo, pelaje). Las ocho direcciones salen
del mismo modelo, sin espejar, así el arma queda siempre en la mano derecha. Los personajes se
dibujan con el doble de detalle que el resto del arte y se muestran sin escalar (`CHARACTER_SCALE`).

El esqueleto de las personas está en `humanoid-rig.ts`: cada cuadro (`CharacterFrame`) es una pose
de piernas, brazos, giro de hombros, inclinación y peso; así se arman la caminata, la carrera, los
golpes de cada arma (`attackStyleFor`), el hechizo y los gestos de reposo. La cabeza
(`humanoid-head.ts`) es un cráneo ovalado con mandíbula, mentón y arco de las cejas, con los
peinados como máscaras sobre una cáscara de pelo. En el cliente, `Entity` guarda la acción en curso
(golpe o hechizo, según los mensajes del servidor) y si corre; `rendering/animation.ts` decide el
cuadro de cada momento y programa los gestos de reposo (`Fidgets`) para que lleguen cada tanto y
no se repitan seguidos.

La capa es una tela curva que cuelga de los hombros: en cada fila se aleja de la espalda lo
necesario para que las piernas no la atraviesen y vuela hacia atrás según `Rig.sway`. Los objetos
(`item-art.ts`) también son modelos de volumen, vistos desde arriba, en dos tamaños: en el suelo
y como ícono. La ventana de personaje (`PaperdollView`) detecta qué objeto hay bajo el puntero
comparando el dibujo con y sin cada pieza puesta. La usan la ventana propia (`EquipmentWindow`,
con casilleros que se pueden arrastrar y botones) y la de mirar a otros (`PaperdollViewer`,
que abre `WorldPaperdolls` con doble clic sobre una persona).

El mundo usa otra proyección del mismo motor (`WorldProjection`), la de UO: el suelo se ve como el
rombo de 44×44 del tile, sin achatarse, y la altura sube derecho en la pantalla. Así los objetos
fijos (`static-art.ts`: árboles, rocas, paredes, cercas, barriles, cajas, pozo, faroles, santuario,
forja, yunque) calzan con las baldosas y se iluminan igual que los personajes. El terreno
(`terrain-art.ts`) se pinta pixel a pixel con ruido periódico: se repite exacto en cada tile, así
los vecinos empalman sin costura; las variantes cambian el centro del tile y comparten los bordes.

Los árboles (`tree-art.ts`) crecen por ramificación, como en la naturaleza: un tronco (con raíces
que asoman) se abre en ramas madre y cada una se divide en hijas más finas, repartidas alrededor
de la madre con el ángulo áureo y con el grosor que manda la regla de Leonardo (la sección de la
madre es la suma de las de sus hijas). Las ramas se tuercen al azar y tiran hacia la luz o se
caen por su peso. Las hojas brotan en las ramitas de la punta, en matas chicas de borde recortado,
y se iluminan como una sola copa (más oscura adentro). Cada especie tiene su plan: roble (copa
ancha), pino (tronco único con pisos de ramas), ceibo (bajo, retorcido, con flores rojas), gomero
(troncos fundidos, aletones, ramas horizontales y raíces aéreas), sauce llorón (cortinas que
cuelgan), álamo (columna) y árbol seco (ramas quebradas). Todo con semilla: mismo árbol cada vez.

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
  rango, lo persiguen y atacan; no entran a las zonas protegidas (los pueblos son seguros; las
  mazmorras no) y vuelven a su lugar si se alejan demasiado. Las que huyen se alejan con poca
  vida y las que lanzan hechizos guardan distancia;
- usa las habilidades de cada criatura (`abilities` en el catálogo, `creature-magic.ts`): veneno al
  morder, hechizos (y curarse), aliento de fuego, regeneración y resistencia mágica;
- resuelve golpes con `resolveAttack` (acierto por destreza, daño del arma, la armadura absorbe);
  el arco dispara desde lejos y gasta una flecha por tiro;
- regenera vitales, guarda el botín dentro del cuerpo de las criaturas muertas y las hace
  reaparecer a los 30 s de que el cuerpo se deshaga;
- resucita a los fantasmas que llegan a 2 tiles del santuario.

`MobileNotifications` avisa vitales al dueño, vida y golpes (`swing`) a quienes ven al mobile.

### Cuerpos

El botín de una criatura es otra ubicación de los objetos (`corpse`): queda dentro de su cuerpo,
que es la misma criatura muerta. `Corpses` (capa de aplicación) recuerda qué cuerpo tiene abierto
cada jugador: `openCorpse` lo abre si está a 2 tiles, `lootAll` pasa todo a la mochila y cada
cambio (incluido arrastrar un objeto con `moveItem`) reenvía `corpse` a quienes lo miran. Con
botín dura 90 s; vacío, 3 s. Al deshacerse se envía `corpseClosed` y lo que quedaba se pierde.

### Habilidades y magia

Cada jugador tiene un `SkillSet` (valores en décimas). Al pelear, practica el arma y Tácticas (y
Parada si lo atacan con escudo); al regenerar maná, Meditación; al lanzar, Magia. El acierto usa la
fórmula de UO con las habilidades de ambos.

Los hechizos (`spell-catalog.ts`) van en ocho círculos, como en UO: cada círculo fija maná, Magia
mínima y tiempo de lanzamiento, y cada hechizo dice a quién va (`self`, `beneficial`, `harmful` o
`location`) y qué hace (`SpellEffect`: daño, curación, atributos, cura, veneno, parálisis,
teletransporte, comida, drenar maná, protección, visión nocturna, daño en área, resurrección o
invocación).

Las **invocaciones** son `Creature` con dueño (`ownerId`) y vencimiento (`expiresAt`): atacan al
objetivo de su dueño o a quien lo ataque, si no lo siguen (pueden entrar al pueblo), lo que matan
cuenta para él, no reaparecen y se van cuando vencen, mueren o su dueño se desconecta. Hay como
mucho dos por jugador.

Los **atributos** (fuerza, destreza e inteligencia) se entrenan como en UO: cada uso de una
habilidad (`SkillSet` avisa a `Player`) puede subir uno de los suyos (`SKILL_STATS`), no muy
seguido, hasta 100 cada uno y 225 entre los tres. Se guardan con el personaje y cambian los
máximos de vida, maná y energía.

Lanzar (`castSpell`) valida libro (o pergamino), Magia mínima, maná, reactivos y objetivo, y gasta
todo de entrada (`startCast`); atacar con un hechizo a un inocente es un crimen, igual que con un
arma. El `GameLoop` resuelve el hechizo al terminar su tiempo (`resolveCast`): tirada de éxito
según Magia, Resistencia mágica del objetivo (reduce a la mitad daño o duración) y efecto. Un golpe
recibido mientras se lanza corta el hechizo, salvo con Protección. Los efectos visuales los dibuja
`EffectsLayer` en el cliente a partir de `spellEffect`.

Los **efectos que duran** viven en el `Combatant`: atributos subidos o bajados (que recalculan los
máximos de vida, maná y energía), Protección, veneno (quita vida cada 2 s y no deja regenerar),
parálisis (se corta con un golpe) y visión nocturna. El `GameLoop` los hace vencer y aplica el
veneno; el dueño recibe la lista con `effects`, que el cliente muestra en la barra de efectos.

Vendas (`domain/healing/bandage.ts`, mensaje `useOn`) y pociones (`domain/items/consumables.ts`)
siguen las mismas reglas de UO: la venda tarda según la destreza, cura según Primeros auxilios y
Anatomía y, con 60 en ambas, puede sacar el veneno.

### Economía

Los personajes del pueblo son `Npc` (mobiles que no pelean ni se mueven), cargados desde objetos
de clase `npc` en Tiled. Las reglas de `domain/economy/economy.ts` validan distancia, oro,
herramientas, habilidad y materiales: recolectar de árboles y rocas (cada lugar se agota y se
recupera con `ResourceSpots`) o pescar en el agua, fundir junto a la forja, fabricar, comprar y
vender. Cada oficio (`crafting.ts`) tiene su herramienta, recetas por grupo con materiales y
habilidad mínima, y a veces un lugar (la herrería pide yunque y forja; cocinar, el fuego); los
pergaminos de Inscripción gastan además los reactivos y el maná del hechizo. Si sale mal se pierde
la mitad del material.
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

### Monturas

`MOUNTS` (shared) lista las monturas; cada una es también una `CreatureKind` mansa. Comprada en
la caballeriza (`buyMount`), queda en el mundo como `Creature` con dueño y sin vencimiento
(`isPet`): sigue al dueño, no pelea y viaja con él en los teletransportes. `MountActions` la monta
(`mount`: la criatura sale del mundo y `Player.mount` guarda la especie), la baja (`dismount`, o al
morir) y avisa con `mountChanged`. Montado, `moveDuration(mode, true)` da los tiempos de UO (200 ms
al paso, 100 ms al galope) en el servidor y en la predicción del cliente, y correr no gasta
energía. La montura se guarda con el personaje (montada o suelta).

En el arte, `mount-art.ts` arma el animal en el mismo lienzo con profundidad que el jinete, así se
tapan bien entre sí: cuadrúpedos con patas en cadena (antebrazo o pierna, caña, cuartilla y casco)
y andares por fase de cada pata, y el lagarto bípedo. `humanoidRig` recibe el asiento (`Seat`) y
sienta al jinete con la pose de montar.

### Mazmorra

`world-builder.ts` arma un solo mapa: la isla a la izquierda, roca maciza en el medio y la
mazmorra (`dungeon-map.ts`) a la derecha. La mazmorra son salas en serpentina unidas por
pasillos de dos tiles; la roca que toca el suelo se vuelve `cave-wall`. Se entra y se sale por
**teletransportes** del mapa (`TileMap.teleporters`): `MovePlayer`, después de un paso, mira si el
tile lleva a otro lado y llama a `teleport`. El cliente no predice pasos desde un teletransporte.
La zona de la mazmorra tiene `dungeon: true`: no es protegida (`safeZoneAt`) y el cliente la dibuja
oscura a cualquier hora. Las criaturas de cada sala salen de `LAIR_LEVELS` según la profundidad;
la última es la guarida del dragón.

### Rango de visión

Cada jugador solo recibe lo que pasa a 18 tiles o menos (como en UO): al moverse, el servidor
calcula quién entra y quién sale de su rango y envía `mobileAppeared` / `mobileDisappeared` en
ambos sentidos. El chat en voz alta también se oye solo dentro de ese rango (el de grupo y el de
gremio llega a sus miembros estén donde estén).

## Render

- **Terreno** (`TerrainLayer`): rombos de 44×44 (el tamaño de tile de UO) dibujados a
  resolución completa, con bordes mezclados según los vecinos, en bloques de 16×16 que se
  ocultan fuera de cámara.
- **Objetos y personajes** comparten una capa ordenada por profundidad (`x + y`), así se puede
  pasar por detrás de un árbol o una pared. `StaticLayer` solo crea sprites de los bloques
  visibles y vuelve translúcido lo que tapa al personaje.
- **Día y noche** (`Lighting`): un mapa de luz a media resolución que multiplica todo lo que
  se ve. Se arma cada cuadro con el color de ambiente según la hora (oscuro y azulado de noche)
  y los halos cálidos de los faroles, la forja, el santuario y el propio jugador, sumados. Así
  la luz ilumina el terreno, las paredes, las criaturas y los personajes que toca en vez de
  taparlos. Los hechizos y las flechas van por encima (brillan de noche). Con Visión nocturna
  no hay oscuridad: se ve como de día. En una mazmorra es de noche siempre, con un ambiente más
  oscuro y sin azul de luna; los braseros iluminan las salas.
- Personajes: modelos de volumen en 8 direcciones, con caminata, carrera y acciones. Caminar y
  correr tienen 8 cuadros por ciclo (las poses clave se interpolan). Se dibujan pixel a pixel
  (`ART_DETAIL` = 1) y se muestran sin suavizar; se probó el doble de detalle con sombreado
  continuo y se veía peor. El cliente dibuja de antemano el ciclo hacia donde mira cada uno (`TextureCache.pump`), unos
  milisegundos por cuadro, así moverse no da tirones.

## Convenciones

- TypeScript estricto en todo el repo; `import type` para tipos.
- Tests junto al código (`*.test.ts`), con Vitest.
- Cada etapa entra por Pull Request con `npm run check` en verde.
- Código e identificadores en inglés; comentarios, textos de UI y documentación en español.
