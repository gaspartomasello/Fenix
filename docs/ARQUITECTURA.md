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

| Módulo                              | Contenido                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `domain/geometry`                   | `Position`, `Direction` (numeración de UO), pasos y distancias                                           |
| `domain/world`                      | `Terrain`, `TileMap`                                                                                     |
| `domain/rules`                      | Movimiento (`canStep`, tiempos de paso), chat (límites, limpieza)                                        |
| `domain/character`                  | Apariencia y validación de nombres                                                                       |
| `domain/items`                      | Catálogo de objetos, lugares del equipo, alcance y límites de mochila                                    |
| `domain/combat`, `domain/creatures` | Vitales, armas, armaduras, golpe y daño; catálogo de criaturas y botín                                   |
| `domain/skills`, `domain/magic`     | Habilidades (suben rápido al principio y de a 0,1 cerca de 100, con tope total) y hechizos con reactivos |
| `domain/economy`                    | Comerciantes y precios, recursos por objeto fijo, recetas de herrería                                    |
| `protocol`                          | Mensajes cliente↔servidor tipados y su codec con validación                                              |

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
  - `content/`: cargador de mapas de Tiled (valida y traduce), generador del continente
    (`procedural-map.ts`), caminos (`roads.ts`), lugares y criaturas por territorio
    (`places.ts`) y `buildWorld`, que junta todo con la mazmorra.
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
  Las ventanas (mochila, equipo) se arrastran y se cierran con la cruz o con clic derecho, como en
  UO; `DragController` implementa arrastrar y soltar con eventos de puntero, así funciona igual con
  mouse y con el dedo. Al empezar a arrastrar, el objeto se levanta (`DragSource.lift` lo esconde
  de la mochila, del personaje o del suelo) y vuelve a verse si se suelta donde no va o el servidor
  no lo acepta.
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
  morder, hechizos (y curarse), aliento de fuego, regeneración y resistencia mágica. Las que
  lanzan hechizos tienen inteligencia (`intelligence` en el catálogo: más fuertes, más maná),
  gastan el maná del hechizo, lo recuperan de a poco y, si reciben un golpe mientras conjuran,
  pierden la concentración y el hechizo falla;
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
botín dura 2 minutos; vacío (o ya revisado), 20 s. Al deshacerse se envía `corpseClosed` y lo
que quedaba se pierde.

El dibujo del cuerpo (`corpse-art.ts`) no es otro modelo: es el de la criatura viva en la pose
`dead`, girado entero antes de proyectarlo. `PosedProjection` envuelve la cámara de siempre con
una rotación y un corrimiento (y su inversa para la luz y las normales), así cada criatura nueva
tiene su cuerpo sin dibujar nada aparte: alcanza con decir cómo cae en `POSES` (de espaldas, de
costado, panza arriba o desplomada) y la altura de su centro. Lo que queda bajo el suelo no se
pinta (`VolumeCanvas` acepta un filtro de puntos). Los dibujos de criaturas reciben el lienzo por
una fábrica (`CanvasFactory`) para que el cuerpo use uno más ancho y bajo. Los espíritus
invocados (vórtice y elementales de aire, fuego y agua) no dejan cuerpo: se desvanecen. En el
cliente, al morir delante de uno se ven dos cuadros de la caída y el cuerpo queda en el piso,
debajo de lo que está parado.

### Habilidades y magia

Cada jugador tiene un `SkillSet` (valores en décimas). Al pelear, practica el arma y Tácticas (y
Anatomía con cada golpe que entra, y Parada si lo atacan con escudo); al regenerar maná,
Meditación; al lanzar, Magia. El acierto usa la fórmula de UO con las habilidades de ambos. El
daño del golpe se multiplica por Tácticas (60 %–100 %) y por Anatomía (hasta +50 %, como en UO).
Del lado del mago, Evaluar inteligencia multiplica el daño de los hechizos (hasta +50 %, no las
curas ni el maná) y se practica con cada hechizo de daño que sale.

Los hechizos (`spell-catalog.ts`) van en ocho círculos, como en UO: cada círculo fija maná, Magia
mínima y tiempo de lanzamiento, y cada hechizo dice a quién va (`self`, `beneficial`, `harmful` o
`location`) y qué hace (`SpellEffect`: daño, curación, atributos, cura, veneno, parálisis,
teletransporte, comida, drenar maná, protección, visión nocturna, daño en área, resurrección o
invocación).

Los **viajes** usan runas: un `Item` de tipo `rune` puede tener `mark` (lugar y nombre de la zona),
que viaja en los snapshots y se guarda con el personaje. Los hechizos de objetivo `rune` (Marcar,
Recordar, Portal) reciben `runeId`: Marcar graba el lugar (no en la mazmorra), Recordar devuelve
`moveTo` y Portal devuelve `gate`. `Gates` (aplicación) pone dos objetos fijos `moongate` en el
suelo (todos los ven con los objetos del suelo), los une, los cierra a los 30 s, y `MovePlayer`
manda al otro lado a quien pisa uno, igual que la entrada de la mazmorra. Lo `fixed` no se puede
mover.

El **sigilo** (`Stealth`, capa de aplicación; reglas en `skills/stealth.ts`): `Player.hidden`
guarda los pasos que le quedan (Sigilo) y, con Invisibilidad, cuándo se acaba. A uno escondido no
lo ve nadie: `MobileNotifications.watchers` devuelve solo a él mismo, `MovePlayer` no avisa sus
pasos, `World.isHidden` lo saca de lo que ven los demás al entrar o moverse, y las criaturas no lo
eligen ni lo siguen. Al esconderse, los demás reciben `mobileDisappeared`; al descubrirse,
`mobileAppeared`; y él, `hiddenChanged`. Lo descubren: atacar, lanzar, hablar en voz alta, recibir
un golpe o un hechizo de daño, correr o pasarse de pasos. `useSkill` usa Esconderse o Mirar.

Algunos hechizos **caen más tarde** (`delayMs`): la Explosión gasta el maná al lanzarla y estalla
2,5 s después, como en UO. `resolveCast` devuelve `delayed` en vez de aplicar el daño, el ciclo del
juego lo guarda y `landDelayedSpell` lo aplica al vencer (con la tirada de Resistencia en ese
momento; cae aunque el objetivo se haya alejado, no si murió o se fue). Mientras tanto se puede
lanzar otro: la Columna de fuego tarda 2,25 s, así que lanzada enseguida cae junto con la
Explosión, si el jugador tiene buena mano.

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

