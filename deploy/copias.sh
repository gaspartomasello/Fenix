#!/bin/sh
# Copias de seguridad de Fenix (corre en el contenedor "copias").
# Cada hora: un .tar.gz con cuentas, personajes y casas en /copias (quedan las
# últimas 48). Una vez por día, si COPIAS_REMOTO está definido (por ejemplo
# "remoto:fenix-copias"), la copia se sube afuera del servidor.
set -eu
HORAS_A_GUARDAR=48
ultimo_dia=""
while true; do
  ahora=$(date -u +%Y%m%d-%H%M)
  archivo="/copias/fenix-$ahora.tar.gz"
  if ls /data/*.json >/dev/null 2>&1; then
    tar -czf "$archivo.tmp" -C /data . && mv "$archivo.tmp" "$archivo"
    echo "[copias] $archivo"
    # Borrar las más viejas.
    ls -1t /copias/fenix-*.tar.gz | tail -n +$((HORAS_A_GUARDAR + 1)) | xargs -r rm -f
    hoy=$(date -u +%Y%m%d)
    if [ -n "${COPIAS_REMOTO:-}" ] && [ "$hoy" != "$ultimo_dia" ]; then
      if rclone copyto "$archivo" "$COPIAS_REMOTO/fenix-$hoy.tar.gz"; then
        ultimo_dia="$hoy"
        echo "[copias] subida afuera: $COPIAS_REMOTO/fenix-$hoy.tar.gz"
      else
        echo "[copias] no se pudo subir afuera (se reintenta en una hora)"
      fi
    fi
  else
    echo "[copias] todavía no hay datos para copiar"
  fi
  sleep 3600
done
