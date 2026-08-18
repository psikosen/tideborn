export interface CreatureCollisionBody {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radiusX: number;
  radiusY: number;
  mass?: number;
  immovable?: boolean;
  layer?: string;
}

export interface CreatureCollisionSnapshot {
  resolvedThisStep: number;
  totalResolved: number;
  maximumPenetration: number;
  solverPasses: number;
  broadphase: 'all-pairs' | 'spatial-hash';
  candidatePairsThisStep: number;
  naivePairsThisStep: number;
  pairReductionPercent: number;
}

/**
 * Lightweight deterministic ellipse solver for side-view fauna. Ellipses fit
 * long sharks, compact fish, tall jellies, and the octopus more closely than a
 * single circle while remaining cheap enough for every active simulation step.
 */
export class CreatureCollisionSystem {
  private resolvedThisStep = 0;
  private totalResolved = 0;
  private maximumPenetration = 0;
  private solverPasses = 3;
  private broadphase: CreatureCollisionSnapshot['broadphase'] = 'all-pairs';
  private candidatePairsThisStep = 0;
  private naivePairsThisStep = 0;

  resolve(
    bodies: CreatureCollisionBody[],
    canCollide: (first: CreatureCollisionBody, second: CreatureCollisionBody) => boolean = () => true,
    passes = 3,
  ): CreatureCollisionSnapshot {
    this.resolvedThisStep = 0;
    this.maximumPenetration = 0;
    this.solverPasses = passes;
    this.naivePairsThisStep = bodies.length * Math.max(0, bodies.length - 1) / 2;
    this.broadphase = bodies.length >= 24 ? 'spatial-hash' : 'all-pairs';
    this.candidatePairsThisStep = 0;
    for (let pass = 0; pass < passes; pass += 1) {
      const pairs = this.broadphase === 'spatial-hash'
        ? this.spatialPairs(bodies)
        : this.allPairs(bodies.length);
      if (pass === 0) this.candidatePairsThisStep = pairs.length;
      for (const [firstIndex, secondIndex] of pairs) {
        const first = bodies[firstIndex];
        const second = bodies[secondIndex];
        if ((first.layer && second.layer && first.layer !== second.layer) || !canCollide(first, second)) continue;
        this.resolvePair(first, second, pass === 0);
      }
    }
    this.totalResolved += this.resolvedThisStep;
    return this.snapshot();
  }

  contactRatio(first: CreatureCollisionBody, second: CreatureCollisionBody): number {
    const radiusX = Math.max(0.001, first.radiusX + second.radiusX);
    const radiusY = Math.max(0.001, first.radiusY + second.radiusY);
    return Math.hypot((second.x - first.x) / radiusX, (second.y - first.y) / radiusY);
  }

  snapshot(): CreatureCollisionSnapshot {
    return {
      resolvedThisStep: this.resolvedThisStep,
      totalResolved: this.totalResolved,
      maximumPenetration: Number(this.maximumPenetration.toFixed(3)),
      solverPasses: this.solverPasses,
      broadphase: this.broadphase,
      candidatePairsThisStep: this.candidatePairsThisStep,
      naivePairsThisStep: this.naivePairsThisStep,
      pairReductionPercent: this.naivePairsThisStep <= 0
        ? 0
        : Number(((1 - this.candidatePairsThisStep / this.naivePairsThisStep) * 100).toFixed(1)),
    };
  }

  private allPairs(count: number): Array<[number, number]> {
    const pairs: Array<[number, number]> = [];
    for (let first = 0; first < count; first += 1) {
      for (let second = first + 1; second < count; second += 1) pairs.push([first, second]);
    }
    return pairs;
  }

  /**
   * Broadphase for crowded shoals. The cell is at least the widest collision
   * diameter, so a genuinely overlapping pair must share a cell or one of its
   * eight neighbors. Pair ordering remains stable for deterministic replays.
   */
  private spatialPairs(bodies: CreatureCollisionBody[]): Array<[number, number]> {
    let cellSize = 0.35;
    for (const body of bodies) cellSize = Math.max(cellSize, body.radiusX * 2, body.radiusY * 2);
    const cells = new Map<string, number[]>();
    const coordinates: Array<[number, number]> = [];
    for (let index = 0; index < bodies.length; index += 1) {
      const cellX = Math.floor(bodies[index].x / cellSize);
      const cellY = Math.floor(bodies[index].y / cellSize);
      coordinates.push([cellX, cellY]);
      const key = `${cellX},${cellY}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(index);
      else cells.set(key, [index]);
    }

    const pairs: Array<[number, number]> = [];
    for (let first = 0; first < bodies.length; first += 1) {
      const [cellX, cellY] = coordinates[first];
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const bucket = cells.get(`${cellX + offsetX},${cellY + offsetY}`);
          if (!bucket) continue;
          for (const second of bucket) if (second > first) pairs.push([first, second]);
        }
      }
    }
    pairs.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
    return pairs;
  }

  private resolvePair(first: CreatureCollisionBody, second: CreatureCollisionBody, countCollision: boolean): void {
    const radiusX = Math.max(0.001, first.radiusX + second.radiusX);
    const radiusY = Math.max(0.001, first.radiusY + second.radiusY);
    let dx = second.x - first.x;
    let dy = second.y - first.y;
    let ratio = Math.hypot(dx / radiusX, dy / radiusY);
    if (ratio >= 1) return;

    const firstInverseMass = first.immovable ? 0 : 1 / Math.max(0.05, first.mass ?? 1);
    const secondInverseMass = second.immovable ? 0 : 1 / Math.max(0.05, second.mass ?? 1);
    const inverseMassTotal = firstInverseMass + secondInverseMass;
    if (inverseMassTotal <= 0) return;

    if (countCollision) {
      this.resolvedThisStep += 1;
      this.maximumPenetration = Math.max(this.maximumPenetration, 1 - ratio);
    }

    if (ratio < 0.0001) {
      const angle = this.deterministicAngle(first.id, second.id);
      dx = Math.cos(angle) * radiusX * 0.001;
      dy = Math.sin(angle) * radiusY * 0.001;
      ratio = 0.001;
    }
    const correctionScale = (1 / ratio - 1) * 0.92;
    const correctionX = dx * correctionScale;
    const correctionY = dy * correctionScale;
    const firstShare = firstInverseMass / inverseMassTotal;
    const secondShare = secondInverseMass / inverseMassTotal;
    first.x -= correctionX * firstShare;
    first.y -= correctionY * firstShare;
    second.x += correctionX * secondShare;
    second.y += correctionY * secondShare;

    const correctionLength = Math.hypot(correctionX, correctionY);
    if (correctionLength <= 0.0001) return;
    const normalX = correctionX / correctionLength;
    const normalY = correctionY / correctionLength;
    const relativeVelocity = ((second.vx ?? 0) - (first.vx ?? 0)) * normalX + ((second.vy ?? 0) - (first.vy ?? 0)) * normalY;
    if (relativeVelocity >= 0) return;
    const impulse = -relativeVelocity * 0.82 / inverseMassTotal;
    if (!first.immovable) {
      first.vx = (first.vx ?? 0) - impulse * firstInverseMass * normalX;
      first.vy = (first.vy ?? 0) - impulse * firstInverseMass * normalY;
    }
    if (!second.immovable) {
      second.vx = (second.vx ?? 0) + impulse * secondInverseMass * normalX;
      second.vy = (second.vy ?? 0) + impulse * secondInverseMass * normalY;
    }
  }

  private deterministicAngle(firstId: string, secondId: string): number {
    let hash = 2166136261;
    for (const character of `${firstId}|${secondId}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
  }
}
