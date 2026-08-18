import * as THREE from 'three';
import type { SurfaceContact } from './SurfaceAdaptationSystem';
import { MaterialId, WORLD_WIDTH, wrapWorldX } from './data';

export interface TreeInteractionBody {
  id: string;
  variant: string;
  baseX: number;
  baseY: number;
  topX: number;
  topY: number;
  radius: number;
}

export interface TreeCollisionResult {
  collided: boolean;
  treeId: string | null;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  penetration: number;
}

export interface TreeGripContact extends SurfaceContact {
  treeId: string;
  variant: string;
}

/**
 * Capsule collision and sucker contact for the generated tree layer. Keeping
 * this separate from the art and wind shader lets richer branch colliders or
 * breakable trunks replace the first trunk-capsule model later.
 */
export class TreeInteractionSystem {
  private bodies: readonly TreeInteractionBody[] = [];
  private collisions = 0;
  private gripQueries = 0;

  setBodies(bodies: readonly TreeInteractionBody[]): void {
    this.bodies = bodies;
  }

  sampleGrip(x: number, y: number, reach = 0.63): TreeGripContact | null {
    this.gripQueries += 1;
    let nearest: { body: TreeInteractionBody; dx: number; dy: number; distance: number } | null = null;
    for (const body of this.bodies) {
      const sample = this.closestPoint(body, x, y);
      const distance = Math.hypot(sample.dx, sample.dy);
      if (distance > body.radius + reach || (nearest && distance >= nearest.distance)) continue;
      nearest = { body, dx: sample.dx, dy: sample.dy, distance };
    }
    if (!nearest) return null;
    const length = nearest.distance || 1;
    return {
      treeId: nearest.body.id,
      variant: nearest.body.variant,
      material: MaterialId.Wood,
      materialName: `${nearest.body.variant.replaceAll('-', ' ')} tree bark`,
      color: new THREE.Color('#493222'),
      accent: new THREE.Color('#766044'),
      directionX: nearest.dx / length,
      directionY: nearest.dy / length,
      distance: Math.max(0, nearest.distance - nearest.body.radius),
    };
  }

  resolve(x: number, y: number, radius: number): TreeCollisionResult {
    let resolvedX = x;
    let resolvedY = y;
    let strongest: TreeCollisionResult = {
      collided: false, treeId: null, x, y, normalX: 0, normalY: 0, penetration: 0,
    };
    for (const body of this.bodies) {
      const sample = this.closestPoint(body, resolvedX, resolvedY);
      const minimum = radius + body.radius;
      const distance = Math.hypot(sample.dx, sample.dy);
      if (distance >= minimum) continue;
      let normalX = distance > 0.0001 ? -sample.dx / distance : resolvedX < sample.pointX ? -1 : 1;
      let normalY = distance > 0.0001 ? -sample.dy / distance : 0;
      const penetration = minimum - distance;
      resolvedX += normalX * penetration;
      resolvedY += normalY * penetration;
      if (penetration > strongest.penetration) {
        strongest = { collided: true, treeId: body.id, x: resolvedX, y: resolvedY, normalX, normalY, penetration };
      }
      this.collisions += 1;
    }
    strongest.x = wrapWorldX(resolvedX);
    strongest.y = resolvedY;
    return strongest;
  }

  snapshot(playerX: number, playerY: number): {
    bodies: number;
    model: 'trunk-capsules';
    collisions: number;
    gripQueries: number;
    nearest: { id: string; variant: string; distance: number } | null;
  } {
    let nearest: { id: string; variant: string; distance: number } | null = null;
    for (const body of this.bodies) {
      const sample = this.closestPoint(body, playerX, playerY);
      const distance = Math.max(0, Math.hypot(sample.dx, sample.dy) - body.radius);
      if (!nearest || distance < nearest.distance) nearest = { id: body.id, variant: body.variant, distance };
    }
    return {
      bodies: this.bodies.length,
      model: 'trunk-capsules',
      collisions: this.collisions,
      gripQueries: this.gripQueries,
      nearest: nearest ? { ...nearest, distance: Number(nearest.distance.toFixed(2)) } : null,
    };
  }

  private closestPoint(body: TreeInteractionBody, x: number, y: number): {
    pointX: number; pointY: number; dx: number; dy: number;
  } {
    const raw = body.baseX - x;
    const wrappedBaseX = Math.abs(raw) <= WORLD_WIDTH * 0.5
      ? body.baseX
      : body.baseX + (raw > 0 ? -WORLD_WIDTH : WORLD_WIDTH);
    const topX = wrappedBaseX + (body.topX - body.baseX);
    const segmentX = topX - wrappedBaseX;
    const segmentY = body.topY - body.baseY;
    const lengthSq = segmentX * segmentX + segmentY * segmentY || 1;
    const projection = THREE.MathUtils.clamp(
      ((x - wrappedBaseX) * segmentX + (y - body.baseY) * segmentY) / lengthSq,
      0,
      1,
    );
    const pointX = wrappedBaseX + segmentX * projection;
    const pointY = body.baseY + segmentY * projection;
    return { pointX, pointY, dx: pointX - x, dy: pointY - y };
  }
}
