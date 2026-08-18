export interface SolidTerrainSampler {
  readonly cellSize?: number;
  isSolid(x: number, y: number): boolean;
}

export interface AquaticTerrainBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radiusX: number;
  radiusY: number;
}

export interface AquaticTerrainCollisionSnapshot {
  contactsThisStep: number;
  totalContacts: number;
  avoidancesThisStep: number;
  totalAvoidances: number;
  rescuesThisStep: number;
  totalRescues: number;
}

/**
 * Reusable terrain collision and near-field steering for swimming fauna.
 * It consumes only an `isSolid` sampler, so active chunks can later replace
 * MatterWorld without coupling creature AI to the granular implementation.
 */
export class AquaticTerrainCollisionSystem {
  private contactsThisStep = 0;
  private totalContacts = 0;
  private avoidancesThisStep = 0;
  private totalAvoidances = 0;
  private rescuesThisStep = 0;
  private totalRescues = 0;

  beginStep(): void {
    this.contactsThisStep = 0;
    this.avoidancesThisStep = 0;
    this.rescuesThisStep = 0;
  }

  /** Returns a velocity correction that bends a swimmer around approaching terrain. */
  avoidance(body: AquaticTerrainBody, terrain: SolidTerrainSampler, lookAhead = 0.32): { x: number; y: number } {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed < 0.025) return { x: 0, y: 0 };
    const direction = Math.atan2(body.vy, body.vx);
    const probeDistance = Math.max((terrain.cellSize ?? 0.125) * 2, lookAhead + speed * 0.38);
    const futureX = body.x + Math.cos(direction) * probeDistance;
    const futureY = body.y + Math.sin(direction) * probeDistance;
    if (this.isClear(body, terrain, futureX, futureY)) return { x: 0, y: 0 };

    this.avoidancesThisStep += 1;
    this.totalAvoidances += 1;
    const turnSign = this.turnSign(body.id);
    const turns = [turnSign * Math.PI / 4, -turnSign * Math.PI / 4, turnSign * Math.PI / 2, -turnSign * Math.PI / 2, Math.PI];
    for (const turn of turns) {
      const angle = direction + turn;
      const candidateX = body.x + Math.cos(angle) * probeDistance;
      const candidateY = body.y + Math.sin(angle) * probeDistance;
      if (!this.isClear(body, terrain, candidateX, candidateY)) continue;
      const desiredSpeed = Math.max(0.42, speed);
      return {
        x: Math.cos(angle) * desiredSpeed - body.vx,
        y: Math.sin(angle) * desiredSpeed - body.vy,
      };
    }
    return { x: -body.vx * 1.65, y: -body.vy * 1.65 };
  }

  /**
   * Resolves a completed movement with axis sliding. If both the old and new
   * positions are obstructed (for example after a collapse), a radial search
   * relocates the swimmer to the nearest complete-body opening.
   */
  resolveMotion(
    body: AquaticTerrainBody,
    previousX: number,
    previousY: number,
    terrain: SolidTerrainSampler,
    rescueDistance = 2.4,
  ): boolean {
    if (this.isClear(body, terrain)) return false;
    this.contactsThisStep += 1;
    this.totalContacts += 1;

    const movedX = Math.abs(body.x - previousX);
    const movedY = Math.abs(body.y - previousY);
    const candidates = movedX >= movedY
      ? [{ x: body.x, y: previousY, axis: 'y' }, { x: previousX, y: body.y, axis: 'x' }]
      : [{ x: previousX, y: body.y, axis: 'x' }, { x: body.x, y: previousY, axis: 'y' }];
    for (const candidate of candidates) {
      if (!this.isClear(body, terrain, candidate.x, candidate.y)) continue;
      body.x = candidate.x;
      body.y = candidate.y;
      if (candidate.axis === 'x') body.vx *= -0.38;
      else body.vy *= -0.38;
      return true;
    }
    if (this.isClear(body, terrain, previousX, previousY)) {
      body.x = previousX;
      body.y = previousY;
      body.vx *= -0.52;
      body.vy *= -0.52;
      return true;
    }

    const rescued = this.nearestClear(body, terrain, previousX, previousY, rescueDistance);
    if (rescued) {
      body.x = rescued.x;
      body.y = rescued.y;
      body.vx *= -0.25;
      body.vy *= -0.25;
      this.rescuesThisStep += 1;
      this.totalRescues += 1;
    }
    return true;
  }

  nearestClear(
    body: AquaticTerrainBody,
    terrain: SolidTerrainSampler,
    originX = body.x,
    originY = body.y,
    maxDistance = 2.4,
  ): { x: number; y: number } | null {
    if (this.isClear(body, terrain, originX, originY)) return { x: originX, y: originY };
    const step = Math.max(terrain.cellSize ?? 0.125, 0.08);
    const directions = 24;
    for (let distance = step; distance <= maxDistance; distance += step) {
      for (let index = 0; index < directions; index += 1) {
        // Search upward first because reef animals normally sit above a floor.
        const angle = Math.PI / 2 + (index % 2 ? -1 : 1) * Math.ceil(index / 2) * (Math.PI * 2 / directions);
        const x = originX + Math.cos(angle) * distance;
        const y = originY + Math.sin(angle) * distance;
        if (this.isClear(body, terrain, x, y)) return { x, y };
      }
    }
    return null;
  }

  isClear(body: Pick<AquaticTerrainBody, 'x' | 'y' | 'radiusX' | 'radiusY'>, terrain: SolidTerrainSampler, x = body.x, y = body.y): boolean {
    if (terrain.isSolid(x, y)) return false;
    const samples = 16;
    for (let index = 0; index < samples; index += 1) {
      const angle = index / samples * Math.PI * 2;
      if (terrain.isSolid(x + Math.cos(angle) * body.radiusX, y + Math.sin(angle) * body.radiusY)) return false;
    }
    return true;
  }

  snapshot(): AquaticTerrainCollisionSnapshot {
    return {
      contactsThisStep: this.contactsThisStep,
      totalContacts: this.totalContacts,
      avoidancesThisStep: this.avoidancesThisStep,
      totalAvoidances: this.totalAvoidances,
      rescuesThisStep: this.rescuesThisStep,
      totalRescues: this.totalRescues,
    };
  }

  private turnSign(id: string): number {
    let hash = 2166136261;
    for (const character of id) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 2 === 0 ? 1 : -1;
  }
}
