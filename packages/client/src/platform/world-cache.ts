/**
 * El mundo del modo solo, guardado en el navegador (IndexedDB) para no
 * generarlo cada vez que se entra. Se guarda uno solo: el de esta versión del
 * juego. Si el navegador no deja guardar (ventana privada, sin espacio), el
 * juego anda igual: solo tarda más al entrar.
 */
const DB_NAME = 'fenix-mundo';
const STORE = 'planos';
const KEY = 'actual';

interface Stored {
  readonly key: string;
  readonly value: unknown;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
  });
}

/** El mundo guardado con esta clave, o null si no hay (o es de otra versión). */
export async function loadWorld(key: string): Promise<unknown> {
  try {
    const db = await open();
    const stored = await new Promise<Stored | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as Stored | undefined);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
    });
    db.close();
    return stored && stored.key === key ? stored.value : null;
  } catch {
    return null;
  }
}

/** Guarda el mundo (reemplaza al de antes). Si no se puede, no pasa nada. */
export async function saveWorld(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value } satisfies Stored, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
    });
    db.close();
  } catch {
    // Sin lugar para guardar: la próxima vez se vuelve a generar.
  }
}
