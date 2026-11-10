# Fenix en línea, en un servidor propio (Oracle gratis)

Guía para poner el juego en línea, con las cuentas, los personajes y las casas guardados en el
servidor (no en el navegador de cada uno). Se usa la capa gratuita de Oracle Cloud, en São Paulo
o Santiago, que es lo más cerca de Argentina.

Lo que queda andando:

- **El juego** en `https://…`, con candado: la página y la conexión del juego, cifradas.
- **Los datos** (`cuentas.json`, `personajes.json`, `casas.json`) en un volumen de Docker que no
  se borra al reiniciar ni al actualizar.
- **Copias de seguridad** cada hora en el servidor (quedan las últimas 48) y, si se configura, una
  por día afuera, en Cloudflare R2 (gratis hasta 10 GB).

## 1. Crear la cuenta de Oracle

1. Entrar a [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) → **Comenzar gratis**.
2. **Región principal (home region): elegir São Paulo o Santiago.** No se puede cambiar después,
   y las máquinas gratis solo se crean en esa región.
3. Pide una tarjeta para verificar la identidad; no cobra mientras se use lo gratuito.
4. Recomendado: pasar la cuenta a **Pay As You Go** (Facturación → Actualizar). Sigue sin cobrar
   dentro de lo gratuito y, según lo que se reporta, evita que apaguen la máquina por poco uso.
   Ojo con no crear nada pago.

## 2. Crear la máquina

En la consola: **Compute → Instances → Create instance**.

1. **Image:** Ubuntu 24.04 (Canonical Ubuntu).
2. **Shape:** _Change shape_ → **Ampere** → `VM.Standard.A1.Flex`, **2 OCPU y 12 GB** (gratis).
   Si dice que no hay capacidad, reintentar más tarde u otro día: pasa seguido.
3. **SSH keys:** _Generate a key pair for me_ → **descargar la clave privada** y guardarla bien:
   es la llave para entrar al servidor.
4. **Create.** Cuando esté en verde (_Running_), anotar la **IP pública**.

## 3. Abrir los puertos del juego en Oracle

La máquina está detrás de una "lista de seguridad" que solo deja pasar SSH.

1. En la instancia: **Subnet** (el enlace) → **Security Lists** → la lista _Default_.
2. **Add Ingress Rules**, dos reglas: _Source CIDR_ `0.0.0.0/0`, _IP Protocol_ TCP,
   _Destination Port_ **80**; y lo mismo con **443**.

## 4. Entrar e instalar

Desde la computadora (en Windows, PowerShell; en Mac, Terminal), con la clave descargada:

```bash
ssh -i ruta/a/la-clave.key ubuntu@IP-PUBLICA
```

Ya adentro, un solo comando:

```bash
curl -fsSL https://raw.githubusercontent.com/gaspartomasello/Fenix/main/deploy/instalar.sh | bash
```

Instala Docker, abre el cortafuegos de Ubuntu, baja el juego y lo levanta. La primera vez tarda
unos minutos (compila). Al final muestra la dirección, por ejemplo
`https://152-67-10-20.sslip.io` (la IP con guiones + `.sslip.io`: una dirección gratis que
apunta al servidor, con certificado de verdad). Con un dominio propio, se cambia `DOMINIO` en
`~/fenix/.env` y se vuelve a levantar (ver abajo).

## 5. Configurar

En el servidor, `nano ~/fenix/.env`:

- `ADMINS`: nombres de los administradores del juego, separados por coma.
- `TEST_CHARACTERS`: personajes de prueba (todo al máximo). **En el servidor de verdad, vacío.**
- `DOMINIO`: la dirección del juego.

Después de cambiarlo: `cd ~/fenix && docker compose up -d`.

## 6. Copias afuera del servidor (recomendado)

Las copias horarias quedan en el mismo servidor: si se pierde la máquina, se pierden con ella. Para
tener una afuera, gratis, con Cloudflare R2:

1. En [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → crear un balde (bucket), por
   ejemplo `fenix-copias`.
2. **Manage R2 API Tokens → Create API token**, con permiso de lectura y escritura sobre ese balde.
   Anotar el _Access Key ID_, el _Secret Access Key_ y el _endpoint_
   (`https://<id-de-cuenta>.r2.cloudflarestorage.com`).
3. En `~/fenix/.env`:

   ```
   COPIAS_REMOTO=remoto:fenix-copias
   COPIAS_ENDPOINT=https://<id-de-cuenta>.r2.cloudflarestorage.com
   COPIAS_CLAVE_ID=...
   COPIAS_CLAVE_SECRETA=...
   ```

4. `cd ~/fenix && docker compose up -d`. En `docker compose logs copias` tiene que aparecer
   "subida afuera".

## Uso diario

| Para…                          | En el servidor                                           |
| ------------------------------ | -------------------------------------------------------- |
| Actualizar a la última versión | `cd ~/fenix && git pull && docker compose up -d --build` |
| Ver qué pasa                   | `cd ~/fenix && docker compose logs -f fenix`             |
| Ver si todo anda               | `cd ~/fenix && docker compose ps`                        |
| Reiniciar el juego             | `cd ~/fenix && docker compose restart fenix`             |
| Listar las copias              | `cd ~/fenix && docker compose exec copias ls -l /copias` |

Actualizar o reiniciar no borra nada: el juego guarda todo al apagarse y los datos viven en el
volumen `datos`. **Nunca correr `docker compose down -v`**: la `-v` borra los volúmenes, o sea,
todas las cuentas.

## Volver a una copia

```bash
cd ~/fenix
docker compose exec copias ls -l /copias          # elegir una, por ejemplo fenix-20261110-0300.tar.gz
docker compose stop fenix
docker run --rm -v fenix_datos:/data -v fenix_copias:/copias alpine:3.20 \
  tar -xzf /copias/fenix-20261110-0300.tar.gz -C /data
docker compose start fenix
```

(Para una copia de R2, primero bajarla a `/copias` con
`docker compose exec copias rclone copy remoto:fenix-copias/fenix-AAAAMMDD.tar.gz /copias/`.)
