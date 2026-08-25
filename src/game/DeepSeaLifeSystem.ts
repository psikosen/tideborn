import * as THREE from 'three';
import { clamp } from './data';
import { CreatureAssetLibrary } from './CreatureAssetLibrary';
import { BiologicalSex, CreatureLifecycleSystem, LifeHistory, LifeState } from './CreatureLifecycleSystem';
import { CreatureCollisionBody, CreatureCollisionSnapshot, CreatureCollisionSystem } from './CreatureCollisionSystem';
import { attachPredatorAlertVisual, updatePredatorAlertVisual } from './PredatorAlertVisual';
import type { JetBlastTargetResult } from './JetBlastSystem';
import type { DeepShoalPreyField } from './DeepSeaShoalSystem';

export type DeepSpecies = 'sixgill-shark' | 'orca' | 'lantern-school' | 'gulper-eel' | 'siphonophore' | 'giant-isopod';
export type DeepBehavior = 'patrolling' | 'stalking' | 'searching' | 'hunting' | 'ambushing' | 'feeding' | 'courting' | 'blinded' | 'staggered' | 'fleeing' | 'drifting' | 'scavenging';
type TargetKind = 'player' | 'creature' | 'shoal' | null;

const DEEP_LIFE_HISTORIES: Record<DeepSpecies, LifeHistory> = {
  'sixgill-shark': { lifespanYears: [55, 85], maturityYears: [12, 18], adultScale: [0.72, 1.36], breedingIntervalYears: [2.4, 4.2], broodSize: [1, 2], maxPopulation: 7 },
  orca: { lifespanYears: [50, 90], maturityYears: [12, 17], adultScale: [0.84, 1.3], breedingIntervalYears: [3.5, 6], broodSize: [1, 1], maxPopulation: 3 },
  'lantern-school': { lifespanYears: [3, 6], maturityYears: [0.55, 1], adultScale: [0.7, 1.32], breedingIntervalYears: [0.45, 0.8], broodSize: [1, 2], maxPopulation: 9 },
  'gulper-eel': { lifespanYears: [8, 15], maturityYears: [1.5, 2.7], adultScale: [0.74, 1.32], breedingIntervalYears: [1.3, 2.2], broodSize: [1, 2], maxPopulation: 4 },
  siphonophore: { lifespanYears: [2, 5], maturityYears: [0.35, 0.7], adultScale: [0.68, 1.42], breedingIntervalYears: [0.45, 0.9], broodSize: [1, 1], maxPopulation: 5, asexual: true },
  'giant-isopod': { lifespanYears: [8, 16], maturityYears: [1.6, 3], adultScale: [0.7, 1.34], breedingIntervalYears: [1.5, 2.8], broodSize: [1, 2], maxPopulation: 5 },
};

const BASE_LENGTH_METERS: Record<DeepSpecies, number> = {
  'sixgill-shark': 4.35,
  orca: 4.9,
  'lantern-school': 1.35,
  'gulper-eel': 2.35,
  siphonophore: 2.4,
  'giant-isopod': 1.7,
};

interface DeepCreature {
  id: string;
  species: DeepSpecies;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  phase: number;
  direction: number;
  behavior: DeepBehavior;
  attackCooldown: number;
  alive: boolean;
  life: LifeState<DeepSpecies>;
  satiatedUntil: number;
  feedingUntil: number;
  inkedUntil: number;
  staggeredUntil: number;
  targetId: string | null;
  targetKind: TargetKind;
  huntProgress: number;
  searchUntil: number;
  lastPlayerX: number;
  lastPlayerY: number;
  visual: THREE.Group;
}

export interface DeepSeaPlayerState {
  x: number;
  y: number;
  concealed: boolean;
  movementNoise?: number;
}

/** Read-only scent/pressure field consumed by streamed prey simulations. */
export interface DeepPredatorField {
  id: string;
  species: Extract<DeepSpecies, 'sixgill-shark' | 'orca' | 'gulper-eel'>;
  x: number;
  y: number;
  behavior: DeepBehavior;
  disabled: boolean;
  sizeScale: number;
}

export interface PredatorBiteEvent {
  kind: 'predator-bite';
  predatorId: string;
  species: DeepSpecies;
  x: number;
  y: number;
  damage: number;
  knockbackX: number;
  knockbackY: number;
}

export interface PredationEvent {
  kind: 'predation';
  predatorId: string;
  predatorSpecies: DeepSpecies;
  preyId: string;
  preySpecies: DeepSpecies;
  x: number;
  y: number;
}

export interface DeepLifecycleEvent {
  kind: 'birth' | 'natural-death';
  creatureId: string;
  species: DeepSpecies;
  x: number;
  y: number;
  generation: number;
  parentIds: string[];
}

export type DeepLifeEvent = PredatorBiteEvent | PredationEvent | DeepLifecycleEvent;

export interface DeepSeaLifeSnapshot {
  nearby: Array<{
    id: string;
    species: DeepSpecies;
    behavior: DeepBehavior;
    x: number;
    y: number;
    distance: number;
    threat: boolean;
    targetId: string | null;
    inkedSeconds: number;
    staggeredSeconds: number;
    alertWaves: boolean;
    ageYears: number;
    lifespanYears: number;
    lifeStage: 'juvenile' | 'adult' | 'elder';
    sex: BiologicalSex;
    generation: number;
    parentIds: string[];
    sizeScale: number;
    sizeMeters: number;
  }>;
  population: Record<DeepSpecies, number>;
  activePopulation: Record<DeepSpecies, number>;
  foodWeb: {
    links: Array<{ predator: DeepSpecies; prey: DeepSpecies; kills: number }>;
    recentPredation: Array<{ predator: DeepSpecies; prey: DeepSpecies; elapsed: number }>;
  };
  lifecycle: ReturnType<CreatureLifecycleSystem<DeepSpecies>['snapshot']>;
  collision: CreatureCollisionSnapshot;
}

