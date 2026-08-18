import * as THREE from 'three';
import { MatterWorld } from './MatterWorld';
import { clamp } from './data';

export interface OccludedLightState {
  skyVisibility: number;
  averageReachM: number;
  minimumReachM: number;
  blockedRayPercent: number;
}

/**
 * A 2D visibility field for the granular world. Rays stop on MatterWorld cells,
 * so excavation immediately changes both carried-light shadows and how much
 * daylight can find its way into a tunnel. The GPU only has to shade the mask.
 */
export class OccludedLightSystem {
  readonly rayCount = 160;
  readonly maxRadiusM = 7.25;
  readonly maskTexture: THREE.DataTexture;

  private readonly distances = new Uint8Array(this.rayCount);
  private readonly stepM = 0.085;

  constructor() {
    this.distances.fill(255);
    this.maskTexture = new THREE.DataTexture(
      this.distances,
      this.rayCount,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.wrapS = THREE.RepeatWrapping;
    this.maskTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.maskTexture.generateMipmaps = false;
    this.maskTexture.colorSpace = THREE.NoColorSpace;
    this.maskTexture.needsUpdate = true;
  }

  update(originX: number, originY: number, world: MatterWorld, seaLevel: number): OccludedLightState {
    let totalReach = 0;
    let minimumReach = this.maxRadiusM;
    let blocked = 0;

    for (let ray = 0; ray < this.rayCount; ray += 1) {
      const angle = -Math.PI + ((ray + 0.5) / this.rayCount) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let reach = this.maxRadiusM;

      // Start beyond the octopus's central body so a floor contact does not
      // incorrectly extinguish every grazing ray.
      for (let distance = 0.34; distance <= this.maxRadiusM; distance += this.stepM) {
        if (world.isSolid(originX + dx * distance, originY + dy * distance)) {
          reach = Math.max(0.16, distance - this.stepM * 0.55);
          blocked += 1;
          break;
        }
      }

      this.distances[ray] = Math.round(clamp(reach / this.maxRadiusM, 0, 1) * 255);
      totalReach += reach;
      minimumReach = Math.min(minimumReach, reach);
    }
    this.maskTexture.needsUpdate = true;

    // Daylight is deliberately directional rather than ambient. A chamber
    // receives less sky as the entrance becomes smaller, deeper, or bends away.
    const skyRayCount = 19;
    let visibleSky = 0;
    const distanceToSky = Math.max(4, seaLevel + 2.8 - originY);
    const maxSkyDistance = Math.min(28, distanceToSky + 12);
    for (let ray = 0; ray < skyRayCount; ray += 1) {
      const spread = (ray / (skyRayCount - 1) - 0.5) * 1.52;
      const angle = Math.PI * 0.5 + spread;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let obstructed = false;
      let escapedToSky = false;
      for (let distance = 0.38; distance <= maxSkyDistance; distance += this.stepM * 1.6) {
        const sampleX = originX + dx * distance;
        const sampleY = originY + dy * distance;
        if (world.isSolid(sampleX, sampleY)) {
          obstructed = true;
          break;
        }
        if (sampleY >= seaLevel + 2.4) {
          escapedToSky = true;
          break;
        }
      }
      // Open water remains an unobstructed sky direction even when the actual
      // surface is farther away than this local ray budget. Canonical depth
      // handles absorption; this test is only for terrain/cave occlusion.
      if (!obstructed && (escapedToSky || maxSkyDistance >= 28)) visibleSky += 1;
    }

    return {
      skyVisibility: Number((visibleSky / skyRayCount).toFixed(3)),
      averageReachM: Number((totalReach / this.rayCount).toFixed(2)),
      minimumReachM: Number(minimumReach.toFixed(2)),
      blockedRayPercent: Number((blocked / this.rayCount * 100).toFixed(1)),
    };
  }
}
