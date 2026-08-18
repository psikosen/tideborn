import { PlanetScaleSystem } from './PlanetScale';
import { WORLD_MIN_X, WORLD_WIDTH, clamp } from './data';

export interface PlanetBeltTraversalState {
  revolutions: number;
  longitudeKm: number;
  beltProgressPercent: number;
  wrappedThisFrame: boolean;
}

/** Tracks a horizontally wrapped side-view belt without coupling planetary
 * longitude to player physics or the matter-cell storage format. */
export class PlanetBeltTraversalSystem {
  private revolutions = 0;
  private wrappedThisFrame = false;

  update(previousX: number, currentX: number): boolean {
    const delta = currentX - previousX;
    this.wrappedThisFrame = Math.abs(delta) > WORLD_WIDTH * 0.5;
    if (this.wrappedThisFrame) this.revolutions += delta < 0 ? 1 : -1;
    return this.wrappedThisFrame;
  }

  state(localX: number, planetScale: PlanetScaleSystem): PlanetBeltTraversalState {
    const progress = clamp((localX - WORLD_MIN_X) / WORLD_WIDTH, 0, 1);
    return {
      revolutions: this.revolutions,
      longitudeKm: Number((progress * planetScale.circumferenceKm()).toFixed(1)),
      beltProgressPercent: Number((progress * 100).toFixed(2)),
      wrappedThisFrame: this.wrappedThisFrame,
    };
  }
}
