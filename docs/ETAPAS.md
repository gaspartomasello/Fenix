# Historial de etapas

Detalle de las funcionalidades agregadas etapa por etapa. La estructura general del proyecto
está en [ARQUITECTURA.md](ARQUITECTURA.md).

## Hechizos de UO completos y campos con partículas (etapa 65)

- **Los 64 hechizos**: se sumaron los que faltaban, cada uno en su círculo como en UO. En el
  primero, Armadura reactiva. En el tercero, Cerradura mágica, Telequinesis y Abrir cerradura.
  En el quinto, Espíritu de espadas, Disipar campo, Incógnito, Reflejo mágico e Invocar criatura.
  En el sexto, Disipar. En el séptimo, Disipar en grupo y Transformación. Las reglas están en
  `@fenix/shared` (`spell-catalog.ts`: `SUMMONED_BEASTS`, `POLYMORPH_FORMS`, `dispelChance`,
  `reactiveArmorPool`, `unlockReach`) y la resolución en `server/domain/magic/spellcasting.ts`.
- **Armadura reactiva** (`combat.ts`): en los golpes cuerpo a cuerpo se queda con la mitad del
  daño y se lo devuelve a quien pega, hasta gastar su reserva. **Reflejo mágico**: el próximo
  hechizo dañino contra uno solo vuelve contra quien lo lanzó (los de área, no).
- **Incógnito y Transformación** cambian lo que ven los demás, no al jugador. `Player.disguise`
  guarda el nombre y la cara falsos (el que habla en voz alta aparece con el nombre falso) y
  `Player.form` el cuerpo de animal o criatura (sin el equipo a la vista). El servidor manda
  `mobileLook` para volver a dibujarlo y lo deshace solo cuando se termina el efecto o al morir.
  Transformado en caballo, corre como montado (`moveDuration` con `mounted`), y el botón de
  atacar no elige a una persona transformada (`MobileSnapshot.polymorphed`). La forma se elige
  en `ui/polymorph-picker.ts`.
- **Disipar** solo afecta a criaturas invocadas (`ownerId` y `expiresAt`), con
  probabilidad según la Magia; **Disipar en grupo**, a las ajenas alrededor de un lugar.
  **Disipar campo** deshace un tile de un muro o campo (`Fields.dispel`).
- **Cerraduras y Telequinesis** usan los casos de uso que ya existían: `Containers.magicLock`,
  `magicUnlock` y `springTrap`, y `Doors.use` con más alcance.
- **Campos con partículas** (`client/rendering/field-layer.ts`): el fuego y el veneno son
  lenguas de llama que suben, se achican y cambian de color, con chispas, humo, brasas y luz de
  noche. El veneno es el mismo fuego en verde. El muro de piedra es un tramo de pared recto a lo
  largo de la hilera (`drawFieldWall` en `@fenix/art`), que sale de mirar los tiles vecinos.
  Las partículas no se guardan: cada una sale de una semilla y del tiempo (`rendering/particles.ts`).
  La bola de fuego, la columna de fuego y la explosión usan las mismas partículas
  (`effects-layer.ts`).
- **Textos sobre los techos**: el nombre, la vida, lo que dice cada uno y los números de daño
  van en `CharacterView.labels`, otra capa por encima de todo el mundo, así ningún techo los tapa.

## Bolsas, tina con panel de colores y resbalar contra paredes (etapa 66)

- **Guardar en bolsas**: soltar un objeto sobre una bolsa (un ícono con `data-bag` en la mochila
  o en otro recipiente) lo guarda adentro, como en UO (`drag-controller.ts`, que ilumina la bolsa
  al pasar por encima). El servidor ya aceptaba `container` sin lugar: busca el primer casillero
  libre.
