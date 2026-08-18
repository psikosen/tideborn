import * as THREE from 'three';
import { AquaticTerrainCollisionSnapshot, AquaticTerrainCollisionSystem, SolidTerrainSampler } from './AquaticTerrainCollisionSystem';
import { CreatureCollisionSnapshot, CreatureCollisionSystem } from './CreatureCollisionSystem';
import { BiologicalSex, CreatureLifecycleSystem, LifeHistory, LifeState } from './CreatureLifecycleSystem';
import { clamp } from './data';

export type DeepFishSpecies = 'silver-sprat' | 'blue-mackerel' | 'lanternfish' | 'bristlemouth' | 'hatchetfish' | 'hadal-snailfish' | 'megacave-glassfish';
export type DeepFishBehavior = 'schooling' | 'drifting' | 'fleeing' | 'scattered' | 'captured';

export interface ShoalPredatorField {
  id: string;
  species: string;
  x: number;
  y: number;
  behavior: string;
  disabled: boolean;
  sizeScale: number;
}

export interface DeepShoalPreyField {
  id: string;
  species: DeepFishSpecies;
  x: number;
  y: number;
}

interface SpeciesConfig {
  label: string;
  band: 'pelagic' | 'twilight' | 'midnight' | 'abyss' | 'hadal' | 'megacave';
  color: string;
  glow: string;
  founders: number;
  history: LifeHistory;
  sizeMeters: number;
  speed: number;
  glowOpacity?: number;
  habitats: Array<{ x: number; y: number; spreadX: number; spreadY: number }>;
}

const SPECIES: Record<DeepFishSpecies, SpeciesConfig> = {
  'silver-sprat': {
    label: 'silver sprat', band: 'pelagic', color: '#8ba9a6', glow: '#d5eee6', glowOpacity: 0.16, founders: 44, sizeMeters: 0.19, speed: 0.72,
    history: { lifespanYears: [2, 5], maturityYears: [0.45, 0.9], adultScale: [0.68, 1.34], breedingIntervalYears: [0.35, 0.72], broodSize: [2, 5], maxPopulation: 76 },
    // Shelf productivity still produces the largest school. Two smaller
    // offshore aggregations keep the open ocean alive without making every
    // cubic metre equally crowded.
    habitats: [
      { x: 15.2, y: -6.1, spreadX: 3.8, spreadY: 2.1 },
      { x: 21.1, y: -9.0, spreadX: 4.8, spreadY: 2.8 },
      { x: 27.0, y: -12.7, spreadX: 4.2, spreadY: 3.2 },
    ],
  },
  'blue-mackerel': {
    label: 'blue mackerel', band: 'pelagic', color: '#4f7888', glow: '#b8d8d2', glowOpacity: 0.1, founders: 18, sizeMeters: 0.46, speed: 0.86,
    history: { lifespanYears: [7, 15], maturityYears: [1.5, 2.8], adultScale: [0.72, 1.36], breedingIntervalYears: [0.85, 1.5], broodSize: [1, 3], maxPopulation: 34 },
    habitats: [
      { x: 18.8, y: -8.0, spreadX: 4.6, spreadY: 2.6 },
      { x: 27.8, y: -13.8, spreadX: 4.4, spreadY: 3.4 },
    ],
  },
  lanternfish: {
    label: 'lanternfish', band: 'twilight', color: '#416b69', glow: '#62f6cc', founders: 36, sizeMeters: 0.22, speed: 0.58,
    history: { lifespanYears: [3, 7], maturityYears: [0.7, 1.3], adultScale: [0.7, 1.35], breedingIntervalYears: [0.45, 0.85], broodSize: [2, 4], maxPopulation: 64 },
    habitats: [{ x: 32.5, y: -22.2, spreadX: 3.8, spreadY: 2.4 }, { x: 36.5, y: -31.5, spreadX: 3.6, spreadY: 4.4 }],
  },
  bristlemouth: {
    label: 'bristlemouth', band: 'midnight', color: '#334858', glow: '#68aee7', founders: 34, sizeMeters: 0.16, speed: 0.52,
    history: { lifespanYears: [2, 5], maturityYears: [0.45, 0.9], adultScale: [0.66, 1.28], breedingIntervalYears: [0.35, 0.7], broodSize: [2, 5], maxPopulation: 62 },
    habitats: [{ x: 39.7, y: -43.8, spreadX: 3.6, spreadY: 5.5 }, { x: 42.2, y: -57.5, spreadX: 3.2, spreadY: 5.3 }],
  },
  hatchetfish: {
    label: 'silver hatchetfish', band: 'abyss', color: '#697783', glow: '#82dff1', founders: 25, sizeMeters: 0.28, speed: 0.43,
    history: { lifespanYears: [4, 9], maturityYears: [1, 1.8], adultScale: [0.72, 1.36], breedingIntervalYears: [0.7, 1.25], broodSize: [1, 3], maxPopulation: 46 },
    habitats: [{ x: 44.2, y: -68.6, spreadX: 3.3, spreadY: 5.2 }, { x: 47.0, y: -82.1, spreadX: 3, spreadY: 4.6 }],
  },
  'hadal-snailfish': {
    label: 'hadal snailfish', band: 'hadal', color: '#665f78', glow: '#be8cff', founders: 18, sizeMeters: 0.31, speed: 0.32,
    history: { lifespanYears: [6, 13], maturityYears: [1.4, 2.5], adultScale: [0.7, 1.4], breedingIntervalYears: [1, 1.8], broodSize: [1, 2], maxPopulation: 36 },
    habitats: [{ x: 49.3, y: -91.8, spreadX: 2.5, spreadY: 3.6 }, { x: 52.2, y: -99.5, spreadX: 2.7, spreadY: 3.1 }],
  },
  'megacave-glassfish': {
    label: 'blind megacave glassfish', band: 'megacave', color: '#3a5a68', glow: '#73f6df', founders: 48, sizeMeters: 0.26, speed: 0.28,
    history: { lifespanYears: [7, 16], maturityYears: [1.6, 3.1], adultScale: [0.68, 1.38], breedingIntervalYears: [0.9, 1.7], broodSize: [2, 4], maxPopulation: 78 },
    habitats: [{ x: 46.0, y: -106.1, spreadX: 3.1, spreadY: 1.4 }, { x: 53.2, y: -107.0, spreadX: 3.8, spreadY: 1.5 }, { x: 60.0, y: -105.8, spreadX: 2.2, spreadY: 1.1 }],
  },
};

