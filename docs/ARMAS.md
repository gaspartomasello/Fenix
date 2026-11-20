# Armas: cómo sumar una nueva

Guía para cargar un arma nueva (o mejorar una que ya existe) de punta a punta: que se pueda
conseguir, que pegue con su daño y su velocidad, y que se vea bien en la mochila, en el suelo,
en la mano del personaje y en la ventana de personaje. Leé también `docs/ARQUITECTURA.md` y las
reglas de `CLAUDE.md` (catálogo de arte, código en inglés y textos en español claro).

## Cómo pelea un arma

- **Acierto:** habilidad del arma del atacante contra la del defensor (fórmula del juego): a igual
  habilidad, 50 %; entre 10 % y 95 %.
- **Daño:** al azar entre `minDamage` y `maxDamage`, +1 cada 20 de fuerza, × Tácticas (60 %–100 %),
  × Anatomía (hasta +50 %); la armadura absorbe hasta 60 %.
- **Velocidad (como en Sphere y OSI):** segundos entre golpes =
  `15000 ÷ ((destreza + 100) × velocidad)`, con la destreza en proporción a la energía que queda
  (cansado, más lento) y nunca más de un golpe por segundo (`shared/combat/swing-speed.ts`).
  Cada arma guarda `swingMs`: **lo que tarda con 40 de destreza** (un personaje nuevo). La
  velocidad base sale sola: `velocidad = 107143 ÷ swingMs` (daga 54, alabarda 29).
  Para cargar una velocidad del juego: `swingMs = 107143 ÷ velocidad`, redondeado a 250.
- **Habilidad:** cada arma usa y sube una: `fencing` (esgrima: daga, estoque, lanza), `swordsmanship`
  (espadas y hachas), `mace-fighting` (mazas, martillos, garrote, bastón), `archery` (arco y
  ballestas, con `range` y `ammo`).

### Valores de referencia (para que quede pareja)

| Tipo                         | Daño       | `swingMs` | Velocidad base | Ejemplos                        |
| ---------------------------- | ---------- | --------- | -------------- | ------------------------------- |
| Puñal (una mano, rápido)     | 10–12      | 2000      | 54             | daga, estoque                   |
| Espada liviana               | 5–12, 5–13 | 2000–2250 | 48–54          | katana, alfanje, cimitarra      |
| Espada / maza de una mano    | 6–16       | 2500–2750 | 39–43          | espada larga, maza, hacha       |
| Pesada de una mano           | 9–18       | 3000      | 36             | hacha de guerra, mangual        |
| Dos manos pesada             | 10–25      | 3250–3750 | 29–33          | hacha doble, alabarda, bardiche |
| Arco / ballesta (alcance 10) | 8–26       | 3000–5000 | 21–36          | arco, ballesta, ballesta pesada |

Regla práctica: **más daño, más lenta**. El daño por segundo de las armas de una mano anda entre
3,3 y 4,5 (con 40 de destreza); las de dos manos, algo más, a cambio de no llevar escudo.

## Los lugares que hay que tocar

Ejemplo: un arma nueva `bastard-sword` («espada bastarda»). La clave va en inglés, en minúsculas
y con guiones; el nombre, en español.

1. **El objeto** — `packages/shared/src/domain/items/item-catalog.ts`
   - Sumar la clave a `BASE_ITEM_KINDS`, en el grupo de las armas.
   - Definirla en `ITEMS` con la ayuda `weapon(nombre, plural, artículo)`; si es de dos manos,
     `{ ...weapon('espada bastarda', 'espadas bastardas', 'una'), twoHanded: true }`.
     El peso sale solo (6 piedras; 10 si es de dos manos).
2. **Sus números de pelea** — `packages/shared/src/domain/combat/weapons.ts`, en `WEAPONS`:
   ```ts
   'bastard-sword': {
     name: 'espada bastarda',
     minDamage: 8,
     maxDamage: 17,
     swingMs: 3000, // con 40 de destreza (velocidad base 36)
     skill: 'swordsmanship',
   },
   ```
   Para arcos y ballestas, además `range: 10` y `ammo: 'arrow'` (o `'bolt'`).
3. **El ícono (mochila y suelo)** — `packages/art/src/item-art.ts`
   - Un modelo procedural en `MODELS` (por ejemplo `'bastard-sword'(c) { … }`), con `VolumeCanvas`:
     `limb` para hojas, mangos y astas; `polygon` para filos y hojas de hacha; `sphere` para pomos;
     `metal(STEEL)`, `metal(GOLD)`, `solid(WOOD)` para los materiales.
   - Si sobresale del casillero, ajustar su tamaño en `ICON_FIT` (ej. `katana: 0.9`).
     Las armas que se empuñan se dibujan en diagonal y se achican solas si no entran.
   - Comparar con las armas vecinas: que se distinga de un vistazo (silueta propia, no solo color).
4. **El arma en la mano (mundo y ventana de personaje)** — `packages/art/src/character-art.ts`,
   función `drawWeapon`. Es otro modelo, dibujado desde la mano (`along(k)` avanza por el arma):
   - Espadas rectas: sumar su entrada a `blades` (`length`, `width`, `guard`).
   - Hachas pesadas: `HEAVY_AXES` (`haft`, `reach`, `height`, `double`).
   - Algo distinto: un bloque propio con `if (kind === '…') { … return; }`.
   - Que **se parezca al ícono** (mismas proporciones y colores): es la misma arma vista en mano.
   - Cómo se lleva al descansar o caminar: `STANCES` (espadas en alto, puñales hacia abajo, mazas
     al hombro) o `POLEARMS` si es de asta y va parada. En guardia y al golpear apunta al enemigo.
   - El gesto del golpe: `attackStyleFor` en `packages/art/src/humanoid-rig.ts` (estocada para
     las de punta en `THRUSTING`, tajo para el resto, disparo para arcos y ballestas).
5. **Dónde se consigue** (al menos uno):
   - Herrero: venta y compra en `packages/shared/src/domain/economy/vendors.ts` (precio parejo con
     las parecidas, ej. katana 140) y receta en `crafting.ts` (`['bastard-sword', 400, ingots(10)]`:
     habilidad mínima en décimas y materiales).
   - Botín de criaturas en `creature-catalog.ts` (`{ kind: 'bastard-sword', chance: 0.2 }`) o
     tesoros en `treasure/treasure.ts`.

## Antes de subirlo

- Correr `npm run check:fast` y `npx eslint packages`.
- Las pruebas de arte (`packages/art/src/art.test.ts`) dibujan el ícono de cada objeto y cada arma
  puesta: si falta el modelo, fallan.
- Mirar el ícono y el arma en la mano lado a lado con las otras (la galería `/objetos` del juego,
  como administrador, muestra todos los íconos) y en el celular acostado.
- Todo lo que ve el jugador, en español claro (glosario en `CLAUDE.md`).
- Un Pull Request por tanda de armas, explicando daño, velocidad y dónde se consiguen.
