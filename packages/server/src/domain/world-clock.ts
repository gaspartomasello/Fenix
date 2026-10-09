import { advanceTime, DAY_LENGTH_MS, type WorldTime } from '@fenix/shared';

/** Hora del mundo: avanza con el reloj real, a la velocidad de un día del juego. */
export class WorldClock {
  private readonly start: WorldTime;

  /** @param startHour hora del juego (0–24) en el momento `startedAt`. */
  constructor(
    private readonly startedAt: number,
    startHour = 8.5,
    dayLengthMs = DAY_LENGTH_MS,
  ) {
    this.start = { dayProgress: (((startHour % 24) + 24) % 24) / 24, dayLengthMs };
  }

  timeAt(now: number): WorldTime {
    return advanceTime(this.start, now - this.startedAt);
  }
}
