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

| Comando                              | Qué hace                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `npm run dev`                        | Servidor (puerto 3000) y cliente con recarga en vivo (5173)  |
| `npm run dev:solo`                   | Modo solo con recarga en vivo, sin servidor aparte           |
| `npm run build`                      | Compila cliente y servidor                                   |
| `npm run build:solo`                 | Genera la página autocontenida del modo solo                 |
| `npm start`                          | Corre la versión compilada: juego completo en el puerto 3000 |
| `npm test`                           | Tests                                                        |
| `npm run lint`                       | ESLint (incluye las reglas de capas)                         |
| `npm run typecheck`                  | Verificación de tipos de los tres paquetes                   |
| `npm run check`                      | Formato + lint + tipos + tests (lo mismo que corre la CI)    |
| `npm run tilesets -w @fenix/content` | Regenera los tilesets de Tiled a partir del arte             |

### Variables de entorno del servidor

| Variable          | Por defecto   | Descripción                                |
| ----------------- | ------------- | ------------------------------------------ |
| `PORT`            | `3000`        | Puerto HTTP/WebSocket                      |
| `HOST`            | `0.0.0.0`     | Interfaz donde escucha                     |
| `MAP_SEED`        | `1997`        | Semilla del mapa generado                  |
| `MAP_SIZE`        | `320`         | Lado del mapa en tiles                     |
| `START_HOUR`      | `8`           | Hora del juego con la que arranca el mundo |
| `CLIENT_DIST`     | `client/dist` | Carpeta del cliente compilado a servir     |
| `DATA_DIR`        | `data`        | Carpeta de los personajes guardados        |
| `TEST_CHARACTERS` | (vacío)       | Personajes de prueba, separados por coma   |

Un **personaje de prueba** entra cada vez con todas las habilidades y atributos al máximo, la
vida y el maná llenos, 999.999 monedas de oro y 1000 de cada reactivo. En el modo solo lo es
**Gaspar**; en el servidor en línea, solo los nombres que diga `TEST_CHARACTERS`. Un personaje de
prueba puede escribir `/hora 22` en el chat para cambiar la hora del mundo (para probar la noche),
`/cueva` para ir a la boca de la mazmorra, `/cueva fondo` para aparecer cerca del dragón y `/ir lugar`
para viajar a un pueblo o lugar con nombre (`/ir` solo muestra la lista).

## Controles

- **Flechas / WASD**: caminar (arriba en pantalla = Noroeste, como en UO). **Shift** para correr.
- **Clic derecho sostenido** (o **tocar y mantener** en el celular): caminar hacia el cursor;
  lejos del personaje, correr.
- **Enter**: hablar. **Escape**: cancelar.
- **B**: mochila. **C**: ventana de personaje, como en UO: casilleros con lo que tiene puesto a la
  izquierda, el personaje grande y de frente, botones a las demás ventanas a la derecha y una placa
  con nombre y título. **Doble clic sobre otra persona** (o alguien del pueblo): ver su ventana de
  personaje, sin botones.
- **Arrastrar** un objeto: moverlo entre el suelo y la mochila. Soltarlo sobre el personaje o en su
  casillero de la ventana de personaje lo equipa; arrastrarlo desde ahí hacia afuera lo saca.
- **Doble clic** (o doble toque): comer, beber, ponerse o sacarse algo; sobre un objeto del suelo,
  levantarlo.
- **Clic** (o toque) sobre una criatura: atacarla. El personaje golpea solo mientras la tenga al
  lado. **Escape**: dejar de atacar.
- **Monturas**: en la caballeriza de Bautista se compran caballos (alazán, negro, tordillo y
  overo), una llama o un lagarto corredor. La montura te sigue; **doble clic sobre ella** para
  montar y **doble clic sobre vos** (o `/desmontar`) para bajarte; en modo guerra el doble clic
  no te baja. Montado se anda al doble de rápido y galopar no cansa. Suelta, la montura te
  defiende y ataca a quien ataques; las criaturas y otros jugadores la pueden matar. Con
  `/liberar` la dejás ir para siempre.
- **Doble clic sobre el cuerpo** de una criatura muerta (o un toque): revisarlo. El botín está
  adentro: se arrastra cada objeto a la mochila o se usa **Tomar todo**.
- **L**: libro de hechizos, con una página por círculo. **1 a 8**: lanzar los hechizos de la página
  abierta. Los de ataque van al objetivo de combate o piden tocar a alguien; los de ayuda piden
  tocar a alguien o a uno mismo, y Teletransporte un lugar. **K**: habilidades, por grupo.
- **Doble clic sobre una venda** y tocar a alguien (o a uno mismo): vendarlo. Sobre un pergamino:
  lanzar su hechizo sin libro ni reactivos. Sobre una poción: tomarla (queda la botella).
- **Clic sobre una criatura con un arco en la mano**: dispararle de lejos (gasta flechas).
- **Tocar a un comerciante** (estando cerca): comprar y vender. A la banquera: abrir la caja del
  banco y arrastrar objetos entre la mochila y el banco.