- **Lo de las bolsas cuenta**: `Items.countInBackpack` y `consumeFromBackpack` miran también
  adentro de las bolsas de la mochila (`Items.carried`), así los reactivos en su bolsa sirven
  para los hechizos. Los personajes nuevos y los de prueba traen los reactivos en una bolsa
  (`domain/items/reagent-bag.ts`).
- **Tina de tintura**: el panel (`ui/dye-window.ts`) tiene 18 tonos con 7 matices cada uno, más
  los grises (`DYE_FAMILIES` en `@fenix/shared`). Primero se le elige el color a la tina
  (`tintTub`: el agua toma ese color y se guarda en el objeto). Después se tiñe del color de la
  tina (`dye`, que gasta una tintura). Las bolsas también se tiñen.
- **Personaje de prueba sin oro**: `Player.testKit` guarda qué versión del kit de prueba ya se le
  aplicó. La versión 2 le saca una sola vez el oro que tenía; lo que gane después lo conserva.
- **Resbalar contra las paredes** (`slideDirection` en `@fenix/shared`), como en UO: un paso en
  diagonal de la grilla que choca prueba las dos direcciones vecinas y sigue por la libre (hacia
  donde tira el mouse o el joystick, `MovementIntent.lean`). De frente contra algo se frena. Lo
  resuelve el cliente al predecir el paso y manda la dirección final; el servidor la valida igual
  que siempre.
- **Chequeo rápido**: `npm run check:fast` corre formato, tipos y solo las pruebas de los módulos
  que cambiaron (Vitest sigue los imports). La batería completa la corre la integración continua.
  Cambiar un catálogo compartido (objetos, mensajes) igual dispara casi todas, porque todo lo usa.

## Efectos de hechizos y veneno a la vista (etapa 70)

- **Un efecto propio por hechizo.** Antes muchos hechizos compartían destellos, anillos o
  hundimientos genéricos. Ahora cada uno de los 64 tiene su receta en
  `client/src/rendering/spell-fx/recipes.ts`: una lista de capas que se dibujan juntas, cada
  una en su parte del tiempo (un proyectil viaja y después estalla).
  - `painters.ts`: los trazos con que se arman (proyectiles, partículas, auras que suben o
    caen, dibujos en el piso, cúpulas y cristales, espirales, rayos, fuego, explosión,
    meteoritos, portales, remolinos, polvo, novas, ondas). Todo procedural, sin guardar
    estado: cada partícula sale de una semilla y del tiempo.
  - El **relámpago** cae largo desde el cielo, quebrado, con ramas, parpadeo y chispas.
  - La **explosión** es de partículas: fogonazo, onda en el piso, bola de fuego, bolas de
    llama que se abren, brasas que vuelan y humo.
  - Los refuerzos suben (cruces de curación, diamantes de agilidad, estrellas de bendición) y
    las maldiciones caen (gotas violetas, anillos); las protecciones envuelven (cúpula de
    facetas, espejo, púas, cristales de hielo).
  - `recipes.test.ts` exige que los 64 tengan efecto, que ninguno sea igual a otro y que todos
    se dibujen de principio a fin.
- **Veneno a la vista, como en UO.** `MobileSnapshot` y `mobileHealth` llevan `poisoned`; el
  servidor lo avisa al envenenarse, al curarse y cuando se pasa. La barra de vida sobre la
  cabeza y la del panel se ven verde veneno.

## Opciones, barra de información y atajos de teclado (etapa 71)

Un panel de opciones como el de un asistente de UO (tecla **P** o botón **Opciones**; en el
celular, en el menú). Todo vive en el navegador (`fenix.opciones`); los atajos mandan los mismos
pedidos que la barra de atajos y los botones, y el servidor decide como siempre.

- **`client/src/core/options.ts`** (lógica pura, con pruebas): qué puede mostrar la barra de
  información y cómo se calcula cada dato (`infoChips`), las combinaciones de teclas
  (`comboOf`: «F1», «Shift+Q», «Ctrl+Alt+3», «Num 7»), los atajos y cómo se guardan y validan.
  Caminar (WASD, flechas), Enter y Escape no se pueden pisar sin modificador.
