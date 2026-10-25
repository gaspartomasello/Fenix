# Ideas para programar más adelante

Diseños conversados y aprobados en principio, todavía sin programar. Antes de empezar uno,
confirmar con el autor las decisiones marcadas como **pendiente**. Cada idea entra como módulo
nuevo (ver «Módulos del servidor» en `docs/ARQUITECTURA.md`).

## Combate y lanzado de hechizos como en Sphere

**Decisión del autor**: el combate y el lanzado de hechizos tienen que sentirse como en
**SphereServer 0.55i / 0.56b**, no como el UO oficial posterior. Vale para todo lo que se
programe de combate y magia de acá en adelante.

Qué dice la configuración de Sphere (`sphere.ini` de Source-X, cuyos valores por defecto son
«compatibles con 0.55i»), comparado con Fenix hoy:

| Rasgo                                             | Sphere 0.55i por defecto                                                                                                       | Fenix hoy                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Orden de lanzado                                  | Sin `MAGICF_PRECAST`: primero el objetivo, después la demora                                                                   | Igual                                         |
| Lanzado previo (`MAGICF_PRECAST`)                 | Opcional: lanzar primero y elegir el objetivo después                                                                          | No existe                                     |
| Moverse mientras se lanza                         | Permitido (`MAGICF_FREEZEONCAST` apagado)                                                                                      | Permitido                                     |
| Tiempo para elegir objetivo                       | Sin límite (`SpellTimeout=0`)                                                                                                  | No aplica (se elige antes)                    |
| Criaturas que pierden el hechizo al recibir golpe | No (`NPCCanFizzleOnHit=0`)                                                                                                     | Sí                                            |
| Velocidad del golpe                               | Fórmula propia de Sphere 0.55 (`CombatSpeedEra=0`, `SpeedScaleFactor=15000`): depende de la velocidad del arma y de la energía | Tiempo fijo por arma (`swingMs`), sin energía |
| Daño mágico y armadura                            | El daño mágico respeta la armadura salvo `MAGICF_IGNOREAR`                                                                     | A revisar                                     |
| Atacar a un asesino                               | No vuelve criminal (`COMBAT_ATTACK_NOAGGREIVED`, comportamiento viejo de Sphere)                                               | A revisar                                     |
| Paralizado                                        | Opción vieja: se puede seguir pegando (`COMBAT_PARALYZE_CANSWING`)                                                             | No se puede                                   |
| Veneno al golpear                                 | Estilo 0.55i (salvo `COMBAT_NOPOISONHIT`)                                                                                      | A revisar                                     |

Fórmula de golpe que se suele citar para Sphere y el UO de esa época: demora en segundos =
15000 ÷ ((energía + 100) × velocidad del arma). Verificarla contra el código de Sphere antes
de programarla.

**Pendiente**, confirmar con el autor:

- ¿Lanzado previo activado (como en muchos servidores Sphere de combate entre jugadores) o el
  orden por defecto (primero el objetivo)?
- ¿Las criaturas pierden el hechizo al recibir golpes, o no (como Sphere por defecto)?
- ¿Velocidad de golpe con la fórmula de Sphere (más energía, más rápido)?
- ¿Recibir daño corta el hechizo de un jugador? ¿Con qué probabilidad?

## Caza de recompensas y cabezas

Los asesinos son temibles, pero tienen precio.

1. **Contador**: el de muertes que ya existe (`MURDERER_KILLS`, nombre rojo a las 5). La
   recompensa crece con cada víctima; mientras más suma el contador, más vale la cabeza
   (**pendiente**: la curva exacta, p. ej. 500 de oro por víctima o creciente).
2. **Descuartizar**: sobre el cuerpo de un jugador, con cuchillo, hacha o espada, se saca el
   objeto **«Cabeza de <nombre>»**. El cuerpo queda sin cabeza.
3. **Cobrar**: se entrega la cabeza al capitán de la guardia o en un tablón de recompensas de un
   pueblo. Se paga, la cabeza queda colgada como trofeo y el asesino recibe el aviso («Tu cabeza
   fue entregada en Puerto Ceniza»).
