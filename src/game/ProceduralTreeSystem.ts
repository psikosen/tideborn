import * as THREE from 'three';
import { MatterWorld } from './MatterWorld';
import { BASE_SEA_LEVEL, MaterialId, PLANET_SEED, WORLD_MAX_Y, mulberry32 } from './data';
import { TreeWindMaterial, type TreeWindProfile } from './TreeWindMaterial';
import type { TreeInteractionBody } from './TreeInteractionSystem';

type TreeVariant = 'windswept-pine' | 'narrow-cedar' | 'shoreline-oldgrowth' | 'storm-scrub' | 'lightning-snag' | 'primitive-fern';

interface TreeDefinition {
  id: TreeVariant;
  width: number;
  height: number;
  weight: number;
  wind: TreeWindProfile;
  burialFraction: number;
}

interface TreeInstance {
  id: string;
  variant: TreeVariant;
  x: number;
  y: number;
  scale: number;
  phase: number;
  surfaceY: number;
  burialDepth: number;
  slopeAngle: number;
  width: number;
  height: number;
  mesh: THREE.Mesh<THREE.PlaneGeometry, TreeWindMaterial>;
}

interface TerrainPlacement {
  surfaceY: number;
  slopeAngle: number;
  burialDepth: number;
  supportMaterial: MaterialId;
}

const DEFINITIONS: readonly TreeDefinition[] = [
  { id: 'windswept-pine', width: 4.1, height: 3.55, weight: 1.3, burialFraction: 0.13, wind: { flexibility: 0.92, crownFlutter: 0.72, stormLean: 1.08, windStart: 0.38 } },
  { id: 'narrow-cedar', width: 1.7, height: 4.65, weight: 1.5, burialFraction: 0.09, wind: { flexibility: 1.1, crownFlutter: 0.5, stormLean: 1.18, windStart: 0.34 } },
  { id: 'shoreline-oldgrowth', width: 4.75, height: 3.65, weight: 0.55, burialFraction: 0.18, wind: { flexibility: 0.58, crownFlutter: 0.62, stormLean: 0.72, windStart: 0.48 } },
  { id: 'storm-scrub', width: 2.75, height: 2.25, weight: 1.35, burialFraction: 0.14, wind: { flexibility: 1.22, crownFlutter: 1.18, stormLean: 1.24, windStart: 0.4 } },
  { id: 'lightning-snag', width: 2.1, height: 3.95, weight: 0.38, burialFraction: 0.14, wind: { flexibility: 0.42, crownFlutter: 0.14, stormLean: 0.62, windStart: 0.58 } },
  { id: 'primitive-fern', width: 3.1, height: 3.6, weight: 0.72, burialFraction: 0.13, wind: { flexibility: 1.28, crownFlutter: 1.4, stormLean: 1.34, windStart: 0.46 } },
] as const;

/** Generated art plus deterministic placement/scale/tint/sway variation. */
export class ProceduralTreeSystem {
  private instances: TreeInstance[] = [];
  private rng: () => number;
  private geometry: THREE.PlaneGeometry;
  private lastTime = 0;
  private lastStorm = 0;

  constructor(private scene: THREE.Scene, private world: MatterWorld, seed = PLANET_SEED + 911) {
    this.rng = mulberry32(seed);
    this.geometry = new THREE.PlaneGeometry(1, 1, 10, 14);
    this.geometry.translate(0, 0.5, 0);
    const loader = new THREE.TextureLoader();
    const textures = new Map<TreeVariant, THREE.Texture>();
    for (const definition of DEFINITIONS) {
      const texture = loader.load(`./assets/trees/variants/${definition.id}.png`);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textures.set(definition.id, texture);
    }

    this.populateBand(-60.5, -44.0, 2.65, textures, 0.72);
    this.populateBand(-37.5, -15.0, 2.05, textures, 1);
  }

  update(time: number, storm: number): void {
    this.lastTime = time;
    this.lastStorm = THREE.MathUtils.clamp(storm, 0, 1);
    for (const tree of this.instances) {
      tree.mesh.material.updateWind(time, storm);
    }
  }

