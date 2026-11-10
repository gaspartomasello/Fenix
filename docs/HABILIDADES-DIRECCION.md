# Dirección de habilidades (para Claude Code)

El skillcap total se elevó a 1000,0 en el PR #108; cada habilidad sigue limitada a 100,0.

Cada habilidad tiene dirección `up`, `down` o `lock` (predeterminado `up`). El jugador toca el control de la ventana y recorre ↑ → ↓ → candado → ↑. El cliente envía `setSkillDirection`; el servidor valida el mensaje y responde con el estado autoritativo.

Al ganar una habilidad ↑, si la suma llegó a 1000,0, se descuentan las décimas necesarias de habilidades ↓ con puntos, en el orden estable de `SKILL_KEYS`. Las habilidades bloqueadas no suben ni ceden puntos. Si ninguna ↓ tiene puntos disponibles, el avance se detiene. Un fallo de la tirada no descuenta puntos. El entrenamiento de atributos conserva su lógica.

Las direcciones se guardan en `SavedCharacter.skillDirections`, se validan al cargar y se restauran; los personajes anteriores usan ↑ por defecto. `SkillsMessage.directions` es opcional para compatibilidad con mensajes anteriores. Las pruebas del dominio y de persistencia deben cubrir el intercambio, el bloqueo y la recuperación tras reconexión.