El nombre de cada persona (uno mismo también) se pinta según su reputación: azul inocente, gris
criminal, rojo asesino y **amarillo invulnerable**. `Combatant.invulnerable` hace que nada le haga
daño (como un administrador del juego) y `Player.notoriety` lo muestra como `invulnerable`; los
personajes de prueba lo activan y desactivan con `/invul` (`toggleInvulnerable`).

Los botones del juego (Mochila, Personaje, Hechizos, Habilidades, Social, Guerra, Mapa) van en la
barra de arriba (`StatusBar.dock`), ajustados a la palabra.

En el cliente, `parseChatInput` (en `core`) traduce los comandos del chat y `SocialWindow` muestra
todo con botones.

### Modo guerra y defensa propia

El modo guerra lo decide el servidor (`Player.warMode`, módulo `WarMode`): el cliente lo pide con
`setWarMode` y todos los que lo ven reciben `warModeChanged` (el personaje se dibuja en guardia:
cuadros `guard` y `guard-0..7` del esqueleto, rodillas flexionadas y brazos arriba; corriendo
vuelve a la carrera normal). Atacar pone en guerra; pasar a paz deja de atacar. Defensa propia
para todos los jugadores: si alguien (criatura o persona) le pega a un jugador que no está
peleando, pasa solo a guerra (`auto`) y le devuelve los golpes; al matar a su objetivo sigue con
el más cercano de los que lo siguen atacando. Contra personas valen las reglas de `pvpRefusal`, y
devolver el golpe no es delito. El modo guerra no se guarda: se entra al juego en paz.

Las subidas de habilidad y de atributo llegan como `system` con `tone` (`skill` o `stat`) y el
chat las pinta en celeste y en verde, como en UO.

### Un mundo grande

- **Índice espacial** (`SpatialIndex`, en `domain`): `World` sabe quién está en cada celda de 16 ×
  16; jugadores y criaturas avisan al moverse (`moved`). `mobilesNear` y `anyPlayerNear` miran
  solo las celdas cercanas, en vez de recorrer todo el mundo.
- **Criaturas que duermen**: lejos de todo jugador (`AWAKE_RANGE`) una criatura no piensa ni
  camina, como en UO; las invocaciones y monturas siempre siguen a su dueño.
- **Mapa compacto** (`encodeMap` / `decodeMap`, en `@fenix/shared`): el mapa del mensaje de
  bienvenida viaja como bytes en base64 (uno por tile de terreno, cinco por objeto fijo).
- **Caminos**: el A\* busca primero en una ventana alrededor de los extremos.
- **Lomas** (`TileMapData.heights`): cada tile tiene una altura en escalones (un byte, viaja en
  el mapa compacto). Solo se ve: todo se camina igual. En el cliente, `Ground` (en `rendering`)
  sube cada cosa según la altura interpolada entre las esquinas del tile; `TerrainLayer` dibuja
  las laderas como mallas de dos triángulos y las sombrea según la pendiente; el clic busca el
  tile mirando las lomas (`Ground.pick`).
- **Objetos grandes**: `StaticDefinition.footprint` (el faro ocupa 2 × 2 tiles y bloquea los
  cuatro) y un lienzo propio en el arte (`staticFrame`).
- **Cambio de mundo**: `World.mapId` (tamaño y semilla) se guarda con el personaje; si el mundo
  cambió, el personaje aparece en la capital en vez de en su lugar viejo.

### Vida en las ciudades

`use-cases/town-life.ts`: los vecinos (`townsfolk`, con aspectos distintos según el nombre)
pasean cerca de su casa con pausas, y los guardias (`guard`) patrullan su puesto. Solo se mueven
si hay algún jugador cerca. Un guardia que ve a un criminal, un asesino o una fiera dentro de la
zona protegida le grita "¡Alto ahí!" y a los 2,5 s aparece a su lado y lo ajusticia (no toca las
criaturas creadas por un administrador). Con los que no comercian se charla: al hacer clic dicen
una frase de `NPC_CHATTER`. `city-builder` los pone: vecinos por las avenidas y guardias en las
puertas y la plaza (no en el refugio de los bandidos).

### Administrador del juego

`use-cases/game-master.ts` (mensaje `gm`, con el comando adentro). Son administradores los
nombres de `ADMINS` y los personajes de prueba (`TEST_CHARACTERS`; en el modo solo, Gaspar); el
servidor lo revisa en cada comando. Desde el chat: `/crear criatura [n]` (salvajes, marcadas
`temporary`: al morir no reaparecen), `/invocar criatura [n]` (lo siguen y pelean para él),
`/criaturas`, `/objeto nombre [n]`, `/montura tipo`, `/matar` (al blanco), `/curar` y
`/resucitar` (por nombre, al blanco o a uno mismo), `/traer nombre`, `/irjunto nombre`,
`/limpiar [radio]` (saca las criaturas creadas cerca) y `/anuncio texto`. Los nombres se buscan
sin mayúsculas ni tildes: igual, que empiece así o que lo contenga.

### Recipientes

Como en UO, hay cosas que guardan cosas: bolsas, saquitos y cajas que se llevan en la
mochila (`capacity` en el catálogo) y muebles del mundo (cofres, barriles, toneles,
cajones, bibliotecas y estantes; ver `STATIC_CONTAINERS`). Un objeto puede estar
`{ type: 'container', containerId }`: el id de una bolsa o `static:x:y` para un mueble.
`Containers` (caso de uso) abre con doble clic si se está a dos pasos o menos (o si la
bolsa es propia), llena los muebles la primera vez y los repone a la media hora de quedar
vacíos, reenvía el contenido cuando cambia y cierra la ventana de quien se aleja. Las
bolsas se guardan con todo lo de adentro (`SavedItem.contents`) y no se puede meter una
bolsa dentro de sí misma.

### Libros

Un `book` guarda su texto en `Item.book` (`BookText`: título, autor y hasta 16 hojas de
320 letras; ver `shared/domain/items/books.ts`). Con doble clic el servidor manda `book`
con el texto y si se puede escribir; el cliente lo muestra en `BookWindow` como dos hojas de
pergamino con letra antigua (IM Fell English y UnifrakturMaguntia, licencia OFL, empaquetadas
con `@fontsource`). Se escribe hoja por hoja (`writeBook`, para no pasar el límite de 1 KB de
un mensaje); el primero que escribe queda como autor. Las bibliotecas traen libros ya escritos
(`LORE_BOOKS`, con `sealed`) que se leen pero no se cambian. La maga vende libros en blanco.