  interactionBodies(): TreeInteractionBody[] {
    return this.instances.map((tree) => {
      const climbHeight = tree.height * 0.78;
      return {
        id: tree.id,
        variant: tree.variant,
        baseX: tree.x,
        baseY: tree.surfaceY + 0.04,
        topX: tree.x - Math.sin(tree.slopeAngle) * climbHeight,
        topY: tree.surfaceY + Math.cos(tree.slopeAngle) * climbHeight,
        radius: THREE.MathUtils.clamp(tree.width * 0.055, 0.12, 0.29),
      };
    });
  }

  snapshot(): {
    count: number;
    variants: Record<TreeVariant, number>;
    scaleRange: [number, number];
    generatedArt: boolean;
    animation: { mode: 'gentle-wind' | 'rising-wind' | 'storm-gusts'; strength: number; gust: number; rootAnchored: boolean; renderer: 'vertex-shader' };
    placement: { method: 'weighted-terrain-tangent'; rootsBuried: number; burialRangeM: [number, number]; slopeRangeDegrees: [number, number]; terrainOccludesRoots: boolean };
  } {
    const variants = Object.fromEntries(DEFINITIONS.map((definition) => [definition.id, 0])) as Record<TreeVariant, number>;
    for (const tree of this.instances) variants[tree.variant] += 1;
    const scales = this.instances.map((tree) => tree.scale);
    const burialDepths = this.instances.map((tree) => tree.burialDepth);
    const slopeDegrees = this.instances.map((tree) => THREE.MathUtils.radToDeg(tree.slopeAngle));
    const rootsBuried = this.instances.filter((tree) => this.world.isSolid(tree.x, tree.mesh.position.y)).length;
    const gustWave = 0.5 + 0.5 * Math.sin(this.lastTime * 0.61);
    const mode = this.lastStorm > 0.55 ? 'storm-gusts' : this.lastStorm > 0.12 ? 'rising-wind' : 'gentle-wind';
    return {
      count: this.instances.length,
      variants,
      scaleRange: [Number(Math.min(...scales).toFixed(2)), Number(Math.max(...scales).toFixed(2))],
      generatedArt: true,
      animation: {
        mode,
        strength: Number((0.18 + this.lastStorm * 0.82).toFixed(2)),
        gust: Number((gustWave * gustWave * this.lastStorm).toFixed(2)),
        rootAnchored: true,
        renderer: 'vertex-shader',
      },
      placement: {
        method: 'weighted-terrain-tangent',
        rootsBuried,
        burialRangeM: [Number(Math.min(...burialDepths).toFixed(2)), Number(Math.max(...burialDepths).toFixed(2))],
        slopeRangeDegrees: [Number(Math.min(...slopeDegrees).toFixed(1)), Number(Math.max(...slopeDegrees).toFixed(1))],
        terrainOccludesRoots: this.world.mesh.renderOrder > Math.max(...this.instances.map((tree) => tree.mesh.renderOrder)),
      },
    };
  }

  private populateBand(start: number, end: number, spacing: number, textures: Map<TreeVariant, THREE.Texture>, density: number): void {
    let x = start + this.rng() * spacing;
    while (x < end) {
      if (this.rng() <= density) this.addTree(x, textures);
      x += spacing * (0.72 + this.rng() * 0.72);
    }
  }

