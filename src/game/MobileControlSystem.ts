export interface PortraitCameraRecommendation {
  /** A slightly taller view keeps the octopus above the touch deck. */
  viewHeightM: number;
  /** Portion of the viewport covered by controls, measured from the bottom. */
  controlOcclusion: number;
  /** Suggested upward screen-space focus shift, as a fraction of view height. */
  focusBiasY: number;
}

export interface MobileLayoutSnapshot {
  active: boolean;
  portrait: boolean;
  width: number;
  height: number;
  coarsePointer: boolean;
  camera: PortraitCameraRecommendation;
}

export interface MobileControlSnapshot extends MobileLayoutSnapshot {
  movement: { x: number; y: number; active: boolean };
  aim: { x: number; y: number; digging: boolean };
  heldActions: string[];
}

export interface MobileControlOptions {
  onLayoutChange?: (layout: MobileLayoutSnapshot) => void;
  moveSensitivity?: number;
}

type DirectionKey = 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS';

/**
 * Reusable portrait touch input adapter.
 *
 * Tideborn's current controller consumes keyboard and canvas pointer events,
 * so this utility synthesizes those inputs for immediate compatibility. It
 * also emits richer `tideborn:mobile-move`, `tideborn:mobile-aim`, and
 * `tideborn:mobile-layout` events so a later analog controller/camera can use
 * the same UI without changing it.
 */
export class MobileControlSystem {
  readonly element: HTMLElement;

  private readonly portraitQuery = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
  private readonly coarseQuery = window.matchMedia('(pointer: coarse)');
  private readonly heldKeys = new Set<string>();
  private readonly directionKeys = new Set<DirectionKey>();
  private readonly abort = new AbortController();
  private readonly options: MobileControlOptions;
  private movePointer: number | null = null;
  private aimPointer: number | null = null;
  private moveX = 0;
  private moveY = 0;
  private aimX = 1;
  private aimY = 0;
  private digging = false;
  private moveSensitivity = 1;

  constructor(private readonly root: HTMLElement, options: MobileControlOptions = {}) {
    this.options = options;
    this.moveSensitivity = Math.max(0.4, Math.min(2.5, options.moveSensitivity ?? 1));
    this.element = document.createElement('section');
    this.element.className = 'mobile-controls';
    this.element.setAttribute('aria-label', 'Portrait touch controls');
    this.element.innerHTML = `
      <div class="mobile-hotbar-caption" aria-hidden="true">TAP A TOOL TO EQUIP</div>
      <div class="mobile-action-bank" aria-label="Octopus abilities">
        ${this.actionButton('jet', 'JET', 'ShiftLeft', 'Jet burst')}
        ${this.actionButton('grab', 'GRAB', 'KeyE', 'Grab, gather, or pry')}
        ${this.actionButton('grip', 'GRIP', 'KeyG', 'Hold to grip a surface', true)}
        ${this.actionButton('camo', 'CAMO', 'KeyC', 'Toggle camouflage')}
        ${this.actionButton('interact', 'USE', 'KeyV', 'Place or use the equipped object')}
        ${this.actionButton('craft', 'CRAFT', 'KeyI', 'Open crafting')}
        ${this.actionButton('heal', 'HEAL', 'KeyU', 'Use a stored vent tonic')}
        ${this.actionButton('reset', 'RESET', 'F10', 'Restart the current session')}
      </div>
      <div class="mobile-stick" data-mobile-stick aria-label="Movement control">
        <div class="mobile-stick-rim"><span class="mobile-stick-knob"></span></div>
        <small>MOVE</small>
      </div>
      <div class="mobile-aim" data-mobile-aim aria-label="Aim and dig control">
        <div class="mobile-aim-rim"><i></i><span class="mobile-aim-knob"></span></div>
        <small>AIM · DIG</small>
      </div>`;
    this.root.appendChild(this.element);
    this.root.classList.add('has-mobile-controls');

    this.bindMovement();
    this.bindAim();
    this.bindActions();
    this.bindLifecycle();
    this.syncLayout();
  }

  snapshot(): MobileControlSnapshot {
    return {
      ...this.layoutSnapshot(),
      movement: {
        x: Number(this.moveX.toFixed(3)),
        y: Number(this.moveY.toFixed(3)),
        active: this.movePointer !== null,
      },
      aim: {
        x: Number(this.aimX.toFixed(3)),
        y: Number(this.aimY.toFixed(3)),
        digging: this.digging,
      },
      heldActions: [...this.heldKeys].sort(),
    };
  }

  destroy(): void {
    this.releaseAll();
    this.abort.abort();
    this.element.remove();
    this.root.classList.remove('has-mobile-controls');
  }