/**
 * Upgradeable active-chunk fauna for the midnight, abyssal, and hadal route.
 * The regional ecosystem can later decide which representatives this system
 * materializes; this class owns only nearby AI, visuals, attacks, and snapshots.
 */
export class DeepSeaLifeSystem {
  private creatures: DeepCreature[] = [];
  private elapsed = 0;
  private foodWebKills = new Map<string, number>();
  private recentPredation: Array<{ predator: DeepSpecies; prey: DeepSpecies; elapsed: number }> = [];
  private lifecycle: CreatureLifecycleSystem<DeepSpecies>;
  private collision = new CreatureCollisionSystem();
  private nextBreedingCheck = 0;
  private birthSequence = 0;

  constructor(private scene: THREE.Scene, private rng: () => number, private assets: CreatureAssetLibrary) {
    this.lifecycle = new CreatureLifecycleSystem(this.rng, DEEP_LIFE_HISTORIES);
    this.add('pelagic-orca', 'orca', 28.5, -12.2, { initialAdult: true, sex: 'female' });
    this.add('sixgill-twilight', 'sixgill-shark', 32.1, -20.7, { initialAdult: true, sex: 'female' });
    this.add('lantern-twilight', 'lantern-school', 33.0, -21.9, { initialAdult: true, sex: 'female' });
    this.add('sixgill-midnight', 'sixgill-shark', 36.3, -27.9, { initialAdult: true, sex: 'male' });
    this.add('lantern-midnight', 'lantern-school', 37.4, -31.2, { initialAdult: true, sex: 'male' });
    this.add('lantern-cloud', 'lantern-school', 40.2, -44.0, { initialAdult: true, sex: 'female' });
    this.add('sixgill-abyss', 'sixgill-shark', 44.0, -69.8, { initialAdult: true, sex: 'female' });
    this.add('gulper-abyss', 'gulper-eel', 47.0, -85.2, { initialAdult: true, sex: 'female' });
    this.add('glass-siphonophore', 'siphonophore', 49.4, -95.2, { initialAdult: true, sex: 'colony' });
    this.add('hadal-isopod', 'giant-isopod', 53.2, -101.0, { initialAdult: true, sex: 'female' });
  }

