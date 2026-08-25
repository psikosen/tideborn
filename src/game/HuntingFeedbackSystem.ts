import * as THREE from 'three';
import { clamp, mulberry32 } from './data';

export type PredatorFeedbackKind = 'hit' | 'attacked' | 'killed' | 'fled' | 'feeding';
export type PredatorLedgerState = 'calm' | 'wary' | 'hunting' | 'limping' | 'satiated' | 'dead';
export type RemainKind = 'fish' | 'crab' | 'clam';

export interface PredatorFeedbackEvent {
  id: string;
  species: string;
  kind: PredatorFeedbackKind;
  x: number;
  y: number;
  amount?: number;
}

export interface HuntingPredatorSighting {
  id: string;
  species: string;
  x: number;
  y: number;
}

export interface HuntingFeedbackContext {
  px: number;
  py: number;
  darkness: number;
  camouflaged: boolean;
  jetRecent: boolean;
  predators: readonly HuntingPredatorSighting[];
}

export interface HuntingNearbyEntry {
  id: string;
  species: string;
  hp: number;
  injured: boolean;
  awareness: number;
  state: PredatorLedgerState;
  distance: number;
  speedScale: number;
}

export interface HuntingFeedbackSnapshot {
  nearby: HuntingNearbyEntry[];
  dodges: number;
  hunts: number;
  killsToday: number;
  remainsActive: number;
  dodgeStaminaHint: number;
}

export interface ScavengeTarget {
  id: string;
  x: number;
  y: number;
  kind: RemainKind;
  attractScavengers: boolean;
}

export interface SerializedHuntingLedgerItem {
  id: string;
  species: string;
  hp: number;
  state: PredatorLedgerState;
  x: number;
  y: number;
  awareness: number;
  lastSeen: number;
  satiatedUntil: number;
  killedAt: number;
}

export interface SerializedHuntingFeedback {
  version: number;
  clock: number;
  day: number;
  dodges: number;
  hunts: number;
  killsToday: number;
  dodgeStaminaHint: number;
  ledger: SerializedHuntingLedgerItem[];
}

interface AttackWindow {
  t: number;
  x: number;
  y: number;
}

interface LedgerEntry {
  species: string;
  hp: number;
  injured: boolean;
  state: PredatorLedgerState;
  x: number;
  y: number;
  awareness: number;
  lastSeen: number;
  satiatedUntil: number;
  killedAt: number;
  attack: AttackWindow | null;
}

interface MeterSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  bucket: number;
  ownerId: string | null;
}

interface WoundSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  ownerId: string | null;
}

interface LungeArc {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
}

interface DodgeBurst {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  active: boolean;
}

interface RemainDecal {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
}

const METER_CAP = 12;
const WOUND_CAP = 12;
const LUNGE_CAP = 6;
const BURST_CAP = 4;
const REMAIN_CAP = 24;
const DAY_SECONDS = 90;
const DEAD_FADE_SECONDS = 20;
const INJURED_THRESHOLD = 0.55;
const LIMP_SPEED_SCALE = 0.75;
const DEFAULT_HIT_AMOUNT = 0.34;
const DETECT_RADIUS = 10;
const DODGE_WINDOW = 0.4;
const DODGE_RANGE = 2.2;
const DODGE_SPEED = 1.9;
const FEEDING_SECONDS = 8;
const REMAIN_SECONDS = 60;
const NEARBY_RANGE = 16;
const LUNGE_SECONDS = 0.35;
const BURST_SECONDS = 0.9;
const METER_BUCKETS = 20;
const HUD_INTERVAL = 0.15;

const LEDGER_STATES: ReadonlySet<string> = new Set(['calm', 'wary', 'hunting', 'limping', 'satiated', 'dead']);

