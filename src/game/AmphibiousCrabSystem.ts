import * as THREE from 'three';
import { CreatureAssetId, CreatureAssetLibrary } from './CreatureAssetLibrary';
import { BiologicalSex, CreatureLifecycleSystem, LifeHistory, LifeState } from './CreatureLifecycleSystem';
import { CreatureCollisionSnapshot, CreatureCollisionSystem } from './CreatureCollisionSystem';
import { MatterWorld } from './MatterWorld';
import { BASE_SEA_LEVEL, WORLD_MAX_Y, WORLD_MIN_X, WORLD_WIDTH, clamp, wrapWorldX } from './data';

export type CrabSpecies = 'shore-crab' | 'mudflat-crab' | 'coconut-crab';
export type CrabBehavior = 'foraging' | 'hunting-fish' | 'cracking-clam' | 'feeding' | 'fleeing' | 'pinching' | 'courting' | 'staggered';
type CrabPreyKind = 'fish' | 'clam';

interface CrabConfig {
  label: string;
  asset: CreatureAssetId;
  founders: number;
  lengthM: number;
  radiusX: number;
  radiusY: number;
  speed: number;
  foodYield: number;
  regionalPopulation: number;
  history: LifeHistory;
}

const CONFIG: Record<CrabSpecies, CrabConfig> = {
  'shore-crab': {
    label: 'striped shore crab', asset: 'animated-shore-crab', founders: 8, lengthM: 0.72, radiusX: 0.34, radiusY: 0.19,
    speed: 0.52, foodYield: 1, regionalPopulation: 4200,
    history: { lifespanYears: [3, 8], maturityYears: [0.8, 1.6], adultScale: [0.72, 1.32], breedingIntervalYears: [0.6, 1.2], broodSize: [1, 3], maxPopulation: 18 },
  },
  'mudflat-crab': {
    label: 'Ilyoplax mudflat crab', asset: 'ilyoplax-mud-crab', founders: 10, lengthM: 0.38, radiusX: 0.23, radiusY: 0.13,
    speed: 0.44, foodYield: 1, regionalPopulation: 6800,
    history: { lifespanYears: [2, 5], maturityYears: [0.5, 1], adultScale: [0.68, 1.28], breedingIntervalYears: [0.4, 0.9], broodSize: [2, 4], maxPopulation: 22 },
  },
  'coconut-crab': {
    label: 'coconut crab', asset: 'coconut-crab', founders: 5, lengthM: 1.08, radiusX: 0.5, radiusY: 0.34,
    speed: 0.3, foodYield: 2, regionalPopulation: 700,
    history: { lifespanYears: [28, 58], maturityYears: [5, 9], adultScale: [0.76, 1.35], breedingIntervalYears: [2, 4], broodSize: [1, 2], maxPopulation: 10 },
  },
};

interface Crab {
  id: string;
  species: CrabSpecies;
  x: number;
  y: number;
  homeX: number;
  vx: number;
  vy: number;
  direction: number;
  phase: number;
  hunger: number;
  behavior: CrabBehavior;
  targetId: string | null;
  targetKind: CrabPreyKind | null;
  feedingUntil: number;
  staggeredUntil: number;
  pinchCooldown: number;
  alive: boolean;
  life: LifeState<CrabSpecies>;
  visual: THREE.Group;
}

export interface CrabPreyField {
  id: string;
  x: number;
  y: number;
  kind: CrabPreyKind;
}

export type CrabEvent =
  | { kind: 'predation'; crabId: string; species: CrabSpecies; preyId: string; preyKind: CrabPreyKind; x: number; y: number }
  | { kind: 'pinch'; crabId: string; species: CrabSpecies; x: number; y: number; damage: number; knockbackX: number }
  | { kind: 'birth' | 'natural-death'; crabId: string; species: CrabSpecies; x: number; y: number; generation: number };

export interface CrabHuntResult {
  caught: boolean;
  reason: 'caught' | 'miss' | 'cooldown';
  crabId?: string;
  species?: CrabSpecies;
  label?: string;
  x?: number;
  y?: number;
  foodYield: number;
  staminaCost: number;
  cooldownRemaining: number;
}

/**
 * Amphibious, surface-following crabs. Every animal retains a lifespan and
 * hunger record off screen, while terrain walking, collision, predation and
 * imported GLB animation are activated only inside the player's local bubble.
 */
