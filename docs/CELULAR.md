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
│                         MUNDO                                │
│                                                       [⟳]    │
│  (joystick)      [1][2][3][4][5][6][7][8][9][0]       [✕] (Atacar) │
└──────────────────────────────────────────────────────────────┘
```

- **Izquierda abajo, pulgar izquierdo: joystick.** Arriba en el joystick es arriba en la pantalla
  (igual que las flechas). Llevándolo al borde se corre.
- **Derecha abajo, pulgar derecho: Atacar.** Elige la criatura salvaje viva más cercana y sigue con
  ella mientras viva (no hace falta tocarla). Mientras se pelea aparecen **⟳** (la siguiente más
  cercana) y **✕** (dejar de atacar). Nunca elige personas, gente del pueblo ni monturas o
  invocaciones de nadie: atacar a otro jugador tiene consecuencias, y eso se hace a propósito
  tocándolo en modo guerra.
- **Abajo al centro: barra de atajos.** Diez casilleros (ocho en celulares angostos). Al
  principio: vendas, pociones de curación, purificación y vigor, Curar, Flecha mágica y Purificar.
  Las vendas y los hechizos de ayuda van a uno mismo; los de ataque, al objetivo de combate.
  Mantener apretado un casillero abre la ventana para cambiarlo.
- **Arriba a la derecha:** Mochila y Mapa (lo que más se abre) y Menú con todo lo demás:
  personaje, hechizos, habilidades, social, guerra, hablar, pantalla completa y salir.
- **Arriba a la izquierda:** vida, maná y energía, los efectos (veneno, bendiciones) y las
  últimas líneas del chat, chicas y sin tapar el mundo. "Hablar" abre el campo para escribir.

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

## Cómo se verificó

Con Playwright, emulando un celular táctil acostado de 844×390 y uno angosto de 667×375:

- El joystick mueve al personaje en la dirección arrastrada.
- El botón Atacar mató a un esqueleto del Cementerio Viejo sin tocarlo.
- La venda de la barra se usa sobre uno mismo.
- El menú abre las ventanas, y la mochila entra en la pantalla angosta.
- Parado, aparece el aviso de girar.

En la computadora se puede probar el modo táctil agregando `?tactil` a la dirección.