  update(dt: number, elapsed: number, player: DeepSeaPlayerState, shoalPrey: readonly DeepShoalPreyField[] = []): DeepLifeEvent[] {
    this.elapsed = elapsed;
    const events: DeepLifeEvent[] = this.updateLifecycle(dt, elapsed);
    for (const creature of this.creatures) {
      if (!creature.alive) {
        creature.visual.visible = false;
        continue;
      }
      creature.attackCooldown = Math.max(0, creature.attackCooldown - dt);
      const dx = player.x - creature.x;
      const dy = player.y - creature.y;
      const distance = Math.hypot(dx, dy);
      // Keep the complete regional population summarized off-screen, but do
      // detailed predator AI and rendering only around the actual camera.
      creature.visual.visible = Math.abs(dx) < 18 && Math.abs(dy) < 11;
      if (!creature.visual.visible) continue;

      const mature = this.lifecycle.isMature(creature.life);
      const aggressive = this.isPredator(creature) && mature;
      const sizeScale = this.lifecycle.currentScale(creature.life);
      const vibrationGain = 1 + clamp(player.movementNoise ?? 0, 0, 3) * 0.14;
      const detection = (creature.species === 'orca' ? 14.5 : creature.species === 'sixgill-shark' ? 10.8 : 6.1)
        * (0.85 + sizeScale * 0.15) * vibrationGain;
      const inked = elapsed < creature.inkedUntil;
      const staggered = elapsed < creature.staggeredUntil;
      const feeding = elapsed < creature.feedingUntil;
      let preyTarget: DeepCreature | undefined;
      let shoalTarget: DeepShoalPreyField | undefined;
      if (aggressive && elapsed >= creature.satiatedUntil) {
        preyTarget = this.findPrey(creature);
        shoalTarget = this.findShoalPrey(creature, shoalPrey);
      }

      if (inked) {
        creature.behavior = 'blinded';
        creature.targetId = null;
        creature.targetKind = null;
        creature.huntProgress = 0;
        creature.vx += Math.sin(elapsed * 1.9 + creature.phase) * dt * 0.32;
        creature.vy += Math.cos(elapsed * 1.4 + creature.phase) * dt * 0.24;
      } else if (staggered) {
        creature.behavior = 'staggered';
        creature.targetId = null;
        creature.targetKind = null;
        creature.huntProgress = 0;
        creature.vx *= Math.pow(0.18, dt);
        creature.vy *= Math.pow(0.18, dt);
      } else if (feeding) {
        creature.behavior = 'feeding';
        creature.targetId = null;
        creature.targetKind = null;
        creature.huntProgress = 0;
        creature.vx *= Math.pow(0.26, dt);
        creature.vy *= Math.pow(0.26, dt);
      } else if (aggressive && !player.concealed && distance < detection) {
        creature.behavior = creature.species === 'gulper-eel' ? 'ambushing' : 'stalking';
        creature.targetId = 'player';
        creature.targetKind = 'player';
        creature.lastPlayerX = player.x;
        creature.lastPlayerY = player.y;
        creature.searchUntil = elapsed + (creature.species === 'orca' ? 8.5 : creature.species === 'sixgill-shark' ? 9.5 : 6.2);
        creature.huntProgress += dt;
        const acceleration = creature.species === 'orca' ? 1.8 : creature.species === 'sixgill-shark' ? 1.65 : 1.25;
        this.accelerateToward(creature, player.x, player.y, acceleration, dt);
      } else if (aggressive && creature.targetKind === 'player' && elapsed < creature.searchUntil) {
        creature.behavior = 'searching';
        creature.huntProgress += dt;
        this.accelerateToward(creature, creature.lastPlayerX, creature.lastPlayerY, creature.species === 'sixgill-shark' ? 0.92 : 0.72, dt);
      } else if (aggressive && elapsed >= creature.satiatedUntil && (preyTarget || shoalTarget)) {
        // Prefer a nearby schooling fish over a much farther trophy target.
        // This produces ordinary feeding most days while preserving occasional
        // orca-on-shark predation when the shark is genuinely the best target.
        const shoalDistance = shoalTarget ? Math.hypot(shoalTarget.x - creature.x, shoalTarget.y - creature.y) : Infinity;
        const creatureDistance = preyTarget ? Math.hypot(preyTarget.x - creature.x, preyTarget.y - creature.y) : Infinity;
        const useShoal = Boolean(shoalTarget && shoalDistance <= creatureDistance * (creature.species === 'orca' ? 0.72 : 0.9));
        const target = useShoal ? shoalTarget! : preyTarget!;
        const targetKind: TargetKind = useShoal ? 'shoal' : 'creature';
        if (creature.targetId !== target.id || creature.targetKind !== targetKind) creature.huntProgress = 0;
        else creature.huntProgress += dt;
        creature.targetId = target.id;
        creature.targetKind = targetKind;
        creature.behavior = 'hunting';
        this.accelerateToward(creature, target.x, target.y, creature.species === 'orca' ? 1.38 : creature.species === 'sixgill-shark' ? 1.22 : 0.95, dt);
      } else if (creature.species === 'lantern-school') {
        const danger = this.nearestPredator(creature, 5.2);
        const playerThreat = !player.concealed && distance < 3.4;
        creature.behavior = danger || playerThreat ? 'fleeing' : 'drifting';
        if (danger) {
          this.accelerateAway(creature, danger.x, danger.y, 1.9, dt);
        } else if (playerThreat) {
          this.accelerateAway(creature, player.x, player.y, 1.4, dt);
        }
      } else if (creature.species === 'siphonophore') {
        creature.behavior = 'drifting';
      } else if (creature.species === 'giant-isopod') {
        creature.behavior = 'scavenging';
      } else {
        creature.behavior = 'patrolling';
        creature.targetId = null;
        creature.targetKind = null;
        creature.huntProgress = 0;
      }

      const returnX = creature.homeX - creature.x;
      const returnY = creature.homeY - creature.y;
      creature.vx += (returnX * 0.045 + Math.sin(elapsed * 0.31 + creature.phase) * 0.08) * dt;
      creature.vy += (returnY * 0.07 + Math.cos(elapsed * 0.43 + creature.phase) * 0.055) * dt;
      const damping = Math.pow(inked ? 0.4 : creature.species === 'siphonophore' ? 0.52 : 0.7, dt);
      creature.vx *= damping;
      creature.vy *= damping;
      const activeHunt = creature.behavior === 'stalking' || creature.behavior === 'hunting';
      const maxSpeed = creature.species === 'orca' && activeHunt ? 2.25 : activeHunt ? 1.85 : creature.behavior === 'searching' ? 1.15 : creature.behavior === 'ambushing' ? 1.48 : creature.species === 'giant-isopod' ? 0.18 : 0.72;
      const speed = Math.hypot(creature.vx, creature.vy);
      if (speed > maxSpeed) {
        creature.vx = creature.vx / speed * maxSpeed;
        creature.vy = creature.vy / speed * maxSpeed;
      }
      const roamX = creature.species === 'orca' ? 12 : creature.species === 'sixgill-shark' ? 8 : 5.5;
      const roamY = creature.species === 'orca' ? 10 : creature.species === 'sixgill-shark' ? 6 : 2.8;
      creature.x = clamp(creature.x + creature.vx * dt, creature.homeX - roamX, creature.homeX + roamX);
      creature.y = clamp(creature.y + creature.vy * dt, creature.homeY - roamY, creature.homeY + roamY);
      if (Math.abs(creature.vx) > 0.04) creature.direction = Math.sign(creature.vx);

      const currentPlayerDistance = Math.hypot(player.x - creature.x, player.y - creature.y);
      const touchingPlayer = this.collision.contactRatio(this.collisionBody(creature), this.playerCollisionBody(player)) <= 1.08;
      if (aggressive && creature.targetKind === 'player' && !player.concealed && touchingPlayer && creature.attackCooldown <= 0) {
        const inverse = 1 / Math.max(0.15, currentPlayerDistance);
        const damage = Math.round((creature.species === 'orca' ? 18 : creature.species === 'sixgill-shark' ? 13 : 8) * (0.7 + sizeScale * 0.3));
        creature.attackCooldown = creature.species === 'orca' ? 5.5 : creature.species === 'sixgill-shark' ? 3.8 : 3.1;
        events.push({
          kind: 'predator-bite',
          predatorId: creature.id,
          species: creature.species,
          x: creature.x,
          y: creature.y,
          damage,
          knockbackX: (player.x - creature.x) * inverse * 2.2,
          knockbackY: (player.y - creature.y) * inverse * 1.4,
        });
      }
      if (preyTarget?.alive && creature.targetKind === 'creature' && creature.huntProgress >= 1.15) {
        const feedingContact = this.collision.contactRatio(this.collisionBody(creature), this.collisionBody(preyTarget)) <= 1.08;
        if (feedingContact) events.push(this.consumePrey(creature, preyTarget, elapsed));
      }
    }
    this.resolveCollisions(player);
    for (const creature of this.creatures) if (creature.alive && creature.visual.visible) this.updateVisual(creature, elapsed);
    return events;
  }