export class AmphibiousCrabSystem {
  private crabs: Crab[] = [];
  private lifecycle: CreatureLifecycleSystem<CrabSpecies>;
  private collision = new CreatureCollisionSystem();
  private nextBreedingCheck = 0;
  private birthSequence = 0;
  private importedRepresentatives = new Map<CrabSpecies, number>();
  private elapsed = 0;
  private huntCooldown = 0;
  private terrainContacts = 0;
  private predationKills = { fish: 0, clam: 0 };
  private recentPredation: Array<{ crab: CrabSpecies; prey: CrabPreyKind; elapsed: number }> = [];

  constructor(
    private scene: THREE.Scene,
    private rng: () => number,
    private assets: CreatureAssetLibrary,
    private world: MatterWorld,
  ) {
    this.lifecycle = new CreatureLifecycleSystem(this.rng, Object.fromEntries(
      (Object.keys(CONFIG) as CrabSpecies[]).map((species) => [species, CONFIG[species].history]),
    ) as Record<CrabSpecies, LifeHistory>);
    // Detailed crab GLBs are large. Load a species only when one of its
    // representatives enters the active bubble; the simulation remains live
    // everywhere without paying a 25+ MB decode hitch at startup.
    for (const species of Object.keys(CONFIG) as CrabSpecies[]) {
      const habitats = this.habitats(species);
      for (let index = 0; index < CONFIG[species].founders; index += 1) {
        const habitat = habitats[index % habitats.length];
        this.spawn(`${species}-${index + 1}`, species, habitat.x, habitat.y, {
          initialAdult: true,
          sex: index % 2 === 0 ? 'female' : 'male',
        });
      }
    }
  }

  update(
    dt: number,
    elapsed: number,
    player: { x: number; y: number; vx: number; concealed: boolean },
    prey: CrabPreyField[],
  ): CrabEvent[] {
    this.elapsed = elapsed;
    this.huntCooldown = Math.max(0, this.huntCooldown - dt);
    const events = this.updateLifecycle(dt, elapsed);
    const visible: Crab[] = [];
    for (const crab of this.crabs) {
      if (!crab.alive) { crab.visual.visible = false; continue; }
      crab.hunger = clamp(crab.hunger - dt * 0.42, 0, 100);
      crab.pinchCooldown = Math.max(0, crab.pinchCooldown - dt);
      const playerDistance = Math.hypot(crab.x - player.x, crab.y - player.y);
      crab.visual.visible = playerDistance < 19 && Math.abs(crab.y - player.y) < 11;
      if (!crab.visual.visible) continue;
      this.ensureAsset(crab);
      visible.push(crab);
      const staggered = elapsed < crab.staggeredUntil;
      const feeding = elapsed < crab.feedingUntil;
      const nearestPrey = crab.hunger < 76 && !feeding && !staggered ? this.nearestPrey(crab, prey, 5.4) : null;
      if (staggered) {
        crab.behavior = 'staggered';
        crab.vx *= Math.pow(0.24, dt);
      } else if (feeding) {
        crab.behavior = 'feeding';
        crab.vx *= Math.pow(0.2, dt);
      } else if (nearestPrey) {
        crab.targetId = nearestPrey.id;
        crab.targetKind = nearestPrey.kind;
        crab.behavior = nearestPrey.kind === 'clam' ? 'cracking-clam' : 'hunting-fish';
        this.walkToward(crab, nearestPrey.x, dt, 1.28);
        if (Math.hypot(nearestPrey.x - crab.x, nearestPrey.y - crab.y) < CONFIG[crab.species].radiusX + 0.34) {
          crab.feedingUntil = elapsed + 2.1;
          crab.hunger = clamp(crab.hunger + (nearestPrey.kind === 'clam' ? 34 : 46), 0, 100);
          this.predationKills[nearestPrey.kind] += 1;
          this.recentPredation.push({ crab: crab.species, prey: nearestPrey.kind, elapsed });
          this.recentPredation = this.recentPredation.slice(-8);
          events.push({ kind: 'predation', crabId: crab.id, species: crab.species, preyId: nearestPrey.id, preyKind: nearestPrey.kind, x: crab.x, y: crab.y });
          crab.targetId = null;
          crab.targetKind = null;
        }
      } else {
        crab.targetId = null;
        crab.targetKind = null;
        const afraid = !player.concealed && playerDistance < (crab.species === 'coconut-crab' ? 1.7 : 2.4);
        if (afraid && crab.species !== 'coconut-crab') {
          crab.behavior = 'fleeing';
          this.walkToward(crab, crab.x + Math.sign(crab.x - player.x || 1) * 4, dt, 1.65);
        } else {
          crab.behavior = crab.species === 'coconut-crab' && playerDistance < 1.1 ? 'pinching' : 'foraging';
          const wander = crab.homeX + Math.sin(elapsed * 0.11 + crab.phase) * (crab.species === 'coconut-crab' ? 5.5 : 4.2);
          this.walkToward(crab, wander, dt, 1);
        }
      }
      this.followTerrain(crab, dt);
      const minimumPlayerGap = CONFIG[crab.species].radiusX + 0.46;
      if (playerDistance > 0.001 && playerDistance < minimumPlayerGap) {
        const push = minimumPlayerGap - playerDistance;
        crab.x = wrapWorldX(crab.x + (crab.x - player.x) / playerDistance * push);
        crab.y += (crab.y - player.y) / playerDistance * push * 0.35;
      }
      if (crab.species === 'coconut-crab' && !player.concealed && playerDistance < 0.82 && crab.pinchCooldown <= 0) {
        crab.pinchCooldown = 3.4;
        events.push({ kind: 'pinch', crabId: crab.id, species: crab.species, x: crab.x, y: crab.y, damage: 7, knockbackX: Math.sign(player.x - crab.x || 1) * 1.1 });
      }
      this.updateVisual(crab, elapsed);
    }
    const bodies = visible.map((crab) => this.body(crab));
    this.collision.resolve(bodies, () => true, 2);
    for (let index = 0; index < visible.length; index += 1) {
      visible[index].x = wrapWorldX(bodies[index].x);
      visible[index].y = bodies[index].y;
      visible[index].vx = bodies[index].vx ?? visible[index].vx;
      visible[index].vy = bodies[index].vy ?? visible[index].vy;
    }
    return events;
  }