const SPECIES_ORDER = Object.keys(SPECIES) as DeepFishSpecies[];

interface DeepFish {
  id: string;
  species: DeepFishSpecies;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  radiusX: number;
  radiusY: number;
  phase: number;
  direction: number;
  alive: boolean;
  behavior: DeepFishBehavior;
  scatteredUntil: number;
  capturedBy: string | null;
  capturedPredatorSpecies: string | null;
  captureProgress: number;
  life: LifeState<DeepFishSpecies>;
}

interface SpeciesMeshes {
  body: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
}

export interface DeepShoalEvent {
  kind: 'birth' | 'natural-death' | 'predation';
  fishId: string;
  fishSpecies: DeepFishSpecies;
  x: number;
  y: number;
  generation: number;
  parentIds: string[];
  predatorId?: string;
  predatorSpecies?: string;
}

export interface DeepFishHuntResult {
  caught: boolean;
  reason: 'caught' | 'miss' | 'cooldown';
  fishId?: string;
  species?: DeepFishSpecies;
  x?: number;
  y?: number;
  staminaCost: number;
  cooldownRemaining: number;
}

export interface DeepSeaShoalSnapshot {
  playerHuntCooldown: number;
  livingFish: number;
  visibleFish: number;
  simulatedFish: number;
  hiddenFish: number;
  population: Record<DeepFishSpecies, number>;
  activePopulation: Record<DeepFishSpecies, number>;
  regionalPopulation: Record<DeepFishSpecies, number>;
  nearby: Array<{
    id: string;
    species: DeepFishSpecies;
    label: string;
    depthBand: SpeciesConfig['band'];
    x: number;
    y: number;
    distance: number;
    behavior: DeepFishBehavior;
    ageYears: number;
    lifespanYears: number;
    lifeStage: 'juvenile' | 'adult' | 'elder';
    sex: BiologicalSex;
    generation: number;
    sizeMeters: number;
    terrainClear: boolean;
  }>;
  foodWeb: {
    predatorKills: Record<string, number>;
    recentPredation: Array<{ predator: string; prey: DeepFishSpecies; elapsed: number }>;
  };
  lifecycle: ReturnType<CreatureLifecycleSystem<DeepFishSpecies>['snapshot']>;
  bodyCollision: CreatureCollisionSnapshot;
  terrainCollision: AquaticTerrainCollisionSnapshot;
}

