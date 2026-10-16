# El mundo de Fenix

Cómo está armado el mundo abierto: biomas, terrenos, objetos del suelo, lomas y agua. Todo el arte
es procedural (`@fenix/art`), sin nada de UO.

## Forma del mundo

El continente mide **1400 × 2000** tiles (`MAP_SIZE` × `MAP_HEIGHT`) y es alargado de norte a sur,
mezcla de América y Britannia, **en una sola pieza** (sin estrecho):

- **Norte**: tundra y nieve arriba; más abajo, tierras templadas con la capital (Puerto Ceniza),
  Roca Alta al pie de la cordillera y Junco Verde.
- **Centro**: una **gran bahía** que se mete desde la costa este; del lado oeste sigue la tierra
  (selva, desiertos, tierra roja).
- **Sur**: tierras que se enfrían hacia la punta.
- **Cordillera** a lo largo de la costa oeste, cortada por pasos.

En el mar:

- **La isla grande**, al este de la bahía: al oeste está **Puerto Brasa** (por ahora con el plano
  de Roca Alta) y en el medio las **Tierras de Ceniza**, un valle negro de ceniza y tierra
  corrupta, amurallado por montañas con **una sola entrada** (del lado de la ciudad). Adentro
  viven orcos, trolls y magos esqueleto, y en el centro está el **Monte del Fuego**, un volcán con
  un cráter de lava.
- **Dos islas al sudeste**, frente a la punta sur y separadas por un canal angosto, de costas
  muy recortadas (como las Malvinas frente a la Patagonia).
- Una isla larga al noreste, otra angosta al oeste y otras chicas de formas variadas
  (alargadas, de dos lóbulos), para explorar y, más adelante, navegar.

Las costas se tuercen con ruido (nada queda redondo) y el clima depende de la latitud. Un mapa
cuadrado (los de prueba) usa la isla redonda de antes. Si cambia la forma del mundo
(`WORLD_VERSION`), los personajes guardados aparecen en la capital.

## Agua

- **Agua celeste (poco profunda)**: se camina, a pie o a caballo. Bordea las costas en una franja
  de ancho desparejo; los ríos y los charcos del pantano son de agua celeste (se vadean) y los
  lagos chicos también.
- **Agua azul (profunda)**: no se camina. Es el mar abierto y el centro de los lagos grandes;
  ahí van a navegar los barcos.

## Lomas

Como en el Age of Empires, el suelo tiene **alturas suaves**: colinas y valles con laderas
sombreadas (la luz viene de arriba a la izquierda). Es solo visual, todo se camina igual. El mar y
la costa quedan abajo y los pueblos son planos.

## Transiciones

Entre un suelo y otro no hay un corte: el borde se tuerce y se entrevera unos tiles (manchas de
uno dentro del otro) y, entre suelos muy distintos, aparece uno mezclado:

- **pasto nevado** entre el pasto (o la tundra) y la nieve;
- **pasto con arena** entre el pasto y la arena o las salinas;
- **pasto ralo** entre el pasto y la tierra, la grava o la tierra roja.

En los bosques espesos el suelo es de **hojarasca**.

## Caminos

Los caminos entre pueblos y los senderos a los lugares se trazan buscando el paso más barato
(rodean montañas y agua) y después se curvan: pasan por puntos corridos al costado y se unen con
una curva suave, así serpentean en vez de ir en línea recta.

## Biomas

El generador (`procedural-map.ts`) decide el bioma de cada tile por **elevación** (mar, costa,
cordilleras), **latitud** (frío al norte, calor al sur) y **humedad**:

| Bioma       | Dónde               | Suelo                        | Qué crece                                                                 |
| ----------- | ------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Nieve       | extremo norte       | nieve (algo de tundra)       | pinos nevados, matas de tundra; los ríos están congelados                 |
| Tundra      | norte               | tundra (manchas de nieve)    | abedules, matas rojizas, piedras con musgo, pastizal                      |
| Bosque      | templado, manchas   | pasto, selva, pasto seco     | robles, pinos, abedules, helechos, hongos, yuyos                          |
| Pradera     | templado            | pasto con prado y pasto seco | árboles sueltos, flores, pastizal, yuyos, florcitas                       |
| Prado       | templado, manchas   | prado (verde claro)          | florcitas, flores, pastizal, algún árbol                                  |
| Llanura     | templado, manchas   | pasto                        | **sin árboles** (lugar para casas): pasto, yuyos, florcitas               |
| Pantano     | bajo y húmedo       | pantano, barro, charcos      | juncos, sauces, árboles secos, hongos, helechos                           |
| Sabana      | cálido y seco       | pasto seco                   | acacias, pastizal pajizo, matorral; palmeras junto al agua                |
| Desierto    | sur, seco           | arena, tierra roja, salinas  | cactus, peyote, matorral seco; oasis de palmeras                          |
| Tierra roja | dentro del desierto | tierra roja agrietada        | peñascos, peyote, matorral, árboles secos                                 |
| Selva       | sur, húmedo         | suelo de selva               | árboles de selva con lianas, palmeras, plantas de hojas grandes, helechos |
| Montaña     | cordilleras         | —                            | macizos de roca; al pie, grava, piedras y pinos                           |
| Costa       | junto al mar        | arena                        | piedras, piedritas; el mar cercano es poco profundo                       |
| Ceniza      | la isla grande      | ceniza, tierra corrupta      | árboles muertos, peñascos, huesos; lava en el cráter del volcán           |

