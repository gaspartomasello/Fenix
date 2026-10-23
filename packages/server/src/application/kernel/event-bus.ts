/**
 * Bus de eventos tipado: un módulo avisa que algo pasó y los que se
 * suscribieron reaccionan, sin que ninguno conozca al otro. Es sincrónico y
 * respeta el orden de suscripción (el del armado de los módulos).
 */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, ((event: never) => void)[]>();

  /** Escucha un evento; devuelve cómo dejar de escucharlo. */
  on<K extends keyof Events>(type: K, listener: (event: Events[K]) => void): () => void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener as (event: never) => void);
    this.listeners.set(type, list);
    return () => {
      const current = this.listeners.get(type);
      if (current)
        this.listeners.set(
          type,
          current.filter((l) => l !== listener),
        );
    };
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    for (const listener of this.listeners.get(type) ?? [])
      (listener as (event: Events[K]) => void)(event);
  }

  /** Cuántos escuchan un evento (para las pruebas del armado). */
  listenerCount(type: keyof Events): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}
