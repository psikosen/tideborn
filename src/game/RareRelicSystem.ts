import * as THREE from 'three';
import { MaterialId, WORLD_WIDTH } from './data';

export type RelicId = 'stone-adze' | 'ceramic-insulator' | 'titanium-clasp' | 'fused-glass-lens' | 'zircon-crystal' | 'garnet-cluster';

export interface RelicDefinition {
  id: RelicId;
  label: string;
  category: 'human artifact' | 'rare mineral';
  description: string;
  use: string;
  color: string;
}

interface RelicDrop {
  id: string;
  relic: RelicId;
  x: number;
  y: number;
  phase: number;
  collected: boolean;
  visual: THREE.Group;
}

const DEFINITIONS: readonly RelicDefinition[] = [
  {
    id: 'stone-adze', label: 'Ancient knapped-stone adze', category: 'human artifact', color: '#9c947f',
    description: 'A shaped stone edge can survive millennia after its binding and handle disappear.',
    use: 'Equip it from the hotbar for efficient soil, clay, and limestone excavation.',
  },
  {
    id: 'ceramic-insulator', label: 'Fired-ceramic insulator', category: 'human artifact', color: '#e2d4b9',
    description: 'A salt-worn electrical ceramic from a drowned coastal grid.',
    use: 'Archive it in a den; later geothermal systems can reuse its heat-resistant body.',
  },
  {
    id: 'titanium-clasp', label: 'Titanium equipment clasp', category: 'human artifact', color: '#9ebac0',
    description: 'A corrosion-resistant fitting outlived the fabric and machine it once secured.',
    use: 'While carried, its ridged frame improves tool and rope attachment.',
  },
  {
    id: 'fused-glass-lens', label: 'Fused-glass optical lens', category: 'human artifact', color: '#7fe8de',
    description: 'Buried optical glass remains recognizable in a concretion from the drowned age.',
    use: 'While carried, it spreads living light farther through black water.',
  },
  {
    id: 'zircon-crystal', label: 'Hadal zircon crystal', category: 'rare mineral', color: '#b8eeff',
    description: 'A rare durable crystal released from ancient metamorphic sediment.',
    use: 'Future precision tools can use its hardness and thermal stability.',
  },
  {
    id: 'garnet-cluster', label: 'Deep garnet cluster', category: 'rare mineral', color: '#e05b7c',
    description: 'Pressure-grown garnet exposed where the trench cuts the planetary crust.',
    use: 'An abrasive and pressure-resistant component for advanced octopus technology.',
  },
] as const;