Los verdes no son todos iguales: dentro de cada bioma, un ruido de matices mezcla pasto, prado,
pasto seco y suelo de selva.

## Fauna

Cada bioma tiene sus animales (los valores salen del bestiario de un servidor de UO, con la vida a
la mitad). Los monstruos fuertes y los jefes quedan para las mazmorras.

- **Presas** (huyen apenas las tocan): conejo, cierva, ciervo, oveja, cuervo, golondrina.
- **Mansos** (no atacan, pero se defienden): cabra, cabra montés, vaca, toro, jabalí, águila, rana
  toro, morsa, gorila, elefante salvaje.
- **Fieras** (atacan a quien se acerca): oso negro, oso pardo, oso grizzly, oso polar, puma,
  pantera, jaguar, leopardo de las nieves, lobo blanco, serpiente, cobra real y escorpiones (con
  veneno), pitón, caimán, cocodrilo y el hombre lagarto (con lanza).

| Bioma             | Qué vive                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| Pradera           | conejos, ciervas, jabalíes, golondrinas, cuervos y algún lobo                   |
| Bosque            | ciervas y ciervos, jabalíes, osos negros y pardos, cuervos, lobos, algún puma   |
| Prado             | conejos, golondrinas, ciervas, ovejas y cabras                                  |
| Llanura           | conejos, vacas, toros, ovejas, golondrinas y algún águila                       |
| Pantano           | ranas toro, caimanes, serpientes, hombres lagarto, arañas y cuervos             |
| Desierto          | escorpiones, serpientes, cobras reales y algún escorpión rey                    |
| Tierra roja       | escorpiones (también el rey), serpientes, pumas y esqueletos                    |
| Nieve             | lobos blancos, osos polares, leopardos de las nieves, morsas y trolls           |
| Tundra            | lobos blancos, ciervas y ciervos, osos pardos, leopardos, morsas y águilas      |
| Pie de montaña    | cabras monteses, águilas, osos grizzly, pumas, trolls y orcos                   |
| Selva             | jaguares, panteras, gorilas, pitones, serpientes, cobras, cocodrilos, elefantes |
| Sabana            | ciervas, jabalíes, toros, elefantes, pumas, águilas, serpientes y escorpiones   |
| Tierras de Ceniza | orcos, trolls y magos esqueleto                                                 |

El **camello** se compra en la caballeriza, como el caballo y la llama. El **elefante** es la
montura especial: cuesta 6000 monedas, aguanta mucho más y pega con los colmillos. No galopa
(apura el paso) y es bastante más grande que un caballo.

Los animales no se achican al tile: cada uno tiene su tamaño. El conejo es chiquito, los osos
grandes y el gorila sobresalen, el toro es más grande que la vaca y el elefante (montura o
salvaje) ocupa casi el doble de alto que un caballo.

## Terrenos

Naturales: pasto, prado, pasto seco, tundra, selva, tierra, barro, arena, salina, tierra roja,
grava, ceniza, nieve, hielo, pantano, agua, **agua poco profunda** (orillas) y lava.

Caminos y pisos: empedrado (caminos nuevos entre ciudades), **camino antiguo** (empedrado gastado
del imperio, lleva a ruinas y lugares peligrosos), madera, **baldosas** de barro cocido, de
**piedra**, de **granito** y de **arenisca**, **mármol claro y oscuro** (juntos arman un damero),
**lajas** y **losas en ruinas**.

Especiales: **tierra corrupta** (negra y violeta, alrededor de la boca de la mazmorra y de lugares
malditos), suelo de cueva y roca.

Los pisos van de a una losa por tile (cuadriculado); los terrenos naturales se mezclan con el
vecino con un borde irregular. Naturales nuevos de transición: pasto nevado, pasto con arena,
pasto ralo y hojarasca.

## Objetos nuevos del suelo

Árboles: palmera, árbol de la selva (con raíces tablares y lianas), abedul, acacia, **arce de
otoño** (rojo, naranja o dorado, en manchas de los bosques), **ciprés**, **baobab** (sabana) y
**bambú** (selva, junto al agua), que se suman al roble, pino, ceibo, gomero, sauce, álamo y árbol
seco.

