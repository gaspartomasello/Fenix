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
4. **Etapa 27:** ciudades: capital grande amurallada con castillo del líder y **puerto con muelle**;
   guarida de bandidos en una isla, sin guardias; pueblos con estilo propio (adobe, madera, piedra,
   chozas) y pisos de damero o baldosas; gente del pueblo que camina y guardias; más pueblos.
5. Más adelante: fauna según el terreno (pájaros, serpientes, escorpiones, cocodrilos, hombres
   lagarto, camello como montura), **búsqueda de tesoros** (mapas, excavar, cofres con guardianes, en las islas) y
   **barcos con combate naval** (combate entre jugadores en el mar).
