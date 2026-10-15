import type { UIAction } from './types';

/** Each finger owns its action; changing phase clears every held input. */
export class Controls {
  private keys = new Set<string>();
  private stickPointer: number | null = null;
  private lookPointer: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private stickX = 0;
  private stickY = 0;
  yaw = 0;
  pitch = 0.62;

  constructor(private enabled: () => boolean, private action: (action: UIAction) => void) {
    document.addEventListener('pointerdown', this.down, { passive: false });
    document.addEventListener('pointermove', this.move, { passive: false });
    document.addEventListener('pointerup', this.up);
    document.addEventListener('pointercancel', this.up);
    document.addEventListener('lostpointercapture', this.up);
    document.addEventListener('keydown', this.keydown);
    document.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => this.clear());
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  vector() {
    if (!this.enabled()) return { x: 0, y: 0 };
    let x = this.stickX + Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    let y = this.stickY + Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y };
  }

  clear() {
    this.keys.clear();
    this.stickPointer = this.lookPointer = null;
    this.stickX = this.stickY = 0;
    this.drawStick();
  }

  resetCamera() { this.yaw = 0; this.pitch = 0.62; }

  private keydown = (e: KeyboardEvent) => {
    if (e.repeat && ['KeyE', 'Escape', 'KeyJ'].includes(e.code)) return;
    if (e.code === 'Escape') { e.preventDefault(); this.action('close'); return; }
    if (!this.enabled()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault(); this.keys.add(e.code);
    }
    if (e.code === 'KeyE') this.action('inspect');
    if (e.code === 'KeyJ') this.action('journal');
  };

  private down = (e: PointerEvent) => {
    if (!this.enabled() || e.button > 0) return;
    const el = e.target as HTMLElement;
    const joystick = el.closest<HTMLElement>('#joystick');
    if (joystick && this.stickPointer === null) {
      e.preventDefault(); this.stickPointer = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      this.updateStick(e); return;
    }
    if ((el.closest('#look-area') || el.id === 'world') && this.lookPointer === null) {
      e.preventDefault(); this.lookPointer = e.pointerId;
      this.lookX = e.clientX; this.lookY = e.clientY;
      el.setPointerCapture(e.pointerId);
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.enabled()) { this.clear(); return; }
    if (e.pointerId === this.stickPointer) { e.preventDefault(); this.updateStick(e); }
    if (e.pointerId === this.lookPointer) {
      e.preventDefault();
      this.yaw -= (e.clientX - this.lookX) * 0.006;
      this.pitch = Math.max(0.38, Math.min(0.88, this.pitch + (e.clientY - this.lookY) * 0.004));
      this.lookX = e.clientX; this.lookY = e.clientY;
    }
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) {
      this.stickPointer = null; this.stickX = this.stickY = 0; this.drawStick();
    }
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
  };

  private updateStick(e: PointerEvent) {
    const el = document.getElementById('joystick');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const radius = rect.width * 0.35;
    let x = (e.clientX - rect.left - rect.width / 2) / radius;
    let y = (e.clientY - rect.top - rect.height / 2) / radius;
    const distance = Math.hypot(x, y);
    if (distance > 1) { x /= distance; y /= distance; }
    this.stickX = Math.abs(x) < 0.08 ? 0 : x;
    this.stickY = Math.abs(y) < 0.08 ? 0 : y;
    this.drawStick();
  }

  private drawStick() {
    const knob = document.getElementById('joystick-knob');
    const radius = (document.getElementById('joystick')?.getBoundingClientRect().width ?? 112) * 0.28;
    if (knob) knob.style.transform = `translate(${this.stickX * radius}px, ${this.stickY * radius}px)`;
  }
}