### Misiones

Los vecinos (`townsfolk`) dan misiones, como en UO: al hacerles clic el cliente manda
`talkNpc` y `Quests` (caso de uso) decide qué contestar. Si el vecino necesita algo, le
manda al jugador un `questOffer`; si ya se la habían aceptado, recuerda lo que falta o
paga si está lista; y si le traen una carta, la recibe. Hay tres tipos (ver
`shared/domain/quests/quests.ts`): **cazar** criaturas (cuentan las que mata el jugador, por
`GameLoop.onCreatureKilled`), **traer** materiales (se descuentan de la mochila al entregar)
y **llevar una carta** (`letter`, se lee como un libro) a un vecino de otro pueblo. Lo que
pide cada vecino sale de su nombre (siempre lo mismo hasta terminarla) y cambia después de
cada misión cumplida; después descansa un rato. Paga en oro según lo pedido, a veces suma un
objeto, y da fama y karma. Se llevan hasta cinco a la vez (`Player.quests`, se guardan con el
personaje) y se ven en el diario de misiones (tecla J).

### Objetos y comercios

El catálogo suma comidas y bebidas (pan, queso, jamón, zanahoria, pastel de carne, vino,
cerveza), armas (espada larga, cimitarra, hacha de guerra, alabarda, garrote, bastón de
combate), escudos (rodela, escudo de metal), capucha de malla y cota de anillas, luz
(`light` en el catálogo: antorcha y farol, que alumbran alrededor de quien los lleva en la
mano izquierda; el cliente suma esas luces al mapa de luz), instrumentos (`music`: al tocarlos,
lo escuchan los que están cerca) y gemas que dejan las criaturas fuertes. Marta la proveedora
(`provisioner`) atiende un almacén en los pueblos medianos y grandes: vende comida, luz,
bolsas e instrumentos, y compra gemas. La ventana de la tienda muestra el daño, la defensa o
cuánto alimenta cada objeto, separa los estantes (armas, armaduras, comida, otros) en las
tiendas grandes, calcula el total al comprar varios y tiene «Vender todo».

### Hablar con los vecinos y leyendas

- **Conversación** (`server/application/npc-talk.ts`): lo que un jugador dice en voz alta lo
  escucha el vecino más cercano (o el que nombre) y contesta según lo que se le pregunta:
  saludo, nombre, oficio, el pueblo, dónde queda un lugar con nombre (rumbo y distancia),
  rumores, comprar, despedida. Cada vecino tiene su carácter (cálido, seco, misterioso o
  charlatán, según su nombre), que cambia cómo dice las cosas, y se acuerda de con quién habló.
  Las respuestas salen como un mensaje de chat del vecino. Es un motor de palabras clave: no
  usa ningún servicio externo.
- **Leyendas** (`shared/domain/quests/legends.ts`, `server/application/legends.ts`): misiones
  largas que nadie ofrece de frente. Un vecino cuenta un rumor (si le preguntás por rumores) y
  queda en el diario; la persona indicada (el escriba, el joyero, la curandera, el herrero)
  cuenta más solo si le preguntás por la palabra justa; en el lugar indicado aparece el jefe con
  nombre propio y su escolta cuando llega alguien que lo busca; al vencerlo se lleva la
  reliquia, y al devolverla recibe oro y un **pergamino de maestría** (+5 en Magia, Tácticas,
  Primeros auxilios o Forzar cerraduras). El avance se guarda con el personaje y se ve en el
  diario de misiones (J), sin decir más que la pista.

### El oficio del ladrón

- **Habilidades nuevas** (grupo «Ladrón»): Forzar cerraduras, Fisgonear y Robar. Las reglas
  (probabilidades, dificultad de cada cerradura) están en `shared/domain/skills/thievery.ts`;
  el caso de uso, en `server/application/thievery.ts`.
- **Cofres con llave**: la dificultad sale del lugar (`lockDifficulty`), así que siempre es la
  misma. En las ruinas, casas abandonadas y mazmorras casi todos están cerrados y son
  difíciles; en los pueblos, uno de cada tres. Fuera de todo lugar con nombre no hay cerraduras.
  Lo guardado con llave trae oro y, a veces, gemas. Con una ganzúa (`pickLock`, se elige el
  cofre) se tira Forzar cerraduras contra la dificultad; al fallar, a veces se rompe la ganzúa.
  El cofre abierto se vuelve a cerrar cuando se repone.
- **Fisgonear** y **Robar** se usan sobre la persona de al lado (un jugador o un vecino; a los
  guardias no): `useSkill` lleva `targetId` y el cliente deja elegir también a los vecinos. A
  un jugador se le roba algo de la mochila (nunca el equipo inicial); a un vecino, sus monedas o
  algo de su oficio. Fisgonear antes o estar escondido ayuda. Si te pescan quedás como criminal
  (los guardias se encargan) y la víctima queda atenta un rato.

### Equipo completo y ventana de personaje

- **Lugares del equipo** (`EQUIPMENT_SLOTS`): además de cabeza, capa, torso, manos, piernas
  y pies, ahora hay cuello (golas), brazos (mangas y brazales) y manos (guantes y guanteletes),
  como en UO. Cada material tiene sus piezas: cuero, tachonado, anillas, malla, hueso y placas;
  el juego completo de placas suma bastante más que el peto solo. El herrero vende las de
  metal, el tabernero las de cuero; la herrería y la sastrería las fabrican. Los guardias
  llevan el juego completo.
- **Cómo se ven puestas** (`character-art.ts`): `STUFF` dice de qué es cada pieza y
  `armorSurface` la pinta (láminas, hileras de anillas, costuras, tachas, bandas de hueso). El
  peto de placas ya no pone mangas de metal: los brazos los cubren los brazales (con codera y
  hombrera). Las grebas de placas tienen escarcelas y rodilleras; la gola se apila sobre el
  cuello.
- **Ventana de personaje** (`paperdoll-art.ts`): el mismo modelo 3D, de frente y casi sin
  inclinación, en la pose `display` (brazos separados, como en UO) y dibujado a
  `PAPERDOLL_DETAIL` veces la resolución del sprite (no el sprite agrandado). El lienzo tiene
  `detail`: con más de 1 las calcomanías crecen, las manos tienen dedos y pulgar (cerradas si
  empuñan algo) y las telas caen sin escalones. Para agarrar una prenda del dibujo se comparan
  dibujos chicos de la misma pose, con y sin la prenda.

