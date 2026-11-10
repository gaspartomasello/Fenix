#!/usr/bin/env bash
# Instala Fenix en un servidor Ubuntu nuevo (Oracle Cloud u otro), de una vez:
#   curl -fsSL https://raw.githubusercontent.com/gaspartomasello/Fenix/main/deploy/instalar.sh | bash
# Instala Docker, abre los puertos 80 y 443, baja el juego, arma el .env con
# la dirección (la IP con .sslip.io si no se da un dominio) y lo levanta.
# Se puede volver a correr: actualiza el juego sin tocar los datos.
# Guía completa: docs/SERVIDOR.md
set -euo pipefail

CARPETA="${FENIX_CARPETA:-$HOME/fenix}"
REPO="${FENIX_REPO:-https://github.com/gaspartomasello/Fenix.git}"

echo "== Fenix: instalación en $CARPETA"

# 1. Docker.
if ! command -v docker >/dev/null 2>&1; then
  echo "== Instalando Docker…"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# 2. Puertos 80 (http) y 443 (https). Las imágenes de Ubuntu de Oracle traen el
#    cortafuegos cerrado salvo SSH: se abren y se guarda para que sobreviva al reinicio.
if sudo iptables -L INPUT -n 2>/dev/null | grep -q REJECT; then
  for puerto in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$puerto" -j ACCEPT 2>/dev/null ||
      sudo iptables -I INPUT 5 -p tcp --dport "$puerto" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save; fi
fi

# 3. El juego.
if [ -d "$CARPETA/.git" ]; then
  echo "== Actualizando el juego…"
  git -C "$CARPETA" pull --ff-only
else
  command -v git >/dev/null 2>&1 || sudo apt-get install -y git
  git clone "$REPO" "$CARPETA"
fi
cd "$CARPETA"

# 4. La configuración (solo la primera vez).
if [ ! -f .env ]; then
  cp .env.ejemplo .env
  dominio="${FENIX_DOMINIO:-}"
  if [ -z "$dominio" ]; then
    ip=$(curl -fsS https://api.ipify.org || true)
    if [ -z "$ip" ]; then
      echo "No se pudo averiguar la IP pública: completá DOMINIO en $CARPETA/.env y volvé a correr esto."
      exit 1
    fi
    dominio="${ip//./-}.sslip.io"
  fi
  sed -i "s|^DOMINIO=.*|DOMINIO=$dominio|" .env
  echo "== Dirección del juego: https://$dominio"
fi

# 5. Levantar (la primera compilación tarda unos minutos).
echo "== Compilando y levantando…"
$DOCKER compose up -d --build
dominio=$(grep '^DOMINIO=' .env | cut -d= -f2)
echo
echo "Listo. En uno o dos minutos el juego está en: https://$dominio"
echo "Ver cómo va:   cd $CARPETA && $DOCKER compose logs -f fenix"
