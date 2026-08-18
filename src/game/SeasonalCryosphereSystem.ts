import * as THREE from 'three';
import { MatterWorld } from './MatterWorld';
import type { SeasonState } from './SeasonSystem';
import {
  BASE_SEA_LEVEL,
  MaterialId,
  PLANET_SEED,
  WORLD_WIDTH,
  clamp,
  mulberry32,
  wrapWorldX,
} from './data';

interface TerrainColumn {
  cellX: number;
  worldX: number;
  surfaceCellY: number;
  surfaceY: number;
  openWater: boolean;
  hash: number;
}

export interface RegionalColdState {
  province: 'temperate-current' | 'alpine-frost' | 'ice-current';
  coldness: number;
  airTemperatureC: number;
  snowfallIntensity: number;
  freezeCoverage: number;
  surfaceFrozen: boolean;
  snowCovered: boolean;
}

export interface CryosphereSnapshot {
  renderer: 'instanced-ice-shader+material-cells+points';
  updateIntervalSeconds: number;
  global: {
    frozenSurfaceCells: number;
    snowCells: number;
    coldColumns: number;
    brokenIceColumns: number;
  };
  local: RegionalColdState;
}

interface CryosphereUpdateInput {
  elapsed: number;
  storm: number;
  seaLevel: number;
  playerX: number;
  playerY: number;
  cameraX: number;
  cameraY: number;
  season: SeasonState;
}

const iceVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const iceFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;
  varying vec2 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  void main() {
    float grain = hash(floor(vWorld * vec2(7.0, 19.0)));
    float crackA = abs(sin(vWorld.x * 3.7 + sin(vWorld.x * 1.31) * 2.2 + vUv.y * 8.0));
    float crackB = abs(sin(vWorld.x * 7.3 - vUv.y * 11.0 + grain * 5.0));
    float crack = 1.0 - smoothstep(0.025, 0.12, min(crackA, crackB));
    float rim = smoothstep(0.0, 0.18, vUv.y) * smoothstep(0.0, 0.18, 1.0 - vUv.y);
    float shimmer = 0.03 * sin(uTime * 0.55 + vWorld.x * 1.9);
    vec3 color = mix(vec3(0.62, 0.86, 0.90), vec3(0.96, 1.0, 0.985), 0.42 + grain * 0.38 + shimmer);
    color *= 1.0 - crack * 0.36;
    color += vec3(0.22, 0.38, 0.40) * rim;
    gl_FragColor = vec4(color, 0.94);
  }