function idHash(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 9973;
  return hash;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function awarenessColor(awareness: number): { r: number; g: number; b: number; css: string } {
  const c = clamp(awareness, 0, 1);
  let r: number;
  let g: number;
  let b: number;
  if (c < 0.5) {
    const k = c / 0.5;
    r = lerp(0.388, 1, k);
    g = lerp(0.851, 0.71, k);
    b = lerp(0.553, 0.29, k);
  } else {
    const k = (c - 0.5) / 0.5;
    r = 1;
    g = lerp(0.71, 0.294, k);
    b = lerp(0.29, 0.22, k);
  }
  const ir = Math.round(r * 255);
  const ig = Math.round(g * 255);
  const ib = Math.round(b * 255);
  return { r: ir, g: ig, b: ib, css: `rgb(${ir},${ig},${ib})` };
}

export class HuntingFeedbackSystem {
  private readonly scene: THREE.Scene;
  private readonly meters: MeterSlot[] = [];
  private readonly wounds: WoundSlot[] = [];
  private readonly lunges: LungeArc[] = [];
  private readonly bursts: DodgeBurst[] = [];
  private readonly remains: RemainDecal[] = [];
  private readonly ledger = new Map<string, LedgerEntry>();
  private readonly rng = mulberry32(0x51ca7f);
  private burstTexture: THREE.CanvasTexture | null = null;
  private woundTexture: THREE.CanvasTexture | null = null;
  private remainRingIndex = 0;
  private remainSequence = 0;
  private clock = 0;
  private day = -1;
  private dodges = 0;
  private hunts = 0;
  private killsToday = 0;
  private dodgeStaminaHint = 0;
  private hudAccumulator = 0;
  private uiRoot: HTMLElement | null = null;
  private chip: HTMLElement | null = null;
  private chipThreatFill: HTMLElement | null = null;
  private chipThreatValue: HTMLElement | null = null;
  private chipDodges: HTMLElement | null = null;
  private chipHunts: HTMLElement | null = null;
  private chipKills: HTMLElement | null = null;
  private chipStamina: HTMLElement | null = null;

  constructor(scene: THREE.Scene, uiRoot?: HTMLElement) {
    this.scene = scene;
    for (let index = 0; index < METER_CAP; index += 1) this.meters.push(this.createMeter());
    for (let index = 0; index < WOUND_CAP; index += 1) this.wounds.push(this.createWound());
    for (let index = 0; index < LUNGE_CAP; index += 1) this.lunges.push(this.createLunge());
    for (let index = 0; index < BURST_CAP; index += 1) this.bursts.push(this.createBurst());
    for (let index = 0; index < REMAIN_CAP; index += 1) this.remains.push(this.createRemain());
    if (uiRoot) this.attachUiRoot(uiRoot);
  }

  ingestPredatorEvent(evt: PredatorFeedbackEvent): void {
    let entry = this.ledger.get(evt.id);
    if (!entry) {
      entry = this.createEntry(evt.species);
      this.ledger.set(evt.id, entry);
    }
    entry.x = evt.x;
    entry.y = evt.y;
    entry.lastSeen = this.clock;
    switch (evt.kind) {
      case 'hit': {
        if (entry.state === 'dead') break;
        entry.hp = clamp(entry.hp - (evt.amount ?? DEFAULT_HIT_AMOUNT), 0, 1);
        if (entry.hp <= 0) {
          this.markKilled(entry);
        } else {
          entry.injured = entry.hp < INJURED_THRESHOLD;
          entry.state = entry.injured ? 'limping' : 'wary';
        }
        break;
      }
      case 'attacked': {
        if (entry.state === 'dead') break;
        entry.attack = { t: this.clock, x: evt.x, y: evt.y };
        entry.awareness = Math.max(entry.awareness, 0.85);
        entry.state = entry.injured ? 'limping' : 'hunting';
        this.spawnLunge(evt.x, evt.y);
        break;
      }
      case 'killed':
        this.markKilled(entry);
        break;
      case 'fled':
        if (entry.state === 'dead') break;
        entry.state = entry.satiatedUntil > this.clock ? 'satiated' : 'calm';
        entry.awareness *= 0.2;
        entry.attack = null;
        break;
      case 'feeding':
        if (entry.state === 'dead') break;
        entry.satiatedUntil = this.clock + FEEDING_SECONDS;
        entry.state = 'satiated';
        entry.attack = null;
        break;
    }
  }

  update(dt: number, ctx: HuntingFeedbackContext): void {
    this.clock += dt;
    for (const [id, entry] of this.ledger) {
      if (entry.state === 'dead' && this.clock - entry.killedAt > DEAD_FADE_SECONDS) this.ledger.delete(id);
    }
    for (const entry of this.ledger.values()) {
      if (entry.attack && this.clock - entry.attack.t > DODGE_WINDOW) entry.attack = null;
      if (entry.state === 'satiated' && this.clock >= entry.satiatedUntil) entry.state = 'calm';
    }

    const decay = Math.pow(0.45, dt);
    const seen = new Set<string>();
    for (let index = 0; index < ctx.predators.length; index += 1) {
      const sighting = ctx.predators[index];
      let entry = this.ledger.get(sighting.id);
      if (!entry) {
        entry = this.createEntry(sighting.species);
        this.ledger.set(sighting.id, entry);
      }
      seen.add(sighting.id);
      entry.x = sighting.x;
      entry.y = sighting.y;
      entry.lastSeen = this.clock;
      const dx = sighting.x - ctx.px;
      const dy = sighting.y - ctx.py;
      const distance = Math.hypot(dx, dy);
      let target = distance < DETECT_RADIUS ? 1 - distance / DETECT_RADIUS : 0;
      target *= 1 - 0.55 * clamp(ctx.darkness, 0, 1);
      if (ctx.camouflaged) target *= 0.5;
      if (ctx.jetRecent && distance < DETECT_RADIUS * 1.6 && entry.state !== 'dead') target += 0.28;
      target = clamp(target, 0, 1);
      const rate = target > entry.awareness ? 3.6 : 1.1;
      entry.awareness += (target - entry.awareness) * Math.min(1, dt * rate);
    }
    for (const [id, entry] of this.ledger) {
      if (!seen.has(id)) entry.awareness *= decay;
    }

    this.updateMeters(ctx.px, ctx.py);
    this.updateWounds();
    this.updatePools(dt);
    this.hudAccumulator += dt;
    if (this.hudAccumulator >= HUD_INTERVAL) {
      this.hudAccumulator = 0;
      this.updateChip(ctx.px, ctx.py);
    }
  }

  noteDodge(predatorId: string, px: number, py: number, predatorX: number, predatorY: number, playerVx: number, playerVy: number): boolean {
    const entry = this.ledger.get(predatorId);
    if (!entry || !entry.attack || entry.state === 'dead') return false;
    const since = this.clock - entry.attack.t;
    if (since < -0.02 || since > DODGE_WINDOW) return false;
    const dx = px - predatorX;
    const dy = py - predatorY;
    const distance = Math.hypot(dx, dy);
    if (distance > DODGE_RANGE) return false;
    const speed = Math.hypot(playerVx, playerVy);
    if (speed < DODGE_SPEED) return false;
    const inverse = 1 / Math.max(0.12, distance);
    const awayComponent = playerVx * dx * inverse + playerVy * dy * inverse;
    if (awayComponent < speed * 0.6) return false;
    entry.attack = null;
    this.dodges += 1;
    this.dodgeStaminaHint += 3;
    this.spawnBurst(px, py);
    return true;
  }

  markRemains(x: number, y: number, kind: RemainKind): void {
    this.hunts += 1;
    const decal = this.remains[this.remainRingIndex];
    this.remainRingIndex = (this.remainRingIndex + 1) % REMAIN_CAP;
    decal.age = 0;
    decal.active = true;
    decal.group.visible = true;
    decal.material.opacity = 0.92;
    decal.group.position.set(x, y, 0.42);
    this.scatterChips(decal.group, kind);
  }

  scavengeTargets(): ScavengeTarget[] {
    const targets: ScavengeTarget[] = [];
    for (const decal of this.remains) {
      if (!decal.active) continue;
      targets.push({
        id: `remains-${decal.group.userData.remainId}`,
        x: Number(decal.group.position.x.toFixed(2)),
        y: Number(decal.group.position.y.toFixed(2)),
        kind: decal.group.userData.remainKind as RemainKind,
        attractScavengers: true,
      });
    }
    return targets;
  }

  resetDaily(elapsed: number): void {
    const day = Math.floor(elapsed / DAY_SECONDS) + 1;
    if (this.day < 0) {
      this.day = day;
      return;
    }
    if (day === this.day) return;
    this.day = day;
    this.dodges = 0;
    this.hunts = 0;
    this.killsToday = 0;
    this.dodgeStaminaHint = 0;
  }

  snapshot(px: number, py: number): HuntingFeedbackSnapshot {
    const nearby: HuntingNearbyEntry[] = [];
    let remainsActive = 0;
    for (const decal of this.remains) if (decal.active) remainsActive += 1;
    for (const [id, entry] of this.ledger) {
      if (entry.state === 'dead' && this.clock - entry.killedAt > DEAD_FADE_SECONDS) continue;
      const distance = Math.hypot(entry.x - px, entry.y - py);
      if (distance > NEARBY_RANGE) continue;
      nearby.push({
        id,
        species: entry.species,
        hp: Number(entry.hp.toFixed(2)),
        injured: entry.injured,
        awareness: Number(entry.awareness.toFixed(2)),
        state: entry.state,
        distance: Number(distance.toFixed(2)),
        speedScale: entry.injured ? LIMP_SPEED_SCALE : 1,
      });
    }
    nearby.sort((a, b) => a.distance - b.distance);
    return {
      nearby,
      dodges: this.dodges,
      hunts: this.hunts,
      killsToday: this.killsToday,
      remainsActive,
      dodgeStaminaHint: this.dodgeStaminaHint,
    };
  }

  serialize(): SerializedHuntingFeedback {
    const ledger: SerializedHuntingLedgerItem[] = [];
    for (const [id, entry] of this.ledger) {
      if (entry.state === 'dead' && this.clock - entry.killedAt > DEAD_FADE_SECONDS) continue;
      ledger.push({
        id,
        species: entry.species,
        hp: Number(entry.hp.toFixed(3)),
        state: entry.state,
        x: Number(entry.x.toFixed(2)),
        y: Number(entry.y.toFixed(2)),
        awareness: Number(entry.awareness.toFixed(3)),
        lastSeen: Number(entry.lastSeen.toFixed(2)),
        satiatedUntil: Number(entry.satiatedUntil.toFixed(2)),
        killedAt: Number(entry.killedAt.toFixed(2)),
      });
    }
    return {
      version: 1,
      clock: Number(this.clock.toFixed(2)),
      day: this.day,
      dodges: this.dodges,
      hunts: this.hunts,
      killsToday: this.killsToday,
      dodgeStaminaHint: this.dodgeStaminaHint,
      ledger,
    };
  }

  deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const raw = data as Partial<SerializedHuntingFeedback>;
    if (!Array.isArray(raw.ledger)) return;
    this.hideAllSprites();
    this.ledger.clear();
    this.clock = typeof raw.clock === 'number' ? raw.clock : this.clock;
    this.day = typeof raw.day === 'number' ? raw.day : this.day;
    this.dodges = typeof raw.dodges === 'number' ? raw.dodges : this.dodges;
    this.hunts = typeof raw.hunts === 'number' ? raw.hunts : this.hunts;
    this.killsToday = typeof raw.killsToday === 'number' ? raw.killsToday : this.killsToday;
    this.dodgeStaminaHint = typeof raw.dodgeStaminaHint === 'number' ? raw.dodgeStaminaHint : this.dodgeStaminaHint;
    for (const item of raw.ledger) {
      if (!item || typeof item.id !== 'string' || typeof item.species !== 'string') continue;
      const entry = this.createEntry(item.species);
      entry.hp = clamp(typeof item.hp === 'number' ? item.hp : 1, 0, 1);
      entry.state = typeof item.state === 'string' && LEDGER_STATES.has(item.state) ? item.state as PredatorLedgerState : 'calm';
      entry.x = typeof item.x === 'number' ? item.x : 0;
      entry.y = typeof item.y === 'number' ? item.y : 0;
      entry.awareness = clamp(typeof item.awareness === 'number' ? item.awareness : 0, 0, 1);
      entry.lastSeen = typeof item.lastSeen === 'number' ? item.lastSeen : this.clock;
      entry.satiatedUntil = typeof item.satiatedUntil === 'number' ? item.satiatedUntil : 0;
      entry.killedAt = typeof item.killedAt === 'number' ? item.killedAt : -1;
      entry.injured = entry.hp > 0 && entry.hp < INJURED_THRESHOLD && entry.state !== 'dead';
      if (entry.state === 'dead' && this.clock - entry.killedAt > DEAD_FADE_SECONDS) continue;
      if (entry.state === 'satiated' && this.clock >= entry.satiatedUntil) entry.state = 'calm';
      this.ledger.set(item.id, entry);
    }
    this.rebuildSprites();
  }

  attachUiRoot(root: HTMLElement): void {
    this.uiRoot = root;
    if (this.chip) return;
    const chip = document.createElement('div');
    chip.dataset.ui = 'hunting-feedback';
    Object.assign(chip.style, {
      position: 'absolute',
      right: '14px',
      bottom: '14px',
      zIndex: '40',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      padding: '9px 13px',
      borderRadius: '12px',
      background: 'rgba(5,19,23,0.82)',
      border: '1px solid rgba(125,238,216,0.30)',
      boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      fontFamily: 'inherit',
      fontSize: '11px',
      letterSpacing: '0.08em',
      color: '#cfe9e2',
      textTransform: 'uppercase',
      pointerEvents: 'none',
      userSelect: 'none',
    } as Partial<CSSStyleDeclaration>);
    const threatRow = document.createElement('div');
    Object.assign(threatRow.style, { display: 'flex', alignItems: 'center', gap: '7px' } as Partial<CSSStyleDeclaration>);
    const threatLabel = document.createElement('span');
    threatLabel.textContent = 'NEAREST THREAT';
    const barShell = document.createElement('span');
    Object.assign(barShell.style, {
      width: '88px',
      height: '6px',
      borderRadius: '999px',
      background: 'rgba(255,255,255,0.10)',
      overflow: 'hidden',
      display: 'inline-block',
    } as Partial<CSSStyleDeclaration>);
    const fill = document.createElement('i');
    Object.assign(fill.style, {
      display: 'block',
      width: '0%',
      height: '100%',
      borderRadius: '999px',
      background: '#63d98d',
      transition: 'width 120ms linear',
    } as Partial<CSSStyleDeclaration>);
    barShell.appendChild(fill);
    const value = document.createElement('b');
    value.textContent = 'CLEAR';
    Object.assign(value.style, { minWidth: '34px', textAlign: 'right' } as Partial<CSSStyleDeclaration>);
    threatRow.append(threatLabel, barShell, value);
    const statsRow = document.createElement('div');
    Object.assign(statsRow.style, { display: 'flex', alignItems: 'center', gap: '10px', opacity: '0.92' } as Partial<CSSStyleDeclaration>);
    const dodges = document.createElement('b');
    dodges.textContent = 'DODGES 0';
    const hunts = document.createElement('b');
    hunts.textContent = 'HUNTS 0';
    const kills = document.createElement('b');
    kills.textContent = 'KILLS 0';
    const stamina = document.createElement('em');
    Object.assign(stamina.style, { fontStyle: 'normal', color: '#8ff2d9' } as Partial<CSSStyleDeclaration>);
    statsRow.append(dodges, hunts, kills, stamina);
    chip.append(threatRow, statsRow);
    root.appendChild(chip);
    this.chip = chip;
    this.chipThreatFill = fill;
    this.chipThreatValue = value;
    this.chipDodges = dodges;
    this.chipHunts = hunts;
    this.chipKills = kills;
    this.chipStamina = stamina;
  }

  private createEntry(species: string): LedgerEntry {
    return {
      species,
      hp: 1,
      injured: false,
      state: 'calm',
      x: 0,
      y: 0,
      awareness: 0,
      lastSeen: this.clock,
      satiatedUntil: 0,
      killedAt: -1,
      attack: null,
    };
  }

  private markKilled(entry: LedgerEntry): void {
    if (entry.state === 'dead') return;
    entry.hp = 0;
    entry.injured = true;
    entry.state = 'dead';
    entry.killedAt = this.clock;
    entry.attack = null;
    this.killsToday += 1;
  }

  private meterAnchorY(species: string): number {
    if (species.includes('orca') || species.includes('shark') || species.includes('leviathan')) return 2.05;
    if (species.includes('gulper') || species.includes('eel')) return 1.15;
    if (species.includes('crab')) return 0.95;
    if (species.includes('stalker') || species.includes('angler')) return 1.45;
    return 1.65;
  }

  private updateMeters(px: number, py: number): void {
    let slotIndex = 0;
    for (const [id, entry] of this.ledger) {
      if (slotIndex >= METER_CAP) break;
      if (entry.state === 'dead') continue;
      if (this.clock - entry.lastSeen > 1.5) continue;
      if (Math.hypot(entry.x - px, entry.y - py) > 15) continue;
      const slot = this.meters[slotIndex];
      slotIndex += 1;
      slot.ownerId = id;
      slot.sprite.visible = true;
      slot.sprite.position.set(entry.x, entry.y + this.meterAnchorY(entry.species), 7.6);
      this.drawMeter(slot, entry.awareness);
    }
    for (; slotIndex < METER_CAP; slotIndex += 1) {
      const slot = this.meters[slotIndex];
      slot.ownerId = null;
      slot.sprite.visible = false;
    }
  }

  private drawMeter(slot: MeterSlot, awareness: number): void {
    const bucket = Math.round(clamp(awareness, 0, 1) * METER_BUCKETS);
    if (bucket === slot.bucket) return;
    slot.bucket = bucket;
    const context = slot.canvas.getContext('2d');
    if (!context) return;
    const width = slot.canvas.width;
    const height = slot.canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(3,14,17,0.78)';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(190,240,225,0.35)';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
    context.fillStyle = 'rgba(255,255,255,0.07)';
    context.fillRect(2, 2, width - 4, height - 4);
    const tone = awarenessColor(bucket / METER_BUCKETS);
    context.fillStyle = tone.css;
    context.fillRect(2, 2, Math.max(0, (width - 4) * (bucket / METER_BUCKETS)), height - 4);
    slot.texture.needsUpdate = true;
  }

  private updateWounds(): void {
    let slotIndex = 0;
    for (const [id, entry] of this.ledger) {
      if (slotIndex >= WOUND_CAP) break;
      if (!entry.injured || entry.state === 'dead') continue;
      if (this.clock - entry.lastSeen > 1.5) continue;
      const slot = this.wounds[slotIndex];
      slotIndex += 1;
      slot.ownerId = id;
      slot.sprite.visible = true;
      slot.sprite.position.set(entry.x, entry.y + this.meterAnchorY(entry.species) * 0.62, 7.55);
      slot.material.rotation = Math.sin(this.clock * 1.7 + idHash(id)) * 0.16;
      slot.material.opacity = 0.72 + Math.sin(this.clock * 2.3 + idHash(id)) * 0.12;
    }
    for (; slotIndex < WOUND_CAP; slotIndex += 1) {
      const slot = this.wounds[slotIndex];
      slot.ownerId = null;
      slot.sprite.visible = false;
    }
  }

  private updatePools(dt: number): void {
    for (const lunge of this.lunges) {
      if (!lunge.active) continue;
      lunge.age += dt;
      const k = lunge.age / LUNGE_SECONDS;
      if (k >= 1) {
        lunge.active = false;
        lunge.mesh.visible = false;
        continue;
      }
      const scale = 0.7 + k * 0.95;
      lunge.mesh.scale.setScalar(scale);
      lunge.mesh.rotation.z += dt * 3.2;
      lunge.material.opacity = (1 - k) * 0.9;
    }
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.age += dt;
      const k = burst.age / BURST_SECONDS;
      if (k >= 1) {
        burst.active = false;
        burst.sprite.visible = false;
        continue;
      }
      const baseY = typeof burst.sprite.userData.baseY === 'number' ? burst.sprite.userData.baseY : burst.sprite.position.y;
      burst.sprite.position.y = baseY + k * 1.05;
      const pop = k < 0.18 ? 0.75 + (k / 0.18) * 0.35 : 1.1 - ((k - 0.18) / 0.82) * 0.12;
      burst.sprite.scale.set(2.2 * pop, 0.62 * pop, 1);
      burst.material.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    }
    for (const decal of this.remains) {
      if (!decal.active) continue;
      decal.age += dt;
      if (decal.age >= REMAIN_SECONDS) {
        decal.active = false;
        decal.group.visible = false;
        continue;
      }
      decal.material.opacity = 0.92 * (1 - decal.age / REMAIN_SECONDS);
    }
  }

  private spawnLunge(x: number, y: number): void {
    let target = this.lunges.find((lunge) => !lunge.active);
    if (!target) {
      target = this.lunges[0];
      if (!target) return;
    }
    target.active = true;
    target.age = 0;
    target.mesh.visible = true;
    target.mesh.position.set(x, y + 0.25, 7.3);
    target.mesh.rotation.z = this.rng() * Math.PI * 2;
    target.mesh.scale.setScalar(0.7);
    target.material.opacity = 0.9;
  }

  private spawnBurst(x: number, y: number): void {
    let target = this.bursts.find((burst) => !burst.active);
    if (!target) {
      target = this.bursts[0];
      if (!target) return;
    }
    target.active = true;
    target.age = 0;
    target.sprite.visible = true;
    target.sprite.position.set(x, y + 1.35, 7.7);
    target.sprite.userData.baseY = y + 1.35;
    target.sprite.scale.set(2.2, 0.62, 1);
    target.material.opacity = 0;
  }

  private scatterChips(group: THREE.Group, kind: RemainKind): void {
    group.userData.remainKind = kind;
    group.userData.remainId = ++this.remainSequence;
    const count = group.children.length;
    for (let index = 0; index < count; index += 1) {
      const chip = group.children[index];
      const angle = this.rng() * Math.PI * 2;
      const radius = 0.12 + this.rng() * 0.42;
      chip.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55, 0.01 * index);
      chip.rotation.z = this.rng() * Math.PI;
      chip.scale.setScalar(0.75 + this.rng() * 0.6);
    }
  }

  private createMeterCanvasContext(canvas: HTMLCanvasElement): void {
    canvas.width = 96;
    canvas.height = 10;
  }

  private createMeter(): MeterSlot {
    const canvas = document.createElement('canvas');
    this.createMeterCanvasContext(canvas);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.17, 1);
    sprite.renderOrder = 70;
    sprite.visible = false;
    this.scene.add(sprite);
    return { sprite, material, canvas, texture, bucket: -1, ownerId: null };
  }

  private ensureWoundTexture(): THREE.CanvasTexture {
    if (this.woundTexture) return this.woundTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      context.strokeStyle = '#2a070c';
      context.lineWidth = 13;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(32, 10);
      context.lineTo(32, 54);
      context.moveTo(10, 32);
      context.lineTo(54, 32);
      context.stroke();
      context.strokeStyle = '#ff5140';
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(32, 11);
      context.lineTo(32, 53);
      context.moveTo(11, 32);
      context.lineTo(53, 32);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.woundTexture = texture;
    return texture;
  }

  private createWound(): WoundSlot {
    const material = new THREE.SpriteMaterial({
      map: this.ensureWoundTexture(),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.58, 0.58, 1);
    sprite.renderOrder = 69;
    sprite.visible = false;
    this.scene.add(sprite);
    return { sprite, material, ownerId: null };
  }

  private createLunge(): LungeArc {
    const geometry = new THREE.RingGeometry(0.36, 0.54, 22, 1, -1.25, 2.5);
    const material = new THREE.MeshBasicMaterial({
      color: '#ffd9c4',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 68;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, material, age: 0, active: false };
  }

  private ensureBurstTexture(): THREE.CanvasTexture {
    if (this.burstTexture) return this.burstTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    if (context) {
      context.textAlign = 'center';
      context.font = '700 34px "Trebuchet MS", system-ui, sans-serif';
      context.lineWidth = 7;
      context.strokeStyle = '#062126';
      context.strokeText('DODGED', 128, 40);
      context.fillStyle = '#a8f4de';
      context.fillText('DODGED', 128, 40);
      context.font = '600 19px "Trebuchet MS", system-ui, sans-serif';
      context.strokeText('+stamina', 128, 66);
      context.fillStyle = '#ffd9a0';
      context.fillText('+stamina', 128, 66);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.burstTexture = texture;
    return texture;
  }

  private createBurst(): DodgeBurst {
    const material = new THREE.SpriteMaterial({
      map: this.ensureBurstTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.2, 0.62, 1);
    sprite.renderOrder = 71;
    sprite.visible = false;
    this.scene.add(sprite);
    return { sprite, material, age: 0, active: false };
  }

  private createRemain(): RemainDecal {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: '#e6dcc3', transparent: true, opacity: 0.92, depthWrite: false });
    const boneGeometry = new THREE.BoxGeometry(0.17, 0.028, 0.028);
    const shellGeometry = new THREE.SphereGeometry(0.05, 8, 6);
    const clamGeometry = new THREE.SphereGeometry(0.06, 8, 6);
    for (let index = 0; index < 5; index += 1) {
      const chip = index % 2 === 0
        ? new THREE.Mesh(boneGeometry, material)
        : new THREE.Mesh(index % 4 === 1 ? shellGeometry : clamGeometry, material);
      chip.renderOrder = 30;
      group.add(chip);
    }
    group.position.z = 0.42;
    group.visible = false;
    group.userData.remainKind = 'fish';
    group.userData.remainId = 0;
    this.scene.add(group);
    return { group, material, age: 0, active: false };
  }

  private nearestThreat(px: number, py: number): { awareness: number; distance: number } | null {
    let best: { awareness: number; distance: number } | null = null;
    for (const entry of this.ledger.values()) {
      if (entry.state === 'dead' || entry.awareness <= 0.02) continue;
      if (this.clock - entry.lastSeen > 1.5) continue;
      const distance = Math.hypot(entry.x - px, entry.y - py);
      if (distance > NEARBY_RANGE) continue;
      if (!best || distance < best.distance) best = { awareness: entry.awareness, distance };
    }
    return best;
  }

  private updateChip(px: number, py: number): void {
    if (!this.chip) return;
    const threat = this.nearestThreat(px, py);
    if (threat && this.chipThreatFill && this.chipThreatValue) {
      const tone = awarenessColor(threat.awareness);
      this.chipThreatFill.style.width = `${Math.round(threat.awareness * 100)}%`;
      this.chipThreatFill.style.background = tone.css;
      this.chipThreatValue.textContent = `${Math.round(threat.awareness * 100)}%`;
    } else if (this.chipThreatFill && this.chipThreatValue) {
      this.chipThreatFill.style.width = '0%';
      this.chipThreatValue.textContent = 'CLEAR';
    }
    if (this.chipDodges) this.chipDodges.textContent = `DODGES ${this.dodges}`;
    if (this.chipHunts) this.chipHunts.textContent = `HUNTS ${this.hunts}`;
    if (this.chipKills) this.chipKills.textContent = `KILLS ${this.killsToday}`;
    if (this.chipStamina) this.chipStamina.textContent = this.dodgeStaminaHint > 0 ? `+${this.dodgeStaminaHint} STAMINA HINT` : '';
  }

  private hideAllSprites(): void {
    for (const meter of this.meters) {
      meter.ownerId = null;
      meter.bucket = -1;
      meter.sprite.visible = false;
    }
    for (const wound of this.wounds) {
      wound.ownerId = null;
      wound.sprite.visible = false;
    }
    for (const lunge of this.lunges) {
      lunge.active = false;
      lunge.mesh.visible = false;
    }
    for (const burst of this.bursts) {
      burst.active = false;
      burst.sprite.visible = false;
    }
  }

  private rebuildSprites(): void {
    let woundIndex = 0;
    for (const entry of this.ledger.values()) {
      if (entry.state === 'dead' || !entry.injured) continue;
      if (woundIndex >= WOUND_CAP) break;
      const slot = this.wounds[woundIndex];
      woundIndex += 1;
      slot.sprite.visible = true;
      slot.sprite.position.set(entry.x, entry.y + this.meterAnchorY(entry.species) * 0.62, 7.55);
    }
  }
}
