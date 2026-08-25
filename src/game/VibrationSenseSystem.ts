import * as THREE from 'three';
import { MaterialId } from './data';

export interface VibrationSenseContext {
  px: number;
  py: number;
  vx: number;
  vy: number;
  darkness: number;
  hasBiolight: boolean;
  gripping: boolean;
  jetImpulse: number;
}

export interface VibrationSenseSnapshot {
  active: boolean;
  ringCount: number;
  revealedSegments: number;
  nearbySegments: number;
  speedFactor: number;
  riskHint: string;
}

export interface VibrationSenseSave {
  enabled: boolean;
  assist: number;
}

const MAX_SEGMENTS = 260;
const MAX_RINGS = 48;
const SEGMENT_HALF_LENGTH = 0.22;
const PATCH_SEGMENT_HALF_LENGTH = 0.19;
const ARC_STEP_M = 0.35;
const MOTION_RING_SPEED = 6;
const MOTION_RING_RADIUS = 5.6;
const MOTION_MIN_INTERVAL = 0.28;
const JET_RING_SPEED = 8.6;
const JET_RING_RADIUS = 4.5;
const JET_TWIN_DELAY = 0.085;
const JET_TRIGGER = 0.85;
const PATCH_RADIUS = 1.6;
const PATCH_RAY_STEP = 0.27;
const PATCH_INTERVAL = 0.26;
const PATCH_SEGMENT_LIFE = 0.55;
const GRIP_MEMORY = 0.65;
const PULSE_MEMORY = 1.35;
const DARKNESS_THRESHOLD = 0.55;
const MOTION_MIN_SPEED = 0.7;
const CRAWL_MAX_SPEED = 0.6;
const BLIND_SPEED_FACTOR = 0.62;
const COLOR_R = 0.3;
const COLOR_G = 0.92;
const COLOR_B = 0.83;

export class VibrationSenseSystem {
  enabled = true;

  private readonly sampleMaterial: (x: number, y: number) => number;
  private readonly lines: THREE.LineSegments;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly slotLife = new Float32Array(MAX_SEGMENTS);
  private readonly slotFade = new Float32Array(MAX_SEGMENTS);
  private readonly slotGain = new Float32Array(MAX_SEGMENTS);
  private readonly slotX0 = new Float32Array(MAX_SEGMENTS);
  private readonly slotY0 = new Float32Array(MAX_SEGMENTS);
  private readonly slotX1 = new Float32Array(MAX_SEGMENTS);
  private readonly slotY1 = new Float32Array(MAX_SEGMENTS);
  private readonly ringActive = new Uint8Array(MAX_RINGS);
  private readonly ringX = new Float32Array(MAX_RINGS);
  private readonly ringY = new Float32Array(MAX_RINGS);
  private readonly ringRadius = new Float32Array(MAX_RINGS);
  private readonly ringLife = new Float32Array(MAX_RINGS);
  private readonly ringMaxRadius = new Float32Array(MAX_RINGS);
  private readonly ringSpeed = new Float32Array(MAX_RINGS);
  private readonly ringGain = new Float32Array(MAX_RINGS);
  private readonly ringDelay = new Float32Array(MAX_RINGS);
  private readonly ringLastCell = new Int32Array(MAX_RINGS);
  private readonly ringLastSlot = new Int32Array(MAX_RINGS);
  private slotCursor = 0;
  private ringCursor = 0;
  private liveSegments = 0;
  private liveRings = 0;
  private motionCooldown = 0;
  private patchCooldown = 0;
  private gripMemory = 0;
  private pulseMemory = 0;
  private patchPhase = 0;
  private assistMultiplier = 1;
  private active = false;
  private speedFactor = 1;
  private riskHint = '';

