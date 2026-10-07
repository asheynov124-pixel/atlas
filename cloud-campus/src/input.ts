/** Keyboard + mouse state. `hit()` is true only on the frame a key went down. */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouse = { x: window.innerWidth / 2 + 120, y: window.innerHeight / 2, l: false, r: false, lHit: false, rHit: false };

  constructor(canvas: HTMLCanvasElement) {
    const swallow = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);
    window.addEventListener('keydown', (e) => {
      if (swallow.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.l = this.mouse.r = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (e.button === 0) { this.mouse.l = true; this.mouse.lHit = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rHit = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  hit(...codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.lHit = this.mouse.rHit = false;
  }
}