### Pueblos vivos

- **Puertas del lado que se ve**: en la vista isométrica las paredes del norte y del oeste
  quedan tapadas por la casa, así que las puertas van siempre en la pared del sur o del este
  (`building` en `city-builder.ts`), la que mira a la plaza si afuera hay paso. La barraca del
  castillo también abre al este. Si igual algo tapa al personaje, se vuelve translúcido.
- **Más oficios** (`NPC_ROLES`): alquimista, curandera, arquero, panadera, carnicero,
  pescador, joyero, escriba y granjero, cada uno con su tienda (`VENDORS`), su aspecto
  (`npc.ts`), su ropa de trabajo y su local amueblado (`furnishShop`). Cada pueblo abre los
  oficios por orden de importancia mientras haya casas; la capital los tiene todos. En la
  plaza pide un mendigo (`beggar`).
- **Casa abandonada**: en los pueblos medianos y grandes, la casa más alejada de la plaza
  quedó sin techo, con telarañas, escombros, huesos y un agujero en la pared.
- **Afuera** (`places.ts`): granjas (`farmstead`: casa, corral con animales, surcos, pozo y
  fardos) donde viven el granjero, que vende lo que da la tierra, y su familia; y lugares que
  despiertan la curiosidad: la Casa del Ermitaño (cabaña abandonada en el bosque), la Granja
  Quemada (ruinas con necrófagos) y la Capilla Olvidada (con esqueletos y un mago esquelético).
  Las casas de los lugares se arman con `cabin`, que puede dejar paredes caídas. Los lugares
  pueden tener vecinos (`Site.npc`).

### Armas de guerra y ventanas de recipientes

- **Armas nuevas**: hacha doble, hacha de batalla, hacha a dos manos, gran hacha de batalla,
  hacha de asta, horquilla de guerra, lanza corta, pico de guerra, alfanje, espada vikinga,
  ballesta y ballesta pesada (en `combat/weapons.ts`). Las ballestas usan **virotes** (`ammo`)
  en vez de flechas; sin munición el servidor avisa cuál falta (`missingAmmo`). Escudos de
  cometa y heráldico, y el **peto de placas de mujer** (`womenOnly` en el catálogo): el
  servidor (`wearRefusal` en `Items`) no deja que lo vista un hombre. El herrero los vende y
  compra; la herrería y la carpintería de arcos tienen sus recetas.
- **Arte**: íconos en `item-art.ts` (con `haft` para los mangos y `crossbow`) y en la mano en
  `character-art.ts` (`HEAVY_AXES`, asta, horquilla, pico, ballesta, escudos con punta). La
  ballesta ataca con el gesto de disparo; la horquilla y la lanza corta, con estocada.
- **Ventanas de recipientes**: `art/container-art.ts` dibuja la mochila de cuero con solapa y
  hebillas, la bolsa fruncida con cordón y el cofre abierto con fieltro verde. Cada arte dice
  dónde va el hueco interior (`interior`); en el cliente, `ui/container-skin.ts` pone el
  dibujo de fondo y ubica ahí el área de objetos. La mochila, el banco y los recipientes
  (bolsa, cofre, caja) lo usan; el resto sigue con el marco común.

### Bajo tierra: criptas y alcantarilla

Los cementerios son más grandes y tienen más no-muertos. Frente a la puerta de cada
cripta hay una bajada (`Descent`, la arma `city-builder`) que lleva a una cripta
subterránea: un pasillo de baldosas oscuras con nichos (sarcófago y un muerto que se
levanta en cada uno) y una sala al fondo con el señor de la cripta (un liche en la capital) y
un cofre. La capital tiene además una reja de alcantarilla en una calle del suroeste: abajo
hay canales de agua sucia con veredas y puentes, nidos de ratas, una guarida de orcos con un
cofre y unas ruinas viejas. Lo generan `generateCrypt` y `generateSewer` (`underground.ts`);
`world-builder` los pone uno debajo del otro al este de la cueva, cada uno con su región
oscura (`dungeon: true`), sus criaturas y dos teletransportes (bajar y volver por la escalera).

**Bajo la capital** hay además **catacumbas** (`generateCatacombs`): túneles de adoquines que
serpentean entre muros de piedra con musgo, osarios con montones de calaveras y no-muertos y
una cámara al fondo con un cofre. Se unen por **pasadizos** (`Passage`): una pared agrietada
(`cracked-wall`, parece pared pero se pasa) en la alcantarilla y otra en la cripta del
cementerio llevan a las catacumbas, y en algunas casas una **baldosa floja**
(`loose-flagstone`, una bajada `secret`) baja a ellas; desde abajo, una escalera de mano sube
de vuelta a la casa. `undercityLinks` (`world-builder`) arma esos teletransportes. La
alcantarilla tiene la estética de UO (arte propio): veredas de adoquines (`Cobblestone`),
canales de agua verde y turbia que se cruzan a pie (`SewerWater`), muros de bloques con musgo
(`sewer-wall`), baba y agujeros que despiden gases.

### Pisos altos y línea de visión

Algunos edificios tienen pisos altos, como en UO: la posada (un piso con cuartos), la torre
del mago (dos pisos con escalera de caracol: biblioteca y observatorio) y algunas casas (escalera
de madera o de mano). `city-builder` pone la escalera en el rincón del cuarto más lejos de la
puerta y anota la subida (`Ascent`); `generateFloors` (`upper-floors.ts`) arma cada piso del
mismo tamaño que la planta baja, con sus paredes, ventanas y muebles, la bajada (`stair-hole`)
justo arriba de la escalera de abajo y, si sigue, otra escalera en la punta más lejana.
`world-builder` pone los pisos en columnas a la derecha de todo (para caminar y chocar son
lugares aparte), cada uno con su región (`floor: 1, 2…`, con luz de día y protegida como el
pueblo), los teletransportes de subir y bajar y un **ancla** (`anchor`): cuánto se corre para
quedar encima de su edificio. `TileMap.displayOf` da la posición a la vista (encima del
edificio, a su altura) y `rawOf` la inversa. Tipos de escalera: de madera, de piedra, de
caracol, de mano, la bajada y la trampilla.

