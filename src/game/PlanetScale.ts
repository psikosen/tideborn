import { WORLD_HEIGHT, WORLD_WIDTH } from './data';
import { PlanetInteriorSystem } from './PlanetInteriorSystem';

export interface PlanetSpecification {
  name: string;
  radiusKm: number;
  massEarths: number;
  gravityEarths: number;
  oceanCoverage: number;
  meanOceanDepthM: number;
  maximumOceanDepthM: number;
  maximumNavigableDepthM: number;
}

export interface DepthBand {
  id: 'coast' | 'sunlit' | 'twilight' | 'midnight' | 'abyss' | 'hadal' | 'subcrustal';
  name: string;
  minDepthM: number;
  maxDepthM: number;
  light: string;
  danger: string;
}

export const EARTH_REFERENCE = {
  radiusKm: 6371,
  circumferenceKm: 40075,
  moonRadiusKm: 1737.4,
  oceanCoverage: 0.71,
  meanOceanDepthM: 3688,
  maximumOceanDepthM: 10984,
} as const;

export const TIDEBORN_PLANET: PlanetSpecification = {
  name: 'Pelagos-730',
  radiusKm: 5200,
  massEarths: 0.59,
  gravityEarths: 0.88,
  oceanCoverage: 0.88,
  meanOceanDepthM: 7200,
  maximumOceanDepthM: 32000,
  maximumNavigableDepthM: 987000,
};

export const PLANET_DEPTH_BANDS: readonly DepthBand[] = [
  { id: 'coast', name: 'Coastal shelf', minDepthM: 0, maxDepthM: 50, light: 'full-spectrum sunlight', danger: 'waves, exposure, coastal hunters' },
  { id: 'sunlit', name: 'Sunlit ocean', minDepthM: 50, maxDepthM: 200, light: 'blue-green sunlight', danger: 'open-water predators' },
  { id: 'twilight', name: 'Twilight zone', minDepthM: 200, maxDepthM: 1000, light: 'faint blue traces', danger: 'ambush predators, cold' },
  { id: 'midnight', name: 'Midnight zone', minDepthM: 1000, maxDepthM: 4000, light: 'biological light only', danger: 'darkness, pressure, scarce food' },
  { id: 'abyss', name: 'Abyssal ocean', minDepthM: 4000, maxDepthM: 6000, light: 'none', danger: 'extreme pressure, giant scavengers' },
  { id: 'hadal', name: 'Hadal trenches', minDepthM: 6000, maxDepthM: 32000, light: 'geothermal and biological light', danger: 'crushing pressure, quakes, toxic vents' },
  { id: 'subcrustal', name: 'Abyssal megacave ocean', minDepthM: 32000, maxDepthM: 987000, light: 'isolated bioluminescence and geothermal light only', danger: 'speculative high-pressure brines, cave collapse, superheated vents, endemic predators' },
] as const;

export interface PlanetScaleState {
  planet: {
    radiusKm: number;
    circumferenceKm: number;
    oceanCoveragePercent: number;
    meanOceanDepthKm: number;
    maximumOceanDepthKm: number;
    maximumNavigableDepthKm: number;
    gravityEarths: number;
  };
  comparison: {
    earthRadius: number;
    moonRadii: number;
    earthCircumference: number;
    earthOceanVolumeEstimate: number;
    marianaDepths: number;
  };
  activeSimulation: {
    widthM: number;
    heightM: number;
    cellSizeCm: number;
    targetCellSizeCm: number;
    targetChunkM: number;
    estimatedChunksAroundBelt: number;
  };
  currentDepth: {
    meters: number;
    pressureAtm: number;
    band: string;
  };
  planetInterior: ReturnType<PlanetInteriorSystem['snapshot']>;
}

/**
 * Owns the conversion boundary between local simulation meters and planetary
 * geography. The current prototype loads one coastal field; future streaming
 * can change longitude/depth addresses without changing matter-cell code.
 */
export class PlanetScaleSystem {
  readonly specification: PlanetSpecification;
  readonly targetCellSizeM = 0.02;
  readonly targetChunkCells = 128;
  readonly prototypeGridWidth = 1024;
  readonly interior: PlanetInteriorSystem;

  constructor(specification = TIDEBORN_PLANET) {
    this.specification = specification;
    this.interior = new PlanetInteriorSystem(specification.radiusKm);
  }

  circumferenceKm(): number {
    return Math.PI * 2 * this.specification.radiusKm;
  }

  wrapLongitudeMeters(longitudeM: number): number {
    const circumferenceM = this.circumferenceKm() * 1000;
    return ((longitudeM % circumferenceM) + circumferenceM) % circumferenceM;
  }

  pressureAtDepth(depthM: number): number {
    // A gameplay-readable seawater approximation: one atmosphere per 10.06 m.
    return 1 + Math.max(0, depthM) / 10.06;
  }

  depthBand(depthM: number): DepthBand {
    const depth = Math.max(0, depthM);
    return PLANET_DEPTH_BANDS.find((band) => depth >= band.minDepthM && depth < band.maxDepthM)
      ?? PLANET_DEPTH_BANDS[PLANET_DEPTH_BANDS.length - 1];
  }

  state(currentDepthM: number): PlanetScaleState {
    const circumferenceKm = this.circumferenceKm();
    const targetChunkM = this.targetCellSizeM * this.targetChunkCells;
    const earthOceanVolumeEstimate = (
      (this.specification.radiusKm / EARTH_REFERENCE.radiusKm) ** 2
      * (this.specification.oceanCoverage / EARTH_REFERENCE.oceanCoverage)
      * (this.specification.meanOceanDepthM / EARTH_REFERENCE.meanOceanDepthM)
    );
    return {
      planet: {
        radiusKm: this.specification.radiusKm,
        circumferenceKm: Number(circumferenceKm.toFixed(0)),
        oceanCoveragePercent: this.specification.oceanCoverage * 100,
        meanOceanDepthKm: this.specification.meanOceanDepthM / 1000,
        maximumOceanDepthKm: this.specification.maximumOceanDepthM / 1000,
        maximumNavigableDepthKm: this.specification.maximumNavigableDepthM / 1000,
        gravityEarths: this.specification.gravityEarths,
      },
      comparison: {
        earthRadius: Number((this.specification.radiusKm / EARTH_REFERENCE.radiusKm).toFixed(2)),
        moonRadii: Number((this.specification.radiusKm / EARTH_REFERENCE.moonRadiusKm).toFixed(2)),
        earthCircumference: Number((circumferenceKm / EARTH_REFERENCE.circumferenceKm).toFixed(2)),
        earthOceanVolumeEstimate: Number(earthOceanVolumeEstimate.toFixed(2)),
        marianaDepths: Number((this.specification.maximumOceanDepthM / EARTH_REFERENCE.maximumOceanDepthM).toFixed(2)),
      },
      activeSimulation: {
        widthM: WORLD_WIDTH,
        heightM: WORLD_HEIGHT,
        cellSizeCm: Number((WORLD_WIDTH / this.prototypeGridWidth * 100).toFixed(1)),
        targetCellSizeCm: this.targetCellSizeM * 100,
        targetChunkM,
        estimatedChunksAroundBelt: Math.ceil(circumferenceKm * 1000 / targetChunkM),
      },
      currentDepth: {
        meters: Number(Math.max(0, currentDepthM).toFixed(1)),
        pressureAtm: Number(this.pressureAtDepth(currentDepthM).toFixed(1)),
        band: this.depthBand(currentDepthM).name,
      },
      planetInterior: this.interior.snapshot(this.specification.maximumOceanDepthM, this.specification.maximumNavigableDepthM),
    };
  }
}
