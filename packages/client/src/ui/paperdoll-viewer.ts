import { GameWindow } from './game-window';
import { PaperdollView, type PaperdollIdentity, type PaperdollLook } from './paperdoll-view';

/**
 * Ventana para mirar a otra persona o a alguien del pueblo (doble clic sobre
 * ella): su personaje y lo que tiene puesto, sin poder tocar nada. Su mochila,
 * al costado: tocarla es fisgonearla (con la habilidad Fisgonear).
 */
export class PaperdollViewer {
  readonly window: GameWindow;
  private readonly view: PaperdollView;
  /** De quién es la ventana abierta, para actualizarla si cambia su equipo. */
  private shownId: string | null = null;

  constructor(snoop: (id: string) => void) {
    this.view = new PaperdollView(null, [], {
      label: 'Fisgonear su mochila',
      onPress: () => {
        if (this.shownId) snoop(this.shownId);
      },
    });
    this.window = new GameWindow('personaje-ajeno', 'Personaje', { x: 120, y: 120 });
    this.window.body.append(this.view.element);
  }

  get showing(): string | null {
    return this.window.visible ? this.shownId : null;
  }

  show(id: string, look: PaperdollLook, identity: PaperdollIdentity): void {
    this.shownId = id;
    this.window.setTitle(identity.name);
    this.view.render(look);
    this.view.setIdentity(identity);
    this.window.show();
  }
}