4. **Quién pone el precio**: lo que paga el pueblo, y además las víctimas pueden sumar oro propio
   al morir («¿Querés ofrecer una recompensa por tu asesino?»).
5. **Trofeo**: la cabeza sigue siendo un objeto aunque no se cobre (guardarla, exhibirla).

Decisiones propuestas (**pendiente** de confirmar):

- **Contra la trampa de los amigos** (uno mata para subir su precio, el otro lo mata y cobra):
  al cobrar la cabeza se le borran las muertes al asesino; o se cobra solo lo que pusieron las
  víctimas.
- **De quién se saca la cabeza**: solo de criminales y asesinos. Hacerlo con un inocente cuenta
  como crimen.
- **Cuerpo de los jugadores**: hoy al morir queda solo el fantasma; hace falta un cuerpo de
  jugador (con lo que llevaba, saqueable si era criminal o asesino, y su cabeza). Como en UO
  (referencia: ServUO, `Mobile.DefaultCorpseDecay`): el cuerpo dura **7 minutos**, después se
  vuelve **huesos** (con lo que quedaba adentro) y los huesos duran **otros 7 minutos** antes de
  desaparecer. Los cuerpos de criaturas no se vuelven huesos: desaparecen (en Fenix hoy, 2
  minutos con botín y 20 segundos vacíos). **Pendiente**: si se usan los mismos 7 + 7 minutos.
- **La cabeza se pudre** (decidido): pasados unos días de juego la cabeza se transforma en
  **«Calavera de <nombre>»**. La calavera ya no se cobra: queda como trofeo para siempre
  (guardarla, exhibirla en una casa, mostrarla). **Pendiente**: cuántos días tarda.

Módulo: `features/bounties/`. Necesita un evento nuevo en el núcleo, `playerSlain` (un jugador
mató a otro), emitido por el combate; registra el uso del cuchillo sobre un cuerpo y suma el
capitán de la guardia o el tablón. No toca por dentro el combate ni la reputación.

## Estética según el rol

Ver `docs/ARTE.md` («Dos estéticas en tensión»). Ideas concretas, en orden sugerido:

1. **El karma tiñe el entorno**: penumbra alrededor de los asesinos, luz cálida alrededor de
   quien tiene buen karma (usa la luz de noche que ya existe).
2. **Temibles de verdad**: el nombre rojo se ve desde más lejos, aura o sonido al acercarse,
   notoriedad que cuesta limpiar.
3. **Vestimenta por camino**: juegos oscuros (como la armadura de hueso) frente a ropa de
   aventurero y de oficio; paletas de tintura propias de cada estética.
4. **El mundo reacciona**: los vecinos se apartan o se esconden ante un asesino, los
   comerciantes le cobran más o no le venden, los guardias lo persiguen de lejos.
5. **Lugares de cada lado**: pueblos cálidos como refugio; la ciudad de bandidos y la región
   volcánica como territorio de los oscuros.

## Sprites propios

Sprites hechos a mano o con IA (a partir de descripciones propias; ver `CLAUDE.md`, «Referencias
sí, copia no») que reemplazan al arte procedural objeto por objeto:

- **Orden sugerido**: íconos de objetos → ventana de personaje (cuerpo base fijo y cada prenda
  en capas que calzan sobre él) → ropa sobre el personaje en el mundo (lo más difícil: 8
  direcciones × ~20 cuadros coherentes; por ahora queda procedural).
- **Etapa preparatoria**: carpeta de assets con nombre igual al identificador del objeto, el
  cliente usa el sprite si existe y si no el procedural, atlas al compilar, guía de tamaños,
  fondo y pose para pedirle a la IA.
- Prendas teñibles en gris neutro.
- Sonidos: el autor tiene foley propio en WAV → convertir a OGG en `assets/sonidos/`.

## Casa a medida: lo que falta (sigue a la etapa 73)

- Guardar diseños para volver a ellos, y que los demás vean el borrador mientras se diseña.
- Puertas dobles, escaleras de caracol, balcones y más piezas de decoración (columnas, arcos).
- Oficio de cantero: sacar piedra con el pico y tallar bloques (hoy solo se compran).
