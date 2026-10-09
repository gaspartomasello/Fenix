import { advanceTime, DAY_LENGTH_MS, type WorldTime } from '@fenix/shared';

/** Hora del mundo: avanza con el reloj real, a la velocidad de un día del juego. */
export class WorldClock {
  private start: WorldTime;

  /** @param startHour hora del juego (0–24) en el momento `startedAt`. */
  constructor(
    private startedAt: number,
    startHour = 8.5,
    private readonly dayLengthMs = DAY_LENGTH_MS,
  ) {
    this.start = { dayProgress: (((startHour % 24) + 24) % 24) / 24, dayLengthMs };
  }

  /** Pone el reloj en `hour` (0–24) a partir de `now`; sigue avanzando desde ahí. */
  setHour(hour: number, now: number): void {
    this.startedAt = now;
    this.start = { dayProgress: (((hour % 24) + 24) % 24) / 24, dayLengthMs: this.dayLengthMs };
  }

  timeAt(now: number): WorldTime {
    return advanceTime(this.start, now - this.startedAt);
  }
}
