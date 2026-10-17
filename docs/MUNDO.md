# El mundo de Fenix

Cómo está armado el mundo abierto: biomas, terrenos, objetos del suelo y el plan para llevarlo a
1000 × 1000. Todo el arte es procedural (`@fenix/art`), sin nada de UO.

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
vecino con un borde irregular (transiciones como las de UO). No hay alturas ni rampas (el mundo es
plano).

## Objetos nuevos del suelo

Árboles: palmera, árbol de la selva (con raíces tablares y lianas), abedul y acacia, que se suman
al roble, pino, ceibo, gomero, sauce, álamo y árbol seco.

Plantas: pastizal (verde, pajizo o mezclado), yuyos, helecho, hongos, florcitas, peyote, matorral
seco, planta de hojas grandes y mata de tundra. Piedras: piedritas, peñasco (granito, arenisca o
piedra oscura) y piedra con musgo. Ruinas: columna antigua (entera o quebrada) y columna caída.

## Lugares

- **Torre Hueca** (pantano): torre del liche, con la tierra corrompida alrededor.
- **Ruinas del Sol** (desierto): losas en ruinas y columnas, con camino antiguo.
- **Cráter Humeante** (tierras secas): laguna de lava en un cráter de ceniza, con trolls y orcos.
- La **boca de la Cueva del Lamento** tiene tierra corrupta alrededor.

Para recorrer el mapa con el personaje de prueba: `/ir 120 300` (coordenadas) o `/ir Torre`.

## Plan (por etapas)

1. **Etapa 24 (esta):** arte de biomas, terrenos y vegetación; integrado al continente actual.
2. **Etapa 25:** mundo de 1000 × 1000 con clima, islas (para los barcos), cordilleras, ríos,
   caminos como los de UO y más distancia entre pueblos; mapa compacto por la red y migración de
   los personajes guardados.
3. **Etapa 26:** ciudades: capital grande amurallada con castillo del líder y **puerto con muelle**;
   guarida de bandidos en una isla, sin guardias; pueblos con estilo propio (adobe, madera, piedra,
   chozas) y pisos de damero o baldosas; gente del pueblo que camina y guardias.
