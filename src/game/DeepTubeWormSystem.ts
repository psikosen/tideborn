import * as THREE from 'three';
import { mulberry32 } from './data';

export interface DeepTubeWorm {
  id: string;
  x: number;
  y: number;
  height: number;
  scale: number;
  health: number;
  alive: boolean;
  nextSprayAt: number;
  group: THREE.Group;
  crown: THREE.Mesh;
}

export interface TubeWormSprayEvent {
  kind: 'hot-spray';
  wormId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  damage: number;
  heatC: number;
}

export interface TubeWormCutResult {
  id: string;
  x: number;
  y: number;
  damage: number;
  remainingHealth: number;
  harvested: boolean;
}

interface HealthDrop {
  id: string;
  x: number;
  y: number;
  collected: boolean;
  visual: THREE.Group;
}

/** Sparse fictional vent worms with heat defense and collectable medicine. */
export class DeepTubeWormSystem {
  private readonly worms: DeepTubeWorm[] = [];
  private readonly drops: HealthDrop[] = [];
  private heldId: string | null = null;
  private dropSequence = 0;

  constructor(private readonly scene: THREE.Scene, seed: number) {
    const rng = mulberry32(seed);
    const colonies = [
      { x: 46.9, y: -94.6, count: 4 },
      { x: 49.8, y: -101.1, count: 5 },
      { x: 52.8, y: -103.25, count: 7 },
      { x: 55.1, y: -102.55, count: 4 },
    ];
    let index = 0;
    for (const colony of colonies) {
      for (let member = 0; member < colony.count; member += 1) {
        const x = colony.x + (member - (colony.count - 1) / 2) * (0.25 + rng() * 0.09) + (rng() - 0.5) * 0.12;
        const height = 0.65 + rng() * 0.95;
        const scale = 0.78 + rng() * 0.58;
        const group = this.createWorm(height, scale, rng);
        const y = colony.y + (rng() - 0.5) * 0.14;
        group.position.set(x, y, 3.7 + rng() * 0.08);
        group.userData.kind = 'deep-tube-worm';
        this.scene.add(group);
        this.worms.push({
          id: `tube-worm-${++index}`, x, y, height, scale, health: 3, alive: true,
          nextSprayAt: 0, group, crown: group.userData.crown as THREE.Mesh,
        });
      }
    }
  }

  update(dt: number, time: number, playerX: number, playerY: number, lit: boolean): TubeWormSprayEvent[] {
    const events: TubeWormSprayEvent[] = [];
    for (const worm of this.worms) {
      if (!worm.alive) continue;
      const distance = Math.hypot(worm.x - playerX, worm.y + worm.height * 0.5 - playerY);
      worm.group.visible = distance < 24 && (lit || distance < 0.9);
      worm.group.rotation.z = Math.sin(time * 1.25 + worm.x * 2.1) * 0.035;
      worm.crown.scale.setScalar(0.94 + Math.sin(time * 2.4 + worm.x) * 0.06);
      if (worm.id === this.heldId && distance <= 2.05 && time >= worm.nextSprayAt) {
        events.push(this.spray(worm, playerX, playerY));
        worm.nextSprayAt = time + 5.5 + (worm.scale % 0.4) * 5;
      }
    }
    const held = this.held();
    if (held && Math.hypot(held.x - playerX, held.y + held.height * 0.5 - playerY) > 2.1) this.heldId = null;
    for (const drop of this.drops) {
      if (drop.collected) continue;
      drop.visual.visible = lit || Math.hypot(drop.x - playerX, drop.y - playerY) < 0.8;
      drop.visual.rotation.z += dt * 0.75;
      drop.visual.position.y = drop.y + Math.sin(time * 2.7 + drop.x) * 0.045;
    }
    return events;
  }

  nearest(x: number, y: number, range: number): DeepTubeWorm | null {
    let nearest: DeepTubeWorm | null = null;
    let best = range;
    for (const worm of this.worms) {
      if (!worm.alive) continue;
      const distance = Math.hypot(worm.x - x, worm.y + worm.height * 0.45 - y);
      if (distance < best) { nearest = worm; best = distance; }
    }
    return nearest;
  }

  grip(worm: DeepTubeWorm, time: number, playerX: number, playerY: number): TubeWormSprayEvent | null {
    this.heldId = worm.id;
    if (time < worm.nextSprayAt) return null;
    worm.nextSprayAt = time + 5.5 + (worm.scale % 0.4) * 5;
    return this.spray(worm, playerX, playerY);
  }

  held(): DeepTubeWorm | null {
    return this.worms.find((worm) => worm.alive && worm.id === this.heldId) ?? null;
  }

  release(): void {
    this.heldId = null;
  }