- **Doble clic sobre el hacha o el pico**, y después tocar un árbol o una roca al lado: talar o
  minar. Sobre la caña de pescar, y tocar el agua: pescar. Doble clic sobre el mineral al lado de
  la forja: fundirlo. Doble clic sobre la herramienta de un oficio (martillo de herrero,
  costurero, serrucho, juego de flechero, mortero, pluma de escriba, sartén): abrir su ventana con
  las recetas.
- **Salir**: el botón de la ventana de personaje (o `/desconectar` en el chat) guarda el
  personaje y vuelve a la pantalla de ingreso.
- **O**: ventana social (reputación, grupo, gremio e invitaciones). **Tab**: modo guerra, para
  poder atacar a otras personas fuera del pueblo.
- **Chat**: `/g mensaje` habla al grupo, `/gr mensaje` al gremio, `/invitar nombre`,
  `/aceptar`, `/rechazar`, `/salir`, `/fundar SIGLAS Nombre`, `/reclutar nombre`,
  `/dejargremio`. `/ayuda` los muestra en el juego.
- **Rueda del mouse**: acercar o alejar la cámara.

## Estructura

```
packages/
├── shared/   Dominio y protocolo comunes (sin dependencias)
├── art/      Arte procedural: pixel art generado por código, sin DOM
├── content/  Mapas y tilesets editables con Tiled
├── server/   Servidor autoritativo: dominio → aplicación → infraestructura
└── client/   Cliente web: core → render / UI / input / red
docs/
├── ARQUITECTURA.md
├── DEPLOY.md  Cómo poner el servidor en línea
└── MAPAS.md   Cómo diseñar mapas con Tiled
```

Detalle de capas, flujo de mensajes y decisiones en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Hoja de ruta

1. ✅ **Base online**: mapa isométrico, personajes, movimiento en tiempo real, chat.
2. ✅ **Mundo**: isla de 128×128 (hoy, el continente de la etapa 15) con bosques, pueblo diseñado en Tiled, edificios y objetos con
   colisión, transiciones de terreno, rango de visión y día/noche con faroles.
3. ✅ **Objetos**: tirarlos y levantarlos del suelo, mochila, ventana de equipo, armas,
   armaduras y ropa que se ven puestas, comida y pociones, arrastrar y soltar.
4. ✅ **Combate**: ratas, lobos y esqueletos que deambulan y atacan, vida, maná y energía, armas y
   armaduras que cuentan, botín, muerte, fantasma y resurrección en el santuario. Los pueblos son
   zonas seguras.
5. ✅ **Habilidades y magia**: siete habilidades que suben con el uso (Lucha, Espadas, Esgrima,
   Tácticas, Parada, Magia, Meditación) y cinco hechizos con reactivos y libro.
6. ✅ **Economía**: talar y minar, fundir mineral, herrería con recetas, cuatro comerciantes
   (herrero, maga, tabernero y banquera) y caja del banco.
7. ✅ **Social**: grupos de hasta seis, gremios con siglas sobre el nombre, chat de grupo y de
   gremio, combate entre jugadores fuera del pueblo (modo guerra), reputación con criminales y
   asesinos (nombre azul, gris o rojo), fama y karma.
8. ✅ **Persistencia y despliegue**: personajes con contraseña (hash `scrypt`), guardado
   automático de posición, vitales, habilidades, objetos, banco, reputación y gremio; el modo
   solo guarda en el navegador. Imagen Docker y despliegue en Render
   ([docs/DEPLOY.md](docs/DEPLOY.md)).
9. ✅ **Gráficos de personajes y criaturas**: modelos de volumen con luz y sombras, el doble de
   detalle, cabeza ovalada realista, cuerpo de hombre o de mujer, nueve peinados y barbas, ropa de
   oficio para la gente del pueblo, y rata, lobo y esqueleto redibujados. Animaciones: caminar y
   correr (distintas), golpe en arco con espada o hacha, estocada con daga, puñetazo, lanzar
   hechizos, mordida de las bestias y gestos de reposo cada tanto (girar los hombros, cambiar el
   peso de pierna). La capa envuelve el cuerpo y vuela según se camine, corra o pelee. Objetos
   redibujados con volumen y vistos desde arriba, y ventana de personaje al estilo de UO.
10. ✅ **Habilidades, hechizos, objetos y oficios como en UO**: 22 habilidades en cuatro grupos
    (combate, magia, recolección y oficios) con tope total de 700; fuerza, destreza e
    inteligencia suben al usarlas (hasta 100 cada una y 225 entre las tres). 34 hechizos en ocho
    círculos, con los reactivos de UO (musgo de sangre y belladona incluidos), objetivo a uno
    mismo, a otro o a un lugar, y Resistencia mágica. El octavo círculo trae Terremoto,
    Resurrección e invocaciones (vórtice de energía, elementales de aire, tierra, fuego y agua, y
    demonio) que pelean para su dueño un rato. Efectos que duran: subir o bajar atributos, Protección
    (los golpes no cortan el hechizo), veneno, parálisis y visión nocturna. Vendas con Primeros
    auxilios y Anatomía, pociones de los colores de UO, pergaminos. Mazas, estoque, lanza, espada
    ancha, katana, martillo de guerra y arco con flechas (de lejos, a dos manos); cuero
    tachonado, armadura de placas, túnica y sombrero de mago. Siete oficios con herramienta,
    materiales y lugar: herrería, sastrería, carpintería, flechería, alquimia, inscripción y
    cocina; y pesca.
