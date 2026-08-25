import * as THREE from 'three';
import { BASE_SEA_LEVEL, PLANET_SEED, WORLD_MIN_X, WORLD_WIDTH, clamp, mulberry32 } from './data';

export type SeasonSampleId = 'late-summer' | 'autumn' | 'storm-season' | 'winter';

export interface SeasonSampleShape {
  id: SeasonSampleId;
  label: string;
  progress: number;
  daysUntilWinter: number;
  winterAtSeconds: number;
  temperatureOffsetC: number;
  daylightHours: number;
  snowfallPotential: number;
  seaIcePotential: number;
  snowLineM: number;
  relativeHumidityPercent: number;
  evaporationMultiplier: number;
  nextSeason: string | null;
}

export type ColdProvince = 'temperate-current' | 'alpine-frost' | 'ice-current';

export interface CryoLocalShape {
  province: ColdProvince;
  coldness: number;
  airTemperatureC: number;
  snowfallIntensity: number;
  freezeCoverage: number;
  surfaceFrozen: boolean;
  snowCovered: boolean;
}

export type BirdMigrationPhase = 'present' | 'leaving' | 'gone' | 'returning';

export interface MigrationState {
  surfaceBirds: BirdMigrationPhase;
  reefFishDepthShiftM: number;
}

export interface BreedingWindow {
  active: boolean;
  intensity: number;
}

export interface ThawFloodRisk {
  level: 'low' | 'moderate' | 'high';
  reasons: string[];
}

export interface WorldEffectsContext {
  season: SeasonSampleShape;
  cryoLocal: CryoLocalShape;
  playerY: number;
  inDen: boolean;
  denInsulation01: number;
}

export interface WorldEffectsSnapshot {
  dayStamp: number;
  foodScarcityFactor: number;
  migrationState: MigrationState;
  breedingWindow: BreedingWindow;
  denTemperatureC: number;
  outsideTemperatureC: number;
  thawFloodRisk: ThawFloodRisk;
  snowDriftCm: number;
  freezeDays: number;
  seasonalBreedingHint: string;
  migrationBanner: string;
}

export interface WorldEffectsSave {
  snowDriftCm: number;
  freezeDays: number;
}

const DAY_LENGTH_SECONDS = 90;
const MAX_DRIFT_CM = 24;
const DRIFT_ACCUM_PER_SECOND = 0.58;
const DRIFT_THAW_FAST = 2.1;
const DRIFT_THAW_COOL = 0.85;
const DRIFT_SETTLE = 0.16;
const FREEZE_DAYS_FOR_RETURNING = 3;
const FREEZE_DAYS_FOR_PRESENT = 4;
const DEPTH_STABILISATION_M = 11;
const DEEP_WATER_ANCHOR_C = 10.8;

type Span = readonly [number, number];

const SCARCITY_SPANS: Record<SeasonSampleId, Span> = {
  'late-summer': [1, 1],
  autumn: [0.92, 0.79],
  'storm-season': [0.7, 0.48],
  winter: [0.45, 0.45],
};

const BREEDING_SPANS: Record<SeasonSampleId, Span> = {
  'late-summer': [1, 0.5],
  autumn: [0.5, 0.25],
  'storm-season': [0.25, 0],
  winter: [0, 0],
};

