// Solmar — keyboard and mouse input. Keys are read by code (KeyW, KeyE, ...),
// the mouse steers the third-person camera: click the canvas to lock the
// pointer, and drag to look around when the pointer is not locked (so the
// game still plays in a headless browser or a window without pointer lock).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.clicked = false;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      } else if (this._dragging) {
        this.mouseDX += e.clientX - this._lastX;
        this.mouseDY += e.clientY - this._lastY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.clicked = true;
      this.mouseDown = true;
      if (e.button === 0 && !this.locked) {
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this._dragging = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  /** True while any of the given codes is held. */
  any(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Mouse movement since the last call, in pixels, then cleared. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** A click since the last call, then cleared. */
  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  lockPointer() {
    try {
      this.canvas.requestPointerLock();
    } catch (err) {
      /* Pointer lock is a nicety; dragging still works without it. */
    }
  }

  unlockPointer() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (err) {
      /* Nothing to unlock. */
    }
  }
}
