import type { Clock } from '../../application/ports';

export class SystemClock implements Clock {
  now(): number {
    return performance.now();
  }
}
