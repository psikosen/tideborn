import * as THREE from 'three';
import { ResourceKey } from './data';

export type SupplyKey = Extract<ResourceKey, 'sponge' | 'adhesive' | 'pumice'>;

export interface SupplyDefinition {
  id: SupplyKey;
  label: string;
  use: string;
  icon: string;
  color: string;
}

interface SupplyCollectible {
  id: string;
  resource: SupplyKey;
  x: number;
  y: number;
  collected: boolean;
  sprite: THREE.Sprite;
}

export const SUPPLY_DEFINITIONS: SupplyDefinition[] = [
  { id: 'sponge', label: 'Filter sponge', use: 'Filter wet chambers and line storage slings.', icon: './assets/resources/sponge.png', color: '#e5b94c' },
  { id: 'adhesive', label: 'Mussel bio-adhesive', use: 'Bind shell edges without consuming cord.', icon: './assets/resources/adhesive.png', color: '#6ecce7' },
  { id: 'pumice', label: 'Vent pumice', use: 'Abrade stone, shell, bone, and wood into precise tools.', icon: './assets/resources/pumice.png', color: '#b8c5c6' },
];

/** Sparse, reusable sprite collectibles that do not require active physics. */
export class SupplyCollectibleSystem {
  private readonly definitions = new Map(SUPPLY_DEFINITIONS.map((definition) => [definition.id, definition]));
  private readonly collectibles: SupplyCollectible[] = [];

  constructor(scene: THREE.Scene) {
    const textureLoader = new THREE.TextureLoader();
    const textures = new Map<SupplyKey, THREE.Texture>();
    for (const definition of SUPPLY_DEFINITIONS) {
      const texture = textureLoader.load(definition.icon);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.set(definition.id, texture);
    }
    const placements: Array<[SupplyKey, number, number]> = [
      ['sponge', 5.8, -1.4], ['sponge', 16.2, -6.2], ['sponge', 39.8, -47.1],
      ['adhesive', -1.7, 0.22], ['adhesive', 11.4, -3.85], ['adhesive', 45.4, -89.7],
      ['pumice', 19.8, -9.8], ['pumice', 36.8, -35.4], ['pumice', 50.2, -99.3],
    ];
    placements.forEach(([resource, x, y], index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.get(resource), transparent: true, depthWrite: false, alphaTest: 0.08,
      }));
      const baseScale = resource === 'sponge' ? 0.58 : resource === 'adhesive' ? 0.48 : 0.54;
      sprite.scale.setScalar(baseScale);
      sprite.position.set(x, y, 3.05);
      sprite.userData.supplyCollectible = resource;
      scene.add(sprite);
      this.collectibles.push({ id: `supply-${resource}-${index}`, resource, x, y, collected: false, sprite });
    });
  }

  update(elapsed: number): void {
    for (let index = 0; index < this.collectibles.length; index += 1) {
      const collectible = this.collectibles[index];
      if (collectible.collected) continue;
      const pulse = 1 + Math.sin(elapsed * 1.7 + index * 1.33) * 0.045;
      const baseScale = collectible.resource === 'sponge' ? 0.58 : collectible.resource === 'adhesive' ? 0.48 : 0.54;
      collectible.sprite.scale.setScalar(baseScale * pulse);
      collectible.sprite.material.opacity = 0.78 + Math.sin(elapsed * 1.3 + index) * 0.12;
    }
  }

  nearest(x: number, y: number, range: number): SupplyCollectible | null {
    let nearest: SupplyCollectible | null = null;
    let best = range;
    for (const collectible of this.collectibles) {
      if (collectible.collected) continue;
      const distance = Math.hypot(collectible.x - x, collectible.y - y);
      if (distance < best) { best = distance; nearest = collectible; }
    }
    return nearest;
  }

  collect(collectible: SupplyCollectible): SupplyDefinition {
    collectible.collected = true;
    collectible.sprite.visible = false;
    return this.definitions.get(collectible.resource)!;
  }

  definition(resource: SupplyKey): SupplyDefinition {
    return this.definitions.get(resource)!;
  }

  snapshot(playerX: number, playerY: number): {
    remaining: Record<SupplyKey, number>;
    nearby: Array<{ id: string; resource: SupplyKey; label: string; distance: number; x: number; y: number }>;
  } {
    const remaining: Record<SupplyKey, number> = { sponge: 0, adhesive: 0, pumice: 0 };
    for (const collectible of this.collectibles) if (!collectible.collected) remaining[collectible.resource] += 1;
    return {
      remaining,
      nearby: this.collectibles
        .filter((collectible) => !collectible.collected && Math.hypot(collectible.x - playerX, collectible.y - playerY) <= 8)
        .map((collectible) => ({
          id: collectible.id,
          resource: collectible.resource,
          label: this.definition(collectible.resource).label,
          distance: Number(Math.hypot(collectible.x - playerX, collectible.y - playerY).toFixed(2)),
          x: collectible.x,
          y: collectible.y,
        }))
        .sort((a, b) => a.distance - b.distance),
    };
  }
}