/** Sparse excavation finds, carried separately from bulk mineral fragments. */
export class RareRelicSystem {
  private definitions = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));
  private drops: RelicDrop[] = [];
  private carried: RelicId[] = [];
  private excavationMass = 0;
  private discoveryIndex = 0;
  private nextId = 1;

  constructor(private scene: THREE.Scene, private rng: () => number) {}

  spawnFromExcavation(material: MaterialId, removed: number, x: number, y: number, canonicalDepthM: number): RelicDrop[] {
    const hardFactor = material === MaterialId.Basalt ? 1.5
      : material === MaterialId.Limestone ? 1.15
        : material === MaterialId.Clay || material === MaterialId.Soil ? 0.78
          : material === MaterialId.Mineral ? 1.7
            : 0.18;
    this.excavationMass += removed * hardFactor;
    const threshold = canonicalDepthM > 12000 ? 30 : 44;
    if (this.excavationMass < threshold) return [];
    this.excavationMass -= threshold;
    const relic = this.pick(material, canonicalDepthM);
    const visual = this.createVisual(relic);
    const drop: RelicDrop = {
      id: `relic-${this.nextId++}`,
      relic,
      x: x + (this.rng() - 0.5) * 0.55,
      y: y + 0.24,
      phase: this.rng() * Math.PI * 2,
      collected: false,
      visual,
    };
    visual.position.set(drop.x, drop.y, 4.15);
    visual.userData.relicId = relic;
    this.scene.add(visual);
    this.drops.push(drop);
    return [drop];
  }

  update(time: number): void {
    for (const drop of this.drops) {
      if (drop.collected) continue;
      drop.visual.position.y = drop.y + Math.sin(time * 2.1 + drop.phase) * 0.045;
      drop.visual.rotation.z = Math.sin(time * 0.7 + drop.phase) * 0.11;
      const pulse = 0.94 + Math.sin(time * 3.2 + drop.phase) * 0.06;
      drop.visual.scale.setScalar(pulse);
    }
  }

  serializeDrops(): { version: 1; drops: Array<{ id: string; relic: RelicId; x: number; y: number }>; carried: RelicId[]; nextId: number } {
    return {
      version: 1,
      drops: this.drops.filter((drop) => !drop.collected).map((drop) => ({ id: drop.id, relic: drop.relic, x: drop.x, y: drop.y })),
      carried: [...this.carried],
      nextId: this.nextId,
    };
  }

  deserializeDrops(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const record = data as { version?: unknown; drops?: unknown; carried?: unknown; nextId?: unknown };
    if (record.version !== 1) return;
    if (Array.isArray(record.carried)) {
      for (const id of record.carried) {
        if (typeof id === 'string' && this.definitions.has(id as RelicId)) this.carried.push(id as RelicId);
      }
    }
    if (!Array.isArray(record.drops)) return;
    for (const entry of record.drops) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as { id?: unknown; relic?: unknown; x?: unknown; y?: unknown };
      if (typeof item.relic !== 'string' || !this.definitions.has(item.relic as RelicId)) continue;
      if (typeof item.x !== 'number' || typeof item.y !== 'number') continue;
      if (this.drops.some((existing) => existing.id === item.id)) continue;
      const visual = this.createVisual(item.relic as RelicId);
      const drop: RelicDrop = {
        id: typeof item.id === 'string' ? item.id : `relic-${this.nextId++}`,
        relic: item.relic as RelicId,
        x: item.x,
        y: item.y,
        phase: this.rng() * Math.PI * 2,
        collected: false,
        visual,
      };
      visual.position.set(drop.x, drop.y, 4.15);
      visual.userData.relicId = drop.relic;
      this.scene.add(visual);
      this.drops.push(drop);
    }
    if (typeof record.nextId === 'number') this.nextId = Math.max(this.nextId, Math.floor(record.nextId));
  }

  nearest(x: number, y: number, range: number): RelicDrop | null {
    let nearest: RelicDrop | null = null;
    let best = range;
    for (const drop of this.drops) {
      if (drop.collected) continue;
      const distance = Math.hypot(this.horizontalDistance(drop.x, x), drop.y - y);
      if (distance < best) { nearest = drop; best = distance; }
    }
    return nearest;
  }

  collect(drop: RelicDrop): RelicDefinition {
    drop.collected = true;
    drop.visual.visible = false;
    this.carried.push(drop.relic);
    return this.definition(drop.relic);
  }

  storeOldest(): RelicDefinition | null {
    const relic = this.carried.shift();
    return relic ? this.definition(relic) : null;
  }

  carriedCount(relic: RelicId): number {
    return this.carried.filter((candidate) => candidate === relic).length;
  }

  effects(): { biolightRadiusBonusM: number; attachmentStrength: number } {
    return {
      biolightRadiusBonusM: Math.min(2.4, this.carriedCount('fused-glass-lens') * 1.2),
      attachmentStrength: Math.min(0.3, this.carriedCount('titanium-clasp') * 0.12),
    };
  }

  snapshot(playerX: number, playerY: number): {
    carried: Array<{ id: RelicId; label: string; category: string; use: string }>;
    effects: ReturnType<RareRelicSystem['effects']>;
    nearby: Array<{ id: string; relic: RelicId; label: string; category: string; x: number; y: number; distance: number }>;
    rarity: string;
  } {
    return {
      carried: this.carried.map((id) => {
        const definition = this.definition(id);
        return { id, label: definition.label, category: definition.category, use: definition.use };
      }),
      effects: this.effects(),
      nearby: this.drops.filter((drop) => !drop.collected).map((drop) => ({
        drop,
        distance: Math.hypot(this.horizontalDistance(drop.x, playerX), drop.y - playerY),
      })).filter(({ distance }) => distance < 7).map(({ drop, distance }) => ({
        id: drop.id,
        relic: drop.relic,
        label: this.definition(drop.relic).label,
        category: this.definition(drop.relic).category,
        x: Number(drop.x.toFixed(2)), y: Number(drop.y.toFixed(2)), distance: Number(distance.toFixed(2)),
      })),
      rarity: 'approximately one find per 30–44 weighted excavated cells',
    };
  }

  definition(id: RelicId): RelicDefinition {
    return this.definitions.get(id)!;
  }

  private pick(material: MaterialId, depthM: number): RelicId {
    const deepPool: RelicId[] = depthM > 9000
      ? ['garnet-cluster', 'zircon-crystal', 'titanium-clasp', 'fused-glass-lens']
      : material === MaterialId.Basalt
        ? ['garnet-cluster', 'zircon-crystal', 'stone-adze']
        : ['stone-adze', 'ceramic-insulator', 'fused-glass-lens', 'titanium-clasp'];
    const forcedSequence: RelicId[] = ['stone-adze', 'fused-glass-lens', 'zircon-crystal', 'ceramic-insulator'];
    const id = this.discoveryIndex < forcedSequence.length
      ? forcedSequence[this.discoveryIndex]
      : deepPool[Math.floor(this.rng() * deepPool.length)];
    this.discoveryIndex += 1;
    return id;
  }

  private createVisual(id: RelicId): THREE.Group {
    const group = new THREE.Group();
    const definition = this.definition(id);
    if (id === 'stone-adze') {
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 5), new THREE.MeshStandardMaterial({ color: '#8f8a78', roughness: 0.96 }));
      head.rotation.z = Math.PI * 0.5;
      const remnant = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 14), new THREE.MeshStandardMaterial({ color: '#56654b', roughness: 1 }));
      remnant.scale.y = 0.62;
      group.add(head, remnant);
    } else if (id === 'ceramic-insulator') {
      const material = new THREE.MeshStandardMaterial({ color: '#ded0b7', roughness: 0.48 });
      for (let i = -1; i <= 1; i += 1) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.18 - Math.abs(i) * 0.025, 0.18 - Math.abs(i) * 0.025, 0.09, 14), material);
        disc.position.y = i * 0.095;
        group.add(disc);
      }
    } else if (id === 'titanium-clasp') {
      const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 20, Math.PI * 1.55), new THREE.MeshStandardMaterial({ color: '#a9c2c7', metalness: 0.72, roughness: 0.26 }));
      clasp.rotation.z = 0.45;
      group.add(clasp);
    } else if (id === 'fused-glass-lens') {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), new THREE.MeshPhysicalMaterial({ color: '#7ee2db', transparent: true, opacity: 0.55, transmission: 0.25, roughness: 0.12, emissive: '#1b5f5b', emissiveIntensity: 0.45 }));
      lens.scale.z = 0.18;
      group.add(lens);
    } else {
      const mineral = new THREE.Mesh(
        id === 'zircon-crystal' ? new THREE.OctahedronGeometry(0.22, 0) : new THREE.DodecahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.3, metalness: 0.08, emissive: definition.color, emissiveIntensity: 0.28 }),
      );
      mineral.scale.set(0.82, 1.25, 0.72);
      group.add(mineral);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.34, 24), new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.34, side: THREE.DoubleSide }));
    ring.renderOrder = 17;
    group.add(ring);
    return group;
  }

  private horizontalDistance(a: number, b: number): number {
    const raw = a - b;
    if (Math.abs(raw) <= WORLD_WIDTH * 0.5) return raw;
    return raw > 0 ? raw - WORLD_WIDTH : raw + WORLD_WIDTH;
  }
}

export { DEFINITIONS as RARE_RELIC_DEFINITIONS };
