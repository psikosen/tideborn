import * as THREE from 'three';
import { MATERIAL_NAMES, MaterialId } from './data';
import { MatterWorld } from './MatterWorld';

export interface SurfaceContact {
  material: MaterialId;
  materialName: string;
  color: THREE.Color;
  accent: THREE.Color;
  directionX: number;
  directionY: number;
  distance: number;
}

interface MaterialAppearance {
  color: string;
  accent: string;
}

// These values mirror the average, lit colors in MatterWorld's material
// shader. Keeping the mapping in this utility lets later chromatophore tiers
// add sampled texture/noise without coupling predator AI to rendering code.
const MATERIAL_APPEARANCE: Partial<Record<MaterialId, MaterialAppearance>> = {
  [MaterialId.Sand]: { color: '#b99458', accent: '#d2b877' },
  [MaterialId.WetSand]: { color: '#655747', accent: '#89765c' },
  [MaterialId.Soil]: { color: '#403129', accent: '#635044' },
  [MaterialId.Mud]: { color: '#39302c', accent: '#594941' },
  [MaterialId.Clay]: { color: '#654a42', accent: '#88675c' },
  [MaterialId.Limestone]: { color: '#70776a', accent: '#959b87' },
  [MaterialId.Basalt]: { color: '#20272c', accent: '#3d474d' },
  [MaterialId.CrushedShell]: { color: '#cbbba2', accent: '#eee1ca' },
  [MaterialId.KelpFiber]: { color: '#376f4b', accent: '#6b9c65' },
  [MaterialId.Wood]: { color: '#533921', accent: '#80603a' },
  [MaterialId.Mineral]: { color: '#287f80', accent: '#61aaa3' },
};

/**
 * Finds body-scale contact against the live microcell field and translates the
 * touched matter into an adaptive chromatophore palette. It is intentionally
 * separate from Octopus so rigid grip constraints or richer texture sampling
 * can replace this first contact model later.
 */
export class SurfaceAdaptationSystem {
  private readonly fallbackAppearance: MaterialAppearance = { color: '#315d59', accent: '#578981' };

  sampleUnderlying(world: MatterWorld, x: number, y: number): SurfaceContact | null {
    // Probe the support directly beneath the mantle first. Wide probes keep
    // camouflage stable while crossing a one-cell ledge or loose pile.
    for (const dx of [0, -0.18, 0.18, -0.34, 0.34]) {
      const contact = this.contactAt(world, x, y, dx, -0.44);
      if (contact) return contact;
    }
    return null;
  }

  sampleGrippable(world: MatterWorld, x: number, y: number): SurfaceContact | null {
    const beneath = this.sampleUnderlying(world, x, y);
    if (beneath) return beneath;

    // Search a sucker-length ellipse around the body. Floor, wall, ceiling,
    // and irregular cave contacts all use the same deterministic query.
    let closest: SurfaceContact | null = null;
    for (let ring = 0; ring < 3; ring += 1) {
      const rx = 0.48 + ring * 0.07;
      const ry = 0.41 + ring * 0.06;
      for (let sample = 0; sample < 32; sample += 1) {
        const angle = (sample / 32) * Math.PI * 2;
        const contact = this.contactAt(world, x, y, Math.cos(angle) * rx, Math.sin(angle) * ry);
        if (contact && (!closest || contact.distance < closest.distance)) closest = contact;
      }
      if (closest) break;
    }
    return closest;
  }

  openWaterProfile(): Pick<SurfaceContact, 'materialName' | 'color' | 'accent'> {
    return {
      materialName: 'open water',
      color: new THREE.Color(this.fallbackAppearance.color),
      accent: new THREE.Color(this.fallbackAppearance.accent),
    };
  }

  private contactAt(world: MatterWorld, x: number, y: number, dx: number, dy: number): SurfaceContact | null {
    if (!world.isSolid(x + dx, y + dy)) return null;
    const material = world.getMaterial(x + dx, y + dy);
    const appearance = MATERIAL_APPEARANCE[material] ?? this.fallbackAppearance;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      material,
      materialName: MATERIAL_NAMES[material] ?? 'unknown surface',
      color: new THREE.Color(appearance.color),
      accent: new THREE.Color(appearance.accent),
      directionX: dx / distance,
      directionY: dy / distance,
      distance,
    };
  }
}