  constructor(scene: THREE.Scene, sampleMaterial: (x: number, y: number) => number) {
    this.sampleMaterial = sampleMaterial;
    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('color', this.colorAttr);
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 42;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  assist(amount01: number): void {
    this.assistMultiplier = Math.min(2, Math.max(0, amount01));
  }

  serialize(): VibrationSenseSave {
    return { enabled: this.enabled, assist: this.assistMultiplier };
  }

  deserialize(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const record = value as Partial<VibrationSenseSave>;
    if (typeof record.enabled === 'boolean') this.enabled = record.enabled;
    if (typeof record.assist === 'number') this.assist(record.assist);
  }

  snapshot(px: number, py: number): VibrationSenseSnapshot {
    let nearby = 0;
    for (let i = 0; i < MAX_SEGMENTS; i += 1) {
      if (this.slotLife[i] <= 0) continue;
      const mx = (this.slotX0[i] + this.slotX1[i]) * 0.5;
      const my = (this.slotY0[i] + this.slotY1[i]) * 0.5;
      if ((mx - px) * (mx - px) + (my - py) * (my - py) <= 9) nearby += 1;
    }
    return {
      active: this.active,
      ringCount: this.liveRings,
      revealedSegments: this.liveSegments,
      nearbySegments: nearby,
      speedFactor: this.speedFactor,
      riskHint: this.riskHint,
    };
  }

  update(rawDt: number, ctx: VibrationSenseContext): number {
    const dt = Math.min(0.12, Math.max(0, rawDt));
    this.active = this.enabled && !ctx.hasBiolight && ctx.darkness > DARKNESS_THRESHOLD;
    this.speedFactor = this.active ? BLIND_SPEED_FACTOR : 1;
    const speed = Math.hypot(ctx.vx, ctx.vy);
    this.motionCooldown -= dt;
    this.patchCooldown -= dt;
    this.pulseMemory -= dt;
    if (ctx.gripping) this.gripMemory = GRIP_MEMORY;
    else this.gripMemory -= dt;

    if (this.active) {
      if (ctx.jetImpulse >= JET_TRIGGER) {
        this.emitJetPulse(ctx.px, ctx.py);
        this.motionCooldown = MOTION_MIN_INTERVAL;
        this.pulseMemory = PULSE_MEMORY;
      } else if (speed > MOTION_MIN_SPEED && this.motionCooldown <= 0) {
        this.emitMotionRing(ctx.px, ctx.py);
        this.motionCooldown = MOTION_MIN_INTERVAL;
        this.pulseMemory = PULSE_MEMORY;
      }
      const crawling = ctx.gripping || (this.gripMemory > 0 && speed < CRAWL_MAX_SPEED);
      if (crawling && this.patchCooldown <= 0) {
        this.emitContactPatch(ctx.px, ctx.py);
        this.patchCooldown = PATCH_INTERVAL;
        this.pulseMemory = Math.max(this.pulseMemory, 0.35);
      }
    }

    this.riskHint = this.active && this.pulseMemory <= 0 ? 'Blind crawl — vibrations only' : '';
    this.stepRings(dt);
    this.refreshVisuals(dt);
    return this.speedFactor;
  }

  private emitMotionRing(px: number, py: number): void {
    this.startRing(px, py, 0, MOTION_RING_RADIUS, MOTION_RING_SPEED, 0, 1);
  }

  private emitJetPulse(px: number, py: number): void {
    this.startRing(px, py, 0, JET_RING_RADIUS, JET_RING_SPEED, 0, 1.3);
    this.startRing(px, py, JET_TWIN_DELAY, JET_RING_RADIUS, JET_RING_SPEED, 0, 1.15);
  }

  private startRing(
    px: number,
    py: number,
    delay: number,
    maxRadius: number,
    speed: number,
    startRadius: number,
    gain: number,
  ): void {
    const r = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    this.ringActive[r] = 1;
    this.ringX[r] = px;
    this.ringY[r] = py;
    this.ringRadius[r] = startRadius;
    this.ringMaxRadius[r] = maxRadius;
    this.ringSpeed[r] = speed;
    this.ringGain[r] = gain;
    this.ringDelay[r] = delay;
    this.ringLife[r] = (maxRadius - startRadius) / speed;
    this.ringLastCell[r] = -1;
    this.ringLastSlot[r] = -1;
  }

  private stepRings(dt: number): void {
    this.liveRings = 0;
    for (let r = 0; r < MAX_RINGS; r += 1) {
      if (this.ringActive[r] === 0) continue;
      if (this.ringDelay[r] > 0) {
        this.ringDelay[r] -= dt;
        this.liveRings += 1;
        continue;
      }
      this.ringRadius[r] += this.ringSpeed[r] * dt;
      this.ringLife[r] -= dt;
      if (this.ringLife[r] <= 0 || this.ringRadius[r] >= this.ringMaxRadius[r]) {
        this.ringActive[r] = 0;
        continue;
      }
      this.sampleRing(r);
      this.liveRings += 1;
    }
  }

  private sampleRing(r: number): void {
    const radius = this.ringRadius[r];
    const circumference = Math.PI * 2 * radius;
    const samples = Math.min(180, Math.max(12, Math.ceil(circumference / ARC_STEP_M)));
    const inner = Math.max(0.08, radius - 0.16);
    const cx = this.ringX[r];
    const cy = this.ringY[r];
    const life = this.ringLife[r];
    const gain = this.ringGain[r];
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const solidInner = this.isOpaque(this.sampleMaterial(cx + dx * inner, cy + dy * inner));
      const solidOuter = this.isOpaque(this.sampleMaterial(cx + dx * radius, cy + dy * radius));
      if (solidInner === solidOuter) continue;
      const mx = cx + dx * (inner + radius) * 0.5;
      const my = cy + dy * (inner + radius) * 0.5;
      const tx = -dy;
      const ty = dx;
      const cellKey = Math.floor(mx * 2) * 46337 + Math.floor(my * 2);
      if (cellKey === this.ringLastCell[r] && this.ringLastSlot[r] >= 0 && this.slotLife[this.ringLastSlot[r]] > 0) {
        this.extendSlot(this.ringLastSlot[r], mx, my, tx, ty);
        continue;
      }
      const slot = this.spawnSegment(
        mx - tx * SEGMENT_HALF_LENGTH,
        my - ty * SEGMENT_HALF_LENGTH,
        mx + tx * SEGMENT_HALF_LENGTH,
        my + ty * SEGMENT_HALF_LENGTH,
        life,
        gain,
      );
      this.ringLastCell[r] = cellKey;
      this.ringLastSlot[r] = slot;
    }
  }