**Pisos a la vista**, como en UO: arriba de todo cada edificio tiene una **azotea** (techo
plano con almenas de piedra o baranda de tablas; se sube por una escalera de mano y una
trampilla) y las casas de una planta tienen su techo (sin acceso). En el cliente, `Ground`
proyecta todo con `displayOf`: los pisos altos se dibujan encima de su edificio, subidos lo
que mide una pared (`FLOOR_PX`) y por delante de su planta baja (`LEVEL_DEPTH`); el suelo de
cada piso lo dibuja `FloorLayer` en la capa ordenada. Desde la calle se ven las fachadas y
las azoteas; al entrar a un edificio se esconden sus pisos de arriba (`floorsAbove`), y desde
un piso alto se ve la ciudad alrededor. En el servidor, los índices de cercanía cuentan a
cada uno donde se ve (`World.seen`): la gente del balcón y la de la calle se ven y se oyen.
Los subsuelos (criptas, alcantarilla, mazmorra) no tienen ancla: siguen aparte y oscuros.

En la capital hay casas de piedra y de **arenisca** mezcladas (bloques claros con moldura y
ventanas en arco, piso de baldosas de arenisca).

La **línea de visión** (`hasLineOfSight`, `shared/domain/rules/line-of-sight.ts`) recorre la
recta entre dos tiles: la tapan las paredes y sus ventanas, las puertas cerradas, las rejas,
murallas, empalizadas, torres, la roca y las montañas (`blocksSight`); los árboles, las cercas
bajas y los muebles no. Tampoco se ve entre niveles distintos (`TileMap.levelAt`). Se usa en:

- hechizos: a alguien de otro piso no se le puede apuntar; si al terminar de conjurar algo
  tapa al objetivo, el hechizo falla (y el maná y los reactivos se pierden);
- golpes y flechas: no atraviesan paredes ni rejas;
- criaturas: sin ver al objetivo no le tiran hechizos ni fuego (se acercan), y si se esconde
  detrás de una pared mientras conjuran, el hechizo se pierde.

### Humanos hostiles y puertos

Además de las bestias, hay gente que ataca: **bárbaros** (en un campamento con empalizada
en la nieve), **piratas** y **corsarios** (en una cala de la costa, con su barco pirata
amarrado) y **bandoleros** (en una guarida del bosque, cerca de los caminos). Son criaturas
del catálogo con cuerpo de persona: `human-foe-art` los dibuja con el mismo rig que a los
jugadores, con su ropa y sus armas. Puerto Ceniza y Puerto Brasa tienen un muelle en la
costa más cercana (`harbor` en `places.ts`): un tablado que entra al mar con postes y un
barco mercante amarrado (estático de 3 × 3 tiles sobre el agua). Los lugares con `near`
ahora sí se ubican cerca de su pueblo (antes el pueblo tomaba el nombre de su cementerio).

### Vestimenta y tinturas

Hay ropa de tela y cuero para cada parte del cuerpo: camisas, camisa fina, jubón, vestido,
pollera, pantalón corto, sombreros (de paja, con pluma, tricornio), pañuelo, sandalias,
zapatos, botas altas y capa de piel. Las vende Rosa la sastra (`tailor`), que también vende
tinturas y la tina. Lo que es `dyeable` se tiñe: con la tina en la mochila, cada teñida gasta
una tintura y cambia `Item.hue` (uno de los 15 colores de `DYE_HUES`). El color viaja en los
íconos (`ItemSnapshot.hue`), en lo que ven los demás (`MobileSnapshot.hues` y
`playerEquipment.hues`, por lugar del cuerpo) y se guarda con el personaje;
`drawCharacterFrame` lo recibe y lo usa en lugar del color de catálogo. La armadura de hueso
(yelmo de calavera, pechera y perneras) no es de metal: deja meditar y lanzar hechizos. La
dejan esqueletos, magos esqueléticos y liches, y la maga vende el yelmo.

### Muros, campos, hechizos de área y trampas

Los hechizos de campo (`field`) apuntan a un lugar caminable y levantan una línea de
`FIELD_LENGTH` (5) casillas perpendicular a la dirección del lanzador: muro de piedra, campo de
fuego, campo venenoso, campo paralizante y campo de energía. Cada casilla es un objeto fijo en el
suelo (`field-*`) que vence según `FIELDS`. El caso de uso `Fields` los levanta y, cada segundo,
golpea a quien esté parado encima: el fuego quema, el veneno envenena y el paralizante inmoviliza
un rato. Los de piedra y energía son barrera: `TileMap.setBarrier` bloquea la casilla en el
servidor y el cliente hace lo mismo al ver el objeto (`FIELDS[...].barrier`), así la predicción de
movimiento coincide. Los de área (`area-cure`, `area-protection`, `burst`, `burst-curse`) afectan
al objetivo y a todo lo que tenga alrededor: curar y proteger a varios, cadena de rayos, lluvia de
meteoritos y maldición en masa. «Trampa mágica» se lanza sobre un cofre o barril del mundo: quien
lo abra recibe una explosión (`TRAP_DAMAGE`); «Desactivar trampa» la quita.

### Búsqueda de tesoros

Algunas criaturas (orcos, bandoleros, piratas, corsarios, trolls, liches, dragones… ver
`TREASURE_MAP_DROPS`) pueden dejar en el cuerpo un mapa del tesoro de nivel 1 a 4. Al dejarlo,
`chartTreasure` elige un lugar de tierra firme fuera de los pueblos y las mazmorras y lo guarda en
`Item.treasure` (se persiste con el personaje). El caso de uso `TreasureHunt` responde al doble
clic con `treasureMap`: el cliente dibuja ese trozo del mundo en pergamino, con la cruz y una pista
respecto del pueblo o lugar más cercano (`treasureHint`). Con el mapa encima, se cava con una pala
(`dig`) a menos de `DIG_RANGE` tiles de la cruz: hace falta minería según el nivel y cada palada
tiene una probabilidad (`digChance`). Al acertar, el mapa se gasta, aparece un cofre del tesoro fijo
en el suelo con oro, gemas y algún objeto (`TREASURE_LEVELS`), y salen sus guardianes (criaturas
temporales, que no reaparecen). El cofre se deshace solo después de `TREASURE_CHEST_MS`. La pala la
venden el herrero y Marta; Marta también compra mapas. Los administradores ven las coordenadas de la
marca al leer el mapa.

### Barcos tripulados