const AMBIENT_SPANS: Record<SeasonSampleId, Span> = {
  'late-summer': [16, 14],
  autumn: [12.5, 8],
  'storm-season': [6, 1],
  winter: [-0.5, -2],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function spanValue(span: Span, progress: number): number {
  return lerp(span[0], span[1], smooth(progress));
}

function makeSoftDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class SeasonalWorldEffectsSystem {
  private readonly rng: () => number;
  private readonly drift: THREE.Points;
  private readonly shimmer: THREE.Points;
  private season: SeasonSampleShape;
  private cryoLocal: CryoLocalShape = {
    province: 'temperate-current',
    coldness: 0,
    airTemperatureC: 16,
    snowfallIntensity: 0,
    freezeCoverage: 0,
    surfaceFrozen: false,
    snowCovered: false,
  };
  private elapsed = 0;
  private inDen = false;
  private denInsulation01 = 0;
  private playerY = BASE_SEA_LEVEL;
  private foodScarcityFactorValue = 1;
  private birdPhase: BirdMigrationPhase = 'present';
  private fishShiftValue = 0;
  private breedingIntensity = 0;
  private snowDriftValue = 0;
  private freezeDaysValue = 0;
  private denTemperatureCValue = 14;
  private outsideTemperatureCValue = 14;
  private thawRisk: ThawFloodRisk = { level: 'low', reasons: [] };
  private breedingHintValue = '';
  private migrationBannerValue = '';

  constructor(private readonly scene: THREE.Scene) {
    this.rng = mulberry32(PLANET_SEED + 11551);
    this.season = {
      id: 'late-summer',
      label: 'Late summer',
      progress: 0,
      daysUntilWinter: 3,
      winterAtSeconds: DAY_LENGTH_SECONDS * 3.425,
      temperatureOffsetC: 0,
      daylightHours: 14.4,
      snowfallPotential: 0,
      seaIcePotential: 0,
      snowLineM: 14,
      relativeHumidityPercent: 48,
      evaporationMultiplier: 1.2,
      nextSeason: 'Autumn',
    };
    const dotTexture = makeSoftDotTexture();
    const driftPositions = new Float32Array(80 * 3);
    for (let index = 0; index < 80; index += 1) {
      driftPositions[index * 3] = WORLD_MIN_X + this.rng() * WORLD_WIDTH;
      driftPositions[index * 3 + 1] = index % 10 < 7
        ? BASE_SEA_LEVEL - 0.5 + this.rng() * 1.6
        : -5.2 + this.rng() * 3.8;
      driftPositions[index * 3 + 2] = 6.2 + this.rng() * 2.4;
    }
    const driftGeometry = new THREE.BufferGeometry();
    driftGeometry.setAttribute('position', new THREE.BufferAttribute(driftPositions, 3));
    this.drift = new THREE.Points(driftGeometry, new THREE.PointsMaterial({
      map: dotTexture,
      color: '#eef7f3',
      size: 0.52,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.drift.visible = false;
    this.drift.frustumCulled = false;
    this.drift.renderOrder = 22;
    this.scene.add(this.drift);

    const shimmerPositions = new Float32Array(72 * 3);
    for (let index = 0; index < 72; index += 1) {
      shimmerPositions[index * 3] = WORLD_MIN_X + (index / 71) * WORLD_WIDTH + (this.rng() - 0.5) * 1.4;
      shimmerPositions[index * 3 + 1] = BASE_SEA_LEVEL + 0.06 + (this.rng() - 0.5) * 0.09;
      shimmerPositions[index * 3 + 2] = 5.6;
    }
    const shimmerGeometry = new THREE.BufferGeometry();
    shimmerGeometry.setAttribute('position', new THREE.BufferAttribute(shimmerPositions, 3));
    this.shimmer = new THREE.Points(shimmerGeometry, new THREE.PointsMaterial({
      map: dotTexture,
      color: '#d8f4ff',
      size: 0.44,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }));
    this.shimmer.visible = false;
    this.shimmer.frustumCulled = false;
    this.shimmer.renderOrder = 23;
    this.scene.add(this.shimmer);
  }

  get foodScarcityFactor(): number {
    return this.foodScarcityFactorValue;
  }

  get migrationState(): MigrationState {
    return { surfaceBirds: this.birdPhase, reefFishDepthShiftM: this.fishShiftValue };
  }

  get breedingWindow(): BreedingWindow {
    return { active: this.breedingIntensity > 0.03, intensity: Number(this.breedingIntensity.toFixed(3)) };
  }

  get denTemperatureC(): number {
    return this.denTemperatureCValue;
  }

  get thawFloodRisk(): ThawFloodRisk {
    return { level: this.thawRisk.level, reasons: [...this.thawRisk.reasons] };
  }

  get snowDriftCm(): number {
    return Number(this.snowDriftValue.toFixed(2));
  }

  get freezeDays(): number {
    return Number(this.freezeDaysValue.toFixed(2));
  }

  get seasonalBreedingHint(): string {
    return this.breedingHintValue;
  }

  get migrationBanner(): string {
    return this.migrationBannerValue;
  }

  dayStamp(elapsed: number): number {
    return Math.floor(Math.max(0, elapsed) / DAY_LENGTH_SECONDS) + 1;
  }

  update(dt: number, elapsed: number, ctx: WorldEffectsContext): void {
    this.elapsed = Math.max(0, elapsed);
    this.season = ctx.season;
    this.cryoLocal = ctx.cryoLocal;
    this.playerY = ctx.playerY;
    this.inDen = ctx.inDen;
    this.denInsulation01 = clamp(ctx.denInsulation01, 0, 1);
    const step = Math.max(0, Math.min(dt, 0.5));
    const progress = clamp(this.season.progress, 0, 1);
    const id = this.season.id;

    this.foodScarcityFactorValue = Number(spanValue(SCARCITY_SPANS[id], progress).toFixed(3));
    this.breedingIntensity = spanValue(BREEDING_SPANS[id], progress);

    if (id === 'late-summer') this.birdPhase = 'present';
    else if (id === 'autumn') this.birdPhase = progress < 0.55 ? 'present' : progress < 0.9 ? 'leaving' : 'gone';
    else if (id === 'storm-season') this.birdPhase = progress < 0.12 ? 'leaving' : 'gone';
    else if (this.freezeDaysValue > FREEZE_DAYS_FOR_PRESENT) this.birdPhase = 'present';
    else if (this.freezeDaysValue > FREEZE_DAYS_FOR_RETURNING) this.birdPhase = 'returning';
    else this.birdPhase = 'gone';

    const winterWeight = id === 'winter'
      ? 1
      : id === 'storm-season'
        ? lerp(0.35, 0.95, progress)
        : id === 'autumn'
          ? lerp(0.05, 0.3, progress)
          : 0;
    const iceSeverity = clamp(
      this.season.seaIcePotential * 0.75 + this.cryoLocal.freezeCoverage * 0.5 + this.cryoLocal.coldness * 0.22,
      0,
      1,
    );
    this.fishShiftValue = Number((3.3 * iceSeverity * winterWeight).toFixed(2));

    if (id === 'winter') {
      this.freezeDaysValue += step / DAY_LENGTH_SECONDS;
      if (this.birdPhase === 'present' || this.birdPhase === 'returning') {
        this.snowDriftValue = Math.max(0, this.snowDriftValue - DRIFT_SETTLE * step);
        if (this.cryoLocal.snowfallIntensity > 0.02) {
          this.snowDriftValue = Math.min(MAX_DRIFT_CM, this.snowDriftValue + this.cryoLocal.snowfallIntensity * DRIFT_ACCUM_PER_SECOND * step);
        }
      } else if (this.cryoLocal.snowfallIntensity > 0.005) {
        this.snowDriftValue = Math.min(MAX_DRIFT_CM, this.snowDriftValue + this.cryoLocal.snowfallIntensity * DRIFT_ACCUM_PER_SECOND * step);
      }
    } else {
      const ambient = spanValue(AMBIENT_SPANS[id], progress);
      const thawRate = ambient > 1.5 ? DRIFT_THAW_FAST : ambient > 0 ? DRIFT_THAW_COOL : DRIFT_SETTLE;
      this.snowDriftValue = Math.max(0, this.snowDriftValue - thawRate * step);
    }

    this.outsideTemperatureCValue = this.outsideTemperatureAt(this.playerY);
    const stableBase = this.stableTemperatureAt(this.playerY);
    this.denTemperatureCValue = Number(
      (this.inDen ? stableBase + 1.1 + this.denInsulation01 * 5.5 : this.outsideTemperatureCValue).toFixed(2),
    );

    this.thawRisk = this.evaluateThawFloodRisk(progress);

    const drifting = this.snowDriftValue > 0.4 && (id === 'winter' || this.outsideTemperatureCValue < 1);
    const driftMaterial = this.drift.material as THREE.PointsMaterial;
    this.drift.visible = drifting;
    if (drifting) {
      driftMaterial.opacity = Number((clamp(this.snowDriftValue / MAX_DRIFT_CM, 0, 1) * 0.34).toFixed(3));
      this.drift.position.x = Math.sin(this.elapsed * 0.11) * 0.7;
      this.drift.position.y = Math.sin(this.elapsed * 0.23) * 0.06;
    }
    const shimmerStrength = clamp(this.cryoLocal.freezeCoverage * 0.6 + (this.cryoLocal.surfaceFrozen ? 0.24 : 0), 0, 0.62);
    const shimmerMaterial = this.shimmer.material as THREE.PointsMaterial;
    this.shimmer.visible = shimmerStrength > 0.02;
    if (this.shimmer.visible) {
      shimmerMaterial.opacity = Number((shimmerStrength * (0.72 + 0.28 * Math.sin(this.elapsed * 1.6))).toFixed(3));
    }

    this.refreshHints();
  }

  snapshot(px: number, py: number): WorldEffectsSnapshot {
    return {
      dayStamp: this.dayStamp(this.elapsed),
      foodScarcityFactor: this.foodScarcityFactorValue,
      migrationState: this.migrationState,
      breedingWindow: this.breedingWindow,
      denTemperatureC: Number(
        (this.inDen ? this.stableTemperatureAt(py) + 1.1 + this.denInsulation01 * 5.5 : this.outsideTemperatureAt(py)).toFixed(2),
      ),
      outsideTemperatureC: Number(this.outsideTemperatureAt(py).toFixed(2)),
      thawFloodRisk: this.thawFloodRisk,
      snowDriftCm: this.snowDriftValue,
      freezeDays: this.freezeDays,
      seasonalBreedingHint: this.breedingHintValue,
      migrationBanner: this.migrationBannerValue,
    };
  }

  serialize(): WorldEffectsSave {
    return {
      snowDriftCm: Number(this.snowDriftValue.toFixed(2)),
      freezeDays: Number(this.freezeDaysValue.toFixed(2)),
    };
  }

  deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const record = data as Record<string, unknown>;
    const drift = record['snowDriftCm'];
    const freeze = record['freezeDays'];
    if (typeof drift === 'number' && Number.isFinite(drift)) this.snowDriftValue = clamp(drift, 0, MAX_DRIFT_CM);
    if (typeof freeze === 'number' && Number.isFinite(freeze)) this.freezeDaysValue = Math.max(0, freeze);
  }

  private outsideTemperatureAt(y: number): number {
    const ambient = spanValue(AMBIENT_SPANS[this.season.id], this.season.progress);
    const provinceChill = this.cryoLocal.coldness * 3.5;
    const elevation = y - BASE_SEA_LEVEL;
    const surfaceAir = ambient - provinceChill - (elevation > 0 ? elevation * 0.68 : 0);
    return surfaceAir;
  }

  private stableTemperatureAt(y: number): number {
    const surfaceAir = this.outsideTemperatureAt(BASE_SEA_LEVEL);
    const depthBelow = Math.max(0, BASE_SEA_LEVEL - y);
    const stability = Math.min(1, depthBelow / DEPTH_STABILISATION_M);
    const anchor = DEEP_WATER_ANCHOR_C - Math.min(depthBelow, 90) * 0.015 + this.season.temperatureOffsetC * 0.18;
    return lerp(surfaceAir, anchor, smooth(stability) * 0.86);
  }

  private evaluateThawFloodRisk(progress: number): ThawFloodRisk {
    const nearSurface = this.playerY > BASE_SEA_LEVEL - 3;
    const warmOnset = this.season.id === 'late-summer' && progress < 0.2;
    const meltEvidence = this.cryoLocal.snowCovered || this.cryoLocal.surfaceFrozen || this.snowDriftValue > 2;
    const warming = this.outsideTemperatureCValue > 0.5;
    const thinIce = this.cryoLocal.freezeCoverage > 0.04 && this.cryoLocal.freezeCoverage < 0.42;
    const reasons: string[] = [];
    let level: ThawFloodRisk['level'] = 'low';
    if (warmOnset && nearSurface && meltEvidence && warming) {
      level = 'high';
      if (this.cryoLocal.snowCovered) reasons.push('snowpack melting into the intertidal zone');
      if (this.cryoLocal.surfaceFrozen) reasons.push('shorefast ice releasing meltwater');
      if (this.snowDriftValue > 2) reasons.push(`${Math.round(this.snowDriftValue)} cm of drift slumping at the waterline`);
    } else if ((warmOnset && nearSurface) || (meltEvidence && nearSurface && warming) || (thinIce && nearSurface && warming)) {
      level = 'moderate';
      if (warmOnset) reasons.push('early warm-season runoff building upstream');
      if (meltEvidence) reasons.push('residual frost sublimating on warm rock');
      if (thinIce) reasons.push('thin ice crust thinning under daylight');
    }
    return { level, reasons };
  }

  private refreshHints(): void {
    const id = this.season.id;
    if (this.breedingIntensity > 0.7) this.breedingHintValue = 'Reef spawning peak: broods released now reach maturity fastest.';
    else if (this.breedingIntensity > 0.35) this.breedingHintValue = 'Spawning continues at half strength; shelter the eggs.';
    else if (this.breedingIntensity > 0.03) this.breedingHintValue = 'Late broods are possible but weak; food comes first.';
    else this.breedingHintValue = id === 'winter' ? 'Spawning closed: the reef rests under the cold.' : 'Breeding has paused until warmer water returns.';
    switch (this.birdPhase) {
      case 'leaving':
        this.migrationBannerValue = 'Shorebirds are staging for departure along the wind.';
        break;
      case 'gone':
        this.migrationBannerValue = 'The skies are empty; the flocks have left the coast.';
        break;
      case 'returning':
        this.migrationBannerValue = 'First scouts of the flock circle back over the shallows.';
        break;
      default:
        this.migrationBannerValue = 'Resident shorebirds work the tideline.';
    }
  }
}
