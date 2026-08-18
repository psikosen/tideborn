import { MatterWorld } from './MatterWorld';
import { WORLD_WIDTH, wrapWorldX } from './data';

export interface DenSite {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  discovered: boolean;
  braces: number;
  storage: number;
  curtains: number;
  bowls: number;
  foodStored: number;
  mineralReinforcement: number;
  bioLights: number;
  artifacts: string[];
  destroyed: boolean;
  collapseReason?: string;
}

export interface DenTotals {
  braces: number;
  storage: number;
  curtains: number;
  bowls: number;
  foodStored: number;
  mineralReinforcement: number;
  bioLights: number;
  artifacts: number;
}

export interface DenClaimResult {
  claimed: boolean;
  site?: DenSite;
  reason: 'claimed' | 'existing' | 'too-open' | 'too-small';
  shelterScore: number;
  spaceScore: number;
}

export class DenNetworkSystem {
  private sites: DenSite[] = [{
    id: 'starter-den',
    name: 'Shore den',
    x: -13.25,
    y: 2.9,
    radius: 2.75,
    discovered: false,
    braces: 0,
    storage: 0,
    curtains: 0,
    bowls: 0,
    foodStored: 0,
    mineralReinforcement: 0,
    bioLights: 0,
    artifacts: [],
    destroyed: false,
  }];

  currentDen(x: number, y: number): DenSite | null {
    let nearest: DenSite | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const site of this.sites) {
      if (site.destroyed) continue;
      const distance = Math.hypot(this.horizontalDistance(x, site.x), y - site.y);
      if (distance <= site.radius && distance < best) {
        nearest = site;
        best = distance;
      }
    }
    return nearest;
  }

  discoverAt(x: number, y: number): DenSite | null {
    const site = this.currentDen(x, y);
    if (!site || site.discovered) return null;
    site.discovered = true;
    return site;
  }

  claim(x: number, y: number, world: MatterWorld): DenClaimResult {
    const existing = this.currentDen(x, y);
    if (existing) return { claimed: false, site: existing, reason: 'existing', shelterScore: 1, spaceScore: 1 };
    const spaceScore = this.habitableSpaceScore(x, y, world);
    if (spaceScore < 0.78) return { claimed: false, reason: 'too-small', shelterScore: 0, spaceScore };
    const shelterScore = this.shelterScore(x, y, world);
    if (shelterScore < 0.46) return { claimed: false, reason: 'too-open', shelterScore, spaceScore };
    const index = this.sites.length + 1;
    const site: DenSite = {
      id: `den-${index}`,
      name: y < -40 ? `Hadal den ${index}` : y < -6 ? `Reef den ${index}` : `Coast den ${index}`,
      x: wrapWorldX(x),
      y,
      radius: 2.45,
      discovered: true,
      braces: 0,
      storage: 0,
      curtains: 0,
      bowls: 0,
      foodStored: 0,
      mineralReinforcement: 0,
      bioLights: 0,
      artifacts: [],
      destroyed: false,
    };
    this.sites.push(site);
    return { claimed: true, site, reason: 'claimed', shelterScore, spaceScore };
  }

  totals(): DenTotals {
    return this.sites.filter((site) => !site.destroyed).reduce<DenTotals>((totals, site) => ({
      braces: totals.braces + site.braces,
      storage: totals.storage + site.storage,
      curtains: totals.curtains + site.curtains,
      bowls: totals.bowls + site.bowls,
      foodStored: totals.foodStored + site.foodStored,
      mineralReinforcement: totals.mineralReinforcement + site.mineralReinforcement,
      bioLights: totals.bioLights + site.bioLights,
      artifacts: totals.artifacts + site.artifacts.length,
    }), { braces: 0, storage: 0, curtains: 0, bowls: 0, foodStored: 0, mineralReinforcement: 0, bioLights: 0, artifacts: 0 });
  }

  biolightCounts(): Array<{ id: string; count: number }> {
    return this.sites.filter((site) => !site.destroyed && site.bioLights > 0).map((site) => ({ id: site.id, count: site.bioLights }));
  }

  expireBiolight(denId: string, count: number): number {
    const site = this.sites.find((candidate) => candidate.id === denId);
    if (!site) return 0;
    const expired = Math.min(site.bioLights, Math.max(0, count));
    site.bioLights -= expired;
    return expired;
  }

  discoveredCount(): number {
    return this.sites.filter((site) => site.discovered && !site.destroyed).length;
  }

  collapseAllDiscovered(reason: string): string[] {
    const lost: string[] = [];
    for (const site of this.sites) {
      if (!site.discovered || site.destroyed) continue;
      site.destroyed = true;
      site.collapseReason = reason;
      lost.push(site.id);
    }
    return lost;
  }

  snapshot(playerX: number, playerY: number): { count: number; found: number; viable: number; lost: number; active: string | null; sites: DenSite[]; totals: DenTotals } {
    const discovered = this.sites.filter((site) => site.discovered);
    const viable = discovered.filter((site) => !site.destroyed).length;
    return {
      count: viable,
      found: discovered.length,
      viable,
      lost: discovered.length - viable,
      active: this.currentDen(playerX, playerY)?.id ?? null,
      sites: discovered.map((site) => ({ ...site })),
      totals: this.totals(),
    };
  }

  private shelterScore(x: number, y: number, world: MatterWorld): number {
    const rayCount = 20;
    let blocked = 0;
    for (let ray = 0; ray < rayCount; ray += 1) {
      const angle = (ray / rayCount) * Math.PI * 2;
      if (this.rayHitsTerrain(x, y, angle, 2.05, world)) blocked += 1;
    }
    const roof = this.rayHitsTerrain(x, y, Math.PI * 0.5, 2.2, world);
    const left = this.rayHitsTerrain(x, y, Math.PI, 2.35, world);
    const right = this.rayHitsTerrain(x, y, 0, 2.35, world);
    const enclosure = blocked / rayCount;
    return roof && (left || right) ? enclosure : enclosure * 0.45;
  }

  private habitableSpaceScore(x: number, y: number, world: MatterWorld): number {
    let clear = world.isSolid(x, y) ? 0 : 1;
    let samples = 1;
    for (const ring of [{ radius: 0.34, count: 8 }, { radius: 0.66, count: 14 }]) {
      for (let index = 0; index < ring.count; index += 1) {
        const angle = index / ring.count * Math.PI * 2;
        if (!world.isSolid(x + Math.cos(angle) * ring.radius, y + Math.sin(angle) * ring.radius)) clear += 1;
        samples += 1;
      }
    }
    return clear / samples;
  }

  private rayHitsTerrain(x: number, y: number, angle: number, distance: number, world: MatterWorld): boolean {
    for (let step = 0.35; step <= distance; step += 0.2) {
      if (world.isSolid(x + Math.cos(angle) * step, y + Math.sin(angle) * step)) return true;
    }
    return false;
  }

  private horizontalDistance(a: number, b: number): number {
    const raw = a - b;
    if (Math.abs(raw) <= WORLD_WIDTH * 0.5) return raw;
    return raw > 0 ? raw - WORLD_WIDTH : raw + WORLD_WIDTH;
  }
}
