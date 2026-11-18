# Reparto de trabajo: objetos nuevos y arquitectura

Fecha: 18 de noviembre de 2026. Fuente de verdad: `main` de `gaspartomasello/Fenix` en GitHub. Antes de empezar, leer `CLAUDE.md`, `docs/ARQUITECTURA.md` y el estado actual de `main`.

## Pedido de Gaspar

Agregar el arma **Pitchfork** (horca de combate): habilidad **Esgrima**, **dos manos**, daño base del arma **13–14** y **2,5 segundos** de intervalo base entre ataques, que se modifica con **Destreza**. Usar como referencia el sprite RGBA de 50 × 50 píxeles en `docs/referencias/pitchfork-50.png`. Su FNV-1a de los bytes RGBA, en orden por filas, es `2936446925`. Conservar cada píxel del sprite en inventario y en el suelo; la variante para el personaje equipado puede adaptarse a las orientaciones del cuerpo.

Agregar también la **Hoz**: habilidad **Espadachín** (`swordsmanship`), **una mano**, daño base **12–16**, intervalo base de **3 segundos** que se ajustará con **Destreza**. Referencia de 50 × 50 píxeles en `docs/referencias/hoz-50.png`; FNV-1a RGBA `3168388371`. Codex dejó su sprite, catálogo, arma, aspecto equipado, receta y vendedor en esta misma rama. La velocidad dinámica también queda pendiente para Claude.

## Integración y responsables

**Codex se encarga de los objetos nuevos.** En esta rama preparó el sprite exacto, catálogo, datos base del arma, aspecto equipado, receta y vendedor del pitchfork. **Claude se encarga de la integración con la arquitectura del juego**, especialmente de la regla compartida de velocidad según Destreza y de reconciliar los objetos anteriores con `main`.

- `packages/shared/src/domain/items/item-catalog.ts`: `pitchfork` como arma equipable a dos manos, distinto de `war-fork` (existente).
- `packages/shared/src/domain/combat/weapons.ts`: `minDamage: 13`, `maxDamage: 14`, `swingMs: 2500`, `skill: 'fencing'`.
- **Pendiente para Claude:** `packages/server/src/domain/combat/combat.ts`: actualmente `nextSwingAt = now + weapon.swingMs` ignora Destreza. Crear una regla compartida y comprobable para ajustar el intervalo con Destreza sin alterar el valor base a Destreza inicial (40). Evaluar si debe aplicarse a todas las armas para mantener coherencia del combate; evitar un caso especial opaco para este objeto. Distinguir daño base del arma del daño final, que ya tiene atributos, habilidades y armadura.
- `packages/art/src/item-art.ts` y representación equipada en `packages/art/src/character-art.ts`: preservar la referencia en mochila/suelo y mostrar la horca en ambas manos de un personaje sin confundirla con `war-fork`. El tamaño exacto 50 × 50 excede `ITEM_ART_SIZE = 44`: resolver el encuadre sin recortar ni interpolar el sprite. Ajustar las pruebas que asumen 44 px para todos los objetos solo en este caso.
- Añadir una vía de obtención coherente con el resto de armas: receta de herrería y/o vendedor, con valores económicos acordes al catálogo. Sin aparición automática en un lugar especial.
- Probar daño base, habilidad, ocupación de manos, intervalo de ataque a Destreza 40 y a valores mayores/menores, fidelidad RGBA del sprite, dibujo en mochila/suelo y obtención. Ejecutar `npm run check` y `npm run build` antes de integrar a `main`.

## Estado del trabajo anterior

Codex dejó cambios locales en `codex/rotatable-armoire` (`ba4ac3b`, `d43f75b`) para forjas, yunques, muebles, bebedero y lavado de vendas. **Esos commits no están publicados en GitHub**. El `main` remoto avanzó mientras tanto: `d50ec3d` ya implementa el lavado de vendas con un módulo propio (`features/washing`) y otro nombre de objeto (`bloody-bandage`). No trasplantar `d43f75b` entero ni reemplazar ese módulo: revisar los cambios de arte por separado y reconciliar con `main`.

Esta rama parte del `main` remoto verificado. Informar qué partes anteriores quedaron integradas y cuáles siguen pendientes, para que Gaspar sepa qué puede ver en el juego publicado.
