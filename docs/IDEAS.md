# Ideas para programar más adelante

Diseños conversados y aprobados en principio, todavía sin programar. Antes de empezar uno,
confirmar con el autor las decisiones marcadas como **pendiente**. Cada idea entra como módulo
nuevo (ver «Módulos del servidor» en `docs/ARQUITECTURA.md`).

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
  jugador (con lo que llevaba, saqueable si era criminal o asesino, y su cabeza).
- **La cabeza se pudre**: se cobra antes de unos días de juego; después queda como trofeo seco
  que no paga.

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
