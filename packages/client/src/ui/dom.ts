/** Crea un elemento con clase y atributos de forma declarativa. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [key, value] of Object.entries(props.attrs ?? {})) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

export function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * Lo que hace un botón al tocarlo o hacerle clic, también mientras otro dedo
 * maneja el joystick: con varios dedos en la pantalla, el celular (Android y
 * iPhone) no genera el "click", así que con el dedo se responde al levantarlo.
 * Con el mouse y el teclado (Enter, espacio) sigue siendo el clic de siempre.
 */
export function onPress(element: HTMLElement, handler: () => void, signal?: AbortSignal): void {
  const options: AddEventListenerOptions = signal ? { signal } : {};
  /** El dedo que apoyó en este botón (y todavía no levantó). */
  let finger: number | null = null;
  /** Para no repetir: un toque ya atendido no vale de nuevo como clic. */
  let handledAt = -Infinity;
  element.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse') finger = e.pointerId;
    },
    options,
  );
  element.addEventListener(
    'pointerup',
    (e) => {
      if (e.pointerId !== finger) return;
      finger = null;
      const rect = element.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) return;
      handledAt = performance.now();
      handler();
    },
    options,
  );
  element.addEventListener(
    'pointercancel',
    () => {
      finger = null;
    },
    options,
  );
  element.addEventListener(
    'click',
    () => {
      if (performance.now() - handledAt < 700) return;
      handler();
    },
    options,
  );
}