El **faro** es grande: ocupa 2 × 2 tiles y es mucho más alto que una persona.

Plantas: pastizal (verde, pajizo o mezclado), yuyos, helecho, hongos, florcitas, peyote, matorral
seco, planta de hojas grandes y mata de tundra. Piedras: piedritas, peñasco (granito, arenisca o
piedra oscura) y piedra con musgo. Ruinas: columna antigua (entera o quebrada) y columna caída.

## Ciudades

Las ciudades las arma el servidor (`city-builder.ts`), cada una con el estilo de su región. Todas
tienen dos avenidas que se cruzan en una **plaza** con fuente (o fogata), santuario, puestos del
mercado y faroles; **barrios** de cuadras con casas, y los negocios (taberna, banco, herrería y
tienda de magia) en las cuadras más cerca de la plaza. Las salidas están al medio de cada lado,
donde llegan los caminos.

| Ciudad                      | Región          | Estilo                                                                |
| --------------------------- | --------------- | --------------------------------------------------------------------- |
| **Puerto Ceniza** (capital) | norte templado  | piedra, muralla con torres, **castillo** con salón del trono, mercado |
| **Roca Alta**               | montaña         | cabañas de troncos, calles de ripio, empalizada                       |
| **Junco Verde**             | pantano         | casas de tablas sobre pilotes, calles de pasarelas, cerca baja        |
| **Puerto Brasa**            | isla del volcán | piedra negra con juntas rojas, braseros, muralla con torres           |
| **Refugio de los Bandidos** | Malvina oeste   | carpas y fogatas dentro de una empalizada; **sin ley**                |

- **Muralla:** las de piedra tienen almenas y torres redondas de techo rojo en las esquinas y a
  los lados de cada puerta; las torres alumbran de noche.
- **Castillo** (capital): muralla propia con cuatro torres, patio con pozo y estandartes, y la
  torre del homenaje con piso de mármol, braseros y el **trono**.
- **Afuera:** la caballeriza con su corral, huertas con un aljibe y el **cementerio**.
- **Cementerio** (uno por ciudad): reja de hierro, tumbas en hileras, una cripta y árboles secos.
  No protege: viven ahí **zombis** (lentos pero tercos, se curan solos), **necrófagos** (rápidos,
  con garras que envenenan), **esqueletos** y un **espectro** (flota, lanza hechizos y resiste la
  magia; no deja cuerpo).
- **Refugio de los Bandidos:** zona sin protección, como las tierras salvajes: se puede pelear
  entre jugadores. Tiene taberna (el contrabandista) y herrero, santuario y su fosa común.

Los pueblos diseñados en Tiled (`docs/MAPAS.md`) siguen funcionando: un `TownPlan` acepta
cualquier plano, generado o dibujado a mano.

## Lugares

- **Torre Hueca** (pantano): torre del liche, con la tierra corrompida alrededor.
- **Ruinas del Sol** (desierto): losas en ruinas y columnas, con camino antiguo.
- **Cráter Humeante** (tierras secas): laguna de lava en un cráter de ceniza, con trolls y orcos.
- La **boca de la Cueva del Lamento** tiene tierra corrupta alrededor.

**Mapa:** la tecla M (o el botón Mapa) abre el minimapa; la segunda vez, el **mapa del mundo**
entero con los nombres de pueblos y lugares y un punto que late donde está uno; la tercera, lo
cierra.

Para recorrer el mapa con el personaje de prueba: `/ir 120 300` (coordenadas) o `/ir Torre`.

## Plan (por etapas)

1. **Etapa 24:** arte de biomas, terrenos y vegetación.
2. **Etapa 25:** el continente de 1000 × 1400, con islas, cordillera y caminos que
   serpentean; mapa compacto por la red; criaturas que duermen lejos de los jugadores; índice
   espacial; los personajes guardados en el mundo anterior aparecen en la capital.
3. **Etapa 26:** mapa pulido: 1400 × 2000, agua celeste que se camina, transiciones graduales,
   lomas, caminos curvos, árboles nuevos y faro grande.
4. **Etapa 30:** ciudades generadas con estilo por región, capital amurallada con castillo,
   refugio de bandidos en una isla y un cementerio con no-muertos en cada ciudad.
5. Pendiente de las ciudades: **puerto con muelle**, guardias, gente del pueblo que camina, un
   pueblo de adobe en el desierto y más pueblos.
6. Más adelante: fauna según el terreno (pájaros, serpientes, escorpiones, cocodrilos, hombres
   lagarto, camello como montura), **búsqueda de tesoros** (mapas, excavar, cofres con guardianes, en las islas) y
   **barcos con combate naval** (combate entre jugadores en el mar).