  cutHeld(damage: number): TubeWormCutResult | null {
    const worm = this.held();
    if (!worm) return null;
    const applied = Math.max(1, Math.round(damage));
    worm.health = Math.max(0, worm.health - applied);
    const harvested = worm.health === 0;
    if (harvested) {
      worm.alive = false;
      worm.group.visible = false;
      this.heldId = null;
      this.spawnHealthDrop(worm.x, worm.y + worm.height * 0.38);
    }
    return { id: worm.id, x: worm.x, y: worm.y + worm.height * 0.45, damage: applied, remainingHealth: worm.health, harvested };
  }

  nearestHealthDrop(x: number, y: number, range: number): HealthDrop | null {
    let nearest: HealthDrop | null = null;
    let best = range;
    for (const drop of this.drops) {
      if (drop.collected) continue;
      const distance = Math.hypot(drop.x - x, drop.y - y);
      if (distance < best) { nearest = drop; best = distance; }
    }
    return nearest;
  }

  collectHealthDrop(drop: HealthDrop): void {
    drop.collected = true;
    drop.visual.visible = false;
  }

  snapshot(playerX: number, playerY: number): {
    generated: number;
    living: number;
    harvested: number;
    held: string | null;
    healthDropsAvailable: number;
    nearby: Array<{ id: string; x: number; y: number; height: number; scale: number; health: number; distance: number; defense: string }>;
    nearbyHealthDrops: Array<{ id: string; x: number; y: number; distance: number }>;
  } {
    return {
      generated: this.worms.length,
      living: this.worms.filter((worm) => worm.alive).length,
      harvested: this.worms.filter((worm) => !worm.alive).length,
      held: this.heldId,
      healthDropsAvailable: this.drops.filter((drop) => !drop.collected).length,
      nearby: this.worms.filter((worm) => worm.alive).map((worm) => ({
        worm,
        distance: Math.hypot(worm.x - playerX, worm.y + worm.height * 0.45 - playerY),
      })).filter(({ distance }) => distance < 8).sort((a, b) => a.distance - b.distance).map(({ worm, distance }) => ({
        id: worm.id, x: Number(worm.x.toFixed(2)), y: Number(worm.y.toFixed(2)), height: Number(worm.height.toFixed(2)),
        scale: Number(worm.scale.toFixed(2)), health: worm.health, distance: Number(distance.toFixed(2)), defense: 'superheated mineral spray',
      })),
      nearbyHealthDrops: this.drops.filter((drop) => !drop.collected).map((drop) => ({
        id: drop.id, x: Number(drop.x.toFixed(2)), y: Number(drop.y.toFixed(2)), distance: Number(Math.hypot(drop.x - playerX, drop.y - playerY).toFixed(2)),
      })).filter((drop) => drop.distance < 8).sort((a, b) => a.distance - b.distance),
    };
  }

  private spray(worm: DeepTubeWorm, playerX: number, playerY: number): TubeWormSprayEvent {
    return {
      kind: 'hot-spray', wormId: worm.id, x: worm.x, y: worm.y + worm.height * 0.72,
      targetX: playerX, targetY: playerY, damage: 7 + Math.round(worm.scale * 2), heatC: 84 + Math.round(worm.scale * 8),
    };
  }

  private spawnHealthDrop(x: number, y: number): void {
    const visual = new THREE.Group();
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.15, 1),
      new THREE.MeshStandardMaterial({ color: '#ffb35f', emissive: '#d64e20', emissiveIntensity: 1.1, roughness: 0.32 }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.018, 6, 18),
      new THREE.MeshBasicMaterial({ color: '#ffd99c', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    visual.add(orb, ring);
    visual.position.set(x, y, 4.2);
    visual.userData.kind = 'vent-health-vesicle';
    this.scene.add(visual);
    this.drops.push({ id: `vent-vesicle-${++this.dropSequence}`, x, y, collected: false, visual });
  }

  private createWorm(height: number, scale: number, rng: () => number): THREE.Group {
    const group = new THREE.Group();
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055 * scale, 0.08 * scale, height, 8, 3),
      new THREE.MeshStandardMaterial({ color: rng() < 0.45 ? '#ede0c4' : '#c9d3bd', roughness: 0.86, emissive: '#3b251a', emissiveIntensity: 0.06 }),
    );
    tube.position.y = height * 0.5;
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.21 * scale, 0.4 * scale, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: rng() < 0.5 ? '#d94554' : '#ef7b52', roughness: 0.62, side: THREE.DoubleSide, emissive: '#701e27', emissiveIntensity: 0.32 }),
    );
    crown.position.y = height + 0.13 * scale;
    crown.rotation.x = Math.PI;
    const plume = new THREE.PointLight('#ff8e50', 0.22, 1.15, 2);
    plume.position.y = height + 0.18;
    group.userData.crown = crown;
    group.add(tube, crown, plume);
    return group;
  }
}
