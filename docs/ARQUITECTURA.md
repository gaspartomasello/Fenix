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

### Persistencia

Un personaje se guarda como datos planos (`SavedCharacter`, en `domain/persistence`):
apariencia, posición, vitales, habilidades, reputación, gremio y sus objetos (mochila, equipo y
banco). `parseSavedCharacter` valida lo leído y descarta lo dañado. La aplicación solo conoce
dos puertos: `CharacterStore` (dónde se guarda) y `PasswordHasher`. `CharacterPersistence`
verifica la contraseña al entrar, guarda al registrarse, cada 30 segundos y al salir.

Implementaciones: `JsonFileCharacterStore` (servidor, escritura atómica y agrupada),
`KeyValueCharacterStore` (modo solo, sobre `localStorage`) y `ScryptPasswordHasher`. El modo
solo no pide contraseña: el servidor embebido se compone sin hasher.

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