  hunt(player: { x: number; y: number; facing: number }, hasNet: boolean): CrabHuntResult {
    const range = hasNet ? 2.45 : 1.48;
    if (this.huntCooldown > 0) return { caught: false, reason: 'cooldown', foodYield: 0, staminaCost: 0, cooldownRemaining: this.huntCooldown };
    const target = this.crabs
      .filter((crab) => crab.alive)
      .map((crab) => ({ crab, distance: Math.hypot(crab.x - player.x, crab.y - player.y), forward: (crab.x - player.x) * player.facing }))
      .filter(({ distance, forward }) => distance <= range && forward > -0.5)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!target) return { caught: false, reason: 'miss', foodYield: 0, staminaCost: 0, cooldownRemaining: 0 };
    this.huntCooldown = hasNet ? 0.65 : 0.9;
    const { crab } = target;
    crab.alive = false;
    crab.visual.visible = false;
    this.lifecycle.recordDeath('harvest');
    const config = CONFIG[crab.species];
    return {
      caught: true, reason: 'caught', crabId: crab.id, species: crab.species, label: config.label,
      x: crab.x, y: crab.y, foodYield: config.foodYield, staminaCost: hasNet ? 9 : 13, cooldownRemaining: this.huntCooldown,
    };
  }

  nearest(x: number, y: number, range: number): { id: string; species: CrabSpecies; label: string; distance: number } | null {
    const target = this.crabs.filter((crab) => crab.alive)
      .map((crab) => ({ crab, distance: Math.hypot(crab.x - x, crab.y - y) }))
      .filter(({ distance }) => distance <= range).sort((a, b) => a.distance - b.distance)[0];
    return target ? { id: target.crab.id, species: target.crab.species, label: CONFIG[target.crab.species].label, distance: target.distance } : null;
  }

  applyJet(x: number, y: number, direction: THREE.Vector2, elapsed: number, strength = 1): number {
    const heading = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    let affected = 0;
    for (const crab of this.crabs) {
      if (!crab.alive) continue;
      const dx = crab.x - x;
      const dy = crab.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 3.8 * Math.max(0.6, strength)) continue;
      const falloff = 1 - distance / (3.8 * Math.max(0.6, strength));
      crab.vx += (heading.x * 1.5 + dx / Math.max(0.2, distance) * 1.1) * falloff * strength;
      crab.vy += (heading.y * 1.1 + 0.7) * falloff * strength;
      crab.staggeredUntil = Math.max(crab.staggeredUntil, elapsed + 1.4 * strength);
      affected += 1;
    }
    return affected;
  }

  snapshot(playerX: number, playerY: number): {
    population: Record<CrabSpecies, number>;
    regionalPopulation: Record<CrabSpecies, number>;
    visible: number;
    culled: number;
    onLand: number;
    underwater: number;
    nearby: Array<Record<string, string | number | boolean | null>>;
    foodWeb: { fishEaten: number; clamsEaten: number; recentPredation: Array<{ crab: CrabSpecies; prey: CrabPreyKind; elapsed: number }> };
    lifecycle: ReturnType<CreatureLifecycleSystem<CrabSpecies>['snapshot']>;
    collision: CreatureCollisionSnapshot;
    terrainContacts: number;
    importedRepresentatives: Record<CrabSpecies, number>;
  } {
    const species = Object.keys(CONFIG) as CrabSpecies[];
    const population = Object.fromEntries(species.map((id) => [id, this.crabs.filter((crab) => crab.alive && crab.species === id).length])) as Record<CrabSpecies, number>;
    const regionalPopulation = Object.fromEntries(species.map((id) => [id, CONFIG[id].regionalPopulation])) as Record<CrabSpecies, number>;
    const living = this.crabs.filter((crab) => crab.alive);
    return {
      population,
      regionalPopulation,
      visible: living.filter((crab) => crab.visual.visible).length,
      culled: living.filter((crab) => !crab.visual.visible).length,
      onLand: living.filter((crab) => crab.y >= BASE_SEA_LEVEL).length,
      underwater: living.filter((crab) => crab.y < BASE_SEA_LEVEL).length,
      nearby: living.map((crab) => ({ crab, distance: Math.hypot(crab.x - playerX, crab.y - playerY) }))
        .filter(({ distance }) => distance <= 12).sort((a, b) => a.distance - b.distance).map(({ crab, distance }) => ({
          id: crab.id, species: crab.species, label: CONFIG[crab.species].label, x: Number(crab.x.toFixed(2)), y: Number(crab.y.toFixed(2)),
          distance: Number(distance.toFixed(2)), behavior: crab.behavior, habitat: crab.y >= BASE_SEA_LEVEL ? 'land' : 'underwater',
          targetId: crab.targetId, targetKind: crab.targetKind, ageYears: Number(crab.life.ageYears.toFixed(2)), lifespanYears: Number(crab.life.lifespanYears.toFixed(2)),
          lifeStage: this.lifecycle.stage(crab.life), sex: crab.life.sex, generation: crab.life.generation,
          sizeMeters: Number((CONFIG[crab.species].lengthM * this.lifecycle.currentScale(crab.life)).toFixed(2)),
        })),
      foodWeb: { fishEaten: this.predationKills.fish, clamsEaten: this.predationKills.clam, recentPredation: this.recentPredation },
      lifecycle: this.lifecycle.snapshot(),
      collision: this.collision.snapshot(),
      terrainContacts: this.terrainContacts,
      importedRepresentatives: Object.fromEntries(species.map((id) => [id, this.importedRepresentatives.get(id) ?? 0])) as Record<CrabSpecies, number>,
    };
  }

  private habitats(species: CrabSpecies): Array<{ x: number; y: number }> {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let x = WORLD_MIN_X + 1; x < WORLD_MIN_X + WORLD_WIDTH - 1; x += 1.35) {
      const surface = this.highestSurface(x);
      if (surface === null) continue;
      const valid = species === 'coconut-crab'
        ? surface >= BASE_SEA_LEVEL + 0.12
        : species === 'shore-crab'
          ? surface >= BASE_SEA_LEVEL - 3.6 && surface <= BASE_SEA_LEVEL + 1.8
          : surface < BASE_SEA_LEVEL - 0.35 && surface > -13;
      if (valid) candidates.push({ x, y: surface + CONFIG[species].radiusY });
    }
    return candidates.length ? candidates : [{ x: species === 'coconut-crab' ? -20 : -2, y: species === 'coconut-crab' ? 5 : 1 }];
  }

  private highestSurface(x: number): number | null {
    for (let y = WORLD_MAX_Y - 0.2; y > -18; y -= this.world.cellSize) {
      if (this.world.isSolid(x, y) && !this.world.isSolid(x, y + this.world.cellSize)) return y + this.world.cellSize * 0.5;
    }
    return null;
  }

  private surfaceNear(x: number, y: number, radiusY: number): number | null {
    const start = y + radiusY + 0.62;
    const end = y - radiusY - 1.05;
    for (let sample = start; sample >= end; sample -= this.world.cellSize) {
      if (this.world.isSolid(x, sample) && !this.world.isSolid(x, sample + this.world.cellSize)) return sample + this.world.cellSize * 0.5;
    }
    return null;
  }

  private walkToward(crab: Crab, targetX: number, dt: number, multiplier: number): void {
    const dx = targetX - crab.x;
    const direction = Math.sign(dx || Math.sin(this.elapsed + crab.phase) || 1);
    crab.direction = direction;
    const desired = direction * CONFIG[crab.species].speed * multiplier;
    crab.vx += (desired - crab.vx) * Math.min(1, dt * 4.2);
  }

  private followTerrain(crab: Crab, dt: number): void {
    const config = CONFIG[crab.species];
    const previousX = crab.x;
    const proposedX = wrapWorldX(crab.x + crab.vx * dt);
    const support = this.surfaceNear(proposedX, crab.y, config.radiusY);
    if (support !== null) {
      const targetY = support + config.radiusY;
      if (Math.abs(targetY - crab.y) <= 0.72) {
        crab.x = proposedX;
        crab.y += (targetY - crab.y) * Math.min(1, dt * 11);
        crab.vy = (targetY - crab.y) * 3;
      } else {
        crab.vx *= -0.42;
        this.terrainContacts += 1;
      }
    } else {
      crab.x = proposedX;
      crab.vy -= dt * (crab.y < BASE_SEA_LEVEL ? 0.8 : 4.2);
      crab.y += crab.vy * dt;
    }
    if (this.world.isSolid(crab.x, crab.y) || this.world.isSolid(crab.x + Math.sign(crab.vx || 1) * config.radiusX, crab.y)) {
      crab.x = previousX;
      crab.vx *= -0.5;
      crab.y += this.world.cellSize * 1.5;
      this.terrainContacts += 1;
    }
    crab.vx *= Math.pow(crab.y < BASE_SEA_LEVEL ? 0.78 : 0.66, dt);
  }

  private nearestPrey(crab: Crab, prey: CrabPreyField[], range: number): CrabPreyField | null {
    const allowed = prey.filter((candidate) => {
      if (crab.species === 'coconut-crab' && candidate.kind === 'fish') return false;
      const vertical = Math.abs(candidate.y - crab.y);
      return vertical < (candidate.kind === 'fish' ? 1.35 : 0.65);
    });
    return allowed.map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - crab.x, candidate.y - crab.y) }))
      .filter(({ distance }) => distance <= range).sort((a, b) => a.distance - b.distance)[0]?.candidate ?? null;
  }

  private updateLifecycle(dt: number, elapsed: number): CrabEvent[] {
    const events: CrabEvent[] = [];
    for (const crab of this.crabs) {
      if (!crab.alive || !this.lifecycle.advance(crab.life, dt)) continue;
      crab.alive = false;
      crab.visual.visible = false;
      this.lifecycle.recordDeath('natural');
      events.push({ kind: 'natural-death', crabId: crab.id, species: crab.species, x: crab.x, y: crab.y, generation: crab.life.generation });
    }
    if (elapsed < this.nextBreedingCheck) return events;
    this.nextBreedingCheck = elapsed + 2.4;
    for (const species of Object.keys(CONFIG) as CrabSpecies[]) {
      const adults = this.crabs.filter((crab) => crab.alive && crab.species === species && this.lifecycle.canBreed(crab.life) && crab.hunger > 54);
      const female = adults.find((crab) => crab.life.sex === 'female');
      const male = adults.find((crab) => crab.life.sex === 'male' && (!female || Math.abs(crab.x - female.x) < 9));
      if (!female || !male || this.crabs.filter((crab) => crab.alive && crab.species === species).length >= this.lifecycle.maxPopulation(species)) continue;
      female.behavior = 'courting';
      male.behavior = 'courting';
      this.lifecycle.markBred(female.life);
      this.lifecycle.markBred(male.life);
      const room = this.lifecycle.maxPopulation(species) - this.crabs.filter((crab) => crab.alive && crab.species === species).length;
      const brood = Math.min(room, this.lifecycle.broodSize(species));
      for (let child = 0; child < brood; child += 1) {
        const newborn = this.spawn(`${species}-born-${++this.birthSequence}`, species, female.x + (this.rng() - 0.5) * 0.6, female.y, {
          generation: Math.max(female.life.generation, male.life.generation) + 1,
          parentIds: [female.id, male.id],
        });
        this.lifecycle.recordBirth();
        events.push({ kind: 'birth', crabId: newborn.id, species, x: newborn.x, y: newborn.y, generation: newborn.life.generation });
      }
    }
    return events;
  }

  private spawn(
    id: string,
    species: CrabSpecies,
    x: number,
    y: number,
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): Crab {
    const visual = this.createFallback(species);
    visual.position.set(x, y, 2.15);
    this.scene.add(visual);
    const crab: Crab = {
      id, species, x, y, homeX: x, vx: (this.rng() - 0.5) * 0.18, vy: 0, direction: this.rng() < 0.5 ? -1 : 1,
      phase: this.rng() * Math.PI * 2, hunger: 58 + this.rng() * 34, behavior: 'foraging', targetId: null, targetKind: null,
      feedingUntil: 0, staggeredUntil: 0, pinchCooldown: 0, alive: true, life: this.lifecycle.create(species, lifeOptions), visual,
    };
    this.crabs.push(crab);
    return crab;
  }

  private ensureAsset(crab: Crab): void {
    if (crab.visual.userData.assetRequested) return;
    crab.visual.userData.assetRequested = true;
    this.assets.attach(CONFIG[crab.species].asset, crab.visual);
    this.importedRepresentatives.set(crab.species, (this.importedRepresentatives.get(crab.species) ?? 0) + 1);
  }

  private createFallback(species: CrabSpecies): THREE.Group {
    const config = CONFIG[species];
    const group = new THREE.Group();
    const colors: Record<CrabSpecies, string> = { 'shore-crab': '#b5583f', 'mudflat-crab': '#b58a62', 'coconut-crab': '#4e6d78' };
    const material = new THREE.MeshStandardMaterial({ color: colors[species], roughness: 0.78, metalness: 0.02 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(config.radiusX, 14, 9), material);
    body.scale.set(1, config.radiusY / config.radiusX, 0.56);
    body.userData.assetFallback = true;
    group.add(body);
    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 4; leg += 1) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(side * config.radiusX * 0.55, (leg - 1.5) * config.radiusY * 0.26, 0),
            new THREE.Vector3(side * config.radiusX * (1.1 + leg * 0.08), -config.radiusY * (0.55 + leg * 0.08), 0),
          ]),
          new THREE.LineBasicMaterial({ color: colors[species] }),
        );
        line.userData.assetFallback = true;
        group.add(line);
      }
      const claw = new THREE.Mesh(new THREE.SphereGeometry(config.radiusY * 0.38, 8, 6), material.clone());
      claw.scale.set(1.35, 0.72, 0.52);
      claw.position.set(side * config.radiusX * 1.08, config.radiusY * 0.3, 0.08);
      claw.userData.assetFallback = true;
      group.add(claw);
    }
    return group;
  }

  private updateVisual(crab: Crab, elapsed: number): void {
    const scale = this.lifecycle.currentScale(crab.life);
    crab.visual.position.set(crab.x, crab.y + Math.sin(elapsed * 5 + crab.phase) * 0.012, 2.15);
    crab.visual.scale.set(crab.direction * scale, scale, scale);
    crab.visual.rotation.z = clamp(-crab.vx * 0.08, -0.12, 0.12);
  }

  private body(crab: Crab) {
    const scale = this.lifecycle.currentScale(crab.life);
    return {
      id: crab.id, x: crab.x, y: crab.y, vx: crab.vx, vy: crab.vy,
      radiusX: CONFIG[crab.species].radiusX * scale, radiusY: CONFIG[crab.species].radiusY * scale,
      mass: crab.species === 'coconut-crab' ? 2.8 : 0.8, layer: crab.y >= BASE_SEA_LEVEL ? 'land' : 'benthic',
    };
  }
}