  snapshot(playerX: number, playerY: number, range = 12): DeepSeaLifeSnapshot {
    const emptyPopulation = () => ({
      'sixgill-shark': 0,
      orca: 0,
      'lantern-school': 0,
      'gulper-eel': 0,
      siphonophore: 0,
      'giant-isopod': 0,
    } satisfies Record<DeepSpecies, number>);
    const population = emptyPopulation();
    const activePopulation = emptyPopulation();
    for (const creature of this.creatures) {
      population[creature.species] += 1;
      if (creature.alive) activePopulation[creature.species] += 1;
    }
    return {
      nearby: this.creatures
        .filter((creature) => creature.alive)
        .map((creature) => ({ creature, distance: Math.hypot(creature.x - playerX, creature.y - playerY) }))
        .filter(({ distance }) => distance <= range)
        .map(({ creature, distance }) => ({
          id: creature.id,
          species: creature.species,
          behavior: creature.behavior,
          x: Number(creature.x.toFixed(2)),
          y: Number(creature.y.toFixed(2)),
          distance: Number(distance.toFixed(2)),
          threat: creature.species === 'sixgill-shark' || creature.species === 'orca' || creature.species === 'gulper-eel',
          targetId: creature.targetId,
          inkedSeconds: Number(Math.max(0, creature.inkedUntil - this.elapsed).toFixed(2)),
          staggeredSeconds: Number(Math.max(0, creature.staggeredUntil - this.elapsed).toFixed(2)),
          alertWaves: this.isPredator(creature) && creature.targetKind === 'player' && this.isAlertBehavior(creature.behavior) && this.elapsed >= creature.inkedUntil,
          ageYears: Number(creature.life.ageYears.toFixed(2)),
          lifespanYears: Number(creature.life.lifespanYears.toFixed(2)),
          lifeStage: this.lifecycle.stage(creature.life),
          sex: creature.life.sex,
          generation: creature.life.generation,
          parentIds: creature.life.parentIds,
          sizeScale: Number(this.lifecycle.currentScale(creature.life).toFixed(2)),
          sizeMeters: Number((BASE_LENGTH_METERS[creature.species] * this.lifecycle.currentScale(creature.life)).toFixed(2)),
        })),
      population,
      activePopulation,
      foodWeb: {
        links: [
          this.foodLink('orca', 'sixgill-shark'),
          this.foodLink('orca', 'lantern-school'),
          this.foodLink('sixgill-shark', 'lantern-school'),
          this.foodLink('gulper-eel', 'lantern-school'),
        ],
        recentPredation: this.recentPredation.slice(-6),
      },
      lifecycle: this.lifecycle.snapshot(),
      collision: this.collision.snapshot(),
    };
  }

  applyInk(x: number, y: number, radius: number, elapsed: number, sharkDuration: number): number {
    let affected = 0;
    for (const creature of this.creatures) {
      if (!creature.alive || !this.isPredator(creature) || Math.hypot(creature.x - x, creature.y - y) > radius) continue;
      const duration = creature.species === 'sixgill-shark' ? sharkDuration : sharkDuration * 0.6;
      creature.inkedUntil = Math.max(creature.inkedUntil, elapsed + duration);
      creature.searchUntil = 0;
      creature.targetId = null;
      creature.targetKind = null;
      creature.behavior = 'blinded';
      creature.vx *= 0.25;
      creature.vy *= 0.25;
      affected += 1;
    }
    return affected;
  }