  private addTree(x: number, textures: Map<TreeVariant, THREE.Texture>): void {
    const sampledSurfaceY = this.surfaceAt(x);
    if (sampledSurfaceY === null || sampledSurfaceY < BASE_SEA_LEVEL + 0.06) return;
    // Seed the first six valid sites with the complete art family, then let
    // habitat-weighted selection take over. Every build showcases the pack
    // while all later forests remain genuinely procedural.
    const definition = this.instances.length < DEFINITIONS.length
      ? DEFINITIONS[this.instances.length]
      : this.pickDefinition(sampledSurfaceY);
    const scale = 0.68 + this.rng() * 0.72;
    const texture = textures.get(definition.id);
    if (!texture) return;
    const placement = this.terrainPlacementAt(x, definition.width * scale, definition.height * scale, definition.burialFraction);
    if (!placement) return;
    const phase = this.rng() * Math.PI * 2;
    const material = new TreeWindMaterial(
      texture,
      new THREE.Color().setHSL(0.41 + (this.rng() - 0.5) * 0.025, 0.25 + this.rng() * 0.09, 0.72 + this.rng() * 0.08),
      phase,
      definition.wind,
    );
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.scale.set(definition.width * scale, definition.height * scale, 1);
    mesh.position.set(x, placement.surfaceY - placement.burialDepth, -3.25 - this.rng() * 0.28);
    mesh.rotation.z = placement.slopeAngle;
    mesh.renderOrder = 2;
    mesh.userData.treeVariant = definition.id;
    mesh.userData.windProfile = definition.wind;
    mesh.userData.surfaceY = placement.surfaceY;
    mesh.userData.burialDepth = placement.burialDepth;
    mesh.userData.slopeAngle = placement.slopeAngle;
    mesh.userData.supportMaterial = placement.supportMaterial;
    this.scene.add(mesh);
    this.instances.push({
      id: `tree-${this.instances.length + 1}`,
      variant: definition.id,
      x,
      y: placement.surfaceY,
      scale,
      phase,
      surfaceY: placement.surfaceY,
      burialDepth: placement.burialDepth,
      slopeAngle: placement.slopeAngle,
      width: definition.width * scale,
      height: definition.height * scale,
      mesh,
    });
  }

  /**
   * Fit a weighted line through the granular surface near the trunk. The
   * fitted tangent suppresses one-cell staircase noise; a capped fraction of
   * its angle gives the planted tree a believable slope response while its
   * biological growth still favors vertical. The root pivot is then sunk far
   * enough to put the source art's painted roots inside solid terrain.
   */
  private terrainPlacementAt(x: number, treeWidth: number, treeHeight: number, burialFraction: number): TerrainPlacement | null {
    const centerY = this.surfaceAt(x);
    if (centerY === null) return null;
    const radius = THREE.MathUtils.clamp(treeWidth * 0.18, this.world.cellSize * 2, 0.82);
    const samples: { dx: number; y: number; weight: number }[] = [];
    for (let index = -3; index <= 3; index += 1) {
      const dx = radius * index / 3;
      const y = this.surfaceAt(x + dx);
      if (y === null) continue;
      samples.push({ dx, y, weight: 1 / (1 + Math.abs(index) * 0.34) });
    }
    if (samples.length < 3) return null;
    const weightTotal = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const meanX = samples.reduce((sum, sample) => sum + sample.dx * sample.weight, 0) / weightTotal;
    const meanY = samples.reduce((sum, sample) => sum + sample.y * sample.weight, 0) / weightTotal;
    const numerator = samples.reduce((sum, sample) => sum + sample.weight * (sample.dx - meanX) * (sample.y - meanY), 0);
    const denominator = samples.reduce((sum, sample) => sum + sample.weight * (sample.dx - meanX) ** 2, 0);
    const terrainSlope = denominator > 1e-5 ? numerator / denominator : 0;
    const tangentAngle = Math.atan(terrainSlope);
    const slopeAngle = THREE.MathUtils.clamp(tangentAngle * 0.55, THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(14));
    const burialDepth = Math.max(this.world.cellSize * 2.25, treeHeight * burialFraction);
    const supportMaterial = this.world.getMaterial(x, centerY - this.world.cellSize * 0.5);
    return { surfaceY: centerY, slopeAngle, burialDepth, supportMaterial };
  }

  private surfaceAt(x: number): number | null {
    for (let y = WORLD_MAX_Y - this.world.cellSize; y >= BASE_SEA_LEVEL - 0.2; y -= this.world.cellSize) {
      const material = this.world.getMaterial(x, y);
      const supportsTree = material === MaterialId.Soil || material === MaterialId.Clay || material === MaterialId.Limestone;
      if (supportsTree && !this.world.isSolid(x, y + this.world.cellSize)) return y + this.world.cellSize * 0.5;
    }
    return null;
  }

  private pickDefinition(surfaceY: number): TreeDefinition {
    const weighted = DEFINITIONS.map((definition) => ({
      definition,
      weight: definition.weight * (surfaceY < BASE_SEA_LEVEL + 1.4 && definition.id === 'primitive-fern' ? 2.2 : 1),
    }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let cursor = this.rng() * total;
    for (const item of weighted) {
      cursor -= item.weight;
      if (cursor <= 0) return item.definition;
    }
    return weighted[weighted.length - 1].definition;
  }
}
