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

| Comando              | Qué hace                                                     |
| -------------------- | ------------------------------------------------------------ |
| `npm run dev`        | Servidor (puerto 3000) y cliente con recarga en vivo (5173)  |
| `npm run dev:solo`   | Modo solo con recarga en vivo, sin servidor aparte           |
| `npm run build`      | Compila cliente y servidor                                   |
| `npm run build:solo` | Genera la página autocontenida del modo solo                 |
| `npm start`          | Corre la versión compilada: juego completo en el puerto 3000 |
| `npm test`           | Tests                                                        |
| `npm run lint`       | ESLint (incluye las reglas de capas)                         |
| `npm run typecheck`  | Verificación de tipos de los tres paquetes                   |
| `npm run check`      | Formato + lint + tipos + tests (lo mismo que corre la CI)    |

### Variables de entorno del servidor

| Variable      | Por defecto   | Descripción                            |
| ------------- | ------------- | -------------------------------------- |
| `PORT`        | `3000`        | Puerto HTTP/WebSocket                  |
| `HOST`        | `0.0.0.0`     | Interfaz donde escucha                 |
| `MAP_SEED`    | `1997`        | Semilla del mapa generado              |
| `MAP_SIZE`    | `96`          | Lado del mapa en tiles                 |
| `CLIENT_DIST` | `client/dist` | Carpeta del cliente compilado a servir |

## Controles

- **Flechas / WASD**: caminar (arriba en pantalla = Noroeste, como en UO). **Shift** para correr.
- **Clic derecho sostenido** (o **tocar y mantener** en el celular): caminar hacia el cursor;
  lejos del personaje, correr.
- **Enter**: hablar. **Escape**: cancelar.
- **Rueda del mouse**: zoom.

## Estructura

```
packages/
├── shared/   Dominio y protocolo comunes (sin dependencias)
├── server/   Servidor autoritativo: dominio → aplicación → infraestructura
└── client/   Cliente web: core → render / UI / input / red
docs/
└── ARQUITECTURA.md
```

Detalle de capas, flujo de mensajes y decisiones en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Hoja de ruta

1. ✅ **Base online**: mapa isométrico, personajes, movimiento en tiempo real, chat.
2. Mundo: mapa más grande por zonas, árboles y edificios, colisiones, día/noche.
3. Ítems: suelo, mochila, paperdoll, equipar, arrastrar y soltar.
4. Combate: monstruos con IA, HP/mana/stamina, muerte, fantasma y resurrección.
5. Skills: suben con el uso, tope total, magia con reagentes y libro de hechizos.
6. Economía: crafting, recolección, NPCs vendedores, banco, oro.
7. Social: party, guilds, PvP, karma/fama.
8. Persistencia y deploy: cuentas, guardado, servidor 24/7.
