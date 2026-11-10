# Dirección de habilidades (para Claude Code)

El skillcap total se elevó a 1000,0 en el PR #108; cada habilidad sigue limitada a 100,0.

Cada habilidad tiene dirección `up`, `down` o `lock` (predeterminado `up`). El jugador toca el control de la ventana y recorre ↑ → ↓ → candado → ↑. El cliente envía `setSkillDirection`; el servidor valida el mensaje y responde con el estado autoritativo.

Al ganar una habilidad ↑, si la suma llegó a 1000,0, se descuentan las décimas necesarias de habilidades ↓ con puntos, en el orden estable de `SKILL_KEYS`. Las habilidades bloqueadas no suben ni ceden puntos. Si ninguna ↓ tiene puntos disponibles, el avance se detiene. Un fallo de la tirada no descuenta puntos. El entrenamiento de atributos conserva su lógica.

Las direcciones se guardan en `SavedCharacter.skillDirections`, se validan al cargar y se restauran; los personajes anteriores usan ↑ por defecto. `SkillsMessage.directions` es opcional para compatibilidad con mensajes anteriores. Las pruebas del dominio y de persistencia deben cubrir el intercambio, el bloqueo y la recuperación tras reconexión.

## Dirección de atributos

Fuerza, Destreza e Inteligencia también tienen ↑, ↓ y candado, con ↑ por defecto. Al statcap total 235, un atributo ↑ puede subir si otro ↓ tiene más de 10 puntos: intercambian un punto. Respeta el tope individual 120. El estado se guarda en `SavedCharacter.statDirections`, se valida al cargar y se envía junto con `EffectsMessage`. Los personajes anteriores se cargan con ↑. La solicitud `setStatDirection` se valida en el protocolo y el servidor la aplica.