`;

/**
 * Regional seasonal snow and sea ice. The rendered crust mirrors real solid
 * material cells, so collision/digging remains owned by MatterWorld while
 * the particles and instanced shader can be replaced independently.
 */
export class SeasonalCryosphereSystem {
  readonly updateIntervalSeconds = 0.5;

  private readonly columns: TerrainColumn[] = [];
  private readonly ownedIce = new Map<string, { x: number; y: number }>();
  private readonly ownedSnow = new Map<string, { x: number; y: number }>();
  private readonly brokenIceColumns = new Set<number>();
  private readonly iceMesh: THREE.InstancedMesh;
  private readonly iceMaterial: THREE.ShaderMaterial;
  private readonly snow: THREE.Points;
  private readonly rng: () => number;
  private nextMaterialUpdate = 0;
  private lastSeasonId = '';
  private local: RegionalColdState = {
    province: 'temperate-current',
    coldness: 0,
    airTemperatureC: 18,
    snowfallIntensity: 0,
    freezeCoverage: 0,
    surfaceFrozen: false,
    snowCovered: false,
  };

  constructor(private readonly scene: THREE.Scene, private readonly world: MatterWorld, seed = PLANET_SEED + 5081) {
    this.rng = mulberry32(seed);
    this.buildColumns(seed);
    this.iceMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: iceVertex,
      fragmentShader: iceFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.iceMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(this.world.cellSize * 1.1, this.world.cellSize * 2.15),
      this.iceMaterial,
      this.world.width,
    );
    this.iceMesh.count = 0;
    this.iceMesh.frustumCulled = false;
    this.iceMesh.renderOrder = 13;
    this.scene.add(this.iceMesh);

    const positions = new Float32Array(440 * 3);
    for (let index = 0; index < positions.length / 3; index += 1) {
      positions[index * 3] = (this.rng() - 0.5) * 38;
      positions[index * 3 + 1] = (this.rng() - 0.45) * 24;
      positions[index * 3 + 2] = 7 + this.rng() * 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.snow = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: '#f1faf7',
      size: 0.11,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }));
    this.snow.visible = false;
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 24;
    this.scene.add(this.snow);
  }

  update(input: CryosphereUpdateInput): void {
    this.iceMaterial.uniforms.uTime.value = input.elapsed;
    if (input.season.id !== this.lastSeasonId) {
      this.brokenIceColumns.clear();
      this.lastSeasonId = input.season.id;
      this.nextMaterialUpdate = 0;
    }
    if (input.elapsed >= this.nextMaterialUpdate) {
      this.reconcileMaterials(input.season, input.seaLevel);
      this.nextMaterialUpdate = input.elapsed + this.updateIntervalSeconds;
    }

    const localSurface = this.surfaceNear(input.playerX);
    this.local = this.climateAt(input.playerX, localSurface?.surfaceY ?? input.seaLevel, input.season, input.storm);
    const nearbyIce = this.hasOwnedNear(this.ownedIce, input.playerX, 1.1);
    const nearbySnow = this.hasOwnedNear(this.ownedSnow, input.playerX, 1.1);
    this.local.surfaceFrozen = nearbyIce;
    this.local.snowCovered = nearbySnow;
    this.updateSnowfall(input, this.local.snowfallIntensity);
  }

  climateAt(x: number, elevation: number, season: SeasonState, storm = 0): RegionalColdState {
    const wrapped = wrapWorldX(x);
    const iceCurrentDistanceRaw = Math.abs(wrapped + 53.5);
    const iceCurrentDistance = Math.min(iceCurrentDistanceRaw, WORLD_WIDTH - iceCurrentDistanceRaw);
    const iceCurrent = 1 - this.smoothstep(6, 21, iceCurrentDistance);
    const alpine = clamp((elevation - 6.2) / 6.6, 0, 1);
    const coldness = clamp(Math.max(iceCurrent, alpine * 0.82), 0, 1);
    const airTemperatureC = 12.5
      + season.temperatureOffsetC
      - iceCurrent * 15.8
      - Math.max(0, elevation - 5.5) * 0.72;
    const freezeTemperature = clamp((0.6 - airTemperatureC) / 8, 0, 1);
    const snowfallIntensity = season.snowfallPotential
      * coldness
      * clamp((2.2 - airTemperatureC) / 7, 0, 1)
      * (0.5 + storm * 0.5);
    const freezeCoverage = season.seaIcePotential * coldness * freezeTemperature;
    return {
      province: iceCurrent > 0.48 ? 'ice-current' : alpine > 0.2 ? 'alpine-frost' : 'temperate-current',
      coldness: Number(coldness.toFixed(3)),
      airTemperatureC: Number(airTemperatureC.toFixed(2)),
      snowfallIntensity: Number(clamp(snowfallIntensity, 0, 1).toFixed(3)),
      freezeCoverage: Number(clamp(freezeCoverage, 0, 1).toFixed(3)),
      surfaceFrozen: false,
      snowCovered: false,
    };
  }

  snapshot(): CryosphereSnapshot {
    return {
      renderer: 'instanced-ice-shader+material-cells+points',
      updateIntervalSeconds: this.updateIntervalSeconds,
      global: {
        frozenSurfaceCells: this.ownedIce.size,
        snowCells: this.ownedSnow.size,
        coldColumns: this.columns.filter((column) => this.staticColdness(column.worldX, column.surfaceY) > 0.35).length,
        brokenIceColumns: this.brokenIceColumns.size,
      },
      local: { ...this.local },
    };
  }

  private buildColumns(seed: number): void {
    for (let cellX = 0; cellX < this.world.width; cellX += 1) {
      let surfaceCellY = -1;
      for (let cellY = this.world.height - 1; cellY >= 1; cellY -= 1) {
        const material = this.world.getCellMaterial(cellX, cellY);
        if (this.isTerrainSolid(material)) {
          surfaceCellY = cellY;
          break;
        }
      }
      if (surfaceCellY < 0) continue;
      const surface = this.world.cellToWorld(cellX, surfaceCellY);
      this.columns.push({
        cellX,
        worldX: surface.x,
        surfaceCellY,
        surfaceY: surface.y + this.world.cellSize * 0.5,
        openWater: surface.y < BASE_SEA_LEVEL - 0.3,
        hash: this.hash(cellX * 0.37 + seed * 0.0001),
      });
    }
  }

  private reconcileMaterials(season: SeasonState, seaLevel: number): void {
    for (const [key, cell] of [...this.ownedIce]) {
      if (this.world.getCellMaterial(cell.x, cell.y) !== MaterialId.Ice) {
        this.brokenIceColumns.add(cell.x);
        this.ownedIce.delete(key);
      }
    }

    const desiredIce = new Map<string, { x: number; y: number }>();
    const desiredSnow = new Map<string, { x: number; y: number }>();
    const seaCellY = this.world.worldToCell(0, seaLevel - this.world.cellSize * 0.24).y;
    for (const column of this.columns) {
      const coldness = this.staticColdness(column.worldX, column.surfaceY);
      if (coldness <= 0.05) continue;
      const climate = this.climateAt(column.worldX, column.surfaceY, season);
      if (column.openWater) {
        const patchHash = this.hash(Math.floor(column.cellX / 3) * 1.913 + 5.7);
        const seasonalCore = season.seaIcePotential <= 0.05
          ? 0
          : coldness * 0.18 * clamp((season.seaIcePotential - 0.05) / 0.95, 0, 1);
        const connectedCoreCoverage = clamp(climate.freezeCoverage * 1.28 + seasonalCore, 0, 1);
        if (!this.brokenIceColumns.has(column.cellX) && patchHash <= connectedCoreCoverage) {
          desiredIce.set(this.key(column.cellX, seaCellY), { x: column.cellX, y: seaCellY });
        }
      } else if (column.surfaceY >= BASE_SEA_LEVEL + 0.05) {
        const altitudeFactor = clamp((column.surfaceY - season.snowLineM + 4) / 6, 0.25, 1);
        const coverage = clamp(climate.snowfallIntensity * (0.58 + altitudeFactor * 0.7), 0, 1);
        if (column.hash <= coverage) {
          const layers = coverage > 0.66 && this.hash(column.cellX * 1.71) < coverage ? 2 : 1;
          for (let layer = 1; layer <= layers; layer += 1) {
            const y = column.surfaceCellY + layer;
            desiredSnow.set(this.key(column.cellX, y), { x: column.cellX, y });
          }
        }
      }
    }

    this.reconcileOwned(this.ownedIce, desiredIce, MaterialId.Ice, 255, -45);
    this.reconcileOwned(this.ownedSnow, desiredSnow, MaterialId.Snow, 135, -25);
    this.refreshIceInstances();
  }

  private reconcileOwned(
    owned: Map<string, { x: number; y: number }>,
    desired: Map<string, { x: number; y: number }>,
    material: MaterialId,
    moisture: number,
    temperatureTenthsC: number,
  ): void {
    for (const [key, cell] of [...owned]) {
      if (desired.has(key)) continue;
      this.world.clearNaturalCell(cell.x, cell.y, material);
      owned.delete(key);
    }
    for (const [key, cell] of desired) {
      if (owned.has(key)) continue;
      if (this.world.setNaturalCell(cell.x, cell.y, material, moisture, temperatureTenthsC)) owned.set(key, cell);
    }
  }

  private refreshIceInstances(): void {
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (const cell of this.ownedIce.values()) {
      const world = this.world.cellToWorld(cell.x, cell.y);
      matrix.makeTranslation(world.x, world.y + this.world.cellSize * 0.42, 2.35);
      this.iceMesh.setMatrixAt(index, matrix);
      index += 1;
    }
    this.iceMesh.count = index;
    this.iceMesh.instanceMatrix.needsUpdate = true;
    this.iceMesh.visible = index > 0;
  }

  private updateSnowfall(input: CryosphereUpdateInput, intensity: number): void {
    const visible = intensity > 0.025 && input.playerY > input.seaLevel - 6;
    this.snow.visible = visible;
    if (!visible) return;
    const material = this.snow.material as THREE.PointsMaterial;
    material.opacity = clamp(0.18 + intensity * 0.72, 0, 0.9);
    this.snow.position.set(input.cameraX, input.cameraY, 0);
    const position = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      let x = position.getX(index) - (0.018 + input.storm * 0.06) * intensity;
      let y = position.getY(index) - (0.035 + (index % 7) * 0.0025) * (0.45 + intensity);
      if (y < -11.5) {
        y = 11.5 + this.rng() * 1.5;
        x = (this.rng() - 0.5) * 38;
      }
      if (x < -20) x += 40;
      position.setXY(index, x, y);
    }
    position.needsUpdate = true;
  }

  private surfaceNear(x: number): TerrainColumn | undefined {
    const wrapped = wrapWorldX(x);
    let nearest: TerrainColumn | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const column of this.columns) {
      const direct = Math.abs(column.worldX - wrapped);
      const distance = Math.min(direct, WORLD_WIDTH - direct);
      if (distance < best) {
        nearest = column;
        best = distance;
      }
    }
    return nearest;
  }

  private hasOwnedNear(owned: Map<string, { x: number; y: number }>, x: number, radiusM: number): boolean {
    const wrapped = wrapWorldX(x);
    for (const cell of owned.values()) {
      const worldX = this.world.cellToWorld(cell.x, cell.y).x;
      const direct = Math.abs(worldX - wrapped);
      if (Math.min(direct, WORLD_WIDTH - direct) <= radiusM) return true;
    }
    return false;
  }

  private staticColdness(x: number, elevation: number): number {
    const wrapped = wrapWorldX(x);
    const direct = Math.abs(wrapped + 53.5);
    const distance = Math.min(direct, WORLD_WIDTH - direct);
    const iceCurrent = 1 - this.smoothstep(6, 21, distance);
    const alpine = clamp((elevation - 6.2) / 6.6, 0, 1) * 0.82;
    return Math.max(iceCurrent, alpine);
  }

  private isTerrainSolid(material: MaterialId): boolean {
    return material !== MaterialId.Empty
      && material !== MaterialId.Water
      && material !== MaterialId.Lava
      && material !== MaterialId.Steam
      && material !== MaterialId.VentFluid;
  }

  private key(x: number, y: number): string {
    return `${x}:${y}`;
  }

  private hash(value: number): number {
    return this.hashUnit(Math.sin(value * 12.9898) * 43758.5453);
  }

  private hashUnit(value: number): number {
    return value - Math.floor(value);
  }

  private smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
}