- **Barra de información** (`ui/info-bar.ts`): una línea en la barra superior con los ocho
  reactivos (ícono y cantidad), oro, peso, vendas, pociones, flechas, vida, maná o energía, en
  el orden elegido; lo que se acaba se pone rojo. Cuenta lo de adentro de las bolsas: el
  inventario trae `carried` (totales por clase de objeto, calculados por el servidor).
- **Ventana de opciones** (`ui/options-window.ts`): pestañas _Barra de información_ (marcar y
  ordenar), _General_ (nombres, números de daño, mapa chico, barra de atajos) y _Atajos de
  teclado_ (elegir tecla, elegir qué hace: comando, hechizo por círculo, objeto o habilidad).
- **`app/options-ui.ts`** junta todo: guarda, aplica y atiende los atajos antes que las teclas
  del juego (como un asistente).
- **Celular**: la barra va en dos líneas angostas arriba y se desliza de costado; la pestaña de
  atajos explica que ahí los atajos son la barra de abajo y los cuatro alrededor de Atacar.

## Casas de los jugadores (etapa 72)

Casas prefabricadas como en UO: se compra la escritura a **Octavio el arquitecto** (en la capital y
en los pueblos medianos), se usa en el campo y la casa aparece entera, con sus cofres. Las
compras de 2000 monedas o más se pueden pagar con el oro del banco.

- **Planos** (`shared/domain/housing/houses.ts`): nueve casas de distintos tamaños y estilos
  (tablas, troncos, piedra, piedra negra, arenisca): casilla de tablas, cabaña de troncos, casa
  chica de piedra, casa de arenisca con patio, casas de dos plantas, torre de piedra negra,
  torreón y fortaleza. Cada plano dice el piso de adentro, cuántos pisos altos, si tiene patio o
  dos cuartos, la puerta (sola, doble o de hierro), los cofres y el precio.
- **El plano armado** (`layout.ts`): paredes, ventanas, puertas, patio cercado, escalera, cofres,
  cartel y cada piso alto con su propia grilla (como los pisos de los pueblos), con la azotea o el
  techo arriba de todo. Siempre el mismo para cada clase de casa.
- **En el mapa** (`structure.ts`): `houseStructure` arma la casa como una construcción del mapa
  (`MapStructure`: objetos fijos, pisos, zonas y teletransportes de las escaleras). Los pisos altos
  van en **lugares apartados** (`World.houseSlots`): la roca vacía de debajo de la mazmorra y de lo
  que hay bajo los pueblos, así el mapa no crece. `placementProblem` dice si se puede levantar:
  tierra firme de campo (no caminos, agua ni pisos de pueblo), fuera de pueblos y lugares con
  nombre, sin árboles ni rocas debajo, sin pegarse a otra casa y sin mucha pendiente.
- **`TileMap.addStructure` / `removeStructure`**: el mapa acepta construcciones mientras se juega.
  Se cuentan aparte de lo del mapa original (terreno, tiles que tapan el paso o la vista, puertas,
  asientos, zonas, pisos altos anclados y teletransportes), y al sacarla todo vuelve a ser como
  antes. Las zonas construidas van antes que las del mapa en `regionAt`. El servidor y el cliente
  arman lo mismo con `houseStructure`, así la predicción de movimiento coincide.
- **Servidor** (`features/housing`): levantar (escritura en la mochila, una casa por personaje,
  cerca, el lugar libre de gente y de cosas), la ventana de la casa, echar a las visitas, demoler
  (con los cofres vacíos: vuelve la escritura) y los permisos. Se enchufa con las reglas del núcleo:
  `guards.door` (las puertas de una casa privada solo las abren los amigos; desde adentro, siempre),
  `guards.move` (los echados no entran), `guards.take` (lo que hay adentro es de los amigos) y
  `guards.container` (los cofres y bolsas de adentro, también).
