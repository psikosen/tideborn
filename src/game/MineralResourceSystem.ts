import * as THREE from 'three';
import { MaterialId, ResourceKey } from './data';

export type MineralKey = Extract<ResourceKey, 'salt' | 'ironstone' | 'copperOre' | 'obsidian' | 'quartz' | 'manganese'>;

export interface MineralDefinition {
  id: MineralKey;
  label: string;
  use: string;
  icon: string;
  color: string;
}

export interface MineralDrop {
  id: string;
  mineral: MineralKey;
  x: number;
  y: number;
  phase: number;
  collected: boolean;
  sprite: THREE.Sprite;
}

export const MINERAL_DEFINITIONS: readonly MineralDefinition[] = [
  { id: 'salt', label: 'Sea salt', use: 'Season and preserve gathered food.', icon: './assets/minerals/salt.png', color: '#dff7ff' },
  { id: 'ironstone', label: 'Ironstone', use: 'Reinforce den walls and load-bearing braces.', icon: './assets/minerals/ironstone.png', color: '#c56545' },
  { id: 'copperOre', label: 'Copper ore', use: 'Bind durable composite striking tools.', icon: './assets/minerals/copper-ore.png', color: '#54d5bc' },
  { id: 'obsidian', label: 'Obsidian', use: 'Shape extremely sharp wedges and cutting edges.', icon: './assets/minerals/obsidian.png', color: '#4d9db6' },
  { id: 'quartz', label: 'Quartz', use: 'Store light and grind precise tool edges.', icon: './assets/minerals/quartz.png', color: '#a6f1ec' },
  { id: 'manganese', label: 'Manganese nodule', use: 'Future pressure-resistant composites.', icon: './assets/minerals/manganese.png', color: '#aa855d' },
] as const;

export class MineralResourceSystem {
  private static readonly YIELD_THRESHOLD = 10;
  private definitions = new Map(MINERAL_DEFINITIONS.map((definition) => [definition.id, definition]));
  private textures = new Map<MineralKey, THREE.Texture>();
  private drops: MineralDrop[] = [];
  private excavationMass = 0;
  private clayYieldIndex = 0;
  private nextId = 1;

  constructor(private scene: THREE.Scene, private rng: () => number) {
    const loader = new THREE.TextureLoader();
    for (const definition of MINERAL_DEFINITIONS) {
      const texture = loader.load(definition.icon);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(definition.id, texture);
    }
  }

  spawnFromExcavation(material: MaterialId, removed: number, x: number, y: number, canonicalDepthM: number): MineralDrop[] {
    const yieldFactor = material === MaterialId.Sand ? 0.38
      : material === MaterialId.WetSand ? 0.45
        : material === MaterialId.Soil ? 0.6
      : material === MaterialId.Clay ? 1
      : material === MaterialId.Limestone ? 0.85
        : material === MaterialId.Mineral ? 1.35
          : material === MaterialId.Basalt ? 1.1
            : 0;
    if (yieldFactor === 0 || removed <= 0) return [];
    this.excavationMass += removed * yieldFactor;
    const count = Math.min(2, Math.floor(this.excavationMass / MineralResourceSystem.YIELD_THRESHOLD));
    if (count <= 0) return [];
    this.excavationMass -= count * MineralResourceSystem.YIELD_THRESHOLD;
    const spawned: MineralDrop[] = [];
    for (let index = 0; index < count; index += 1) {
      const mineral = this.pickMineral(material, canonicalDepthM);
      const definition = this.definitions.get(mineral)!;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.textures.get(mineral),
        transparent: true,
        depthWrite: false,
        color: '#ffffff',
      }));
      const scale = mineral === 'manganese' ? 0.52 : 0.46;
      sprite.scale.set(scale, scale, 1);
      sprite.renderOrder = 16;
      const drop: MineralDrop = {
        id: `mineral-${this.nextId++}`,
        mineral,
        x: x + (this.rng() - 0.5) * 0.65,
        y: y + 0.18 + index * 0.18,
        phase: this.rng() * Math.PI * 2,
        collected: false,
        sprite,
      };
      sprite.position.set(drop.x, drop.y, 3.9);
      sprite.userData.mineralLabel = definition.label;
      this.scene.add(sprite);
      this.drops.push(drop);
      spawned.push(drop);
    }
    return spawned;
  }

  update(time: number): void {
    for (const drop of this.drops) {
      if (drop.collected) continue;
      drop.sprite.position.set(drop.x, drop.y + Math.sin(time * 2.8 + drop.phase) * 0.055, 3.9);
      const pulse = 0.92 + Math.sin(time * 3.7 + drop.phase) * 0.06;
      drop.sprite.scale.setScalar((drop.mineral === 'manganese' ? 0.52 : 0.46) * pulse);
      const material = drop.sprite.material as THREE.SpriteMaterial;
      material.opacity = 0.92 + Math.sin(time * 4.1 + drop.phase) * 0.08;
    }
  }

  nearest(x: number, y: number, range: number): MineralDrop | null {
    let nearest: MineralDrop | null = null;
    let best = range;
    for (const drop of this.drops) {
      if (drop.collected) continue;
      const distance = Math.hypot(drop.x - x, drop.y - y);
      if (distance < best) {
        nearest = drop;
        best = distance;
      }
    }
    return nearest;
  }

  collect(drop: MineralDrop): MineralDefinition {
    drop.collected = true;
    drop.sprite.visible = false;
    return this.definitions.get(drop.mineral)!;
  }

  snapshot(playerX: number, playerY: number): Array<{ id: string; mineral: MineralKey; label: string; x: number; y: number; distance: number }> {
    return this.drops
      .filter((drop) => !drop.collected && Math.abs(drop.x - playerX) < 6 && Math.abs(drop.y - playerY) < 5)
      .map((drop) => ({
        id: drop.id,
        mineral: drop.mineral,
        label: this.definitions.get(drop.mineral)!.label,
        x: Number(drop.x.toFixed(2)),
        y: Number(drop.y.toFixed(2)),
        distance: Number(Math.hypot(drop.x - playerX, drop.y - playerY).toFixed(2)),
      }));
  }

  definition(mineral: MineralKey): MineralDefinition {
    return this.definitions.get(mineral)!;
  }

  private pickMineral(material: MaterialId, depthM: number): MineralKey {
    if (material === MaterialId.Sand || material === MaterialId.WetSand) return 'salt';
    if (material === MaterialId.Soil) return 'ironstone';
    if (material === MaterialId.Clay) {
      const claySequence: MineralKey[] = ['salt', 'ironstone', 'ironstone', 'salt'];
      return claySequence[this.clayYieldIndex++ % claySequence.length];
    }
    const pool: MineralKey[] = material === MaterialId.Limestone
      ? ['quartz', 'salt', 'quartz']
      : material === MaterialId.Basalt
        ? ['obsidian', 'manganese', depthM > 6000 ? 'manganese' : 'ironstone']
        : ['ironstone', 'copperOre', 'quartz', depthM > 3000 ? 'manganese' : 'copperOre'];
    return pool[Math.floor(this.rng() * pool.length)];
  }
}