11. ✅ **Mundo sin pixelado e iluminación**: terreno (pasto, tierra, arena, adoquines, agua y
    tablones) y objetos del mundo (árboles, rocas, paredes, cercas, barriles, cajas, pozo,
    faroles, santuario, forja y yunque) redibujados a resolución completa con volumen y luz,
    en la proyección de UO. De noche, la luz de faroles y fuegos ilumina el suelo, las paredes y
    los personajes que toca, sin velar la pantalla; Visión nocturna hace ver como de día. El
    oro se ve como una moneda, un puñado, una pila o una montaña según la cantidad.
12. ✅ **Criaturas y mazmorra**: araña gigante (envenena), orco (huye cuando le queda poca vida),
    trol (se regenera), esqueleto mago y liche (lanzan hechizos de lejos y se curan) y dragón
    rojo (aliento de fuego que alcanza a los de al lado). La **Cueva del Lamento**: se entra por
    una boca de piedra en el bosque y se sale por una escalera; salas unidas por pasillos,
    oscura a cualquier hora (los braseros iluminan las salas), criaturas más fuertes cuanto más
    hondo y el dragón en la última sala. El botín queda **dentro del cuerpo**, que se revisa con
    doble clic.
13. ✅ **Monturas**: caballo con anatomía de verdad (pecho profundo, cruz, grupa redonda, cuello
    arqueado, cabeza en cuña, rodillas, corvejones altos, menudillos y cascos) en cuatro
    pelajes, llama de cuello largo y lagarto corredor bípedo. Paso de cuatro tiempos, galope con
    un instante en el aire y reposo; el jinete va sentado con las piernas sobre el lomo, los pies
    en los estribos y las riendas en las manos. Caballerizo en el pueblo, montura que sigue a su
    dueño y viaja con él, montar y desmontar, el doble de velocidad y se guarda con el personaje.
    Después: animación de ocho cuadros por ciclo al caminar, correr y galopar (con las patas
    delanteras cruzadas) y el cuerpo de una criatura se revisa en un ataúd con calavera, como en
    UO. Se probó dibujar los sprites al doble de detalle con sombreado suave, pero se veía peor:
    volvió el gráfico anterior, con la animación nueva.
14. ✅ **Árboles**: siete especies que crecen por ramificación (tronco, ramas madre, ramas y
    ramitas, con las hojas en las puntas): roble de copa ancha, pino con pisos de ramas, ceibo
    retorcido con flores rojas, gomero de tronco enorme con aletones y raíces aéreas, sauce
    llorón, álamo columnar y árbol seco. Sauces y ceibos crecen en las orillas, los gomeros
    sueltos en el campo y los álamos en cortinas al costado de los caminos.
15. ✅ **El continente**: un mundo de 320×320 con nieve al norte, desierto al sur, pantanos,
    bosques, praderas, cordilleras y ríos con puentes. Tres pueblos unidos por caminos con
    carteles: Puerto Ceniza (la capital), Roca Alta (minero, entre montañas) y Junco Verde (en el
    pantano), cada uno con su gente. Lugares con nombre y sus habitantes: Campamento de los
    Colmillos (orcos), Torre Hueca (liche), Cementerio Viejo, Faro del Cabo, Refugio Helado,
    Ruinas del Sol y Paso del Cuervo. Las criaturas viven según el terreno. Mundo abierto, con
    caminos anchos y rectos (empedrados cerca de los pueblos), senderos a cada lugar y un
    **minimapa** que se abre y se cierra con la tecla M. Para probar, `/ir` lleva a un personaje
    de prueba a cualquier lugar.
16. ✅ **Cuerpos muertos**: cada criatura queda tirada en el piso con su propio cuerpo, el
    mismo modelo de cuando estaba viva: orcos, troles, esqueletos y liches de espaldas con los
    brazos abiertos y el arma en el suelo, lobos, ratas y monturas de costado, la araña panza
    arriba y el dragón desplomado con las alas caídas. Al morir se ve la caída, y el cuerpo se
    revisa con doble clic. Las criaturas nuevas tienen su cuerpo sin dibujar nada aparte.
17. ✅ **Monturas que pelean**: suelta, la montura defiende a su dueño y ataca a quien él ataque
    (el caballo y la llama patean, el lagarto muerde). Las criaturas y otros jugadores la pueden
    matar: el dueño recibe el aviso y su cuerpo queda en el piso. Con `/liberar` se la deja ir.
