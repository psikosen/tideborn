export interface SweptTerrainSampler {
  readonly cellSize?: number;
  isSolid(x: number, y: number): boolean;
}

export interface SweptEllipse {
  radiusX: number;
  radiusY: number;
}

export interface SweptContactResult {
  x: number;
  y: number;
  collided: boolean;
  slideApplied: boolean;
  startPenetrating: boolean;
  normalX: number;
  normalY: number;
  timeOfImpact: number;
  attemptedTravelM: number;
  safeTravelM: number;
  queries: number;
  substeps: number;
}

export interface SweptContactSnapshot {
  model: 'conservative-swept-ellipse';
  totalSweeps: number;
  contacts: number;
  slides: number;
  startPenetrations: number;
  preventedTravelM: number;
  maximumAttemptedTravelM: number;
  last: {
    collided: boolean;
    slideApplied: boolean;
    timeOfImpact: number;
    normalX: number;
    normalY: number;
    queries: number;
    substeps: number;
  };
}

interface SegmentHit {
  x: number;
  y: number;
  collided: boolean;
  timeOfImpact: number;
  normalX: number;
  normalY: number;
  queries: number;
  substeps: number;
}

/**
 * Conservative swept-ellipse terrain contact for fast 2D bodies. It samples
 * the whole path in fractions smaller than half a matter cell, binary-searches
 * first contact, then spends the remaining motion along the contact tangent.
 * This is deliberately a small browser-friendly feasibility step rather than
 * an implicit FEM/contact solver.
 */
export class SweptContact2D {
  private totalSweeps = 0;
  private contacts = 0;
  private slides = 0;
  private startPenetrations = 0;
  private preventedTravelM = 0;
  private maximumAttemptedTravelM = 0;
  private last: SweptContactResult = {
    x: 0,
    y: 0,
    collided: false,
    slideApplied: false,
    startPenetrating: false,
    normalX: 0,
    normalY: 0,
    timeOfImpact: 1,
    attemptedTravelM: 0,
    safeTravelM: 0,
    queries: 0,
    substeps: 0,
  };

  move(
    fromX: number,
    fromY: number,
    deltaX: number,
    deltaY: number,
    body: SweptEllipse,
    terrain: SweptTerrainSampler,
  ): SweptContactResult {
    this.totalSweeps += 1;
    const attemptedTravelM = Math.hypot(deltaX, deltaY);
    this.maximumAttemptedTravelM = Math.max(this.maximumAttemptedTravelM, attemptedTravelM);

    const start = this.sampleEllipse(fromX, fromY, body, terrain);
    if (start.collided) {
      this.startPenetrations += 1;
      this.last = {
        x: fromX,
        y: fromY,
        collided: false,
        slideApplied: false,
        startPenetrating: true,
        normalX: start.normalX,
        normalY: start.normalY,
        timeOfImpact: 0,
        attemptedTravelM,
        safeTravelM: 0,
        queries: start.queries,
        substeps: 0,
      };
      return { ...this.last };
    }

    if (attemptedTravelM <= 1e-7) {
      this.last = {
        x: fromX,
        y: fromY,
        collided: false,
        slideApplied: false,
        startPenetrating: false,
        normalX: 0,
        normalY: 0,
        timeOfImpact: 1,
        attemptedTravelM,
        safeTravelM: 0,
        queries: start.queries,
        substeps: 0,
      };
      return { ...this.last };
    }

    const primary = this.sweepSegment(fromX, fromY, deltaX, deltaY, body, terrain);
    let x = primary.x;
    let y = primary.y;
    let queries = start.queries + primary.queries;
    let substeps = primary.substeps;
    let slideApplied = false;

    if (primary.collided) {
      this.contacts += 1;
      const remainingScale = 1 - primary.timeOfImpact;
      let tangentX = deltaX * remainingScale;
      let tangentY = deltaY * remainingScale;
      const inward = tangentX * primary.normalX + tangentY * primary.normalY;
      if (inward < 0) {
        tangentX -= primary.normalX * inward;
        tangentY -= primary.normalY * inward;
      }
      if (Math.hypot(tangentX, tangentY) > 1e-5) {
        // A tiny outward skin prevents numerical re-contact at the exact same
        // point while remaining far below the 12.5 cm terrain-cell scale.
        const skin = Math.min(0.002, (terrain.cellSize ?? 0.125) * 0.04);
        const slide = this.sweepSegment(
          x + primary.normalX * skin,
          y + primary.normalY * skin,
          tangentX,
          tangentY,
          body,
          terrain,
        );
        queries += slide.queries;
        substeps += slide.substeps;
        slideApplied = Math.hypot(slide.x - x, slide.y - y) > 1e-4;
        if (slideApplied) this.slides += 1;
        x = slide.x;
        y = slide.y;
      }
    }

    const safeTravelM = Math.hypot(x - fromX, y - fromY);
    this.preventedTravelM += Math.max(0, attemptedTravelM - safeTravelM);
    this.last = {
      x,
      y,
      collided: primary.collided,
      slideApplied,
      startPenetrating: false,
      normalX: primary.normalX,
      normalY: primary.normalY,
      timeOfImpact: primary.timeOfImpact,
      attemptedTravelM,
      safeTravelM,
      queries,
      substeps,
    };
    return { ...this.last };
  }