  applyJet(x: number, y: number, direction: THREE.Vector2, elapsed: number, strength = 1): number {
    let affected = 0;
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    for (const creature of this.creatures) {
      if (!creature.alive) continue;
      const dx = creature.x - x;
      const dy = creature.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 3.4) continue;
      const falloff = 1 - distance / 3.4;
      creature.vx += (normalized.x * 0.7 + dx / Math.max(0.2, distance) * 1.55) * falloff * strength;
      creature.vy += (normalized.y * 0.55 + dy / Math.max(0.2, distance) * 1.35) * falloff * strength;
      const stagger = creature.species === 'lantern-school' ? 1.6 : creature.species === 'sixgill-shark' ? 0.72 : 0.42;
      creature.staggeredUntil = Math.max(creature.staggeredUntil, elapsed + stagger * strength);
      affected += 1;
    }
    return affected;
  }

  applyJetBlast(x: number, y: number, direction: THREE.Vector2, elapsed: number): JetBlastTargetResult {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    const result: JetBlastTargetResult = { affected: 0, killed: 0, hits: [] };
    for (const creature of this.creatures) {
      if (!creature.alive || !this.isPredator(creature)) continue;
      const offset = new THREE.Vector2(creature.x - x, creature.y - y);
      const distance = offset.length();
      if (distance > 6.6) continue;
      const alignment = distance < 0.25 ? 1 : normalized.dot(offset.clone().normalize());
      if (alignment < 0.18) continue;
      const scale = this.lifecycle.currentScale(creature.life);
      const sizeMeters = BASE_LENGTH_METERS[creature.species] * scale;
      const killDistance = clamp(3.2 - sizeMeters * 0.18, 0.92, 2.72);
      const killed = distance <= killDistance && alignment >= 0.54;
      const falloff = Math.max(0.1, 1 - distance / 6.6);
      creature.vx += (normalized.x * 8.2 + offset.x / Math.max(0.2, distance) * 3.4) * falloff;
      creature.vy += (normalized.y * 7.1 + offset.y / Math.max(0.2, distance) * 2.7) * falloff;
      creature.staggeredUntil = Math.max(creature.staggeredUntil, elapsed + (killed ? 0 : 3.6));
      creature.targetId = null;
      creature.targetKind = null;
      if (killed) {
        this.retire(creature, 'harvest');
        result.killed += 1;
      }
      result.affected += 1;
      result.hits.push({ id: creature.id, species: creature.species, x: creature.x, y: creature.y, killed });
    }
    return result;
  }

  predatorField(): DeepPredatorField[] {
    return this.creatures
      .filter((creature) => creature.alive && this.isPredator(creature))
      .map((creature) => ({
        id: creature.id,
        species: creature.species as DeepPredatorField['species'],
        x: creature.x,
        y: creature.y,
        behavior: creature.behavior,
        disabled: this.elapsed < creature.inkedUntil || this.elapsed < creature.staggeredUntil || this.elapsed < creature.feedingUntil,
        sizeScale: this.lifecycle.currentScale(creature.life),
      }));
  }

  /** Synchronizes feeding animation when this predator consumes streamed prey. */
  onShoalPredation(predatorId: string, elapsed: number): boolean {
    const creature = this.creatures.find((candidate) => candidate.id === predatorId && candidate.alive && this.isPredator(candidate));
    if (!creature) return false;
    creature.behavior = 'feeding';
    creature.targetId = null;
    creature.targetKind = null;
    creature.huntProgress = 0;
    creature.feedingUntil = Math.max(creature.feedingUntil, elapsed + 1.35);
    creature.satiatedUntil = Math.max(creature.satiatedUntil, elapsed + (creature.species === 'orca' ? 12 : 7.5));
    creature.attackCooldown = Math.max(creature.attackCooldown, 1.1);
    creature.vx *= 0.32;
    creature.vy *= 0.32;
    return true;
  }

  private add(
    id: string,
    species: DeepSpecies,
    x: number,
    y: number,
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): DeepCreature {
    const retired = !lifeOptions.initialAdult ? this.creatures.find((creature) => !creature.alive && creature.species === species) : undefined;
    if (retired) {
      retired.id = id;
      retired.x = x;
      retired.y = y;
      retired.homeX = x;
      retired.homeY = y;
      retired.vx = species === 'siphonophore' || species === 'giant-isopod' ? 0.05 : (this.rng() > 0.5 ? 0.3 : -0.3);
      retired.vy = 0;
      retired.phase = this.rng() * Math.PI * 2;
      retired.direction = 1;
      retired.behavior = species === 'giant-isopod' ? 'scavenging' : species === 'siphonophore' ? 'drifting' : 'patrolling';
      retired.attackCooldown = 0;
      retired.alive = true;
      retired.life = this.lifecycle.create(species, lifeOptions);
      retired.satiatedUntil = 0;
      retired.feedingUntil = 0;
      retired.inkedUntil = 0;
      retired.staggeredUntil = 0;
      retired.targetId = null;
      retired.targetKind = null;
      retired.huntProgress = 0;
      retired.searchUntil = 0;
      retired.lastPlayerX = x;
      retired.lastPlayerY = y;
      retired.visual.position.set(x, y, 2.15);
      retired.visual.visible = false;
      return retired;
    }
    const visual = this.createVisual(species);
    visual.position.set(x, y, 2.15);
    visual.visible = false;
    this.scene.add(visual);
    if (species === 'sixgill-shark') this.assets.attach('shark', visual);
    if (species === 'orca') this.assets.attach('orca', visual);
    const creature: DeepCreature = {
      id,
      species,
      x,
      y,
      homeX: x,
      homeY: y,
      vx: species === 'siphonophore' || species === 'giant-isopod' ? 0.05 : (this.rng() > 0.5 ? 0.3 : -0.3),
      vy: 0,
      phase: this.rng() * Math.PI * 2,
      direction: 1,
      behavior: species === 'giant-isopod' ? 'scavenging' : species === 'siphonophore' ? 'drifting' : 'patrolling',
      attackCooldown: 0,
      alive: true,
      life: this.lifecycle.create(species, lifeOptions),
      satiatedUntil: 0,
      feedingUntil: 0,
      inkedUntil: 0,
      staggeredUntil: 0,
      targetId: null,
      targetKind: null,
      huntProgress: 0,
      searchUntil: 0,
      lastPlayerX: x,
      lastPlayerY: y,
      visual,
    };
    this.creatures.push(creature);
    return creature;
  }

  private isPredator(creature: DeepCreature): boolean {
    return creature.species === 'sixgill-shark' || creature.species === 'orca' || creature.species === 'gulper-eel';
  }

  private isAlertBehavior(behavior: DeepBehavior): boolean {
    return behavior === 'stalking' || behavior === 'searching' || behavior === 'hunting' || behavior === 'ambushing';
  }

  private findPrey(predator: DeepCreature): DeepCreature | undefined {
    const choices = this.creatures
      .filter((prey) => prey.alive && prey.id !== predator.id && this.canEat(predator.species, prey.species))
      .map((prey) => ({ prey, distance: Math.hypot(prey.x - predator.x, prey.y - predator.y), priority: this.preyPriority(predator.species, prey.species) }))
      .filter((candidate) => candidate.distance <= (predator.species === 'orca' ? 12 : predator.species === 'sixgill-shark' ? 8.5 : 5.8))
      .sort((a, b) => a.priority - b.priority || a.distance - b.distance);
    return choices[0]?.prey;
  }

  private findShoalPrey(predator: DeepCreature, prey: readonly DeepShoalPreyField[]): DeepShoalPreyField | undefined {
    const range = predator.species === 'orca' ? 15 : predator.species === 'sixgill-shark' ? 10.5 : 6.4;
    return prey
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - predator.x, candidate.y - predator.y) }))
      .filter(({ distance }) => distance <= range)
      .sort((first, second) => first.distance - second.distance)[0]?.candidate;
  }

  private canEat(predator: DeepSpecies, prey: DeepSpecies): boolean {
    if (predator === 'orca') return prey === 'sixgill-shark' || prey === 'lantern-school';
    if (predator === 'sixgill-shark' || predator === 'gulper-eel') return prey === 'lantern-school';
    return false;
  }

  private preyPriority(predator: DeepSpecies, prey: DeepSpecies): number {
    if (predator === 'orca' && prey === 'sixgill-shark') return 0;
    return 1;
  }

  private nearestPredator(prey: DeepCreature, range: number): DeepCreature | undefined {
    return this.creatures
      .filter((candidate) => candidate.alive && this.isPredator(candidate) && this.lifecycle.isMature(candidate.life) && this.elapsed >= candidate.inkedUntil)
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - prey.x, candidate.y - prey.y) }))
      .filter(({ distance }) => distance <= range)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
  }

  private accelerateToward(creature: DeepCreature, x: number, y: number, acceleration: number, dt: number): void {
    const dx = x - creature.x;
    const dy = y - creature.y;
    const inverse = 1 / Math.max(0.2, Math.hypot(dx, dy));
    creature.vx += dx * inverse * acceleration * dt;
    creature.vy += dy * inverse * acceleration * dt;
  }

  private accelerateAway(creature: DeepCreature, x: number, y: number, acceleration: number, dt: number): void {
    const dx = creature.x - x;
    const dy = creature.y - y;
    const inverse = 1 / Math.max(0.2, Math.hypot(dx, dy));
    creature.vx += dx * inverse * acceleration * dt;
    creature.vy += dy * inverse * acceleration * dt;
  }

  private consumePrey(predator: DeepCreature, prey: DeepCreature, elapsed: number): PredationEvent {
    this.retire(prey, 'predation');
    predator.behavior = 'feeding';
    predator.targetId = null;
    predator.targetKind = null;
    predator.huntProgress = 0;
    predator.feedingUntil = elapsed + 1.35;
    predator.satiatedUntil = elapsed + (predator.species === 'orca' ? 13 : 8.5);
    const key = this.foodKey(predator.species, prey.species);
    this.foodWebKills.set(key, (this.foodWebKills.get(key) ?? 0) + 1);
    this.recentPredation.push({ predator: predator.species, prey: prey.species, elapsed: Number(elapsed.toFixed(2)) });
    if (this.recentPredation.length > 12) this.recentPredation.shift();
    return {
      kind: 'predation',
      predatorId: predator.id,
      predatorSpecies: predator.species,
      preyId: prey.id,
      preySpecies: prey.species,
      x: prey.x,
      y: prey.y,
    };
  }

  private updateLifecycle(dt: number, elapsed: number): DeepLifecycleEvent[] {
    const events: DeepLifecycleEvent[] = [];
    for (const creature of this.creatures) {
      if (!creature.alive || !this.lifecycle.advance(creature.life, dt)) continue;
      this.retire(creature, 'natural');
      events.push({
        kind: 'natural-death',
        creatureId: creature.id,
        species: creature.species,
        x: creature.x,
        y: creature.y,
        generation: creature.life.generation,
        parentIds: creature.life.parentIds,
      });
    }

    if (elapsed < this.nextBreedingCheck) return events;
    this.nextBreedingCheck = elapsed + 0.75;
    const speciesList: DeepSpecies[] = ['sixgill-shark', 'orca', 'lantern-school', 'gulper-eel', 'siphonophore', 'giant-isopod'];
    for (const species of speciesList) {
      const living = this.creatures.filter((creature) => creature.alive && creature.species === species);
      if (living.length >= this.lifecycle.maxPopulation(species)) continue;
      let first: DeepCreature | undefined;
      let second: DeepCreature | undefined;
      if (this.lifecycle.isAsexual(species)) {
        first = living.find((creature) => this.lifecycle.canBreed(creature.life));
      } else {
        first = living.find((creature) => creature.life.sex === 'female' && this.lifecycle.canBreed(creature.life));
        second = first && living.find((creature) => creature.id !== first!.id && this.lifecycle.compatible(first!.life, creature.life));
      }
      if (!first || (!this.lifecycle.isAsexual(species) && !second)) continue;

      const available = this.lifecycle.maxPopulation(species) - living.length;
      const brood = Math.min(available, this.lifecycle.broodSize(species));
      this.lifecycle.markBred(first.life);
      if (second) this.lifecycle.markBred(second.life);
      first.behavior = 'courting';
      if (second) second.behavior = 'courting';
      const parentIds = second ? [first.id, second.id] : [first.id];
      const generation = Math.max(first.life.generation, second?.life.generation ?? first.life.generation) + 1;
      const centerX = second ? (first.x + second.x) * 0.5 : first.x;
      const centerY = second ? (first.y + second.y) * 0.5 : first.y;
      for (let index = 0; index < brood; index += 1) {
        const child = this.add(
          `${species}-born-${++this.birthSequence}`,
          species,
          centerX + (this.rng() - 0.5) * 0.7,
          centerY + (this.rng() - 0.5) * 0.45,
          { generation, parentIds },
        );
        this.lifecycle.recordBirth();
        events.push({
          kind: 'birth',
          creatureId: child.id,
          species,
          x: child.x,
          y: child.y,
          generation,
          parentIds,
        });
      }
    }
    return events;
  }

  private retire(creature: DeepCreature, cause: 'natural' | 'predation' | 'harvest'): void {
    if (!creature.alive) return;
    creature.alive = false;
    creature.visual.visible = false;
    creature.targetId = null;
    creature.targetKind = null;
    creature.huntProgress = 0;
    this.lifecycle.recordDeath(cause);
  }

  private foodKey(predator: DeepSpecies, prey: DeepSpecies): string {
    return `${predator}>${prey}`;
  }

  private foodLink(predator: DeepSpecies, prey: DeepSpecies): { predator: DeepSpecies; prey: DeepSpecies; kills: number } {
    return { predator, prey, kills: this.foodWebKills.get(this.foodKey(predator, prey)) ?? 0 };
  }

  private createVisual(species: DeepSpecies): THREE.Group {
    if (species === 'sixgill-shark') return this.createShark();
    if (species === 'orca') return this.createOrca();
    if (species === 'lantern-school') return this.createLanternSchool();
    if (species === 'gulper-eel') return this.createGulperEel();
    if (species === 'siphonophore') return this.createSiphonophore();
    return this.createIsopod();
  }

  private createShark(): THREE.Group {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: '#26383d', roughness: 0.72, emissive: '#061014', emissiveIntensity: 0.18 });
    const belly = new THREE.MeshStandardMaterial({ color: '#526268', roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 14), skin);
    body.scale.set(2.4, 0.68, 0.55);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.72, 16), skin);
    snout.rotation.z = -Math.PI / 2;
    snout.position.x = 1.22;
    const tail = this.triangle('#1b2d32', [0, 0, 0, -0.72, 0.62, 0, -0.58, -0.58, 0]);
    tail.position.x = -1.08;
    tail.userData.tail = true;
    const dorsal = this.triangle('#21343a', [-0.18, 0, 0, 0.18, 0.72, 0, 0.5, 0, 0]);
    dorsal.position.y = 0.23;
    const pectoral = this.triangle('#1b2d32', [0, 0, 0, -0.42, -0.62, 0, 0.48, -0.08, 0]);
    pectoral.position.set(0.15, -0.18, 0.08);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.25), belly);
    jaw.position.set(1.05, -0.23, 0.04);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 9, 7), new THREE.MeshBasicMaterial({ color: '#c9e8dc' }));
    eye.position.set(0.84, 0.14, 0.38);
    group.add(body, snout, tail, dorsal, pectoral, jaw, eye);
    group.children.forEach((child) => { child.userData.assetFallback = true; });
    this.addPredatorStatusVisuals(group, 1.55);
    return group;
  }

  private createOrca(): THREE.Group {
    const group = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: '#10191d', roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: '#d7dfdc', roughness: 0.64 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), black);
    body.scale.set(2.8, 0.78, 0.66);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10), white);
    belly.scale.set(2.5, 0.28, 0.55);
    belly.position.set(0.14, -0.34, 0.1);
    const tail = this.triangle('#10191d', [0, 0, 0, -0.85, 0.72, 0, -0.85, -0.72, 0]);
    tail.position.x = -1.58;
    tail.userData.tail = true;
    group.add(body, belly, tail);
    group.children.forEach((child) => { child.userData.assetFallback = true; });
    this.addPredatorStatusVisuals(group, 1.8);
    return group;
  }

  private addPredatorStatusVisuals(group: THREE.Group, alertRadius: number): void {
    attachPredatorAlertVisual(group, alertRadius, 0.82);

    const inkCloud = new THREE.Group();
    inkCloud.userData.inkCloud = true;
    inkCloud.visible = false;
    for (let index = 0; index < 11; index += 1) {
      const blot = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 + (index % 3) * 0.045, 9, 7),
        new THREE.MeshBasicMaterial({
          color: index % 2 ? '#15101f' : '#21142d',
          transparent: true,
          opacity: 0.58,
          blending: THREE.NormalBlending,
          depthWrite: false,
        }),
      );
      const angle = index * 2.17;
      blot.position.set(Math.cos(angle) * (0.35 + (index % 4) * 0.16), Math.sin(angle) * (0.22 + (index % 3) * 0.12), 0.8 + index * 0.004);
      blot.userData.inkPart = true;
      blot.userData.baseX = blot.position.x;
      blot.userData.baseY = blot.position.y;
      inkCloud.add(blot);
    }
    group.add(inkCloud);
  }

  private createLanternSchool(): THREE.Group {
    const group = new THREE.Group();
    for (let index = 0; index < 8; index += 1) {
      const fish = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 7), new THREE.MeshBasicMaterial({ color: '#2b4549' }));
      body.scale.set(1.8, 0.62, 0.35);
      const lure = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 6), new THREE.MeshBasicMaterial({ color: '#82f4d5', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      lure.position.set(0.12, -0.07, 0.13);
      fish.position.set((index % 4) * 0.46 - 0.72, Math.floor(index / 4) * 0.42 - 0.22 + (index % 2) * 0.08, (index % 3) * 0.04);
      fish.userData.phase = index * 0.74;
      fish.userData.baseY = fish.position.y;
      fish.add(body, lure);
      group.add(fish);
    }
    const schoolGlow = new THREE.PointLight('#5fc8b2', 0.32, 1.8, 1.8);
    schoolGlow.position.z = 0.8;
    group.add(schoolGlow);
    return group;
  }

  private createGulperEel(): THREE.Group {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.25, 0, 0), new THREE.Vector3(-0.45, 0.12, 0), new THREE.Vector3(0.35, -0.08, 0), new THREE.Vector3(1.05, 0.03, 0),
    ]);
    const body = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.11, 8, false), new THREE.MeshStandardMaterial({ color: '#18272c', roughness: 0.7, emissive: '#062528', emissiveIntensity: 0.22 }));
    const mouth = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.25, 18), new THREE.MeshBasicMaterial({ color: '#6b817c', side: THREE.DoubleSide }));
    mouth.position.set(1.08, 0.03, 0.02);
    mouth.rotation.y = Math.PI / 2;
    const lure = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#6fd8c9', transparent: true, opacity: 0.76, blending: THREE.AdditiveBlending }));
    lure.position.set(0.82, 0.32, 0.08);
    group.add(body, mouth, lure);
    this.addPredatorStatusVisuals(group, 1.15);
    return group;
  }

  private createSiphonophore(): THREE.Group {
    const group = new THREE.Group();
    const bellMaterial = new THREE.MeshBasicMaterial({ color: '#599b91', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let index = 0; index < 9; index += 1) {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.12 + index * 0.008, 10, 7), bellMaterial);
      bell.scale.y = 0.72;
      bell.position.y = index * 0.23;
      bell.userData.phase = index * 0.61;
      group.add(bell);
    }
    for (let index = 0; index < 5; index += 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3((index - 2) * 0.08, 0, 0), new THREE.Vector3((index - 2) * 0.14, -1.6 - index * 0.16, 0)]),
        new THREE.LineBasicMaterial({ color: '#477c76', transparent: true, opacity: 0.28 }),
      );
      group.add(line);
    }
    return group;
  }

  private createIsopod(): THREE.Group {
    const group = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: '#48534f', roughness: 0.92, metalness: 0.08 });
    for (let segment = 0; segment < 8; segment += 1) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7), shell);
      plate.scale.set(1.25, 0.62, 0.55);
      plate.position.x = (segment - 3.5) * 0.22;
      plate.position.y = Math.sin(segment / 7 * Math.PI) * 0.08;
      group.add(plate);
      for (const side of [-1, 1]) {
        const leg = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(plate.position.x, -0.08, 0), new THREE.Vector3(plate.position.x + side * 0.12, -0.34, 0)]),
          new THREE.LineBasicMaterial({ color: '#66716b' }),
        );
        group.add(leg);
      }
    }
    return group;
  }

  private collisionBody(creature: DeepCreature): CreatureCollisionBody {
    const scale = this.lifecycle.currentScale(creature.life);
    const dimensions: Record<DeepSpecies, { x: number; y: number; mass: number }> = {
      // Long-body profiles include the full imported nose-to-tail silhouette;
      // torso-only bounds still let fins and tails visibly cross.
      'sixgill-shark': { x: 2.2, y: 0.55, mass: 9 },
      orca: { x: 2.48, y: 0.7, mass: 15 },
      'lantern-school': { x: 1.02, y: 0.32, mass: 1.2 },
      'gulper-eel': { x: 1.2, y: 0.26, mass: 1.8 },
      siphonophore: { x: 0.32, y: 1.2, mass: 0.55 },
      'giant-isopod': { x: 0.86, y: 0.3, mass: 2.4 },
    };
    const dimension = dimensions[creature.species];
    return {
      id: creature.id,
      x: creature.x,
      y: creature.y,
      vx: creature.vx,
      vy: creature.vy,
      radiusX: dimension.x * scale,
      radiusY: dimension.y * scale,
      mass: dimension.mass * scale * scale,
      layer: 'deep-water',
    };
  }

  private playerCollisionBody(player: DeepSeaPlayerState): CreatureCollisionBody {
    return { id: 'player', x: player.x, y: player.y, radiusX: 0.52, radiusY: 0.58, mass: 1000, immovable: true, layer: 'deep-water' };
  }

  private resolveCollisions(player: DeepSeaPlayerState): void {
    const active = this.creatures.filter((creature) => creature.alive && creature.visual.visible);
    const bodies = active.map((creature) => this.collisionBody(creature));
    bodies.push(this.playerCollisionBody(player));
    this.collision.resolve(bodies, () => true, 4);
    for (let index = 0; index < active.length; index += 1) {
      const creature = active[index];
      const body = bodies[index];
      creature.x = body.x;
      creature.y = body.y;
      creature.vx = body.vx ?? creature.vx;
      creature.vy = body.vy ?? creature.vy;
    }
  }

  private updateVisual(creature: DeepCreature, elapsed: number): void {
    creature.visual.position.set(creature.x, creature.y, 2.15);
    const vertical = Math.sin(elapsed * 0.82 + creature.phase) * 0.035;
    creature.visual.position.y += vertical;
    const speciesScale = creature.species === 'sixgill-shark' || creature.species === 'orca' ? 1 : creature.species === 'lantern-school' ? 1.35 : creature.species === 'giant-isopod' ? 0.85 : 1;
    const baseScale = speciesScale * this.lifecycle.currentScale(creature.life);
    const feedingPulse = creature.behavior === 'feeding' ? 1 + Math.sin(elapsed * 18) * 0.1 : 1;
    creature.visual.scale.set(creature.direction * baseScale * feedingPulse, baseScale / feedingPulse, baseScale);
    const tail = creature.visual.children.find((child) => child.userData.tail);
    const huntSpeed = this.isAlertBehavior(creature.behavior) ? 8.5 : 4.6;
    if (tail) tail.rotation.z = Math.sin(elapsed * huntSpeed + creature.phase) * 0.36;
    const inked = elapsed < creature.inkedUntil;
    const alertMode = inked || creature.targetKind !== 'player'
      ? 'none'
      : creature.behavior === 'searching' ? 'searching' : this.isAlertBehavior(creature.behavior) ? 'spotted' : 'none';
    updatePredatorAlertVisual(creature.visual, elapsed, alertMode, creature.phase);
    creature.visual.children.forEach((child) => {
      if (child.userData.inkCloud) {
        child.visible = inked;
        child.children.forEach((part, index) => {
          part.position.x = part.userData.baseX + Math.sin(elapsed * 1.2 + index) * 0.045;
          part.position.y = part.userData.baseY + Math.cos(elapsed * 1.45 + index * 0.7) * 0.04;
          const pulse = 0.82 + Math.sin(elapsed * 1.8 + index) * 0.14;
          part.scale.setScalar(pulse);
        });
      }
    });
    if (creature.species === 'lantern-school') {
      creature.visual.children.forEach((child, index) => {
        if (child.userData.baseY === undefined) return;
        child.position.y = child.userData.baseY + Math.sin(elapsed * 1.7 + child.userData.phase) * 0.045;
        child.rotation.z = Math.sin(elapsed * 2.1 + index) * 0.08;
      });
    } else if (creature.species === 'siphonophore') {
      creature.visual.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const pulse = 0.92 + Math.sin(elapsed * 1.1 + child.userData.phase) * 0.05;
          child.scale.set(pulse, pulse * 0.72, pulse);
        }
      });
    }
  }

  private triangle(color: string, positions: number[]): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2]);
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  }
}
