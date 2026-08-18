import { HADAL_VENT_Y, WORLD_MIN_Y, clamp } from './data';
import { PlanetScaleSystem } from './PlanetScale';

export interface DepthRouteState {
  localDepthM: number;
  canonicalDepthM: number;
  routeProgress: number;
  darkness: number;
  band: string;
  requiresBiolight: boolean;
  hasBiolight: boolean;
  accessAllowed: boolean;
}

/**
 * Maps the prototype's continuous cave descent onto the canonical planetary
 * depth axis. Local matter stays centimeter-scale while each streamed habitat
 * may represent a distant vertical step through the global ocean column.
 */
export class DepthAccessSystem {
  readonly ventDepthM = 27000;
  readonly megacaveFloorDepthM: number;
  readonly biolightGateDepthM = 1100;
  private readonly routeStartY = -2.2;
  private readonly routeEndY = HADAL_VENT_Y;
  private readonly megacaveEndY = WORLD_MIN_Y + 0.45;

  constructor(private readonly planetScale: PlanetScaleSystem) {
    this.megacaveFloorDepthM = planetScale.specification.maximumNavigableDepthM;
  }

  sample(_x: number, y: number, seaLevel: number, hasBiolight: boolean): DepthRouteState {
    const localDepthM = Math.max(0, seaLevel - y);
    const vertical = clamp((this.routeStartY - y) / (this.routeStartY - this.routeEndY), 0, 1);
    const belowVent = clamp((this.routeEndY - y) / (this.routeEndY - this.megacaveEndY), 0, 1);
    const routeProgress = vertical < 1 ? vertical * 0.82 : 0.82 + belowVent * 0.18;
    const streamedDepthProgress = smoothstep01(vertical);
    const ventDepth = localDepthM + (this.ventDepthM - localDepthM) * streamedDepthProgress;
    const canonicalDepthM = ventDepth + (this.megacaveFloorDepthM - this.ventDepthM) * smoothstep01(belowVent);
    // The compressed vertical slice needs a long visual transition: coastal
    // color fades across most of the descent instead of snapping to black as
    // soon as the route maps into a distant streamed habitat.
    const darkness = smoothstepRange(vertical, 0.08, 0.74);
    const requiresBiolight = canonicalDepthM >= this.biolightGateDepthM;
    return {
      localDepthM: Number(localDepthM.toFixed(2)),
      canonicalDepthM: Number(canonicalDepthM.toFixed(1)),
      routeProgress: Number(routeProgress.toFixed(3)),
      darkness: Number(darkness.toFixed(3)),
      band: this.planetScale.depthBand(canonicalDepthM).name,
      requiresBiolight,
      hasBiolight,
      // Biolight is a visibility requirement, never an invisible collision gate.
      // The player may choose to enter black water and navigate by memory/touch.
      accessAllowed: true,
    };
  }
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function smoothstepRange(value: number, min: number, max: number): number {
  return smoothstep01((value - min) / Math.max(0.001, max - min));
}