  snapshot(): SweptContactSnapshot {
    return {
      model: 'conservative-swept-ellipse',
      totalSweeps: this.totalSweeps,
      contacts: this.contacts,
      slides: this.slides,
      startPenetrations: this.startPenetrations,
      preventedTravelM: Number(this.preventedTravelM.toFixed(3)),
      maximumAttemptedTravelM: Number(this.maximumAttemptedTravelM.toFixed(3)),
      last: {
        collided: this.last.collided,
        slideApplied: this.last.slideApplied,
        timeOfImpact: Number(this.last.timeOfImpact.toFixed(4)),
        normalX: Number(this.last.normalX.toFixed(3)),
        normalY: Number(this.last.normalY.toFixed(3)),
        queries: this.last.queries,
        substeps: this.last.substeps,
      },
    };
  }

  private sweepSegment(
    fromX: number,
    fromY: number,
    deltaX: number,
    deltaY: number,
    body: SweptEllipse,
    terrain: SweptTerrainSampler,
  ): SegmentHit {
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= 1e-7) {
      return { x: fromX, y: fromY, collided: false, timeOfImpact: 1, normalX: 0, normalY: 0, queries: 0, substeps: 0 };
    }
    const maxStep = Math.max(0.02, (terrain.cellSize ?? 0.125) * 0.38);
    const steps = Math.max(1, Math.ceil(distance / maxStep));
    let safeT = 0;
    let queries = 0;

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const candidate = this.sampleEllipse(fromX + deltaX * t, fromY + deltaY * t, body, terrain);
      queries += candidate.queries;
      if (!candidate.collided) {
        safeT = t;
        continue;
      }

      let low = safeT;
      let high = t;
      let contact = candidate;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const middle = (low + high) * 0.5;
        const sample = this.sampleEllipse(fromX + deltaX * middle, fromY + deltaY * middle, body, terrain);
        queries += sample.queries;
        if (sample.collided) {
          high = middle;
          contact = sample;
        } else {
          low = middle;
        }
      }
      return {
        x: fromX + deltaX * low,
        y: fromY + deltaY * low,
        collided: true,
        timeOfImpact: low,
        normalX: contact.normalX,
        normalY: contact.normalY,
        queries,
        substeps: step,
      };
    }

    return {
      x: fromX + deltaX,
      y: fromY + deltaY,
      collided: false,
      timeOfImpact: 1,
      normalX: 0,
      normalY: 0,
      queries,
      substeps: steps,
    };
  }

  private sampleEllipse(
    x: number,
    y: number,
    body: SweptEllipse,
    terrain: SweptTerrainSampler,
  ): { collided: boolean; normalX: number; normalY: number; queries: number } {
    let queries = 1;
    let hitCount = 0;
    let normalX = 0;
    let normalY = 0;
    const centerSolid = terrain.isSolid(x, y);
    if (centerSolid) {
      hitCount += 1;
      const epsilon = Math.max(0.04, (terrain.cellSize ?? 0.125) * 0.55);
      const left = terrain.isSolid(x - epsilon, y) ? 1 : 0;
      const right = terrain.isSolid(x + epsilon, y) ? 1 : 0;
      const below = terrain.isSolid(x, y - epsilon) ? 1 : 0;
      const above = terrain.isSolid(x, y + epsilon) ? 1 : 0;
      queries += 4;
      normalX += left - right;
      normalY += below - above;
    }

    const rings = [
      { scale: 1, samples: 20 },
      { scale: 0.62, samples: 12 },
    ];
    for (const ring of rings) {
      for (let index = 0; index < ring.samples; index += 1) {
        const angle = index / ring.samples * Math.PI * 2;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        queries += 1;
        if (!terrain.isSolid(
          x + cosine * body.radiusX * ring.scale,
          y + sine * body.radiusY * ring.scale,
        )) continue;
        hitCount += 1;
        // Ellipse gradient gives the obstacle-to-body normal at the sample.
        normalX -= cosine / Math.max(0.001, body.radiusX);
        normalY -= sine / Math.max(0.001, body.radiusY);
      }
    }

    if (hitCount === 0) return { collided: false, normalX: 0, normalY: 0, queries };
    const length = Math.hypot(normalX, normalY);
    if (length <= 1e-7) return { collided: true, normalX: 0, normalY: 1, queries };
    return { collided: true, normalX: normalX / length, normalY: normalY / length, queries };
  }
}