- **Permisos**: dueño, copropietarios (todo menos demoler y nombrar copropietarios), amigos (abren
  puertas y cofres, levantan lo de adentro), visitas y echados. Pública: cualquiera abre las
  puertas, menos los echados.
- **Guardado**: las casas y lo que tienen adentro (el piso y los cofres) se guardan aparte de los
  personajes (`HouseStore`: `casas.json` en el servidor, el navegador en el modo solo), cada minuto
  y al apagar (`GameModule.saveAll`). Si el mundo cambió, la casa vuelve a su dueño como escritura
  en el banco.
- **Cliente**: `ClientGame` arma las casas en su mapa (`houses`, `houseChanged`, `houseRemoved`);
  el dibujo suma un bloque de objetos por casa (`StaticLayer.addStructure`), vuelve a armar el
  terreno que cambió (`TerrainLayer.invalidate`) y los pisos altos (`FloorLayer.sync`). Al usar la
  escritura, `WorldHouses` muestra la casa en el suelo (verde si se puede, roja si no) siguiendo el
  puntero; con el dedo, el primer toque la muestra y el segundo la levanta. Doble clic en el cartel
  abre la ventana de la casa (`HouseWindow`).
- **Para más adelante**: el deterioro de las casas abandonadas y no dejar marcar runas adentro de
  una casa ajena.

## Casa a medida (etapa 73)

Como el diseñador de casas de UO: el arquitecto vende **lotes** vacíos (escrituras como las de las
casas) y, adentro, una ventana de diseño deja poner las piezas planta por planta.

- **Lotes** (`houses.ts`, `lot: true`): chico 6×6 (2 plantas, 2 cofres, 2000 monedas), mediano 9×9
  (2 plantas, 3 cofres, 5000), grande 12×12 (3 plantas, 4 cofres, 10000) y muy grande 15×15
  (3 plantas, 5 cofres, 18000). La medida es el interior: el lote ocupa dos tiles más por lado.
- **Diseño** (`shared/domain/housing/design.ts`): una grilla por planta del tamaño del lote, con
  dos letras por tile (piso y pieza), así entra en un mensaje chico. Pisos (madera, laja, baldosas,
  arenisca, barro, mármol), paredes y ventanas de cada estilo, puertas de madera o de hierro,
  escaleras y cofres. Las paredes, ventanas y puertas toman su orientación de las vecinas
  (esquina, columna, a lo largo de x o de y). El techo va solo, arriba de lo último construido
  (de tablas o azotea de piedra).
- **Reglas** (`designProblem`): lo de arriba se apoya en un piso o una pared de abajo; a cada
  planta se sube por una escalera (una por planta), con piso libre arriba y al lado; los cofres
  tienen piso, no se pasan de los del lote y se llega a ellos (y a las escaleras) caminando desde
  afuera. La entrada y el cartel quedan afuera, del lado de la calle, así nunca se tapan.
- **El plano** (`customLayout`): el mismo `HouseLayout` que el de las casas hechas, con los pisos
  altos en sus lugares apartados (un lote los reserva todos desde el principio). `siteLayout` elige
  el plano de la clase o el del diseño; `houseStructure` y el resto no cambian.
- **Costos** (`designCost`): cada pieza cuesta oro o materiales (tablas, troncos, bloques de
  piedra, lingotes de hierro). Al **confirmar** se paga lo nuevo con oro (de la mochila y, si no
  alcanza, del banco) o con materiales (de la mochila y de los cofres de la casa); lo que se saca
  devuelve la mitad de sus materiales (nunca oro: así no se gana nada armando y desarmando). Al
  demoler, vuelven la escritura del lote y la mitad de los materiales de la obra.
