import { WORLD_MAX_X, WORLD_MIN_X, WORLD_WIDTH, clamp, mulberry32 } from './data';

export interface LandmassProfile {
  center: number;
  width: number;
  height: number;
  shape: number;
}

export interface LandmassLayer {
  points: number[][];
  profiles: LandmassProfile[];
}

/** Deterministic, wrapped silhouette generator with deliberately mixed scales. */
export class ProceduralLandmassSystem {
  private readonly profiles: LandmassProfile[];

  constructor(seed: number) {
    const rng = mulberry32(seed);
    const archetypes = [
      { center: -55, width: 7, height: 3.2 },
      { center: -31, width: 29, height: 11.4 },
      { center: -9, width: 6, height: 2.4 },
      { center: 14, width: 43, height: 7.1 },
      { center: 43, width: 14, height: 5.8 },
      { center: 58, width: 4.5, height: 2.1 },
    ];
    this.profiles = archetypes.map((profile, index) => ({
      center: profile.center + (rng() - 0.5) * (index === 1 ? 2 : 1.3),
      width: profile.width * (0.9 + rng() * 0.2),
      height: profile.height * (0.88 + rng() * 0.24),
      shape: 0.72 + rng() * 1.05,
    }));
  }

  createLayer(baseY: number, heightScale: number, phase: number): LandmassLayer {
    const points: number[][] = [];
    const start = WORLD_MIN_X - WORLD_WIDTH;
    const end = WORLD_MAX_X + WORLD_WIDTH;
    for (let x = start; x <= end; x += 0.72) {
      const localX = this.wrap(x);
      let rise = 0;
      for (const profile of this.profiles) {
        let distance = Math.abs(localX - profile.center);
        distance = Math.min(distance, WORLD_WIDTH - distance);
        const halfWidth = profile.width * 0.5;
        if (distance >= halfWidth) continue;
        const normalized = clamp(1 - distance / halfWidth, 0, 1);
        const shoulder = Math.sin(normalized * Math.PI * 0.5);
        const asymmetry = 1 + Math.sin((localX - profile.center) * 0.63 + phase) * 0.075;
        rise = Math.max(rise, profile.height * Math.pow(shoulder, profile.shape) * asymmetry);
      }
      const granularRidge = rise > 0.08
        ? (Math.sin(localX * 0.61 + phase) * 0.12 + Math.sin(localX * 1.73 - phase) * 0.045) * heightScale
        : 0;
      points.push([x, baseY + rise * heightScale + granularRidge]);
    }
    points.push([end, baseY - 4], [start, baseY - 4]);
    return { points, profiles: this.profiles.map((profile) => ({ ...profile })) };
  }

  snapshot(): { count: number; widths: number[]; heights: number[]; smallestWidth: number; largestWidth: number } {
    const widths = this.profiles.map((profile) => Number(profile.width.toFixed(1)));
    const heights = this.profiles.map((profile) => Number(profile.height.toFixed(1)));
    return {
      count: this.profiles.length,
      widths,
      heights,
      smallestWidth: Math.min(...widths),
      largestWidth: Math.max(...widths),
    };
  }

  private wrap(x: number): number {
    return ((x - WORLD_MIN_X) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH + WORLD_MIN_X;
  }
}