/**
 * Dense deep-sea fish population with active-chunk streaming. Every fish keeps
 * a lightweight biological record, but only the nearby depth bubble receives
 * movement, collision, predator, and GPU-instance work.
 */
export class DeepSeaShoalSystem {
  private fish: DeepFish[] = [];
  private meshes = new Map<DeepFishSpecies, SpeciesMeshes>();
  private lifecycle: CreatureLifecycleSystem<DeepFishSpecies>;
  private bodyCollision = new CreatureCollisionSystem();
  private terrainCollision = new AquaticTerrainCollisionSystem();
  private visibleFishCount = 0;
  private simulatedFishCount = 0;
  private elapsed = 0;
  private nextBreedingCheck = 0;
  private birthSequence = 0;
  private huntCooldown = 0;
  private predatorCooldowns = new Map<string, number>();
  private predatorKills = new Map<string, number>();
  private recentPredation: Array<{ predator: string; prey: DeepFishSpecies; elapsed: number }> = [];
  private dummy = new THREE.Object3D();

  constructor(private scene: THREE.Scene, private rng: () => number, private terrain: SolidTerrainSampler) {
    const histories = Object.fromEntries(SPECIES_ORDER.map((species) => [species, SPECIES[species].history])) as Record<DeepFishSpecies, LifeHistory>;
    this.lifecycle = new CreatureLifecycleSystem(this.rng, histories);
    for (const species of SPECIES_ORDER) {
      const config = SPECIES[species];
      const meshes = this.createMeshes(species, config.history.maxPopulation);
      this.meshes.set(species, meshes);
      this.scene.add(meshes.body, meshes.glow);
      for (let index = 0; index < config.founders; index += 1) {
        const habitat = config.habitats[index % config.habitats.length];
        const x = habitat.x + (this.rng() - 0.5) * habitat.spreadX * 2;
        const y = habitat.y + (this.rng() - 0.5) * habitat.spreadY * 2;
        this.add(`${species}-${index + 1}`, species, x, y, {
          initialAdult: true,
          // Alternate within each habitat instead of accidentally separating
          // the founding sexes into different depth clusters.
          sex: Math.floor(index / config.habitats.length) % 2 ? 'male' : 'female',
        });
      }
    }
    this.refreshInstances(0, 0);
  }

