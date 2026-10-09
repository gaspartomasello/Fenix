# Diseñar mapas con Tiled

El pueblo de **Puerto Ceniza** está diseñado en [Tiled](https://www.mapeditor.org), un editor de
mapas gratuito. El resto de la isla (bosques, costas, lagos) lo genera el servidor; el pueblo se
estampa en el centro.

## Archivos

```
packages/content/
├── maps/puerto-ceniza.json     El pueblo (mapa de Tiled en formato JSON)
└── tilesets/
    ├── terreno.json / .png     Pasto, tierra, arena, empedrado, agua, madera, cueva, roca
    └── objetos.json / .png     Árboles, rocas, paredes, cercas, faroles, paredes de cueva…
```

Los tilesets se generan a partir del arte del juego. **No se editan a mano**: si cambia el arte o
se agregan terrenos u objetos, se regeneran con:

```bash
npm run tilesets -w @fenix/content
```

Si se agrega un **terreno**, el tileset `terreno` crece y el `firstgid` de `objetos` en el mapa
tiene que correrse lo mismo (y con él, los números de la capa `objetos`). Los objetos nuevos van
al final de su tileset y no corren nada.

## Editar el pueblo

1. Instalá Tiled y abrí `packages/content/maps/puerto-ceniza.json`.
2. Usá las tres capas que el juego entiende:

| Capa              | Tipo             | Qué va                                                                                          |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `terreno`         | Capa de patrones | Un tile del tileset `terreno` por casilla. Vacío = lo que genere la isla.                       |
| `objetos`         | Capa de patrones | Un objeto del tileset `objetos` por casilla.                                                    |
| `zonas`           | Capa de objetos  | Un punto llamado `aparicion` y rectángulos de clase `region`.                                   |
| `objetos-sueltos` | Capa de objetos  | Puntos con el nombre de un objeto (`short-sword`, `gold`…) y una propiedad `cantidad` opcional. |

3. Guardá (Ctrl+S) y corré `npm test`: el test del cargador valida el mapa y avisa con un mensaje
   claro si algo está mal (por ejemplo, un objeto puesto en la capa de terreno).

## Reglas útiles

- **Objetos que bloquean**: árboles, rocas, paredes, cercas, barriles, cajones, el aljibe y los
  faroles no se pueden atravesar. Flores, arbustos y carteles sí.
- **Paredes**: `wall-x` va sobre el borde superior derecho del tile y `wall-y` sobre el superior
  izquierdo. Para una casa con interior de `x0..x1`, `y0..y1`:
  - pared norte: `wall-x` en la fila `y0`; pared oeste: `wall-y` en la columna `x0`;
  - pared sur: `wall-x` en la fila `y1 + 1`; pared este: `wall-y` en la columna `x1 + 1`;
  - `wall-corner` en `(x0, y0)` y `wall-post` en `(x1 + 1, y1 + 1)`;
  - una puerta es un hueco en la pared sur o este.
- **Faroles** iluminan de noche (radio de 5 tiles).
- **Santuario** (`shrine`): los fantasmas que llegan a 2 tiles vuelven a la vida. Tiene que haber
- **Forja y yunque** (`forge`, `anvil`): para fundir mineral y fabricar. Los árboles (`oak`,
  `pine`) dan troncos y las rocas (`rock`) mineral.
- **Comerciantes**: en la capa `zonas`, un punto de clase `npc` con una propiedad `rol`
  (`blacksmith`, `mage`, `innkeeper` o `banker`).
  al menos uno en el mapa.
- **Zonas** (`region`): además de nombrar el lugar, son **seguras**: las criaturas no entran.
- **Zonas** (`region`): su nombre aparece en la barra de estado cuando el jugador está adentro.
- **Aparición**: el punto `aparicion` debe caer en un tile transitable; el test lo verifica.
- **Objetos sueltos**: se pueden levantar. Nombres válidos: `gold`, `apple`, `healing-potion`,
  `dagger`, `short-sword`, `axe`, `wooden-shield`, `leather-cap`, `iron-helmet`, `leather-armor`,
  `chainmail`, `cloak`, `trousers`, `boots`. Todavía no reaparecen: vuelven al reiniciar el
  servidor.