  private emitContactPatch(px: number, py: number): void {
    this.patchPhase += 0.41;
    const rays = 22;
    let wasSolid = this.isOpaque(this.sampleMaterial(px, py));
    for (let i = 0; i < rays; i += 1) {
      const angle = (i / rays) * Math.PI * 2 + this.patchPhase;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      wasSolid = this.isOpaque(this.sampleMaterial(px, py));
      for (let d = 0.42; d <= PATCH_RADIUS; d += PATCH_RAY_STEP) {
        const solidHere = this.isOpaque(this.sampleMaterial(px + dx * d, py + dy * d));
        if (solidHere !== wasSolid) {
          const mx = px + dx * (d - PATCH_RAY_STEP * 0.5);
          const my = py + dy * (d - PATCH_RAY_STEP * 0.5);
          const tx = -dy;
          const ty = dx;
          this.spawnSegment(
            mx - tx * PATCH_SEGMENT_HALF_LENGTH,
            my - ty * PATCH_SEGMENT_HALF_LENGTH,
            mx + tx * PATCH_SEGMENT_HALF_LENGTH,
            my + ty * PATCH_SEGMENT_HALF_LENGTH,
            PATCH_SEGMENT_LIFE,
            0.5,
          );
          break;
        }
        wasSolid = solidHere;
      }
    }
  }

  private spawnSegment(x0: number, y0: number, x1: number, y1: number, life: number, gain: number): number {
    const slot = this.slotCursor;
    this.slotCursor = (this.slotCursor + 1) % MAX_SEGMENTS;
    this.slotX0[slot] = x0;
    this.slotY0[slot] = y0;
    this.slotX1[slot] = x1;
    this.slotY1[slot] = y1;
    this.slotLife[slot] = life;
    this.slotFade[slot] = life;
    this.slotGain[slot] = gain;
    return slot;
  }

  private extendSlot(slot: number, mx: number, my: number, tx: number, ty: number): void {
    this.slotX1[slot] = mx + tx * SEGMENT_HALF_LENGTH;
    this.slotY1[slot] = my + ty * SEGMENT_HALF_LENGTH;
  }

  private refreshVisuals(dt: number): void {
    const pos = this.positionAttr.array as Float32Array;
    const col = this.colorAttr.array as Float32Array;
    let live = 0;
    for (let i = 0; i < MAX_SEGMENTS; i += 1) {
      if (this.slotLife[i] <= 0) continue;
      this.slotLife[i] -= dt;
      if (this.slotLife[i] <= 0) continue;
      const fade = this.slotLife[i] / this.slotFade[i];
      const brightness = fade * (0.35 + 0.65 * fade) * this.slotGain[i] * this.assistMultiplier;
      const p = live * 6;
      pos[p] = this.slotX0[i];
      pos[p + 1] = this.slotY0[i];
      pos[p + 2] = 0;
      pos[p + 3] = this.slotX1[i];
      pos[p + 4] = this.slotY1[i];
      pos[p + 5] = 0;
      col[p] = COLOR_R * brightness;
      col[p + 1] = COLOR_G * brightness;
      col[p + 2] = COLOR_B * brightness;
      col[p + 3] = COLOR_R * brightness;
      col[p + 4] = COLOR_G * brightness;
      col[p + 5] = COLOR_B * brightness;
      live += 1;
    }
    this.liveSegments = live;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, live * 2);
    this.lines.visible = this.enabled && live > 0;
  }

  private isOpaque(material: number): boolean {
    return material !== MaterialId.Empty
      && material !== MaterialId.Water
      && material !== MaterialId.Steam
      && material !== MaterialId.VentFluid
      && material !== MaterialId.Lava;
  }
}
