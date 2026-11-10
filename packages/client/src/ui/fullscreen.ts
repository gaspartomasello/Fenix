/**
 * Pantalla completa en el celular, sin las pestañas ni la barra de la
 * dirección. Los navegadores solo la dan como respuesta a un toque: al girar
 * el celular (acostado) se intenta y, si no la dan, se pide con el próximo
 * toque en el juego. El iPhone no la tiene para páginas: ahí se juega sin
 * barras agregándolo a la pantalla de inicio (y se avisa cómo, una vez).
 */

/** ¿El navegador deja poner la página en pantalla completa? (en iPhone, no). */
export function canFullscreen(): boolean {
  return (
    typeof document.documentElement.requestFullscreen === 'function' &&
    document.fullscreenEnabled !== false
  );
}

/** ¿Se abrió como aplicación desde la pantalla de inicio? (ya no hay barras) */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function isLandscape(): boolean {
  return window.matchMedia('(orientation: landscape)').matches;
}

/** Pantalla completa y, si el navegador deja, trabada acostada. */
export async function enterFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // Sin permiso (no fue un toque, o el navegador no deja): se sigue jugando igual.
  }
}

/**
 * Con el celular acostado, pantalla completa: al girarlo se intenta, y si el
 * navegador pide un toque, se pone con el próximo (el de "Jugar", o cualquiera
 * en el juego). Si el jugador sale de pantalla completa, se respeta: vuelve
 * recién al girar de nuevo (o con "Pantalla completa" del menú).
 */
export function fullscreenOnLandscape(): void {
  if (!canFullscreen() || isStandalone()) return;
  /** Falta ponerla: se pone con el próximo toque mientras siga acostado. */
  let pending = isLandscape();
  const enter = (): void => {
    if (!pending || !isLandscape() || document.fullscreenElement) return;
    pending = false;
    void enterFullscreen().then(() => {
      // Si el navegador no la dio (no contó como toque), queda para el próximo.
      if (!document.fullscreenElement) pending = isLandscape();
    });
  };
  // Un toque (al soltar el dedo) es lo que el navegador acepta como gesto.
  document.addEventListener('pointerup', enter, { capture: true });
  window.matchMedia('(orientation: landscape)').addEventListener('change', () => {
    pending = isLandscape();
    enter();
  });
}

/** ¿Hay que contarle al jugador de iPhone cómo jugar sin barras? (una sola vez) */
export function shouldExplainHomeScreen(): boolean {
  if (canFullscreen() || isStandalone()) return false;
  try {
    if (localStorage.getItem(HOME_SCREEN_HINT_KEY)) return false;
    localStorage.setItem(HOME_SCREEN_HINT_KEY, '1');
  } catch {
    // Sin almacenamiento: se avisa igual.
  }
  return true;
}

const HOME_SCREEN_HINT_KEY = 'fenix.aviso-inicio';

export const HOME_SCREEN_HINT =
  'Para jugar sin las barras del navegador en iPhone: tocá Compartir y elegí «Agregar a inicio». Fenix queda como una aplicación, a pantalla completa.';