- **Servidor** (`Housing.design`, `BuildingPayment`): solo el dueño, cerca o adentro; el diseño
  tiene que ser de ese lote y construible; no puede haber cosas tiradas donde cambia la casa ni
  cosas en un cofre que se saca. Quien está parado donde cambia algo sale afuera; los cofres que
  siguen quedan con lo suyo. El diseño se guarda con la casa (`SavedHouse.design`).
- **Cliente** (`HouseDesignWindow`): el lote visto desde arriba, planta por planta; se elige una
  pieza y se pinta (arrastrando también), con atajos para rodear de paredes y poner piso en todo.
  Muestra lo que cuesta en oro y en materiales (con lo que hay en la mochila), lo que vuelve y por
  qué todavía no se puede construir. Nada cambia en el mundo hasta pagar.
- **Materiales**: el arquitecto vende bloques de piedra (nuevo), tablas, troncos y lingotes; el
  carpintero y el leñador, tablas y troncos.

## Ventanas que se corren (etapa 74)

Como en UO, cada ventana (`GameWindow`) se arrastra desde cualquier lugar que no tenga su propio
toque (no solo desde la barra): los objetos, los botones y la grilla de diseño siguen siendo
suyos, y desde el cuerpo recién arrastra cuando el dedo se mueve unos píxeles. Se puede correr
fuera de la pantalla dejando 48 px asomados para volver a agarrarla. Tocarla la trae adelante; su
atajo (B, C, el botón Mochila…) la trae adelante y entera si estaba tapada o corrida, y si ya
estaba así, la cierra.

## Continente de la selva (etapa 76)

Al oeste del continente de Puerto Ceniza, cruzando el mar, hay un segundo continente de selva y
ruinas antiguas (unos 800 × 1200 tiles de tierra en el mapa de 1400 × 2000).

- **Forma**: `generateIslandMap({ shape: 'jungle' })` usa `JungleShape`: varios lóbulos con la
  costa recortada, un espinazo de sierras de norte a sur con pasos y macizos sueltos. Hace calor en
  todas partes: selva cerrada, manglares (pantano) en lo bajo y húmedo, y claros de sabana.
- **Armado**: `buildWorld` genera la franja de la selva aparte (`withJungleWest`), corre todo el
  continente principal hacia el este y une los dos en un mismo mapa antes de sumar la mazmorra, lo
  de abajo de los pueblos y los pisos altos (así el pueblo de la selva también tiene cripta y pisos).
  Solo en mapas grandes y alargados (desde 1000 de ancho) o con `jungle: true`; las pruebas chicas
  no lo arman. Cambió la forma del mundo: `WORLD_VERSION` 9.
- **Puerto Esmeralda**: pueblo de estilo `jungle` (troncos, empalizada, empedrado de una ciudad
  antigua, palmeras y braseros), con su muelle. No se llega caminando: hay que ir en barco o con
  runas.
- **Lugares** (`populateContinent(…, 'jungle')`): Pirámide del Jaguar (gradas con altura), Ciudad
  Perdida, Templo Hundido, Altar de las Serpientes, Terrazas de los Monos, Tumbas del Rey Olvidado y
  el Campamento de los Exploradores. Los senderos forman una red: cada uno va al pueblo o al lugar
  ya unido más cercano. La fauna es la de la selva (jaguares, panteras, gorilas, pitones,
  cocodrilos, hombres lagarto).

## Ruinas y tribus de la selva (etapa 77)

El continente de la selva toma un aire mesoamericano, con arte propio (procedural, sin copiar
ningún monumento real):

- **Objetos nuevos** (`statics.ts` + `static-art.ts`): cabeza colosal de piedra (con casco y
  orejeras, medio tapada por plantas), estela tallada, cabeza de serpiente emplumada, aro del juego
  de pelota, tótem pintado y choza de paja. Las caras miran a la cámara (`toCamera`).
