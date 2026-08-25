export type ShaderQuality = 'low' | 'medium' | 'high';

export interface AccessibilitySettings {
  predatorAlertIntensity: number;
  darknessAssist: number;
  reduceParticles: boolean;
  shaderQuality: ShaderQuality;
  cameraShake: number;
  touchSensitivity: number;
  uiTextScale: number;
  colorSafeAlerts: boolean;
  motionReduce: boolean;
}

export interface AccessibilityFlags {
  reduceParticles: boolean;
  shaderQuality: ShaderQuality;
  predatorAlertIntensity: number;
  darknessAssist: number;
  cameraShake: number;
  touchSensitivity: number;
}

export interface AccessibilitySnapshot extends AccessibilitySettings {
  px: number;
  py: number;
}

export interface AccessibilitySave {
  version: number;
  settings: AccessibilitySettings;
}

export type AccessibilityListener = (snapshot: AccessibilitySettings) => void;

type NumericKey = 'predatorAlertIntensity' | 'darknessAssist' | 'cameraShake' | 'touchSensitivity' | 'uiTextScale';
type BooleanKey = 'reduceParticles' | 'colorSafeAlerts' | 'motionReduce';
type SliderDefinition = { key: NumericKey; label: string; description: string; min: number; max: number; step: number };
type BooleanDefinition = { key: BooleanKey; label: string; description: string };

const STORAGE_KEY = 'tideborn-accessibility';
const SAVE_VERSION = 1;
const PERSIST_DEBOUNCE_MS = 300;

const DEFAULTS: AccessibilitySettings = {
  predatorAlertIntensity: 1,
  darknessAssist: 0,
  reduceParticles: false,
  shaderQuality: 'high',
  cameraShake: 1,
  touchSensitivity: 1,
  uiTextScale: 1,
  colorSafeAlerts: false,
  motionReduce: false,
};

const SLIDERS: SliderDefinition[] = [
  { key: 'predatorAlertIntensity', label: 'Predator alert intensity', description: 'Strength of red predator warning pulses', min: 0, max: 1, step: 0.05 },
  { key: 'darknessAssist', label: 'Darkness assist', description: 'Brightens vibration-sense feedback in deep water', min: 0, max: 1, step: 0.05 },
  { key: 'cameraShake', label: 'Camera shake', description: 'Strength of impact and thunder screen shake', min: 0, max: 1, step: 0.05 },
  { key: 'touchSensitivity', label: 'Touch sensitivity', description: 'Touch stick response speed multiplier', min: 0.5, max: 2, step: 0.05 },
  { key: 'uiTextScale', label: 'Interface text scale', description: 'Scales the size of interface text', min: 1, max: 1.6, step: 0.05 },
];

const BOOLEANS: BooleanDefinition[] = [
  { key: 'reduceParticles', label: 'Reduce particles', description: 'Fewer bubbles, bursts, and storm particles' },
  { key: 'colorSafeAlerts', label: 'Color-safe alerts', description: 'Colorblind-friendly alert palette' },
  { key: 'motionReduce', label: 'Reduce motion', description: 'Calms ambient sway and pulsing effects' },
];

const QUALITIES: Array<{ value: ShaderQuality; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(value.toFixed(decimals));
}

export class AccessibilitySettingsSystem {
  private readonly gearButton: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly listeners = new Set<AccessibilityListener>();
  private readonly settings: AccessibilitySettings = { ...DEFAULTS };
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private open = false;

  constructor(uiRoot: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = this.buildStyles();
    document.head.appendChild(style);

    this.gearButton = document.createElement('button');
    this.gearButton.type = 'button';
    this.gearButton.className = 'tba11y-gear';
    this.gearButton.setAttribute('aria-label', 'Open accessibility settings');
    this.gearButton.setAttribute('aria-expanded', 'false');
    this.gearButton.innerHTML = '<span aria-hidden="true">⚙</span><small>A11Y</small>';
    this.gearButton.addEventListener('click', () => this.toggle());

    this.panel = document.createElement('section');
    this.panel.className = 'tba11y-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Accessibility settings');
    this.panel.hidden = true;
    this.panel.appendChild(this.buildPanelContent());

    const host = document.createElement('div');
    host.className = 'tba11y-root';
    host.appendChild(this.gearButton);
    host.appendChild(this.panel);
    uiRoot.appendChild(host);

    window.addEventListener('keydown', (event) => {
      if (!this.open || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle(false);
    }, true);

    this.loadPersisted();
    this.apply();
  }