Los barcos siguen el modelo de UO (se revisó el código de ServUO para las reglas): se compran como
maqueta a Bruno el armador (`shipwright`), se botan con doble clic en el agua más cercana y los
navegan varios personajes juntos. Hay balandra (5 × 3, sin cañones) y galeón (7 × 3, un cañón
por banda); ver `SHIPS`.

- **Permisos** (`ShipSecurity`): el dueño es siempre capitán. Los niveles son pasajero (sube),
  tripulante (gobierna, dispara, repara), oficial (abre la bodega) y capitán (permisos, nombre,
  guardar). Se dan con nombre o a cualquiera, al grupo o al gremio del dueño; «sin permiso» con
  nombre deja afuera aunque sea del grupo (`shipLevel`). Para subir caminando a una cubierta ajena
  hace falta permiso (`MovePlayer.refusal`).
- **Timón**: cualquier tripulante a bordo da órdenes en voz alta como al timonel de UO («adelante»,
  «despacio atrás», «un paso a babor», «virar a estribor», «dar la vuelta», «alto»;
  `parseShipOrder`) o con la ventana del barco. El caso de uso `Ships` mueve el barco tile por tile
  (más lento «despacio») y lleva todo lo que hay encima: gente, criaturas y objetos. Solo entra en
  agua libre, sin muelles, rocas ni otros barcos.
- **Cubierta**: `TileMap.setDeck` vuelve caminables los tiles de agua que ocupa un barco, en el
  servidor y en el cliente (que conoce los barcos por `ships` y `shipMoved`), así la predicción de
  movimiento coincide.
- **Cañones, casco y bodega**: cada disparo gasta una bala (de la mochila o de la bodega), sale
  derecho por esa banda hasta `CANNON_RANGE` y daña el primer barco o a la gente que encuentra.
  Con el casco en cero, el barco se hunde y los de a bordo nadan hasta la costa. Reparar gasta
  tablas y tela. La bodega es un recipiente fijo en la popa, solo para oficiales.
- **Guardar**: el capitán, cerca de la costa, sin nadie más a bordo y con la bodega vacía, lo
  guarda en su maqueta (con nombre, casco y permisos). Mientras está en el agua, el guardado del
  personaje incluye la maqueta en el banco (por si el servidor se reinicia); al volver a entrar, si
  el barco sigue en el agua, la copia se descarta (`Ships.afterJoin`). Lo que haya en la bodega
  no sobrevive a un reinicio.
- El dibujo del barco se arma con la proa hacia +x y se gira con `RotatedProjection`: la luz
  queda fija en el mundo para las cuatro direcciones.

### Persistencia

Un personaje se guarda como datos planos (`SavedCharacter`, en `domain/persistence`):
apariencia, posición, vitales, habilidades, reputación, gremio y sus objetos (mochila, equipo y
banco). `parseSavedCharacter` valida lo leído y descarta lo dañado. La aplicación solo conoce
dos puertos: `CharacterStore` (dónde se guarda) y `PasswordHasher`. `CharacterPersistence`
verifica la contraseña al entrar, guarda al registrarse, cada 30 segundos y al salir.

Implementaciones: `JsonFileCharacterStore` (servidor, escritura atómica y agrupada),
`KeyValueCharacterStore` (modo solo, sobre `localStorage`) y `ScryptPasswordHasher`. El modo
solo no pide contraseña: el servidor embebido se compone sin hasher.

### Cuentas y creación de personajes

Se entra con una **cuenta** (nombre y contraseña) que guarda hasta cinco personajes
(`ACCOUNT_CHARACTERS`). El puerto `AccountStore` guarda `AccountRecord` (nombre, hash y lista de
personajes): `JsonFileAccountStore` (`cuentas.json`) en el servidor y `KeyValueAccountStore`
(`fenix.cuentas`) en el modo solo. El caso de uso `Accounts` entra o crea la cuenta, arma la
lista (`account`), crea, juega y borra personajes; `ClientSession` pasa de "sin cuenta" a
"en la cuenta" y de ahí al mundo (mensajes `login`, `createCharacter`, `play`,
`deleteCharacter`; el viejo `join` sigue andando para las pruebas). Un personaje de antes de las
cuentas pasa a la cuenta de su mismo nombre la primera vez que se entra con su contraseña. La
cuenta de un personaje de prueba ya lo trae.

La creación es como en UO (`shared/domain/character/creation.ts`): 120 puntos de atributos (de
10 a 80 cada uno) y tres habilidades, una en 60 y dos en 50. El equipo sale de `startingKit`:
lo de todos (100 vendas, comida, pociones, antorcha) más lo de cada habilidad (armas y armadura
para combate, libro y 150 de cada reactivo para Magia, herramientas y materiales para los
oficios…); además, 2000 monedas en el banco. Las armas, la armadura y el escudo se ponen solos.

Todo ese equipo es **de equipo inicial** (`Item.newbie`, se guarda y se muestra en el nombre):
no se puede tirar al suelo, ni guardar fuera de las cosas propias (mochila, equipo, banco y sus
bolsas), ni vender; tampoco se mezcla en una pila con lo comprado, así no se "contagia".

### Fauna

La fauna está en `@fenix/shared` (`fauna-catalog.ts`): cada animal tiene su carácter. Las
**presas** tienen rango de agresión 0 y huyen siempre (`fleeAt: 1`), los **mansos** tienen
rango 0 (solo devuelven los golpes) y las **fieras** atacan a quien se acerca. No hizo falta
cambiar la IA: con esos valores alcanza. En `@fenix/art`, `fauna-art.ts` dibuja cada animal:
los de pezuñas con el esqueleto de las monturas (sin montura), los de zarpas con un cuadrúpedo
con medidas, orejas, cola y pelaje propios (rosetas del jaguar y del leopardo), y los demás con
modelos propios (pájaros, serpientes, escorpiones, cocodrilos, rana, morsa, gorila). El hombre
lagarto, que anda en dos patas, está con los monstruos. `places.ts` reparte la fauna por bioma.
Cada animal tiene su lienzo y su escala (`faunaLayout`), así no todos miden lo mismo: los
grandes sobresalen del tile. Las monturas también: `mountLayout(kind)` da el lienzo de cada una
(el elefante usa uno mucho más grande que el del caballo) y el cliente lo usa para anclar el
dibujo, el nombre, la vida y el tamaño de la sombra.

### Monturas