- **Lugares**: la Pirámide del Jaguar suma estelas y cabezas de serpiente al pie de la escalinata;
  nuevos: Aldea de los Hombres Jaguar (empalizada, chozas, tótems), Corral de los Jinetes, Cabezas
  Colosales, Juego de Pelota (cancha entre dos taludes con sus aros) y Plaza de las Estelas.
  Además hay cabezas y estelas sueltas entre los árboles.
- **Tribus** (humanos hostiles, `human-foe-art.ts`): guerrero tribal (lanza y escudo), jinete
  tribal montado en un lagarto corredor (usa el lienzo de la montura; muerto, queda tirado sin
  ella) y chamán tribal (lanza hechizos y se cura). Todos llevan la **máscara tribal**, un objeto
  nuevo de cabeza (madera pintada con penacho de plumas) que pueden soltar al morir. También
  andan sueltos por la selva.

## Botín de los humanos, más oro y habilidades más rápidas (etapa 78)

- **Los humanos dejan lo que llevan**: cada humano hostil (bárbaros, piratas, corsarios,
  bandoleros, guerreros, jinetes y chamanes tribales) tiene su `outfit` en el catálogo de
  criaturas: lo que lleva puesto y en las manos. El dibujo sale de ahí (`human-foe-art.ts`) y, al
  morir, todo eso queda entero en el cuerpo (máscaras tribales incluidas, que se pueden poner).
- **Bolsa de reactivos**: los que hacen magia (el chamán tribal, el mago esquelético) tienen una
  `bag` en el catálogo; al morir dejan una bolsa con sus reactivos adentro (`CorpseDrop.contents`).
  Al desaparecer el cuerpo, se borra también lo de adentro de sus bolsas.
- **Oro**: todo el oro del botín sale un 30 % más (`GOLD_BONUS`, en `rollLoot`).
- **Habilidades**: hasta 50 se sube con cada uso (`FAST_GAIN_UNTIL`), de a 1,0 hasta 25 y de a 0,7
  hasta 50; de ahí en más, como antes.

## Altamar, carteles de comercio y luces de adentro (etapa 79)

- **Altamar**, sede imperial y puerto del sur del continente de la selva (estilo `imperial` de
  `city-builder.ts`): piedra y arenisca, calles de lajas, plaza de mármol con estatuas del
  emperador, estandartes en las puertas, faroles cada 5 tiles, palacio y todos los oficios.
  `buildHarbor` arma el puerto al sur de la muralla: muelle de piedra, muelles de madera con barcos
  amarrados, un puente hasta el **barrio flotante** (plataforma de tablones con mercado, estatua y
  los galpones del pescador y el astillero) y otro puente hasta el islote del faro. La región
  "Puerto de Altamar" es tan segura como la ciudad. En el continente, `TownPlan.harbor` abre un
  canal desde el agua del borde sur de la ciudad hasta el mar abierto. `WORLD_VERSION` 10.
- **Carteles de comercio** como en UO (`shop-sign-<ícono>-x|y`): una tabla colgada de un brazo de
  hierro junto a la puerta, perpendicular a la pared, con el ícono del oficio (yunque, serrucho,
  estrella, monedas, jarra, corazón, bolsa, tijera, arco, frasco, pan, jamón, gema, pluma, pez,
  ancla, casa, herradura, hacha). `Plan.shopSign` la cuelga en el primer tramo liso de pared.
- **Luces de adentro**: faroles de mano colgados y antorchas en las paredes (`wall-lantern-*`,
  `wall-torch-*`), mesitas con velas, y el farol de la calle rediseñado (zócalo de piedra, poste con
  anillos y volutas, farol de seis vidrios).
- **Interiores**: las casas suman ropero, mesita de velas junto a la cama, macetas, tapices y un
  farol; los comercios, su luz y una mesita con velas o una maceta en un rincón.

## Calabozo de hielo y criaturas de la nieve (etapa 80)