  update(
    dt: number,
    elapsed: number,
    player: { x: number; y: number; concealed: boolean },
    predators: ShoalPredatorField[],
  ): DeepShoalEvent[] {
    this.elapsed = elapsed;
    this.huntCooldown = Math.max(0, this.huntCooldown - dt);
    this.terrainCollision.beginStep();
    const events = this.updateLifecycle(dt, elapsed);
    const simulationDt = Math.min(dt, 0.12);
    const simulated: DeepFish[] = [];
    const previous = new Map<string, { x: number; y: number }>();

    for (const fish of this.fish) {
      if (!fish.alive) continue;
      const dx = fish.x - player.x;
      const dy = fish.y - player.y;
      if (Math.abs(dx) > 17 || Math.abs(dy) > 12) continue;
      simulated.push(fish);
      previous.set(fish.id, { x: fish.x, y: fish.y });
      const config = SPECIES[fish.species];
      const scale = this.lifecycle.currentScale(fish.life);
      fish.radiusX = config.sizeMeters * scale * 0.72;
      fish.radiusY = config.sizeMeters * scale * (fish.species === 'hatchetfish' ? 0.64 : 0.32);
      const captor = fish.capturedBy ? predators.find((predator) => predator.id === fish.capturedBy && !predator.disabled) : undefined;
      if (fish.capturedBy && !captor) {
        fish.capturedBy = null;
        fish.capturedPredatorSpecies = null;
        fish.captureProgress = 0;
        fish.scatteredUntil = elapsed + 1.4;
      }
      const predator = this.nearestPredator(fish, predators, 5.5);
      const playerDistance = Math.hypot(player.x - fish.x, player.y - fish.y);
      if (captor) {
        fish.behavior = 'captured';
        fish.captureProgress += simulationDt;
        const captureAngle = fish.phase + fish.captureProgress * 11;
        const spiralRadius = Math.max(0, 0.34 * (1 - fish.captureProgress / 0.78));
        const targetX = captor.x + Math.cos(captureAngle) * spiralRadius;
        const targetY = captor.y + Math.sin(captureAngle) * spiralRadius * 0.58;
        fish.vx += (targetX - fish.x) * simulationDt * 13;
        fish.vy += (targetY - fish.y) * simulationDt * 13;
      } else if (predator) {
        fish.behavior = 'fleeing';
        this.accelerateAway(fish, predator.x, predator.y, 1.38, simulationDt);
      } else if (!player.concealed && playerDistance < 2.8) {
        fish.behavior = 'fleeing';
        this.accelerateAway(fish, player.x, player.y, 1.05, simulationDt);
      } else if (elapsed < fish.scatteredUntil) {
        fish.behavior = 'scattered';
      } else {
        fish.behavior = fish.species === 'hadal-snailfish' || fish.species === 'megacave-glassfish' ? 'drifting' : 'schooling';
      }

      const homePull = captor ? 0 : fish.species === 'hadal-snailfish' || fish.species === 'megacave-glassfish' ? 0.035 : 0.055;
      const idleMotion = captor ? 0 : 1;
      fish.vx += ((fish.homeX - fish.x) * homePull + Math.sin(elapsed * 0.37 + fish.phase) * 0.075 * idleMotion) * simulationDt;
      fish.vy += ((fish.homeY - fish.y) * homePull * 1.35 + Math.cos(elapsed * 0.51 + fish.phase) * 0.055 * idleMotion) * simulationDt;
      const avoidance = this.terrainCollision.avoidance(fish, this.terrain, 0.28);
      fish.vx += avoidance.x * simulationDt * 7;
      fish.vy += avoidance.y * simulationDt * 7;
      const damping = Math.pow(captor ? 0.46 : 0.73, simulationDt);
      fish.vx *= damping;
      fish.vy *= damping;
      const maxSpeed = captor ? 3.4 : config.speed * (fish.behavior === 'fleeing' ? 2.15 : fish.behavior === 'scattered' ? 1.55 : 1);
      const speed = Math.hypot(fish.vx, fish.vy);
      if (speed > maxSpeed) {
        fish.vx = fish.vx / speed * maxSpeed;
        fish.vy = fish.vy / speed * maxSpeed;
      }
      fish.x = clamp(fish.x + fish.vx * simulationDt, fish.homeX - 5.8, fish.homeX + 5.8);
      fish.y = clamp(fish.y + fish.vy * simulationDt, fish.homeY - 5.2, fish.homeY + 5.2);
      if (Math.abs(fish.vx) > 0.02) fish.direction = Math.sign(fish.vx);
      const old = previous.get(fish.id)!;
      this.terrainCollision.resolveMotion(fish, old.x, old.y, this.terrain, 3.2);
    }

    const capturedIds = new Set(simulated.filter((fish) => fish.capturedBy).map((fish) => fish.id));
    this.bodyCollision.resolve(simulated, (first, second) => first.id !== second.id && !capturedIds.has(first.id) && !capturedIds.has(second.id), 2);
    for (const fish of simulated) {
      const old = previous.get(fish.id)!;
      this.terrainCollision.resolveMotion(fish, old.x, old.y, this.terrain, 3.2);
    }
    events.push(...this.resolvePredation(predators, simulated, elapsed));
    this.simulatedFishCount = simulated.length;
    this.refreshInstances(player.x, player.y);
    return events;
  }

