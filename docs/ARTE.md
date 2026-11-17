# Dirección de arte

Fenix no es una copia de Ultima Online. Es un mundo con arte propio que toma de tres fuentes y
las mezcla:

- **Ultima Online**: el mundo vivo y abierto, los oficios, la vida de pueblo, la libertad de rol.
- **Diablo**: la fantasía oscura, la luz dramática, lo temible de las mazmorras.
- **Helbreath**: el ritmo, la lectura clara de los personajes, el choque entre bandos.

Las referencias se usan como lo hace un pintor: para entender qué hace funcionar una imagen
(silueta, paleta, clima, lectura a tamaño chico), nunca para calcarla. La regla está en
`CLAUDE.md` («Referencias sí, copia no»).

## Dos estéticas en tensión

El mundo no tiene un solo tono: el aspecto acompaña al rol que cada uno elige.

|            | Cálida, aventurera                                                  | Oscura, temible                                    |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Quién      | Amistosos: aventureros, artesanos, exploradores                     | Criminales, asesinos, caóticos                     |
| Qué hacen  | Combate contra criaturas, misiones, investigar y descubrir el mundo | Combate entre jugadores, robo, emboscadas          |
| Paleta     | Tonos tierra, cálidos, saturados, luz dorada                        | Negros, rojos apagados, metales oxidados, poca luz |
| Vestimenta | Telas, cuero claro, colores de oficio                               | Placas ennegrecidas, pinchos, capuchas, calaveras  |
| Lugares    | Pueblos, granjas, caminos, puertos                                  | Ciudad de bandidos, criptas, la región volcánica   |
| Para quién | Todo público                                                        | Quien busca el riesgo                              |

**Los asesinos tienen que dar miedo.** Que se los reconozca de lejos, que el entorno reaccione
(los vecinos se apartan, los guardias los persiguen) y que encontrarse con uno sea un momento
tenso. La reputación que ya existe (inocente, criminal, asesino; fama y karma) es la base: el
aspecto la hace visible.

## Para el arte

- Procedural en `@fenix/art`, o sprites propios (hechos a mano o con IA a partir de
  descripciones propias) que reemplazan al procedural objeto por objeto.
- Prendas y armaduras en gris neutro cuando se pueden teñir: el juego les pone el color.
- Antes de que algo entre al juego: comparar lado a lado con las referencias usadas.

## La ropa en el personaje (etapa 138)

El personaje del mundo y el de la ventana de personaje son el mismo modelo: lo que se ve en uno se
tiene que ver en el otro. Reglas de la ropa de tela (`character-art.ts`):

- **Bajo una túnica, un vestido o una pollera no se dibujan las piernas** (antes las caderas y los
  muslos asomaban por los costados de la tela): de la pollera para abajo, la canilla; de la túnica,
  solo los pies. Sentado o montado, las piernas van del color de la tela.
- **Cada prenda tiene su corte**, no solo su color:
  - _Camisa_: escote en V; va metida en el pantalón.
  - _Camisa fina_: chorrera de encaje blanco al frente y puños de encaje.
  - _Jubón_: cerrado hasta el cuello, botones dorados, acolchado en rombos y mangas acuchilladas.
  - _Chaleco_: abierto sobre camisa de lino, con botones dorados y mangas blancas.
  - _Sayo_: cuello redondo con cordón y un faldón hasta la rodilla sobre el pantalón.
  - _Vestido_: corpiño de escote cuadrado con cordón cruzado, manga corta, cinta en la cintura y
    falda con mucho vuelo y ruedo de encaje.
  - _Túnica_: cruzada al frente con ribete dorado, cordón en la cintura, mangas de campana con
    ribete y ruedo dorado.
  - _Túnica con capucha_: paño tosco, sin adornos, con la capucha puesta (tapa el pelo y rodea la
    cara) y cordón.
  - _Túnica raída con capucha_: la misma, gris, con el ruedo en jirones y las mangas rotas.
- La hebilla del cinturón es chica: a tamaño de sprite una grande parecía una mancha.