- **Calabozo de Hielo** (`ice-dungeon.ts`): se entra por una boca en la nieve del norte del
  continente principal (`iceEntrance`, que busca `populateContinent`). Cavernas de nieve y hielo
  unidas por túneles que serpentean (un árbol más tres atajos), un lago helado, un río subterráneo
  en diagonal con puentes donde lo cruzan los túneles y cristales de hielo que alumbran. Dos
  escaleras de piedra bajan a las **salas especiales**: el Trono de la Escarcha (liche de escarcha
  con magos y elementales) y el Santuario del Dragón de Hielo (cámara en cruz con el dragón).
  Diseño propio, inspirado en el calabozo de hielo de UO. Van como lugares bajo tierra en la
  columna de las criptas; `iceLinks` arma las escaleras.
- **Bestiario de la nieve**: yeti, troll de las nieves, araña de hielo, elemental de hielo, liche
  de escarcha y dragón de hielo toman el cuerpo de otra criatura teñido de hielo o de nieve
  (`ice-art.ts`: `FROST_VARIANTS` y `frosted`); el mago de escarcha es un humano con su ropa (la
  deja al morir, con su bolsa de reactivos). Yetis, trolls y magos andan también por la nieve.
- Objetos nuevos: `ice-wall` (pared de hielo con carámbanos) y `ice-crystal` (alumbra).

## Tumba de los Reyes (etapa 81)

- **Tumba de los Reyes** (`kings-tomb.ts`): se baja por una escalinata entre ruinas de arenisca en
  el desierto del continente principal (`tombEntrance`, con `findEntrance(bioma)`, la misma búsqueda
  que la boca del calabozo de hielo). Pasillo angosto que dobla hasta el vestíbulo, el gran salón
  con seis nichos de cada lado (sarcófago y un muerto en cada uno), la cripta del **rey de la
  tumba** al fondo con su trono y su guardia, y un corredor al este hasta una cámara en cruz con un
  liche, espectros y cofres. Muros de arenisca tallada (`tomb-wall`). Diseño propio, inspirado en
  la de UO.
- Criaturas nuevas: **momia** (cuerpo de zombi teñido de vendas viejas) y **rey de la tumba**
  (liche teñido de oro), con las paletas `linen` y `gold` de `ice-art.ts`.
- Los calabozos de afuera se arman igual en `world-builder.ts` (`specials` y `dungeonLinks`).

## El mundo del modo solo se guarda en el navegador (etapa 82)

- Generar el mundo es lo lento. `planWorld` lo deja como **plano** (`WorldBlueprint`: el mapa, la
  gente, los objetos y las criaturas con su casa) y `worldFromBlueprint` arma el mundo vivo desde ahí;
  `createWorld` hace las dos cosas.
- En el modo solo, `EmbeddedGateway` busca el plano en IndexedDB (`platform/world-cache.ts`). Si no
  está, lo genera una vez (con el aviso "Creando el mundo por primera vez…"), lo empaqueta
  (`blueprint-codec.ts`: terreno, alturas y objetos fijos en arreglos de números) y lo guarda. La
  clave lleva el id del mundo y la marca de la compilación (`__FENIX_BUILD__`): una versión nueva
  del juego genera el suyo. Si el navegador no deja guardar, anda igual (tarda como antes).
- Medido en Chromium: la primera entrada ~17 s; las siguientes ~4 s hasta estar en el juego.

## El cuerpo de los jugadores y el saqueo (etapa 83)

- Al morir un jugador, el combate avisa `playerDied` y el módulo de cuerpos deja en el suelo un
  objeto `player-corpse` (con `corpse`: nombre, dueño y si era inocente). `Items.strip` le pasa todo
  lo que llevaba encima y en la mochila, menos el equipo inicial, que sigue con el fantasma.
- Se abre con doble clic (la misma ventana que los cuerpos de las criaturas) y se revisa **de a un
  objeto**: el mensaje `corpse` lleva `noTakeAll` y la ventana esconde "Tomar todo"; el servidor
  también lo rechaza.