  hunt(player: { x: number; y: number; facing: number }, hasNet: boolean): DeepFishHuntResult {
    const range = hasNet ? 2.8 : 1.78;
    const staminaCost = hasNet ? 8 : 12;
    if (this.huntCooldown > 0) return { caught: false, reason: 'cooldown', staminaCost: 0, cooldownRemaining: this.huntCooldown };
    this.huntCooldown = hasNet ? 0.48 : 0.72;
    const target = this.fish
      .filter((fish) => fish.alive && !fish.capturedBy)
      .map((fish) => ({ fish, distance: Math.hypot(fish.x - player.x, fish.y - player.y), forward: (fish.x - player.x) * player.facing }))
      .filter((candidate) => candidate.distance <= range && candidate.forward > -0.55)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!target) return { caught: false, reason: 'miss', staminaCost: 5, cooldownRemaining: this.huntCooldown };
    const { fish } = target;
    this.retire(fish, 'harvest');
    return {
      caught: true, reason: 'caught', fishId: fish.id, species: fish.species,
      x: fish.x, y: fish.y, staminaCost, cooldownRemaining: this.huntCooldown,
    };
  }

  applyJet(x: number, y: number, direction: THREE.Vector2, elapsed: number, strength = 1): number {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    let affected = 0;
    for (const fish of this.fish) {
      if (!fish.alive) continue;
      const dx = fish.x - x;
      const dy = fish.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 3.6) continue;
      const force = 1 - distance / 3.6;
      const inverse = 1 / Math.max(0.16, distance);
      fish.vx += (normalized.x * 0.55 + dx * inverse * 2.1) * force * strength;
      fish.vy += (normalized.y * 0.42 + dy * inverse * 1.7) * force * strength;
      fish.scatteredUntil = Math.max(fish.scatteredUntil, elapsed + 2.2 * strength);
      affected += 1;
    }
    return affected;
  }

  preyField(playerX: number, playerY: number, range = 21): DeepShoalPreyField[] {
    return this.fish
      .filter((fish) => fish.alive && !fish.capturedBy && Math.abs(fish.x - playerX) <= range && Math.abs(fish.y - playerY) <= range * 0.72)
      .map((fish) => ({ id: fish.id, species: fish.species, x: fish.x, y: fish.y }));
  }

  snapshot(playerX: number, playerY: number, range = 12): DeepSeaShoalSnapshot {
    const population = this.emptyPopulation();
    const activePopulation = this.emptyPopulation();
    for (const fish of this.fish) {
      population[fish.species] += 1;
      if (fish.alive) activePopulation[fish.species] += 1;
    }
    const livingFish = Object.values(activePopulation).reduce((sum, value) => sum + value, 0);
    return {
      playerHuntCooldown: Number(this.huntCooldown.toFixed(2)),
      livingFish,
      visibleFish: this.visibleFishCount,
      simulatedFish: this.simulatedFishCount,
      hiddenFish: Math.max(0, livingFish - this.visibleFishCount),
      population,
      activePopulation,
      regionalPopulation: {
        'silver-sprat': 720000,
        'blue-mackerel': 185000,
        lanternfish: 284000,
        bristlemouth: 510000,
        hatchetfish: 96000,
        'hadal-snailfish': 42000,
        'megacave-glassfish': 920000,
      },
      nearby: this.fish
        .filter((fish) => fish.alive)
        .map((fish) => ({ fish, distance: Math.hypot(fish.x - playerX, fish.y - playerY) }))
        .filter(({ distance }) => distance <= range)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 80)
        .map(({ fish, distance }) => ({
          id: fish.id,
          species: fish.species,
          label: SPECIES[fish.species].label,
          depthBand: SPECIES[fish.species].band,
          x: Number(fish.x.toFixed(2)),
          y: Number(fish.y.toFixed(2)),
          distance: Number(distance.toFixed(2)),
          behavior: fish.behavior,
          ageYears: Number(fish.life.ageYears.toFixed(2)),
          lifespanYears: Number(fish.life.lifespanYears.toFixed(2)),
          lifeStage: this.lifecycle.stage(fish.life),
          sex: fish.life.sex,
          generation: fish.life.generation,
          sizeMeters: Number((SPECIES[fish.species].sizeMeters * this.lifecycle.currentScale(fish.life)).toFixed(2)),
          terrainClear: this.terrainCollision.isClear(fish, this.terrain),
        })),
      foodWeb: {
        predatorKills: Object.fromEntries(this.predatorKills),
        recentPredation: this.recentPredation.slice(-8),
      },
      lifecycle: this.lifecycle.snapshot(),
      bodyCollision: this.bodyCollision.snapshot(),
      terrainCollision: this.terrainCollision.snapshot(),
    };
  }

  private add(
    id: string,
    species: DeepFishSpecies,
    x: number,
    y: number,
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): DeepFish {
    const retired = this.fish.find((fish) => !fish.alive && fish.species === species);
    const fish = retired ?? {
      id, species, x, y, homeX: x, homeY: y, vx: 0, vy: 0, radiusX: 0.16, radiusY: 0.08,
      phase: 0, direction: 1, alive: true, behavior: 'schooling' as DeepFishBehavior,
      scatteredUntil: 0, capturedBy: null, capturedPredatorSpecies: null, captureProgress: 0,
      life: this.lifecycle.create(species, lifeOptions),
    };
    fish.id = id;
    fish.species = species;
    fish.x = x;
    fish.y = y;
    fish.homeX = x;
    fish.homeY = y;
    fish.vx = (this.rng() > 0.5 ? 1 : -1) * (0.12 + this.rng() * 0.2);
    fish.vy = (this.rng() - 0.5) * 0.1;
    fish.phase = this.rng() * Math.PI * 2;
    fish.direction = Math.sign(fish.vx);
    fish.alive = true;
    fish.behavior = 'schooling';
    fish.scatteredUntil = 0;
    fish.capturedBy = null;
    fish.capturedPredatorSpecies = null;
    fish.captureProgress = 0;
    fish.life = this.lifecycle.create(species, lifeOptions);
    const scale = this.lifecycle.currentScale(fish.life);
    fish.radiusX = SPECIES[species].sizeMeters * scale * 0.72;
    fish.radiusY = SPECIES[species].sizeMeters * scale * (species === 'hatchetfish' ? 0.64 : 0.32);
    const clear = this.terrainCollision.nearestClear(fish, this.terrain, x, y, 5.5);
    if (clear) {
      fish.x = clear.x;
      fish.y = clear.y;
      fish.homeX = clear.x;
      fish.homeY = clear.y;
    }
    if (!retired) this.fish.push(fish);
    return fish;
  }

  private updateLifecycle(dt: number, elapsed: number): DeepShoalEvent[] {
    const events: DeepShoalEvent[] = [];
    for (const fish of this.fish) {
      if (!fish.alive || !this.lifecycle.advance(fish.life, dt)) continue;
      this.retire(fish, 'natural');
      events.push(this.event('natural-death', fish));
    }
    if (elapsed < this.nextBreedingCheck) return events;
    this.nextBreedingCheck = elapsed + 0.9;
    for (const species of SPECIES_ORDER) {
      const living = this.fish.filter((fish) => fish.alive && fish.species === species);
      if (living.length >= this.lifecycle.maxPopulation(species)) continue;
      const mother = living.find((fish) => fish.life.sex === 'female' && this.lifecycle.canBreed(fish.life));
      const father = mother && living.find((fish) => fish.id !== mother.id && this.lifecycle.compatible(mother.life, fish.life));
      if (!mother || !father) continue;
      this.lifecycle.markBred(mother.life);
      this.lifecycle.markBred(father.life);
      const available = this.lifecycle.maxPopulation(species) - living.length;
      const brood = Math.min(available, this.lifecycle.broodSize(species));
      const generation = Math.max(mother.life.generation, father.life.generation) + 1;
      const parentIds = [mother.id, father.id];
      for (let index = 0; index < brood; index += 1) {
        const child = this.add(
          `${species}-born-${++this.birthSequence}`,
          species,
          (mother.x + father.x) * 0.5 + (this.rng() - 0.5) * 0.6,
          (mother.y + father.y) * 0.5 + (this.rng() - 0.5) * 0.4,
          { generation, parentIds },
        );
        this.lifecycle.recordBirth();
        events.push(this.event('birth', child));
      }
    }
    return events;
  }

  private resolvePredation(predators: ShoalPredatorField[], simulated: DeepFish[], elapsed: number): DeepShoalEvent[] {
    const events: DeepShoalEvent[] = [];
    for (const target of simulated) {
      if (!target.alive || !target.capturedBy || target.captureProgress < 0.78) continue;
      const predator = predators.find((candidate) => candidate.id === target.capturedBy && !candidate.disabled);
      if (!predator) continue;
      this.retire(target, 'predation');
      this.predatorCooldowns.set(predator.id, elapsed + (predator.species === 'orca' ? 8 : 5.5));
      const key = `${predator.species}>${target.species}`;
      this.predatorKills.set(key, (this.predatorKills.get(key) ?? 0) + 1);
      this.recentPredation.push({ predator: predator.species, prey: target.species, elapsed: Number(elapsed.toFixed(2)) });
      if (this.recentPredation.length > 16) this.recentPredation.shift();
      events.push({ ...this.event('predation', target), predatorId: predator.id, predatorSpecies: predator.species });
    }
    for (const predator of predators) {
      if (predator.disabled || elapsed < (this.predatorCooldowns.get(predator.id) ?? 0)) continue;
      // A predator can hold only one prey item through the capture animation.
      if (simulated.some((fish) => fish.alive && fish.capturedBy === predator.id)) continue;
      const target = simulated
        .filter((fish) => fish.alive && !fish.capturedBy)
        .map((fish) => ({ fish, distance: Math.hypot(fish.x - predator.x, fish.y - predator.y) }))
        .filter(({ distance }) => distance <= (predator.species === 'orca' ? 1.25 : predator.species === 'sixgill-shark' ? 0.92 : 0.68) * predator.sizeScale)
        .sort((a, b) => a.distance - b.distance)[0]?.fish;
      if (!target) continue;
      target.capturedBy = predator.id;
      target.capturedPredatorSpecies = predator.species;
      target.captureProgress = 0;
      target.behavior = 'captured';
    }
    return events;
  }

  private retire(fish: DeepFish, cause: 'natural' | 'predation' | 'harvest'): void {
    if (!fish.alive) return;
    fish.alive = false;
    this.lifecycle.recordDeath(cause);
  }

  private event(kind: DeepShoalEvent['kind'], fish: DeepFish): DeepShoalEvent {
    return {
      kind, fishId: fish.id, fishSpecies: fish.species, x: fish.x, y: fish.y,
      generation: fish.life.generation, parentIds: fish.life.parentIds,
    };
  }

  private nearestPredator(fish: DeepFish, predators: ShoalPredatorField[], range: number): ShoalPredatorField | undefined {
    return predators
      .filter((predator) => !predator.disabled)
      .map((predator) => ({ predator, distance: Math.hypot(predator.x - fish.x, predator.y - fish.y) }))
      .filter(({ distance }) => distance <= range)
      .sort((a, b) => a.distance - b.distance)[0]?.predator;
  }

  private accelerateAway(fish: DeepFish, x: number, y: number, force: number, dt: number): void {
    const dx = fish.x - x;
    const dy = fish.y - y;
    const inverse = 1 / Math.max(0.15, Math.hypot(dx, dy));
    fish.vx += dx * inverse * force * dt;
    fish.vy += dy * inverse * force * dt;
  }

  private refreshInstances(playerX: number, playerY: number): void {
    this.visibleFishCount = 0;
    for (const species of SPECIES_ORDER) {
      const meshes = this.meshes.get(species)!;
      let count = 0;
      for (const fish of this.fish) {
        if (!fish.alive || fish.species !== species || Math.abs(fish.x - playerX) > 14 || Math.abs(fish.y - playerY) > 9.5) continue;
        const scale = this.lifecycle.currentScale(fish.life);
        const pulse = 0.9 + Math.sin(this.elapsed * 1.7 + fish.phase) * 0.08;
        this.dummy.position.set(fish.x, fish.y, 1.92 + (count % 4) * 0.008);
        this.dummy.rotation.set(0, 0, Math.atan2(fish.vy, Math.max(0.08, Math.abs(fish.vx))) * fish.direction * 0.32);
        this.dummy.scale.set(fish.direction * scale, scale, 1);
        this.dummy.updateMatrix();
        meshes.body.setMatrixAt(count, this.dummy.matrix);
        this.dummy.position.set(fish.x + fish.direction * SPECIES[species].sizeMeters * 0.2, fish.y - fish.radiusY * 0.3, 1.95);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(scale * pulse, scale * pulse, 1);
        this.dummy.updateMatrix();
        meshes.glow.setMatrixAt(count, this.dummy.matrix);
        count += 1;
      }
      meshes.body.count = count;
      meshes.glow.count = count;
      meshes.body.instanceMatrix.needsUpdate = true;
      meshes.glow.instanceMatrix.needsUpdate = true;
      this.visibleFishCount += count;
    }
  }

  private createMeshes(species: DeepFishSpecies, capacity: number): SpeciesMeshes {
    const config = SPECIES[species];
    const shape = new THREE.Shape();
    if (species === 'bristlemouth') {
      shape.moveTo(0.18, 0); shape.lineTo(0.06, 0.035); shape.lineTo(-0.16, 0.025); shape.lineTo(-0.24, 0.08);
      shape.lineTo(-0.21, 0); shape.lineTo(-0.24, -0.08); shape.lineTo(-0.16, -0.025); shape.lineTo(0.06, -0.035); shape.closePath();
    } else if (species === 'hatchetfish') {
      shape.moveTo(0.2, 0); shape.quadraticCurveTo(0.02, 0.17, -0.15, 0.13); shape.lineTo(-0.26, 0.18);
      shape.lineTo(-0.22, 0); shape.lineTo(-0.26, -0.18); shape.lineTo(-0.15, -0.13); shape.quadraticCurveTo(0.02, -0.17, 0.2, 0); shape.closePath();
    } else if (species === 'hadal-snailfish' || species === 'megacave-glassfish') {
      shape.moveTo(0.22, 0); shape.quadraticCurveTo(0.04, 0.13, -0.18, 0.1); shape.lineTo(-0.32, 0.04);
      shape.lineTo(-0.32, -0.04); shape.lineTo(-0.18, -0.1); shape.quadraticCurveTo(0.04, -0.13, 0.22, 0); shape.closePath();
    } else {
      shape.moveTo(0.22, 0); shape.quadraticCurveTo(0.04, 0.1, -0.14, 0.075); shape.lineTo(-0.26, 0.14);
      shape.lineTo(-0.22, 0); shape.lineTo(-0.26, -0.14); shape.lineTo(-0.14, -0.075); shape.quadraticCurveTo(0.04, -0.1, 0.22, 0); shape.closePath();
    }
    const body = new THREE.InstancedMesh(
      new THREE.ShapeGeometry(shape, 2),
      new THREE.MeshBasicMaterial({ color: config.color, side: THREE.DoubleSide, transparent: true, opacity: species === 'megacave-glassfish' ? 0.58 : 0.96 }),
      capacity,
    );
    const glow = new THREE.InstancedMesh(
      new THREE.CircleGeometry(species === 'bristlemouth' ? 0.03 : 0.042, 8),
      new THREE.MeshBasicMaterial({ color: config.glow, transparent: true, opacity: config.glowOpacity ?? 0.92, blending: THREE.AdditiveBlending, depthWrite: false }),
      capacity,
    );
    for (const mesh of [body, glow]) {
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
    }
    return { body, glow };
  }

  private emptyPopulation(): Record<DeepFishSpecies, number> {
    return { 'silver-sprat': 0, 'blue-mackerel': 0, lanternfish: 0, bristlemouth: 0, hatchetfish: 0, 'hadal-snailfish': 0, 'megacave-glassfish': 0 };
  }
}