`MOUNTS` (shared) lista las monturas; cada una es también una `CreatureKind`. Comprada en la
caballeriza (`buyMount`), queda en el mundo como `Creature` con dueño y sin vencimiento
(`isPet`): sigue al dueño y viaja con él en los teletransportes. Suelta pelea como una invocación
(`updateSummonTarget`): ataca al objetivo de su dueño y a quien lo ataque a él o a ella. Las
criaturas salvajes la eligen como presa igual que a un jugador, y atacar la montura de otro jugador
sigue las reglas del combate entre jugadores contra su dueño (el pueblo la protege y es un crimen
si el dueño es inocente). Al dueño se le avisa cuando la atacan y cuando la matan; el cuerpo queda
20 s y después puede comprar otra. `releasePet` (`/liberar`) la deja ir, montada o suelta. `MountActions` la monta
(`mount`: la criatura sale del mundo y `Player.mount` guarda la especie), la baja (`dismount`, o al
morir) y avisa con `mountChanged`. Montado, `moveDuration(mode, true)` da los tiempos de UO (200 ms
al paso, 100 ms al galope) en el servidor y en la predicción del cliente, y correr no gasta
energía. La montura se guarda con el personaje (montada o suelta).

En el arte, `mount-art.ts` arma el animal en el mismo lienzo con profundidad que el jinete, así se
tapan bien entre sí: cuadrúpedos con patas en cadena (antebrazo o pierna, caña, cuartilla y casco)
y andares por fase de cada pata, y el lagarto bípedo. `humanoidRig` recibe el asiento (`Seat`) y
sienta al jinete con la pose de montar.

### Continente

`procedural-map.ts` genera el continente (320×320 por defecto, `MAP_SIZE`) con campos de ruido:

- **Elevación**: decide el mar y las costas (baja hacia los bordes) y sube alrededor de cada
  pueblo para que quede en tierra firme. Un ruido "de crestas" marca las **cordilleras**
  (objetos `mountain` que bloquean), con un arco abierto hacia la capital alrededor de Roca Alta.
- **Latitud y humedad**: nieve al norte, desierto al sur, pantano alrededor de Junco Verde y en
  los bajos húmedos; bosques y praderas en el resto. Al pie de las montañas, una franja
  pedregosa. Cada bioma tiene su vegetación (pino nevado, cactus, juncos, sauces…).
- **Ríos**: bajan desde el pie de la montaña siempre hacia lo más bajo hasta el mar (o terminan
  en una laguna).

Las cordilleras solo aparecen en algunas regiones y se les quitan los cordones de un tile (parecen
cercos): quedan macizos, y el resto del continente es abierto, con bosques ralos.

Encima se estampan las ciudades (`TownPlan`: plano, lugar y clima) y se trazan
**caminos** entre ellos con A* (`roads.ts`): cada terreno tiene su costo (el agua y la montaña,
mucho) y doblar también cuesta, así salen tramos largos y rectos que cruzan los ríos por lo más
angosto con **puentes** de tablones. Son de tres tiles de ancho, con banquinas sin árboles, y van
**empedrados** cerca de los pueblos (las calles de los pueblos también). A la salida de cada
pueblo, un **cartel** (`TileMap.signs`) dice adónde lleva el camino. Cada lugar con nombre y la
boca de la cueva tienen un **sendero** de tierra hasta el camino más cercano.

`places.ts` ubica los **lugares con nombre** según su bioma y su distancia a la capital
(campamento orco, torre en ruinas, cementerio, faro, refugio en la nieve, ruinas del desierto,
paso de montaña) y la boca de la cueva al pie de una cordillera. Son zonas con `wild: true`: se
ve el nombre pero no protegen. Las criaturas sueltas salen de una densidad por bioma
(`BIOME_CREATURES`) y cada lugar tiene sus habitantes; los alrededores de los pueblos quedan
tranquilos. Con un mapa chico (menos de 200) queda solo la capital.

`city-builder.ts` arma cada **ciudad** como un plano (`MapRegion`, el mismo que sale de un
mapa de Tiled) sobre un lienzo de tiles: avenidas en cruz con la plaza, muralla con puertas al
medio de cada lado (donde llegan los caminos), cuadras partidas por calles con una casa cada una
(`Plan.enclose` pone las paredes en el borde de atrás de los tiles, como en los mapas de Tiled),
los negocios con su gente cerca de la plaza, el castillo en la capital y, afuera, caballeriza,
huertas y cementerio. Un `Style` por región elige paredes, pisos, calles, muralla y faroles. Las
criaturas del cementerio salen en `MapRegion.lairs`; `procedural-map.ts` las corre al lugar del
pueblo y `places.ts` las suma a las del continente. Cada zona protegida es lo de adentro de la
muralla; el cementerio y el refugio de los bandidos son `wild` (no protegen). Los objetos de 2 × 2
(torre, cripta, fuente) ocupan todos sus tiles. `furnishShop` y `furnishHome` amueblan cada casa
sin tapar el paso de la puerta al centro; las bibliotecas y estantes se cuelgan de la pared con
`Plan.onWall` (otro objeto en el mismo tile que la pared). El río de la capital marca en
`MapRegion.rivers` por dónde entra y sale, y `procedural-map.ts` lo sigue afuera.

**Puertas:** `DOORS` (shared) une cada puerta cerrada con su dibujo abierto. El estado es lo
único del mapa que cambia: `TileMap.setDoorOpen` y `isWalkable` (una puerta abierta no bloquea).
El servidor (`use-cases/doors.ts`) abre o cierra con `useDoor` si el jugador está al lado y avisa
a todos con `door`; quien entra recibe las abiertas en `welcome.openDoors`. El cliente actualiza
su mapa (la predicción de movimiento usa el mismo) y `StaticLayer.refreshDoor` cambia el dibujo.
Las **puertas dobles** son dos hojas (`*-l` en la menor coordenada y `*-r` en la siguiente) con la
bisagra en el marco de afuera y sin jamba en el medio: `doorPartner` encuentra la otra hoja y
`Doors.use` abre y cierra las dos juntas (`Plan.doubleDoor` las pone; la caballeriza, el salón del
trono y los pasillos de la mazmorra las usan).

**Nada tapa el paso:** `Plan.repair` revisa al final de cada ciudad que desde la plaza se llegue
caminando (con las puertas abiertas) a todo el suelo libre y que cada puerta tenga paso de los dos
lados: saca el mueble que cierra un rincón, abre una puerta en una pared de casa que deja un cuarto
cerrado y tapa los huecos chicos encerrados. La muralla sigue un contorno con las esquinas cortadas
en diagonal (distintas en cada ciudad), la plaza es redonda y las cuadras cambian de tamaño en cada
barrio. Las pruebas de `city-builder.test.ts` y `dungeon-map.test.ts` lo verifican en varias semillas.