- Sacar algo del cuerpo de un inocente (que no sea el propio) vuelve criminal a quien lo hace.
- A los 7 minutos el cuerpo se vuelve un montón de huesos (`player-bones`) con lo que quedaba
  adentro; a los otros 7 se deshace con todo.

## El celular mejor repartido y la línea estética de las ventanas (etapa 84)

- Con el dedo, la pantalla se reparte en franjas: a la izquierda una columna (`.touch-column`) con
  la vida, los efectos y el chat; arriba al centro solo el lugar y la hora (la barra separa nombre, lugar, hora y compañía en partes); arriba a la
  derecha tres medallones con ícono (mochila, mapa y menú). Cambiar y soltar objetivo van a la
  izquierda de Atacar, y los atajos del arco quedan más separados para no pisarse.
- Los reactivos (lo elegido en Opciones) van en una barra larga arriba, entre la vida y los
  medallones; se arrastra desde su agarre a cualquier lugar (`ui/draggable.ts`, la misma pieza que
  mueve el minimapa). En Opciones se apaga sin olvidar lo elegido (`infoBar`) y se vuelve a su lugar.
- Puntos cardinales: el aro del minimapa lleva N, E, S y O en la diagonal que les toca (el minimapa
  está girado como la vista: el norte arriba a la derecha); el mapa del mundo, con el norte arriba,
  tiene una rosa de los vientos de bronce.
- En la computadora, los reactivos también van en su propia barra, debajo de la de arriba, y se
  arrastran igual; lo que va debajo (la vida, el minimapa) baja lo que ella ocupe mientras está en
  su lugar.
- Al girar el celular dentro de un marco (la app de Claude), el aviso de cambio de tamaño puede
  llegar antes de tiempo o no llegar, y el juego quedaba con el tamaño de antes (agrandado). El
  dibujador vigila el tamaño real de su contenedor (`ResizeObserver`) y se vuelve a medir solo.
- Las ventanas con forma propia (el ataúd, la mochila de cuero, la bolsa…) no llevan marco: la
  ventana es el dibujo, justa a su contorno. Arriba, una franja invisible para arrastrarla y el
  medallón de cerrar en la esquina; el ataúd lleva sobre el pie una plaquita con el nombre y
  "Tomar todo".
- El joystick está despegado del borde (más cómodo hacia abajo y a la izquierda).
- El minimapa es redondo y se arrastra a cualquier lugar (también en la computadora); el lugar se
  guarda en fracciones de la pantalla (`fenix.minimapa.lugar`), así sirve al girar el celular.
- El menú tiene título y medallón para cerrar, y botones justos a la palabra.
- Línea estética común (regla del repo): paneles de cuero con marco de bronce, remaches en las
  esquinas (`--rivet`), barra de título con costura dorada, cerrar como medallón, botones dorados
  con bisel. La ventana de personaje pasó de piedra gris a nogal y bronce y se achica en pantallas
  bajas.

## El teclado del celular (etapa 85)

- En el celular, las pantallas de antes del mundo no ponen el cursor solas en el campo del nombre:
  eso abría el teclado apenas se entraba y agrandaba la página.
- Tocar cualquier cosa que no sea un campo de texto cierra el teclado (`dismissKeyboardOnTapOutside`):
  el juego se queda con los toques de la pantalla y el navegador ya no lo cerraba solo.
- Al cerrarse el teclado y al entrar al mundo, la página vuelve a su escala justa (`resetScale`).
- Si un campo desaparece con el cursor adentro (al pasar del ingreso a la lista de personajes),
  iOS deja el teclado abierto sin campo y no hay forma de cerrarlo. Por eso, antes de cambiar de
  pantalla o entrar al mundo se saca el cursor (`blurField`), y si igual quedó uno huérfano, el
  próximo toque afuera entra y sale de un campo de paso (`forceHideKeyboard`), que lo cierra.
