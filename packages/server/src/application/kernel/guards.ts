/**
 * Reglas que cualquier módulo puede sumar para negar algo (por ejemplo, los
 * barcos no dejan caminar fuera de la cubierta). La primera que niega, con
 * su motivo, gana; si ninguna niega, se permite.
 */
export class Guards<Args extends unknown[]> {
  private readonly rules: ((...args: Args) => string | null)[] = [];

  add(rule: (...args: Args) => string | null): void {
    this.rules.push(rule);
  }

  /** Por qué no se puede (o null si se puede). */
  refusal(...args: Args): string | null {
    for (const rule of this.rules) {
      const reason = rule(...args);
      if (reason) return reason;
    }
    return null;
  }
}