  get<K extends keyof AccessibilitySettings>(key: K): AccessibilitySettings[K] {
    return this.settings[key];
  }

  set<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]): void {
    const next = this.validate(key, value);
    if (next === undefined || this.settings[key] === next) return;
    this.settings[key] = next;
    this.apply();
    this.notify();
    this.persistDebounced();
  }

  subscribe(listener: AccessibilityListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.settings });
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    Object.assign(this.settings, DEFAULTS);
    this.apply();
    this.notify();
    this.refreshControls();
    this.persistDebounced();
  }

  apply(): void {
    document.documentElement.style.setProperty('--tb-ui-scale', String(this.settings.uiTextScale));
    document.body.classList.toggle('tba11y-reduce-motion', this.settings.motionReduce);
    document.body.classList.toggle('tba11y-colorsafe', this.settings.colorSafeAlerts);
    document.body.classList.toggle('tba11y-low-fx', this.settings.reduceParticles || this.settings.shaderQuality !== 'high');
  }

  flags(): AccessibilityFlags {
    return {
      reduceParticles: this.settings.reduceParticles,
      shaderQuality: this.settings.shaderQuality,
      predatorAlertIntensity: this.settings.predatorAlertIntensity,
      darknessAssist: this.settings.darknessAssist,
      cameraShake: this.settings.cameraShake,
      touchSensitivity: this.settings.touchSensitivity,
    };
  }

  snapshot(px: number, py: number): AccessibilitySnapshot {
    return { ...this.settings, px, py };
  }

  serialize(): AccessibilitySave {
    return { version: SAVE_VERSION, settings: { ...this.settings } };
  }

  deserialize(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const record = value as Partial<AccessibilitySave>;
    if (record.version !== SAVE_VERSION || !record.settings || typeof record.settings !== 'object') return;
    const incoming = record.settings as Partial<AccessibilitySettings>;
    for (const definition of SLIDERS) {
      const raw = incoming[definition.key];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        this.settings[definition.key] = roundToStep(clamp(raw, definition.min, definition.max), definition.step);
      }
    }
    for (const definition of BOOLEANS) {
      const raw = incoming[definition.key];
      if (typeof raw === 'boolean') this.settings[definition.key] = raw;
    }
    if (typeof incoming.shaderQuality === 'string' && QUALITIES.some((option) => option.value === incoming.shaderQuality)) {
      this.settings.shaderQuality = incoming.shaderQuality;
    }
    this.apply();
    this.notify();
    this.refreshControls();
  }

  private validate<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]): AccessibilitySettings[K] | undefined {
    const slider = SLIDERS.find((definition) => definition.key === key);
    if (slider) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
      return roundToStep(clamp(value, slider.min, slider.max), slider.step) as AccessibilitySettings[K];
    }
    if (BOOLEANS.some((definition) => definition.key === key)) {
      if (typeof value !== 'boolean') return undefined;
      return value;
    }
    if (key === 'shaderQuality') {
      if (typeof value !== 'string' || !QUALITIES.some((option) => option.value === value)) return undefined;
      return value;
    }
    return undefined;
  }

  private notify(): void {
    const current: AccessibilitySettings = { ...this.settings };
    for (const listener of this.listeners) listener(current);
  }

  private persistDebounced(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()));
      } catch {
      }
    }, PERSIST_DEBOUNCE_MS);
  }

  private loadPersisted(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      this.deserialize(JSON.parse(raw));
    } catch {
    }
  }

  private toggle(force?: boolean): void {
    const next = force ?? !this.open;
    if (next === this.open) return;
    this.open = next;
    this.panel.hidden = !next;
    this.gearButton.setAttribute('aria-expanded', String(next));
    this.gearButton.setAttribute('aria-label', next ? 'Close accessibility settings' : 'Open accessibility settings');
    if (next) {
      requestAnimationFrame(() => this.panel.classList.add('tba11y-open'));
      this.refreshControls();
      this.panel.querySelector<HTMLElement>('input, button')?.focus();
    } else {
      this.panel.classList.remove('tba11y-open');
      this.gearButton.focus();
    }
  }

  private refreshControls(): void {
    for (const definition of SLIDERS) {
      const input = this.panel.querySelector<HTMLInputElement>(`[data-tba11y-slider="${definition.key}"]`);
      const output = this.panel.querySelector<HTMLSpanElement>(`[data-tba11y-value="${definition.key}"]`);
      if (input) input.value = String(this.settings[definition.key]);
      if (output) output.textContent = this.formatValue(definition.key, this.settings[definition.key]);
    }
    for (const definition of BOOLEANS) {
      const input = this.panel.querySelector<HTMLInputElement>(`[data-tba11y-check="${definition.key}"]`);
      if (input) input.checked = this.settings[definition.key];
    }
    for (const option of QUALITIES) {
      const button = this.panel.querySelector<HTMLButtonElement>(`[data-tba11y-quality="${option.value}"]`);
      button?.setAttribute('aria-pressed', String(this.settings.shaderQuality === option.value));
    }
  }

  private formatValue(key: NumericKey, value: number): string {
    if (key === 'touchSensitivity') return `${value.toFixed(2)}×`;
    return `${Math.round(value * 100)}%`;
  }

  private buildPanelContent(): HTMLElement {
    const wrapper = document.createElement('div');
    const rows: string[] = [];
    for (const definition of SLIDERS) {
      rows.push(`
        <div class="tba11y-row">
          <label for="tba11y-${definition.key}"><b>${definition.label}</b><small>${definition.description}</small></label>
          <div class="tba11y-slider-line">
            <input id="tba11y-${definition.key}" data-tba11y-slider="${definition.key}" type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${this.settings[definition.key]}">
            <span class="tba11y-value" data-tba11y-value="${definition.key}">${this.formatValue(definition.key, this.settings[definition.key])}</span>
          </div>
        </div>`);
    }
    const qualityButtons = QUALITIES.map((option) => `
      <button type="button" class="tba11y-segment" data-tba11y-quality="${option.value}" aria-pressed="${String(this.settings.shaderQuality === option.value)}">${option.label}</button>`).join('');
    rows.push(`
      <div class="tba11y-row">
        <span class="tba11y-static-label"><b>Shader quality</b><small>Bloom and render resolution budget</small></span>
        <div class="tba11y-segments" role="group" aria-label="Shader quality">${qualityButtons}</div>
      </div>`);
    for (const definition of BOOLEANS) {
      rows.push(`
        <div class="tba11y-row">
          <label class="tba11y-check-row" for="tba11y-${definition.key}">
            <input id="tba11y-${definition.key}" data-tba11y-check="${definition.key}" type="checkbox"${this.settings[definition.key] ? ' checked' : ''}>
            <span><b>${definition.label}</b><small>${definition.description}</small></span>
          </label>
        </div>`);
    }
    wrapper.innerHTML = `
      <header class="tba11y-head"><h2>Accessibility</h2></header>
      <div class="tba11y-body">${rows.join('')}</div>
      <footer class="tba11y-foot"><button type="button" class="tba11y-reset" data-tba11y-reset>Reset to defaults</button></footer>`;
    for (const definition of SLIDERS) {
      const input = wrapper.querySelector<HTMLInputElement>(`[data-tba11y-slider="${definition.key}"]`);
      const output = wrapper.querySelector<HTMLSpanElement>(`[data-tba11y-value="${definition.key}"]`);
      input?.addEventListener('input', () => {
        const value = Number(input.value);
        this.set(definition.key, value);
        if (output) output.textContent = this.formatValue(definition.key, value);
      });
    }
    for (const option of QUALITIES) {
      wrapper.querySelector(`[data-tba11y-quality="${option.value}"]`)?.addEventListener('click', () => {
        this.set('shaderQuality', option.value);
        for (const inner of QUALITIES) {
          wrapper.querySelector(`[data-tba11y-quality="${inner.value}"]`)?.setAttribute('aria-pressed', String(inner.value === option.value));
        }
      });
    }
    for (const definition of BOOLEANS) {
      wrapper.querySelector(`[data-tba11y-check="${definition.key}"]`)?.addEventListener('change', (event) => {
        this.set(definition.key, (event.target as HTMLInputElement).checked);
      });
    }
    wrapper.querySelector('[data-tba11y-reset]')?.addEventListener('click', () => this.reset());
    return wrapper;
  }

  private buildStyles(): string {
    return `
.tba11y-root { position: absolute; inset: 0; pointer-events: none; z-index: 12; font-family: inherit; }
.tba11y-root > * { pointer-events: auto; }
.tba11y-gear { position: absolute; top: 250px; right: 20px; display: grid; grid-template-columns: auto auto; align-items: center; gap: 3px 6px; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(120, 220, 255, .28); background: rgba(6, 22, 27, .82); color: #cfeef7; cursor: pointer; backdrop-filter: blur(6px); }
.tba11y-gear > span { font-size: 16px; line-height: 1; }
.tba11y-gear > small { color: rgba(207, 238, 247, .55); font: 700 8px/1 ui-monospace, monospace; letter-spacing: .14em; }
.tba11y-gear:hover, .tba11y-gear:focus-visible { border-color: rgba(140, 235, 255, .55); outline: none; box-shadow: 0 0 16px rgba(80, 200, 255, .18); }
.tba11y-panel { position: absolute; top: 250px; right: 20px; width: min(320px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 270px)); overflow-y: auto; padding: 0; border-radius: 14px; border: 1px solid rgba(120, 220, 255, .3); background: rgba(4, 16, 21, .94); color: #d9f3fb; transform: translateX(16px); opacity: 0; transition: transform .22s ease, opacity .22s ease; box-shadow: 0 18px 48px rgba(0, 0, 0, .5); }
.tba11y-panel.tba11y-open { transform: translateX(0); opacity: 1; }
.tba11y-head { position: sticky; top: 0; padding: 13px 16px 9px; background: linear-gradient(rgba(4, 16, 21, .98), rgba(4, 16, 21, .86)); border-bottom: 1px solid rgba(120, 220, 255, .16); }
.tba11y-head h2 { margin: 0; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
.tba11y-body { display: grid; gap: 2px; padding: 8px 16px 12px; }
.tba11y-row { display: grid; gap: 6px; padding: 9px 0; border-bottom: 1px solid rgba(120, 220, 255, .08); }
.tba11y-row:last-child { border-bottom: 0; }
.tba11y-row label, .tba11y-static-label { display: grid; gap: 2px; }
.tba11y-row b { font-size: 12px; }
.tba11y-row small { color: rgba(217, 243, 251, .52); font-size: 10px; line-height: 1.35; }
.tba11y-slider-line { display: flex; align-items: center; gap: 10px; }
.tba11y-slider-line input[type=range] { flex: 1; accent-color: #58d5f2; cursor: pointer; }
.tba11y-value { min-width: 42px; text-align: right; font: 700 11px/1 ui-monospace, monospace; color: #8fe6ff; }
.tba11y-segments { display: flex; gap: 6px; }
.tba11y-segment { flex: 1; padding: 7px 4px; border-radius: 9px; border: 1px solid rgba(120, 220, 255, .26); background: transparent; color: rgba(217, 243, 251, .75); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.tba11y-segment[aria-pressed="true"] { background: rgba(88, 213, 242, .18); border-color: rgba(140, 235, 255, .65); color: #eafaff; }
.tba11y-segment:hover, .tba11y-segment:focus-visible { border-color: rgba(140, 235, 255, .55); outline: none; }
.tba11y-check-row { display: flex !important; align-items: center; gap: 10px; cursor: pointer; }
.tba11y-check-row input { width: 16px; height: 16px; accent-color: #58d5f2; cursor: pointer; }
.tba11y-foot { position: sticky; bottom: 0; padding: 10px 16px 13px; background: linear-gradient(rgba(4, 16, 21, .86), rgba(4, 16, 21, .98)); border-top: 1px solid rgba(120, 220, 255, .16); }
.tba11y-reset { width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(120, 220, 255, .3); background: rgba(88, 213, 242, .1); color: #d9f3fb; font-family: inherit; font-size: 11px; font-weight: 700; letter-spacing: .05em; cursor: pointer; }
.tba11y-reset:hover, .tba11y-reset:focus-visible { background: rgba(88, 213, 242, .2); outline: none; }
@media (max-width: 700px), (pointer: coarse) {
  .tba11y-gear { top: 64px; right: 8px; padding: 6px 8px; }
  .tba11y-panel { top: 64px; right: 8px; max-height: calc(100vh - 84px); }
}
body.tba11y-reduce-motion *, body.tba11y-reduce-motion *::before, body.tba11y-reduce-motion *::after { animation-duration: .001s !important; animation-iteration-count: 1 !important; transition-duration: .001s !important; scroll-behavior: auto !important; }
body.tba11y-low-fx .tba11y-panel { box-shadow: none; backdrop-filter: none; }
body.tba11y-reduce-motion .tba11y-panel { transition: none; }
html { --tb-ui-scale: 1; }
`;
  }
}
