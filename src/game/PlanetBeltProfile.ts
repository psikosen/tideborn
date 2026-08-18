import { BASE_SEA_LEVEL, PLANET_SEED, WORLD_MIN_X, WORLD_WIDTH } from './data';

/**
 * Deterministic equatorial surface used by both the granular gameplay field
 * and whole-planet slice visualizations. Values are local prototype meters;
 * the streamed depth route maps them onto canonical planetary depths.
 */
export function planetBeltTerrainHeight(x: number): number {
  const beltAngle = ((x - WORLD_MIN_X) / WORLD_WIDTH) * Math.PI * 2;
  const detail = Math.sin(beltAngle * 9) * 0.24 + Math.sin(beltAngle * 23 + 1.4) * 0.11;
  const oceanShelf = -9.6 + Math.sin(beltAngle * 3) * 0.72 + detail;
  const islandRise = lerp(-9.6, 7.6, smoothstep01((x + 38) / 12)) + detail;

  if (x < -40) {
    const needleIslet = landmassDome(x, -58.1, 2.25, 14.8);
    const broadIsland = landmassDome(x, -47.5, 4.35, 17.4);
    return oceanShelf + Math.max(needleIslet, broadIsland);
  }
  if (x < -36) return lerp(oceanShelf, islandRise, smoothstep01((x + 40) / 4));
  if (x < -26) return islandRise;
  if (x < -19) {
    const ridgeT = smoothstep01((x + 26) / 7);
    return lerp(7.6, 6.8, ridgeT) + Math.sin(ridgeT * Math.PI) * 1.35 + detail;
  }
  if (x < -13) return 6.8 - (x + 19) * 0.46 + detail;
  if (x < -8) return 4.05 - (x + 13) * 0.37 + detail;
  if (x < 7) return 2.2 - (x + 8) * 0.27 + detail;
  if (x < 17) return -1.85 - (x - 7) * 0.70 + detail;
  if (x < 25) return -8.85 - Math.sin((x - 17) / 8 * Math.PI) * 3.4 + detail;
  if (x < 34) return lerp(-8.85, -26.85, smoothstep01((x - 25) / 9)) + detail;
  if (x < 50) return lerp(-26.85, -101.8, smoothstep01((x - 34) / 16)) + detail;
  if (x < 56) return -101.8 - Math.sin((x - 50) / 6 * Math.PI) * 2.3 + detail;
  return lerp(-101.8, -9.6, smoothstep01((x - 56) / 8)) + detail;
}

export function planetBeltProfileSample(x: number): { heightM: number; underwater: boolean } {
  const heightM = planetBeltTerrainHeight(x);
  return { heightM, underwater: heightM < BASE_SEA_LEVEL };
}

function landmassDome(x: number, center: number, halfWidth: number, rise: number): number {
  const distance = Math.abs(x - center);
  if (distance >= halfWidth) return 0;
  const normalized = 1 - distance / halfWidth;
  const dome = Math.sin(normalized * Math.PI * 0.5);
  return rise * Math.pow(dome, 0.82) * (1 + Math.sin((x - center) * 2.15 + PLANET_SEED * 0.0001) * 0.035);
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
