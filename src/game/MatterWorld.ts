import * as THREE from 'three';
import {
  BASE_SEA_LEVEL,
  MaterialId,
  PLANET_SEED,
  WORLD_HEIGHT,
  WORLD_MIN_X,
  WORLD_MIN_Y,
  WORLD_WIDTH,
  clamp,
  mulberry32,
  wrapWorldX,
} from './data';
import { planetBeltTerrainHeight } from './PlanetBeltProfile';

const CELL_SIZE = 0.125;
const GRID_W = Math.round(WORLD_WIDTH / CELL_SIZE);
const GRID_H = Math.round(WORLD_HEIGHT / CELL_SIZE);
const CELL_EMPTY = MaterialId.Empty;
const MIN_CHIP_RATIO = 0.25;

const MATERIAL_HARDNESS: Partial<Record<MaterialId, number>> = {
  [MaterialId.Sand]: 0.25,
  [MaterialId.WetSand]: 0.35,
  [MaterialId.Soil]: 0.55,
  [MaterialId.Mud]: 0.4,
  [MaterialId.Clay]: 1.1,
  [MaterialId.Limestone]: 2.2,
  [MaterialId.Basalt]: 3.5,
  [MaterialId.CrushedShell]: 0.45,
  [MaterialId.Mineral]: 1.7,
  [MaterialId.Ice]: 0.82,
  [MaterialId.Snow]: 0.16,
};

export type ExcavationMaterialClass = 'loose-aggregate' | 'cohesive-earth' | 'solid-rock' | 'other';

/**
 * Loose packets yield to an octopus raking several arms through them more
 * readily than an equally hard continuous wall. This material-side modifier
 * keeps that behavior consistent for bare arms, shaped tools and upgrades.
 */
const EXCAVATION_STRENGTH_MULTIPLIER: Partial<Record<MaterialId, number>> = {
  [MaterialId.Sand]: 1.38,
  [MaterialId.WetSand]: 1.3,
  [MaterialId.Mud]: 1.26,
  [MaterialId.CrushedShell]: 1.34,
  [MaterialId.Mineral]: 1.4,
  [MaterialId.Soil]: 1.16,
};

const materialVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const materialFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uCells;
  uniform float uTime;
  uniform float uStorm;
  uniform float uSeaLevel;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  vec3 palette(float id) {
    if (id < 1.5) return vec3(0.76, 0.62, 0.38);
    if (id < 2.5) return vec3(0.43, 0.37, 0.29);
    if (id < 3.5) return vec3(0.26, 0.20, 0.15);
    if (id < 4.5) return vec3(0.23, 0.19, 0.17);
    if (id < 5.5) return vec3(0.39, 0.28, 0.24);
    if (id < 6.5) return vec3(0.48, 0.51, 0.43);
    if (id < 7.5) return vec3(0.13, 0.16, 0.18);
    if (id < 8.5) return vec3(0.08, 0.36, 0.43);
    if (id < 9.5) return vec3(1.0, 0.24, 0.04);
    if (id < 10.5) return vec3(0.88, 0.80, 0.67);
    if (id < 11.5) return vec3(0.25, 0.53, 0.33);
    if (id < 12.5) return vec3(0.34, 0.22, 0.12);
    if (id < 13.5) return vec3(0.17, 0.58, 0.58);
    if (id < 14.5) return vec3(0.72, 0.89, 0.88);
    if (id < 15.5) return vec3(0.15, 0.72, 0.48);
    if (id < 16.5) return vec3(0.60, 0.84, 0.88);
    return vec3(0.91, 0.95, 0.93);
  }

  void main() {
    vec4 raw = texture2D(uCells, vUv);
    float id = floor(raw.r * 255.0 + 0.5);
    if (id < 0.5) discard;

    vec2 texel = vec2(1.0 / ${GRID_W.toFixed(1)}, 1.0 / ${GRID_H.toFixed(1)});
    float above = floor(texture2D(uCells, vUv + vec2(0.0, texel.y)).r * 255.0 + 0.5);
    float left = floor(texture2D(uCells, vUv - vec2(texel.x, 0.0)).r * 255.0 + 0.5);
    float n = hash(floor(vUv * vec2(2048.0, 1024.0)));
    float broad = hash(floor(vUv * vec2(280.0, 140.0)));
    vec3 col = palette(id);
    col *= 0.82 + n * 0.16 + broad * 0.08;
    col *= mix(1.0, 0.72, raw.g * 0.65);

    // Alpha stores persistent fracture progress. Fine dark seams make slow
    // excavation readable without turning every chip into a separate mesh.
    float fracture = raw.a;
    float seamField = abs(sin((vUv.x * 493.0 + vUv.y * 337.0) * 3.1 + n * 2.4));
    float seam = 1.0 - smoothstep(0.035, 0.16, seamField);
    col *= 1.0 - fracture * (0.16 + seam * 0.54);
    col += vec3(0.11, 0.075, 0.045) * fracture * (1.0 - seam) * 0.2;

    if (above < 0.5) col += vec3(0.16, 0.14, 0.10);
    if (left < 0.5) col += vec3(0.035, 0.05, 0.055);
    if (id > 8.5 && id < 9.5) {
      col += vec3(0.65, 0.10, 0.01) * (0.55 + 0.45 * sin(uTime * 4.0 + vUv.x * 80.0));
    }
    if (id > 15.5 && id < 16.5) {
      float iceVein = pow(max(0.0, sin(vUv.x * 860.0 + sin(vUv.y * 173.0) * 2.1)), 18.0);
      col += vec3(0.20, 0.34, 0.38) * (0.16 + iceVein * 0.48);
    }
    if (id > 16.5) {
      float crystal = pow(max(0.0, sin((vUv.x + vUv.y) * 1100.0)), 22.0);
      col += vec3(0.18, 0.21, 0.20) * crystal;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface DigResult {
  removed: number;
  blocked: boolean;
  material: MaterialId;
  chipped: number;
  fractureProgress: number;
  strengthMultiplier: number;
  materialClass: ExcavationMaterialClass;
}

export interface MatterPerformanceSnapshot {
  simulationSteps: number;
  movedCells: number;
  lastStepMovedCells: number;
  sleepingCellsSkipped: number;
  textureUploads: number;
  textureSyncedCells: number;
  textureIdleFrames: number;
  activityRule: 'wake-on-change';
}

export class MatterWorld {
  readonly width = GRID_W;
  readonly height = GRID_H;
  readonly cellSize = CELL_SIZE;
  readonly material = new Uint8Array(GRID_W * GRID_H);
  readonly moisture = new Uint8Array(GRID_W * GRID_H);
  readonly temperature = new Int16Array(GRID_W * GRID_H);
  readonly flags = new Uint8Array(GRID_W * GRID_H);
  readonly fracture = new Uint16Array(GRID_W * GRID_H);
  readonly pixels = new Uint8Array(GRID_W * GRID_H * 4);
  readonly texture: THREE.DataTexture;
  readonly mesh: THREE.Mesh;
  readonly shader: THREE.ShaderMaterial;
  modifiedCells = 0;
  seaLevel = BASE_SEA_LEVEL;
  private scanParity = 0;
  private textureDirty = true;
  private rng = mulberry32(PLANET_SEED);
  private simulationSteps = 0;
  private movedCells = 0;
  private lastStepMovedCells = 0;
  private sleepingCellsSkipped = 0;
  private textureUploads = 0;
  private textureSyncedCells = 0;
  private textureIdleFrames = 0;
  private pristineMaterial!: Uint8Array;
  private pristineMoisture!: Uint8Array;
  private pristineTemperature!: Int16Array;
  private pristineFlags!: Uint8Array;
  private pristineFracture!: Uint16Array;

  constructor() {
    this.generate();
    this.syncPixels();
    this.texture = new THREE.DataTexture(this.pixels, GRID_W, GRID_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
    // The initial pixels were synchronized immediately above. Later uploads
    // are driven only by real cell edits or active granular motion.
    this.textureDirty = false;

    this.shader = new THREE.ShaderMaterial({
      uniforms: {
        uCells: { value: this.texture },
        uTime: { value: 0 },
        uStorm: { value: 0 },
        uSeaLevel: { value: this.seaLevel },
      },
      vertexShader: materialVertex,
      fragmentShader: materialFragment,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT), this.shader);
    this.mesh.position.set(0, WORLD_MIN_Y + WORLD_HEIGHT * 0.5, 0);
    this.mesh.renderOrder = 3;
    this.pristineMaterial = this.material.slice();
    this.pristineMoisture = this.moisture.slice();
    this.pristineTemperature = this.temperature.slice();
    this.pristineFlags = this.flags.slice();
    this.pristineFracture = this.fracture.slice();
  }

  private idx(x: number, y: number): number {
    return x + y * GRID_W;
  }

  private terrainHeight(x: number): number {
    return planetBeltTerrainHeight(x);
  }

  private generate(): void {
    for (let gy = 0; gy < GRID_H; gy += 1) {
      const wy = WORLD_MIN_Y + (gy + 0.5) * CELL_SIZE;
      for (let gx = 0; gx < GRID_W; gx += 1) {
        const wx = WORLD_MIN_X + (gx + 0.5) * CELL_SIZE;
        const surface = this.terrainHeight(wx);
        if (wy > surface) continue;
        const depth = surface - wy;
        let mat = MaterialId.Limestone;
        if (wx > 15) mat = depth > 1.1 ? MaterialId.Basalt : MaterialId.Mineral;
        else if (wx < -14 && surface > BASE_SEA_LEVEL + 0.1) mat = depth < 0.85 ? MaterialId.Soil : depth < 2.1 ? MaterialId.Clay : MaterialId.Limestone;
        else if (depth < 0.9) mat = wx < -8 ? MaterialId.Sand : MaterialId.WetSand;
        else if (depth < 1.6) mat = MaterialId.Clay;
        const i = this.idx(gx, gy);
        this.material[i] = mat;
        this.moisture[i] = wy < BASE_SEA_LEVEL + 0.4 ? 220 : mat === MaterialId.Soil ? 85 : 40;
        const ventHeat = wx > 46 && wx < 57 && wy < -88 ? 18 : 0;
        this.temperature[i] = Math.round((18 - Math.max(0, -wy) * 0.16 + ventHeat) * 10);
      }
    }

    // A deterministic starter den with a flooded lower pool and a narrow escape crack.
    this.carveEllipse(-13.0, 2.65, 1.65, 1.1);
    this.carveEllipse(-14.35, 3.35, 1.18, 0.84);
    this.carveTunnel(-11.5, 2.5, -8.55, 2.38, 0.60);
    this.carveTunnel(-14.6, 4.0, -15.0, 5.3, 0.24);
    this.carveTunnel(-13.7, 1.95, -13.7, 0.8, 0.36);

    // A reachable reef alcove teaches players that dens are a network, not a
    // single quest room. The much deeper trench chamber remains a late-route
    // outpost for players who carry their home system into the abyss.
    this.carveEllipse(11.8, -6.35, 1.48, 0.9);
    this.carveEllipse(12.75, -6.58, 0.72, 0.62);
    this.carveTunnel(9.15, -3.35, 11.0, -5.95, 0.68);

    // A second naturally sheltered chamber proves the den network beyond the
    // starter coast. It opens into the trench wall and can be claimed with N.
    this.carveEllipse(29.2, -18.1, 1.65, 0.96);
    this.carveEllipse(30.25, -18.55, 0.95, 0.72);
    this.carveTunnel(27.0, -11.15, 29.0, -17.75, 0.48);

    // The bottom of this streamed field is the first representative chamber
    // of the planet-wide water-rock shell. A short local passage stands in for
    // hundreds of kilometers of separately streamed abyssal megacaves.
    this.carveEllipse(45.8, -106.2, 3.9, 2.15);
    this.carveEllipse(53.2, -107.3, 4.8, 2.55);
    this.carveEllipse(60.3, -105.9, 3.2, 1.8);
    this.carveTunnel(46.8, -101.4, 46.2, -105.0, 0.72);
    this.carveTunnel(49.1, -106.6, 58.0, -106.4, 0.82);

    // Hydrothermal structures and a thin lava fissure in the distant basin.
    for (let y = -110.5; y < -101.6; y += CELL_SIZE) {
      this.setWorld(51.6 + Math.sin(y * 2.4) * 0.18, y, MaterialId.Basalt, 255, 620);
      this.setWorld(52.5 + Math.sin(y * 1.8) * 0.14, y, MaterialId.Basalt, 255, 650);
    }
    for (let x = 50.0; x < 50.9; x += CELL_SIZE) {
      this.setWorld(x, -108.8, MaterialId.Lava, 0, 940);
    }
  }

  private carveEllipse(cx: number, cy: number, rx: number, ry: number): void {
    const min = this.worldToCell(cx - rx, cy - ry);
    const max = this.worldToCell(cx + rx, cy + ry);
    for (let y = min.y; y <= max.y; y += 1) {
      for (let x = min.x; x <= max.x; x += 1) {
        const world = this.cellToWorld(x, y);
        if (((world.x - cx) / rx) ** 2 + ((world.y - cy) / ry) ** 2 <= 1) {
          this.material[this.idx(x, y)] = CELL_EMPTY;
        }
      }
    }
  }

  private carveTunnel(x0: number, y0: number, x1: number, y1: number, radius: number): void {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(length / (CELL_SIZE * 0.5));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.carveEllipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, radius);
    }
  }

  private setWorld(wx: number, wy: number, material: MaterialId, moisture = 0, temperature = 180): void {
    const c = this.worldToCell(wx, wy);
    if (!this.inBounds(c.x, c.y)) return;
    const i = this.idx(c.x, c.y);
    this.material[i] = material;
    this.moisture[i] = moisture;
    this.temperature[i] = temperature;
  }

  worldToCell(wx: number, wy: number): { x: number; y: number } {
    const wrappedX = wrapWorldX(wx);
    return {
      x: clamp(Math.floor((wrappedX - WORLD_MIN_X) / CELL_SIZE), 0, GRID_W - 1),
      y: clamp(Math.floor((wy - WORLD_MIN_Y) / CELL_SIZE), 0, GRID_H - 1),
    };
  }

  cellToWorld(x: number, y: number): { x: number; y: number } {
    return {
      x: WORLD_MIN_X + (x + 0.5) * CELL_SIZE,
      y: WORLD_MIN_Y + (y + 0.5) * CELL_SIZE,
    };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  }

  getMaterial(wx: number, wy: number): MaterialId {
    if (wy < WORLD_MIN_Y || wy >= WORLD_MIN_Y + WORLD_HEIGHT) {
      return MaterialId.Basalt;
    }
    const c = this.worldToCell(wrapWorldX(wx), wy);
    return this.material[this.idx(c.x, c.y)] as MaterialId;
  }

  serializeModifiedCells(): { version: 1; cells: number[] } | null {
    const cells: number[] = [];
    for (let i = 0; i < this.material.length; i += 1) {
      if (this.material[i] === this.pristineMaterial[i]
        && this.moisture[i] === this.pristineMoisture[i]
        && this.temperature[i] === this.pristineTemperature[i]
        && this.flags[i] === this.pristineFlags[i]
        && this.fracture[i] === this.pristineFracture[i]) continue;
      cells.push(i, this.material[i], this.moisture[i], this.temperature[i], this.flags[i], this.fracture[i]);
    }
    return cells.length > 0 ? { version: 1, cells } : null;
  }

  importModifiedCells(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const payload = data as { version?: unknown; cells?: unknown };
    if (payload.version !== 1 || !Array.isArray(payload.cells)) return;
    const cells = payload.cells;
    let restored = 0;
    for (let offset = 0; offset + 5 < cells.length; offset += 6) {
      const index = cells[offset];
      if (!Number.isInteger(index) || index < 0 || index >= this.material.length) continue;
      this.material[index] = cells[offset + 1] ?? this.pristineMaterial[index];
      this.moisture[index] = cells[offset + 2] ?? this.pristineMoisture[index];
      this.temperature[index] = cells[offset + 3] ?? this.pristineTemperature[index];
      this.flags[index] = cells[offset + 4] ?? this.pristineFlags[index];
      this.fracture[index] = cells[offset + 5] ?? this.pristineFracture[index];
      restored += 1;
    }
    if (restored > 0) this.textureDirty = true;
  }

  getCellMaterial(x: number, y: number): MaterialId {
    if (!this.inBounds(x, y)) return MaterialId.Basalt;
    return this.material[this.idx(x, y)] as MaterialId;
  }

  setNaturalCell(x: number, y: number, material: MaterialId, moisture: number, temperatureTenthsC: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const index = this.idx(x, y);
    const current = this.material[index] as MaterialId;
    const replaceable = current === MaterialId.Empty
      || current === MaterialId.Water
      || current === MaterialId.Ice
      || current === MaterialId.Snow;
    if (!replaceable) return false;
    if (current === material && this.moisture[index] === moisture && this.temperature[index] === temperatureTenthsC) return true;
    this.material[index] = material;
    this.moisture[index] = moisture;
    this.temperature[index] = temperatureTenthsC;
    this.flags[index] = 0;
    this.fracture[index] = 0;
    this.textureDirty = true;
    this.wakeAround(x, y);
    return true;
  }

  clearNaturalCell(x: number, y: number, expected: MaterialId): boolean {
    if (!this.inBounds(x, y)) return false;
    const index = this.idx(x, y);
    if (this.material[index] !== expected) return false;
    this.material[index] = MaterialId.Empty;
    this.moisture[index] = 0;
    this.temperature[index] = 180;
    this.flags[index] = 0;
    this.fracture[index] = 0;
    this.textureDirty = true;
    this.wakeAround(x, y);
    return true;
  }

  isSolid(wx: number, wy: number): boolean {
    const mat = this.getMaterial(wx, wy);
    return mat !== MaterialId.Empty && mat !== MaterialId.Water && mat !== MaterialId.Steam && mat !== MaterialId.VentFluid && mat !== MaterialId.Lava;
  }

  isDiggable(mat: MaterialId, toolStrength: number): boolean {
    return this.hardness(mat) <= toolStrength * this.excavationStrengthMultiplier(mat);
  }

  excavationProfile(mat: MaterialId): {
    materialClass: ExcavationMaterialClass;
    hardness: number;
    strengthMultiplier: number;
  } {
    return {
      materialClass: this.excavationMaterialClass(mat),
      hardness: this.hardness(mat),
      strengthMultiplier: this.excavationStrengthMultiplier(mat),
    };
  }

  dig(wx: number, wy: number, radius: number, toolStrength: number, preserveDisplacedMatter = true): DigResult {
    const center = this.worldToCell(wx, wy);
    const cellRadius = Math.max(1, Math.round(radius / CELL_SIZE));
    let removed = 0;
    let blocked = false;
    let dominant = MaterialId.Empty;
    let chipped = 0;
    let fractureProgress = 0;
    const displaced: MaterialId[] = [];
    for (let oy = -cellRadius; oy <= cellRadius; oy += 1) {
      for (let ox = -cellRadius; ox <= cellRadius; ox += 1) {
        if (ox * ox + oy * oy > cellRadius * cellRadius) continue;
        const x = center.x + ox;
        const y = center.y + oy;
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        const mat = this.material[i] as MaterialId;
        if (mat === MaterialId.Empty) continue;
        if (!this.isDiggable(mat, toolStrength)) {
          blocked = true;
          dominant = mat;
          const hardness = this.hardness(mat);
          const strengthRatio = toolStrength * this.excavationStrengthMultiplier(mat) / hardness;
          if (strengthRatio >= MIN_CHIP_RATIO) {
            const required = this.fractureRequired(mat);
            const chipForce = Math.max(1, Math.round(strengthRatio * strengthRatio * 10));
            this.fracture[i] = Math.min(required, this.fracture[i] + chipForce);
            chipped += 1;
            fractureProgress = Math.max(fractureProgress, this.fracture[i] / required);
            if (this.fracture[i] >= required) {
              this.material[i] = MaterialId.Empty;
              this.moisture[i] = 0;
              this.flags[i] = 0;
              this.fracture[i] = 0;
              removed += 1;
              if (preserveDisplacedMatter && removed % 4 === 0) {
                displaced.push(mat === MaterialId.Limestone || mat === MaterialId.Basalt ? MaterialId.Mineral : mat);
              }
              this.wakeAround(x, y);
            }
          }
          continue;
        }
        dominant = mat;
        this.material[i] = MaterialId.Empty;
        this.moisture[i] = 0;
        this.flags[i] = 0;
        this.fracture[i] = 0;
        removed += 1;
        if (preserveDisplacedMatter && removed % 4 === 0) {
          displaced.push(mat === MaterialId.Limestone || mat === MaterialId.Basalt ? MaterialId.Mineral : mat);
        }
        this.wakeAround(x, y);
      }
    }

    // Excavation produces a real pile behind and below the tool head.
    let pileX = center.x - Math.sign(wx) * 0;
    let pileY = center.y + cellRadius + 1;
    for (const mat of displaced) {
      let placed = false;
      for (let attempt = 0; attempt < 12 && !placed; attempt += 1) {
        const x = clamp(pileX + Math.round((this.rng() - 0.5) * cellRadius * 2.4), 1, GRID_W - 2);
        const y = clamp(pileY + Math.floor(attempt / 4), 1, GRID_H - 2);
        const i = this.idx(x, y);
        if (this.material[i] === MaterialId.Empty) {
          this.material[i] = mat;
          this.moisture[i] = this.cellToWorld(x, y).y < this.seaLevel ? 220 : 70;
          this.flags[i] = 1;
          this.wakeAround(x, y);
          placed = true;
        }
      }
    }

    if (removed > 0) {
      this.modifiedCells += removed;
    }
    if (removed > 0 || chipped > 0) this.textureDirty = true;
    return {
      removed,
      blocked,
      material: dominant,
      chipped,
      fractureProgress,
      strengthMultiplier: this.excavationStrengthMultiplier(dominant),
      materialClass: this.excavationMaterialClass(dominant),
    };
  }

  addMaterial(wx: number, wy: number, mat: MaterialId, radius = 0.25): number {
    const c = this.worldToCell(wx, wy);
    const r = Math.max(1, Math.round(radius / CELL_SIZE));
    let placed = 0;
    for (let oy = -r; oy <= r; oy += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        if (ox * ox + oy * oy > r * r) continue;
        const x = c.x + ox;
        const y = c.y + oy;
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (this.material[i] === MaterialId.Empty) {
          this.material[i] = mat;
          this.flags[i] = 1;
          this.wakeAround(x, y);
          placed += 1;
        }
      }
    }
    if (placed) this.textureDirty = true;
    return placed;
  }

  step(playerX: number, playerY: number, storm: number): void {
    this.scanParity ^= 1;
    this.simulationSteps += 1;
    this.lastStepMovedCells = 0;
    const center = this.worldToCell(playerX, playerY);
    const minX = clamp(center.x - 100, 1, GRID_W - 2);
    const maxX = clamp(center.x + 100, 1, GRID_W - 2);
    const minY = clamp(center.y - 82, 1, GRID_H - 2);
    const maxY = clamp(center.y + 82, 1, GRID_H - 2);
    let changed = false;
    const leftToRight = this.scanParity === 0;

    for (let y = minY; y <= maxY; y += 1) {
      for (let stepX = minX; stepX <= maxX; stepX += 1) {
        const x = leftToRight ? stepX : maxX - (stepX - minX);
        const i = this.idx(x, y);
        const mat = this.material[i] as MaterialId;
        if (mat !== MaterialId.Sand && mat !== MaterialId.WetSand && mat !== MaterialId.Mud && mat !== MaterialId.Mineral && mat !== MaterialId.CrushedShell) continue;
        // Settled terrain stays asleep regardless of camera position. The old
        // moving bottom strip woke untouched mineral layers whenever the
        // player descended, causing false collapses and repeated 4 MB texture
        // uploads. Digging, placement and neighboring motion now wake only
        // cells that can actually react.
        if (this.flags[i] === 0) {
          this.sleepingCellsSkipped += 1;
          continue;
        }
        const below = this.idx(x, y - 1);
        if (this.material[below] === MaterialId.Empty || this.material[below] === MaterialId.Water) {
          this.swap(i, below);
          this.flags[below] = 1;
          this.lastStepMovedCells += 1;
          changed = true;
          continue;
        }
        const dir = (this.rng() < 0.5 ? -1 : 1) * (leftToRight ? 1 : -1);
        const diag = this.idx(x + dir, y - 1);
        if (this.material[diag] === MaterialId.Empty) {
          this.swap(i, diag);
          this.flags[diag] = 1;
          this.lastStepMovedCells += 1;
          changed = true;
        } else if (this.rng() > 0.72) {
          const otherDiag = this.idx(x - dir, y - 1);
          if (this.material[otherDiag] === MaterialId.Empty) {
            this.swap(i, otherDiag);
            this.flags[otherDiag] = 1;
            this.lastStepMovedCells += 1;
            changed = true;
          } else {
            this.flags[i] = 0;
          }
        } else {
          this.flags[i] = 0;
        }
      }
    }

    // Storms inject wet sediment at the beach and local flood cells into low den cavities.
    if (storm > 0.55 && this.rng() < storm * 0.3) {
      this.addMaterial(-10.2 + this.rng() * 3.2, 2.7 + this.rng() * 0.8, MaterialId.WetSand, 0.13);
      changed = true;
    }
    if (this.seaLevel > BASE_SEA_LEVEL + 0.2) {
      const den = this.worldToCell(-13.2, 2.15);
      for (let x = den.x - 10; x <= den.x + 10; x += 1) {
        for (let y = den.y - 4; y <= den.y + 2; y += 1) {
          const i = this.idx(x, y);
          if (this.material[i] === MaterialId.Empty && this.rng() < storm * 0.0025) {
            this.material[i] = MaterialId.Water;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      this.movedCells += this.lastStepMovedCells;
      this.textureDirty = true;
    }
  }

  updateTexture(time: number, storm: number): void {
    this.shader.uniforms.uTime.value = time;
    this.shader.uniforms.uStorm.value = storm;
    this.shader.uniforms.uSeaLevel.value = this.seaLevel;
    if (!this.textureDirty) {
      this.textureIdleFrames += 1;
      return;
    }
    this.syncPixels();
    this.texture.needsUpdate = true;
    this.textureUploads += 1;
    this.textureSyncedCells += this.material.length;
    this.textureDirty = false;
  }

  performanceSnapshot(): MatterPerformanceSnapshot {
    return {
      simulationSteps: this.simulationSteps,
      movedCells: this.movedCells,
      lastStepMovedCells: this.lastStepMovedCells,
      sleepingCellsSkipped: this.sleepingCellsSkipped,
      textureUploads: this.textureUploads,
      textureSyncedCells: this.textureSyncedCells,
      textureIdleFrames: this.textureIdleFrames,
      activityRule: 'wake-on-change',
    };
  }

  private swap(a: number, b: number): void {
    [this.material[a], this.material[b]] = [this.material[b], this.material[a]];
    [this.moisture[a], this.moisture[b]] = [this.moisture[b], this.moisture[a]];
    [this.temperature[a], this.temperature[b]] = [this.temperature[b], this.temperature[a]];
    [this.flags[a], this.flags[b]] = [this.flags[b], this.flags[a]];
    [this.fracture[a], this.fracture[b]] = [this.fracture[b], this.fracture[a]];
    this.wakeAroundIndex(a);
    this.wakeAroundIndex(b);
  }

  private wakeAroundIndex(index: number): void {
    this.wakeAround(index % GRID_W, Math.floor(index / GRID_W));
  }

  private wakeAround(x: number, y: number): void {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const cellX = x + ox;
        const cellY = y + oy;
        if (!this.inBounds(cellX, cellY)) continue;
        const index = this.idx(cellX, cellY);
        const material = this.material[index] as MaterialId;
        if (material === MaterialId.Sand
          || material === MaterialId.WetSand
          || material === MaterialId.Mud
          || material === MaterialId.Mineral
          || material === MaterialId.CrushedShell) {
          this.flags[index] = 1;
        }
      }
    }
  }

  private hardness(mat: MaterialId): number {
    return MATERIAL_HARDNESS[mat] ?? 99;
  }

  private excavationStrengthMultiplier(mat: MaterialId): number {
    return EXCAVATION_STRENGTH_MULTIPLIER[mat] ?? 1;
  }

  private excavationMaterialClass(mat: MaterialId): ExcavationMaterialClass {
    if (mat === MaterialId.Sand
      || mat === MaterialId.WetSand
      || mat === MaterialId.Mud
      || mat === MaterialId.CrushedShell
      || mat === MaterialId.Mineral) return 'loose-aggregate';
    if (mat === MaterialId.Soil || mat === MaterialId.Clay) return 'cohesive-earth';
    if (mat === MaterialId.Limestone || mat === MaterialId.Basalt) return 'solid-rock';
    return 'other';
  }

  private fractureRequired(mat: MaterialId): number {
    return Math.round(this.hardness(mat) * 100);
  }

  private syncPixels(): void {
    for (let i = 0; i < this.material.length; i += 1) {
      const p = i * 4;
      this.pixels[p] = this.material[i];
      this.pixels[p + 1] = this.moisture[i];
      this.pixels[p + 2] = clamp(Math.round((this.temperature[i] + 300) / 7), 0, 255);
      const required = this.fractureRequired(this.material[i] as MaterialId);
      this.pixels[p + 3] = required < 9000
        ? clamp(Math.round((this.fracture[i] / required) * 255), 0, 255)
        : 0;
    }
  }
}