**Asientos:** `SEATS` (shared) dice qué objetos son asiento y hacia dónde miran; `TileMap.seatAt`
lo responde por tile. Sentarse es solo visual: el cliente dibuja el cuadro `sit` (pose propia
de silla en `humanoid-rig`) cuando la persona está quieta, a pie y en paz sobre un asiento.

El **minimapa** (`ui/minimap.ts`) dibuja el mapa una vez a un pixel por tile y lo muestra girado
como la vista isométrica, centrado en el jugador, con la gente cerca y los nombres de los
lugares; se abre y se cierra con el botón Mapa o la tecla M y recuerda si quedó abierto.

El cliente arma el terreno por bloques de 16×16 recién cuando entran en pantalla, y el servidor
comprime los mensajes de la conexión (el mapa viaja al entrar).

### Mazmorra

`world-builder.ts` arma un solo mapa: el continente a la izquierda, roca maciza en el medio y la
mazmorra (`dungeon-map.ts`) a la derecha. La mazmorra son cavernas de forma irregular (una elipse
con el borde ondulado y lóbulos, suavizada) en serpentina, unidas por pasillos de dos tiles que
serpentean entre puntos al azar; la roca que toca el suelo se vuelve `cave-wall`. Las puertas
dobles van en el primer tramo recto del pasillo al salir de cada caverna (de huesos en la guarida),
y los braseros y estalagmitas solo se ponen si no cierran ningún paso ni tapan una puerta. Se entra y se sale por
**teletransportes** del mapa (`TileMap.teleporters`): `MovePlayer`, después de un paso, mira si el
tile lleva a otro lado y llama a `teleport`. El cliente no predice pasos desde un teletransporte.
La zona de la mazmorra tiene `dungeon: true`: no es protegida (`safeZoneAt`) y el cliente la dibuja
oscura a cualquier hora. Las criaturas de cada sala salen de `LAIR_LEVELS` según la profundidad;
la última es la guarida del dragón. El dragón rojo es grande (lienzo propio en `dragon-art.ts`,
casi tres veces una persona); el dragón joven es el chico, en el fondo y en las Tierras de Ceniza.

### Montañas

Las montañas son como en UO: terreno de roca (`Terrain.Mountain`) que sube en laderas, más alto
cuanto más adentro del macizo (`mountains.ts`, al final de `populateContinent`). La marca
`mountain` sigue en cada tile (bloquea y se pica con el pico) pero no se dibuja
(`INVISIBLE_STATICS`); encima van riscos sueltos de tres formas (`crag`, `crag-spire`,
`crag-ledge`). Los macizos grandes tienen una **mina**: un socavón de dos tiles que entra hasta una
galería, con su nombre de región. Y ningún rincón de tierra firme queda encerrado (por montañas,
árboles o un farol delante de una puerta): se le abre el paso más corto, nunca a través de paredes.
En el campo, un ruido de **claros** deja zonas lisas, sin plantas ni piedras, para poder construir.

### Rango de visión

Cada jugador solo recibe lo que pasa a 18 tiles o menos (como en UO): al moverse, el servidor
calcula quién entra y quién sale de su rango y envía `mobileAppeared` / `mobileDisappeared` en
ambos sentidos. El chat en voz alta también se oye solo dentro de ese rango (el de grupo y el de
gremio llega a sus miembros estén donde estén).

## Render

- **Terreno** (`TerrainLayer`): rombos de 44×44 (el tamaño de tile de UO) dibujados a
  resolución completa, con bordes mezclados según los vecinos, en bloques de 16×16 que se
  ocultan fuera de cámara. El color de cada terreno y variante se calcula una sola vez por
  pixel (`colorField` en `terrain-art.ts`) y cada combinación de vecinos lo reutiliza: así un
  tile nuevo cuesta décimas de milisegundo en vez de casi diez. El terreno es un grupo de
  dibujo propio de Pixi (`isRenderGroup`), así no se rearma su lista de dibujo cada vez que
  un personaje se mueve.
- **Sin tirones al caminar**: los bloques de terreno y de objetos que están cerca de la
  pantalla (`PREPARE_MARGIN`) se preparan de antemano, de a uno por cuadro: primero se dibujan
  sus texturas con `TextureCache.pump` (y se suben a la placa de video ahí mismo) y después se
  arma el bloque oculto. Los objetos que salen de pantalla se ocultan y recién se destruyen
  lejos (`DISCARD_MARGIN`), así ir y volver no rearma nada.
- **Objetos y personajes** comparten una capa ordenada por profundidad (`x + y`), así se puede
  pasar por detrás de un árbol o una pared. `StaticLayer` solo crea sprites de los bloques
  cercanos y vuelve translúcido lo que tapa al personaje.
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

## Interfaz: atajos y celular

- **Barra de atajos**: el modelo está en `core/hotbar.ts` (casilleros con un objeto por tipo o un
  hechizo, lo guardado en el navegador, contar y buscar en la mochila) y la vista en
  `ui/hotbar-bar.ts`. `GameSession.setUpHotbar` decide qué hace cada casillero: los objetos se
  buscan en la mochila al usarlos (las vendas y los hechizos de ayuda van a uno mismo). El
  servidor no sabe nada de la barra: recibe los mismos pedidos que con doble clic o el libro.
- **Modo táctil** (`html.touch-ui`, cuando la pantalla es táctil sin mouse o con `?tactil`):
  `input/joystick.ts` da una intención de movimiento con prioridad sobre el resto en
  `InputController` (que además acerca o aleja con dos dedos); `ui/touch-hud.ts` pone el botón
  de atacar, el menú y el aviso de girar el celular. El botón de atacar usa `nextAutoTarget`
  (`core/targeting.ts`): la criatura salvaje viva más cercana, sin personas ni criaturas con
  dueño. El diseño de la pantalla es solo CSS. El diseño de juego está en `docs/CELULAR.md`.

## Convenciones

- TypeScript estricto en todo el repo; `import type` para tipos.
- Tests junto al código (`*.test.ts`), con Vitest.
- Cada etapa entra por Pull Request con `npm run check` en verde.
- Código e identificadores en inglés; comentarios, textos de UI y documentación en español.
