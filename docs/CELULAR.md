# Fenix en el celular

Cómo se juega Fenix con el dedo y por qué. Se juega con el celular **acostado** (como la mayoría
de los juegos de rol de celular y como MobileUO, el cliente de UO para celular hecho sobre
ClassicUO): el mundo isométrico necesita ancho, y así cada pulgar tiene su lado.

## Objetivo

Que se pueda jugar una sesión entera (caminar, pelear, curarse, revisar cuerpos, comprar) sin
apuntar con precisión ni abrir ventanas en medio de una pelea. Todo lo que se hace muchas veces va
a un toque; lo que se hace de vez en cuando, a dos (menú → ventana).

## Pantalla

```
┌──────────────────────────────────────────────────────────────┐
│ [Vida/Maná/Energía]   Zona · (x, y) · hora   [Mochila][Mapa][Menú] │
│ [efectos]                                        [minimapa]  │
│ [chat: 3 líneas]                                             │
│                                                              │
│                         MUNDO                  [⟳][✕]        │
│                                            [a4]               │
│                                         [a3]                  │
│                                       [a2]                    │
│  (joystick)   [1][2][3][4][5][6][7][8][9][0]  [a1]  (Atacar)  │
└──────────────────────────────────────────────────────────────┘
```

- **Izquierda abajo, pulgar izquierdo: joystick.** Arriba en el joystick es arriba en la pantalla
  (igual que las flechas). Llevándolo al borde se corre. Es casi transparente para no tapar el
  mundo; la perilla se marca más mientras se usa.
- **Derecha abajo, pulgar derecho: Atacar.** Elige la criatura salvaje viva más cercana y sigue con
  ella mientras viva (no hace falta tocarla). Mientras se pelea aparecen **⟳** (la siguiente más
  cercana) y **✕** (dejar de atacar). Nunca elige personas, gente del pueblo ni monturas o
  invocaciones de nadie: atacar a otro jugador tiene consecuencias, y eso se hace a propósito
  tocándolo en modo guerra.
- **Alrededor de Atacar: cuatro atajos más** en arco, al alcance del mismo pulgar (como en los
  juegos de rol de celular). Al principio: vendas, Gran curación, Relámpago y Explosión. Funcionan
  igual que la barra de abajo (mantener apretado para cambiarlos) y se guardan aparte.
- **Abajo al centro: barra de atajos.** Diez casilleros (ocho en celulares angostos). Al
  principio: vendas, pociones de curación, purificación y vigor, Curar, Flecha mágica y Purificar.
  Las vendas y los hechizos de ayuda van a uno mismo; los de ataque, al objetivo de combate.
  Mantener apretado un casillero abre la ventana para cambiarlo.
- **Arriba a la derecha:** Mochila y Mapa (lo que más se abre) y Menú con todo lo demás:
  personaje, hechizos, habilidades, social, guerra, hablar, pantalla completa y salir.
- **Arriba a la izquierda:** vida, maná y energía, los efectos (veneno, bendiciones) y las
  últimas líneas del chat, chicas y sin tapar el mundo. **Tocar el chat abre el campo para
  escribir** (también "Hablar" en el menú).
- **Ventanas:** quedan por encima del joystick y de los botones, y si no entran en la pantalla se
  desplazan por dentro. Las habilidades van en dos columnas.

## Que la página no quede acercada

Antes, al girar el celular el juego quedaba ampliado y solo volvía tocando dos veces el chat. Las
causas y los arreglos:

- La página del modo solo no tenía la etiqueta `viewport`: el navegador la armaba a 980 px de ancho
  y al girar cambiaba la escala. Ahora el modo solo copia la de `index.html`.
- El campo del chat tenía letra de menos de 16 px, y el iPhone acerca la página al escribir en un
  campo así (y no la vuelve a alejar). Con el dedo, los campos usan 16 px.
- El navegador ya no amplía con pellizcos ni doble toque sobre la página (el acercar y alejar del
  juego, con dos dedos sobre el mundo, sigue andando). Al girar, se vuelve a aplicar la escala 1 y
  las ventanas abiertas se acomodan dentro de la pantalla.

## Gestos en el mundo

| Gesto                         | Qué hace                                     |
| ----------------------------- | -------------------------------------------- |
| Joystick                      | Caminar; al borde, correr                    |
| Tocar y mantener en el suelo  | Caminar hacia el dedo (como el clic derecho) |
| Tocar una criatura            | Atacarla                                     |
| Tocar un cuerpo               | Revisarlo                                    |
| Tocar a la gente del pueblo   | Comerciar, banco o caballeriza               |
| Tocar la montura propia       | Montarse                                     |
| Tocar un objeto y arrastrarlo | Levantarlo, llevarlo a la mochila o tirarlo  |
| Dos dedos                     | Acercar o alejar                             |

## Celular parado

Aparece un aviso para girarlo, con un dibujo de un celular que gira. Se puede seguir igual
("Jugar así igual"): los controles se acomodan, pero se ve menos mundo. **Pantalla completa**
(en el menú) también intenta trabar la pantalla acostada donde el navegador lo permite (Android;
el iPhone no deja).

## Computadora

La barra de atajos también está en la computadora, arriba de los botones: teclas **1 a 9 y 0**,
clic para usar, clic derecho para cambiar. Con el libro de hechizos abierto, 1 a 8 siguen siendo
los hechizos de su página, y el botón **Atajo** de cada hechizo lo manda a la barra.

Para pelear sin apuntar con el mouse: **E** ataca a la siguiente criatura cercana y **Q** a la
anterior (lo mismo que **⟳** en el celular, en los dos sentidos). Como el botón de atacar, nunca
elige personas, vecinos ni criaturas con dueño.

## Cómo se verificó

Con Playwright, emulando un celular táctil acostado de 844×390 y uno angosto de 667×375:

- El joystick mueve al personaje en la dirección arrastrada.
- El botón Atacar mató a un esqueleto del Cementerio Viejo sin tocarlo.
- La venda de la barra se usa sobre uno mismo.
- El menú abre las ventanas, y la mochila entra en la pantalla angosta.
- Parado, aparece el aviso de girar.
- Después de girar (acostado → parado → acostado) la escala sigue en 1 y el ancho en 844.
- Tocar el chat abre el campo (con letra de 16 px) y se puede escribir.
- El primer atajo alrededor de Atacar usa las vendas; ⟳ y ✕ aparecen arriba mientras se pelea.

En la computadora se puede probar el modo táctil agregando `?tactil` a la dirección.