  setMoveSensitivity(value: number): void {
    this.moveSensitivity = Math.max(0.4, Math.min(2.5, value));
  }

  private actionButton(action: string, label: string, code: string, description: string, hold = false): string {
    return `<button class="mobile-action mobile-action--${action}" data-mobile-action="${action}" data-key-code="${code}" data-hold="${hold}" aria-label="${description}"><b>${label}</b><small>${hold ? 'HOLD' : description}</small></button>`;
  }

  private bindMovement(): void {
    const zone = this.element.querySelector<HTMLElement>('[data-mobile-stick]')!;
    const knob = zone.querySelector<HTMLElement>('.mobile-stick-knob')!;
    const update = (event: PointerEvent): void => {
      if (event.pointerId !== this.movePointer) return;
      const rect = zone.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
      let x = (event.clientX - (rect.left + rect.width / 2)) / radius;
      let y = (event.clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      if (length > 0.001) {
        const scaled = length * this.moveSensitivity;
        x = x / length * Math.min(1, scaled);
        y = y / length * Math.min(1, scaled);
      }
      this.moveX = x;
      this.moveY = -y;
      knob.style.transform = `translate(${(x * radius).toFixed(1)}px, ${(y * radius).toFixed(1)}px)`;
      this.applyMovementKeys();
      this.emit('tideborn:mobile-move', { x: this.moveX, y: this.moveY, active: true });
    };

    zone.addEventListener('pointerdown', (event) => {
      if (this.movePointer !== null) return;
      event.preventDefault();
      event.stopPropagation();
      this.movePointer = event.pointerId;
      zone.setPointerCapture(event.pointerId);
      zone.classList.add('active');
      update(event);
    }, { signal: this.abort.signal });
    zone.addEventListener('pointermove', update, { signal: this.abort.signal });
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== this.movePointer) return;
      event.preventDefault();
      event.stopPropagation();
      this.movePointer = null;
      this.moveX = 0;
      this.moveY = 0;
      knob.style.transform = '';
      zone.classList.remove('active');
      this.applyMovementKeys();
      this.emit('tideborn:mobile-move', { x: 0, y: 0, active: false });
    };
    zone.addEventListener('pointerup', release, { signal: this.abort.signal });
    zone.addEventListener('pointercancel', release, { signal: this.abort.signal });
    zone.addEventListener('lostpointercapture', release, { signal: this.abort.signal });
  }

  private bindAim(): void {
    const zone = this.element.querySelector<HTMLElement>('[data-mobile-aim]')!;
    const knob = zone.querySelector<HTMLElement>('.mobile-aim-knob')!;
    const update = (event: PointerEvent, begin = false): void => {
      if (event.pointerId !== this.aimPointer) return;
      const rect = zone.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
      let x = (event.clientX - (rect.left + rect.width / 2)) / radius;
      let y = (event.clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      if (Math.hypot(x, y) > 0.12) {
        this.aimX = x;
        this.aimY = y;
      }
      knob.style.transform = `translate(${(this.aimX * radius).toFixed(1)}px, ${(this.aimY * radius).toFixed(1)}px)`;
      const point = this.aimCanvasPoint(this.aimX, this.aimY);
      this.dispatchCanvasPointer(begin ? 'pointerdown' : 'pointermove', point.x, point.y, event.pointerId, 0, 1);
      this.emit('tideborn:mobile-aim', { x: this.aimX, y: -this.aimY, digging: true });
    };

    zone.addEventListener('pointerdown', (event) => {
      if (this.aimPointer !== null) return;
      event.preventDefault();
      event.stopPropagation();
      this.aimPointer = event.pointerId;
      this.digging = true;
      zone.setPointerCapture(event.pointerId);
      zone.classList.add('active');
      update(event, true);
    }, { signal: this.abort.signal });
    zone.addEventListener('pointermove', (event) => update(event), { signal: this.abort.signal });
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== this.aimPointer) return;
      event.preventDefault();
      event.stopPropagation();
      const point = this.aimCanvasPoint(this.aimX, this.aimY);
      this.dispatchWindowPointerUp(point.x, point.y, event.pointerId);
      this.aimPointer = null;
      this.digging = false;
      knob.style.transform = '';
      zone.classList.remove('active');
      this.emit('tideborn:mobile-aim', { x: this.aimX, y: -this.aimY, digging: false });
    };
    zone.addEventListener('pointerup', release, { signal: this.abort.signal });
    zone.addEventListener('pointercancel', release, { signal: this.abort.signal });
    zone.addEventListener('lostpointercapture', release, { signal: this.abort.signal });
  }

  private bindActions(): void {
    this.element.querySelectorAll<HTMLButtonElement>('[data-mobile-action]').forEach((button) => {
      const code = button.dataset.keyCode!;
      const press = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture(event.pointerId);
        button.classList.add('active');
        this.pressKey(code);
      };
      const release = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        button.classList.remove('active');
        this.releaseKey(code);
      };
      button.addEventListener('pointerdown', press, { signal: this.abort.signal });
      button.addEventListener('pointerup', release, { signal: this.abort.signal });
      button.addEventListener('pointercancel', release, { signal: this.abort.signal });
      button.addEventListener('lostpointercapture', release, { signal: this.abort.signal });
    });
  }

  private bindLifecycle(): void {
    const sync = () => this.syncLayout();
    window.addEventListener('resize', sync, { signal: this.abort.signal });
    window.addEventListener('orientationchange', sync, { signal: this.abort.signal });
    window.addEventListener('blur', () => this.releaseAll(), { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    }, { signal: this.abort.signal });
  }

  private applyMovementKeys(): void {
    const threshold = 0.24;
    const desired = new Set<DirectionKey>();
    if (this.moveX < -threshold) desired.add('KeyA');
    if (this.moveX > threshold) desired.add('KeyD');
    if (this.moveY > threshold) desired.add('KeyW');
    if (this.moveY < -threshold) desired.add('KeyS');
    for (const key of this.directionKeys) if (!desired.has(key)) this.releaseKey(key);
    for (const key of desired) if (!this.directionKeys.has(key)) this.pressKey(key);
    this.directionKeys.clear();
    for (const key of desired) this.directionKeys.add(key);
  }

  private pressKey(code: string): void {
    if (this.heldKeys.has(code)) return;
    this.heldKeys.add(code);
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: this.keyForCode(code), bubbles: true }));
  }

  private releaseKey(code: string): void {
    if (!this.heldKeys.delete(code)) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: this.keyForCode(code), bubbles: true }));
  }

  private keyForCode(code: string): string {
    if (code === 'ShiftLeft') return 'Shift';
    if (code === 'Enter') return 'Enter';
    return code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  }

  private aimCanvasPoint(directionX: number, directionY: number): { x: number; y: number } {
    const canvas = this.root.querySelector<HTMLCanvasElement>('canvas');
    const rect = canvas?.getBoundingClientRect() ?? this.root.getBoundingClientRect();
    return {
      x: rect.left + rect.width * (0.5 + directionX * 0.34),
      y: rect.top + rect.height * (0.46 + directionY * 0.3),
    };
  }

  private dispatchCanvasPointer(type: 'pointerdown' | 'pointermove', x: number, y: number, pointerId: number, button: number, buttons: number): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return;
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary: false,
      clientX: x, clientY: y, button, buttons,
    }));
  }

  private dispatchWindowPointerUp(x: number, y: number, pointerId: number): void {
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary: false,
      clientX: x, clientY: y, button: 0, buttons: 0,
    }));
  }

  private releaseAll(): void {
    for (const key of [...this.heldKeys]) this.releaseKey(key);
    if (this.digging) {
      const point = this.aimCanvasPoint(this.aimX, this.aimY);
      this.dispatchWindowPointerUp(point.x, point.y, this.aimPointer ?? 97);
    }
    this.directionKeys.clear();
    this.movePointer = null;
    this.aimPointer = null;
    this.moveX = 0;
    this.moveY = 0;
    this.digging = false;
    this.element.querySelectorAll('.active').forEach((node) => node.classList.remove('active'));
    this.element.querySelectorAll<HTMLElement>('.mobile-stick-knob, .mobile-aim-knob').forEach((node) => { node.style.transform = ''; });
  }

  private layoutSnapshot(): MobileLayoutSnapshot {
    const portrait = window.innerHeight > window.innerWidth;
    const active = this.portraitQuery.matches;
    return {
      active,
      portrait,
      width: window.innerWidth,
      height: window.innerHeight,
      coarsePointer: this.coarseQuery.matches,
      camera: {
        viewHeightM: active ? 20 : 18,
        controlOcclusion: active ? 0.3 : 0,
        focusBiasY: active ? 0.08 : 0,
      },
    };
  }

  private syncLayout(): void {
    const layout = this.layoutSnapshot();
    this.root.dataset.mobileLayout = layout.active ? 'portrait' : 'desktop';
    this.options.onLayoutChange?.(layout);
    this.emit('tideborn:mobile-layout', layout);
  }

  private emit<T>(name: string, detail: T): void {
    this.root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}
