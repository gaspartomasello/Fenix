# Poner el servidor en línea

El servidor es un solo proceso de Node que sirve la página del juego y el WebSocket en el mismo
puerto. Los personajes se guardan en `DATA_DIR/personajes.json` (cada 30 segundos, al salir del
juego y al apagar el servidor). Las contraseñas se guardan con hash `scrypt` y sal; nunca en
texto plano.

## Con Docker (cualquier proveedor)

```bash
docker build -t fenix .
docker run -p 3000:3000 -v fenix-datos:/data fenix
```

El volumen `/data` es lo único que hay que conservar entre versiones: ahí están los personajes.

## En Render

El archivo `render.yaml` describe un servicio web con Docker y un disco de 1 GB montado en
`/data`.

1. Entrar a [render.com](https://render.com) con la cuenta de GitHub.
2. **New → Blueprint** y elegir el repositorio `Fenix`. Render lee `render.yaml`.
3. Confirmar. Cuando termine de compilar, el juego queda en la dirección que muestra Render
   (`https://fenix-xxxx.onrender.com`).

Los discos persistentes necesitan un plan pago (`starter`). En el plan gratuito el servicio se
duerme sin uso y **los personajes se borran en cada reinicio**: sirve para probar, no para jugar.

## Variables de entorno

| Variable      | Por defecto   | Descripción                                |
| ------------- | ------------- | ------------------------------------------ |
| `PORT`        | `3000`        | Puerto HTTP/WebSocket                      |
| `HOST`        | `0.0.0.0`     | Interfaz donde escucha                     |
| `DATA_DIR`    | `data`        | Carpeta de los personajes guardados        |
| `MAP_SEED`    | `1997`        | Semilla del mapa generado                  |
| `MAP_SIZE`    | `320`         | Lado del mapa en tiles                     |
| `START_HOUR`  | `8`           | Hora del juego con la que arranca el mundo |
| `CLIENT_DIST` | `client/dist` | Carpeta del cliente compilado a servir     |

## Copias de seguridad

`personajes.json` es texto: alcanza con copiarlo. Para restaurar, detener el servidor, reemplazar
el archivo y volver a arrancar. Si el archivo tiene un personaje dañado, ese personaje se
descarta al leerlo y el resto carga normalmente.

## Modo solo

La página del modo solo (`npm run build:solo`) no necesita servidor: el personaje se guarda en el
navegador (`localStorage`). Si el navegador no permite guardar datos, se puede jugar igual, pero
el progreso se pierde al cerrar la pestaña.
