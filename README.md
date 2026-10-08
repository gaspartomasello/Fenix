# Fenix

MMORPG web inspirado en **Ultima Online** y el motor **Sphere**: mundo isométrico compartido,
en tiempo real, jugable desde el navegador.

> Proyecto independiente. No usa código, gráficos, mapas ni marcas de Electronic Arts.
> El arte se genera por código y las mecánicas se reimplementan desde cero.

## Requisitos

- Node.js 22.12 o superior
- npm 10 o superior

## Jugar solo, sin instalar nada

El **modo solo** corre el servidor del juego dentro del navegador: no hace falta Node, Git
ni conexión con otros jugadores. `npm run build:solo` genera un único archivo
`packages/client/dist-solo/fenix.html` que se puede publicar como página web.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí <http://localhost:5173>. Para probar el multijugador, abrí otra pestaña y creá otro personaje.

| Comando                              | Qué hace                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `npm run dev`                        | Servidor (puerto 3000) y cliente con recarga en vivo (5173)  |
| `npm run dev:solo`                   | Modo solo con recarga en vivo, sin servidor aparte           |
| `npm run build`                      | Compila cliente y servidor                                   |
| `npm run build:solo`                 | Genera la página autocontenida del modo solo                 |
| `npm start`                          | Corre la versión compilada: juego completo en el puerto 3000 |
| `npm test`                           | Tests                                                        |
| `npm run lint`                       | ESLint (incluye las reglas de capas)                         |
| `npm run typecheck`                  | Verificación de tipos de los tres paquetes                   |
| `npm run check`                      | Formato + lint + tipos + tests (lo mismo que corre la CI)    |
| `npm run tilesets -w @fenix/content` | Regenera los tilesets de Tiled a partir del arte             |

### Variables de entorno del servidor

| Variable      | Por defecto   | Descripción                                |
| ------------- | ------------- | ------------------------------------------ |
| `PORT`        | `3000`        | Puerto HTTP/WebSocket                      |
| `HOST`        | `0.0.0.0`     | Interfaz donde escucha                     |
| `MAP_SEED`    | `1997`        | Semilla del mapa generado                  |
| `MAP_SIZE`    | `128`         | Lado del mapa en tiles                     |
| `START_HOUR`  | `8`           | Hora del juego con la que arranca el mundo |
| `CLIENT_DIST` | `client/dist` | Carpeta del cliente compilado a servir     |

## Controles

- **Flechas / WASD**: caminar (arriba en pantalla = Noroeste, como en UO). **Shift** para correr.
- **Clic derecho sostenido** (o **tocar y mantener** en el celular): caminar hacia el cursor;
  lejos del personaje, correr.
- **Enter**: hablar. **Escape**: cancelar.
- **B**: mochila. **C**: equipo (también con los botones de abajo a la derecha).
- **Arrastrar** un objeto: moverlo entre el suelo, la mochila y los casilleros del equipo.
- **Doble clic** (o doble toque): comer, beber, ponerse o sacarse algo; sobre un objeto del suelo,
  levantarlo.
- **Clic** (o toque) sobre una criatura: atacarla. El personaje golpea solo mientras la tenga al
  lado. **Escape**: dejar de atacar.
- **L**: libro de hechizos. **K**: habilidades. **1 a 5**: lanzar un hechizo (los de ataque van al
  objetivo de combate o piden tocar una criatura).
- **Tocar a un comerciante** (estando cerca): comprar y vender. A la banquera: abrir la caja del
  banco y arrastrar objetos entre la mochila y el banco.
- **Doble clic sobre el hacha o el pico**, y después tocar un árbol o una roca al lado: talar o
  minar. Doble clic sobre el mineral al lado de la forja: fundirlo. Doble clic sobre el martillo
  de herrero: abrir la herrería (al lado del yunque y la forja).
- **Rueda del mouse**: acercar o alejar la cámara.

## Estructura

```
packages/
├── shared/   Dominio y protocolo comunes (sin dependencias)
├── art/      Arte procedural: pixel art generado por código, sin DOM
├── content/  Mapas y tilesets editables con Tiled
├── server/   Servidor autoritativo: dominio → aplicación → infraestructura
└── client/   Cliente web: core → render / UI / input / red
docs/
├── ARQUITECTURA.md
└── MAPAS.md   Cómo diseñar mapas con Tiled
```

Detalle de capas, flujo de mensajes y decisiones en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Hoja de ruta

1. ✅ **Base online**: mapa isométrico, personajes, movimiento en tiempo real, chat.
2. ✅ **Mundo**: isla de 128×128 con bosques, pueblo diseñado en Tiled, edificios y objetos con
   colisión, transiciones de terreno, rango de visión y día/noche con faroles.
3. ✅ **Objetos**: tirarlos y levantarlos del suelo, mochila, ventana de equipo, armas,
   armaduras y ropa que se ven puestas, comida y pociones, arrastrar y soltar.
4. ✅ **Combate**: ratas, lobos y esqueletos que deambulan y atacan, vida, maná y energía, armas y
   armaduras que cuentan, botín, muerte, fantasma y resurrección en el santuario. Los pueblos son
   zonas seguras.
5. ✅ **Habilidades y magia**: siete habilidades que suben con el uso (Lucha, Espadas, Esgrima,
   Tácticas, Parada, Magia, Meditación) y cinco hechizos con reactivos y libro.
6. ✅ **Economía**: talar y minar, fundir mineral, herrería con recetas, cuatro comerciantes
   (herrero, maga, tabernero y banquera) y caja del banco.
7. Social: grupos, gremios, combate entre jugadores, karma y fama.
8. Persistencia y deploy: cuentas, guardado, servidor 24/7.
