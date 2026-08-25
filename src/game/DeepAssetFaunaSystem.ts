import * as THREE from 'three';
import { AquaticTerrainCollisionSnapshot, AquaticTerrainCollisionSystem, SolidTerrainSampler } from './AquaticTerrainCollisionSystem';
import { CreatureAssetId, CreatureAssetLibrary } from './CreatureAssetLibrary';
import { CreatureCollisionSnapshot, CreatureCollisionSystem } from './CreatureCollisionSystem';
import { BiologicalSex, CreatureLifecycleSystem, LifeHistory, LifeState } from './CreatureLifecycleSystem';
import { DeepShoalPreyField, ShoalPredatorField } from './DeepSeaShoalSystem';
import { attachPredatorAlertVisual, updatePredatorAlertVisual } from './PredatorAlertVisual';
import type { JetBlastTargetResult } from './JetBlastSystem';
import { clamp } from './data';

export type ImportedDeepSpecies =
  | 'twilight-emperor'
  | 'abyss-manta'
  | 'midnight-angler'
  | 'abyss-spinefish'
  | 'hadal-stalker'
  | 'bloodfin-leviathan'
  | 'cyan-abyss-hunter';

export type ImportedDeepBehavior = 'cruising' | 'filter-feeding' | 'stalking' | 'hunting' | 'searching' | 'feeding' | 'blinded' | 'staggered' | 'courting';

interface ImportedSpeciesConfig {
  label: string;
  asset: CreatureAssetId;
  predator: boolean;
  baseLength: number;
  collisionLength: number;
  speed: number;
  detection: number;
  damage: number;
  color: string;
  glow?: string;
  habitats: [{ x: number; y: number }, { x: number; y: number }];
  history: LifeHistory;
}

const CONFIG: Record<ImportedDeepSpecies, ImportedSpeciesConfig> = {
  'twilight-emperor': {
    label: 'twilight emperor', asset: 'twilight-emperor', predator: false, baseLength: 0.92, collisionLength: 0.78,
    speed: 0.52, detection: 0, damage: 0, color: '#b9d5b0', glow: '#76dacc',
    habitats: [{ x: 34.2, y: -25.8 }, { x: 37.1, y: -34.1 }],
    history: { lifespanYears: [9, 16], maturityYears: [1.8, 3], adultScale: [0.78, 1.28], breedingIntervalYears: [1.2, 2.2], broodSize: [1, 1], maxPopulation: 3 },
  },
  'abyss-manta': {
    label: 'abyssal manta', asset: 'abyss-manta', predator: false, baseLength: 3.6, collisionLength: 2.8,
    speed: 0.48, detection: 0, damage: 0, color: '#a8c8c8', glow: '#65a8c4',
    habitats: [{ x: 41.8, y: -58.5 }, { x: 44.0, y: -65.1 }],
    history: { lifespanYears: [35, 55], maturityYears: [8, 13], adultScale: [0.82, 1.26], breedingIntervalYears: [3.5, 5.5], broodSize: [1, 1], maxPopulation: 3 },
  },
  'midnight-angler': {
    label: 'midnight angler', asset: 'midnight-angler', predator: true, baseLength: 1.55, collisionLength: 1.35,
    speed: 0.58, detection: 5.4, damage: 9, color: '#52666a', glow: '#d8fff0',
    habitats: [{ x: 39.1, y: -42.8 }, { x: 41.1, y: -52.6 }],
    history: { lifespanYears: [12, 24], maturityYears: [2.5, 4.5], adultScale: [0.74, 1.34], breedingIntervalYears: [1.8, 3.2], broodSize: [1, 2], maxPopulation: 4 },
  },
  'abyss-spinefish': {
    label: 'abyssal spinefish', asset: 'abyss-spinefish', predator: true, baseLength: 2.5, collisionLength: 2.1,
    speed: 0.62, detection: 6.2, damage: 12, color: '#173d56', glow: '#448cff',
    habitats: [{ x: 44.8, y: -72.3 }, { x: 46.5, y: -79.6 }],
    history: { lifespanYears: [18, 34], maturityYears: [3.5, 6], adultScale: [0.76, 1.36], breedingIntervalYears: [2.1, 3.8], broodSize: [1, 2], maxPopulation: 4 },
  },
  'cyan-abyss-hunter': {
    label: 'cyan abyss hunter', asset: 'cyan-abyss-hunter', predator: true, baseLength: 3.3, collisionLength: 2.8,
    speed: 0.76, detection: 7.2, damage: 15, color: '#2f7777', glow: '#48d9c9',
    habitats: [{ x: 46.8, y: -83.4 }, { x: 48.7, y: -88.1 }],
    history: { lifespanYears: [26, 44], maturityYears: [5, 8], adultScale: [0.78, 1.38], breedingIntervalYears: [2.8, 4.4], broodSize: [1, 1], maxPopulation: 3 },
  },
  'hadal-stalker': {
    label: 'hadal crown-stalker', asset: 'hadal-stalker', predator: true, baseLength: 1.9, collisionLength: 1.6,
    speed: 0.42, detection: 4.8, damage: 11, color: '#808060', glow: '#c9d589',
    habitats: [{ x: 49.5, y: -91.5 }, { x: 51.0, y: -96.4 }],
    history: { lifespanYears: [20, 38], maturityYears: [4, 7], adultScale: [0.72, 1.34], breedingIntervalYears: [2.2, 4], broodSize: [1, 2], maxPopulation: 4 },
  },
  'bloodfin-leviathan': {
    label: 'bloodfin leviathan', asset: 'bloodfin-leviathan', predator: true, baseLength: 7.4, collisionLength: 6.2,
    speed: 0.68, detection: 10.5, damage: 24, color: '#35141a', glow: '#ff3048',
    habitats: [{ x: 51.7, y: -99.8 }, { x: 54.0, y: -103.2 }],
    history: { lifespanYears: [70, 120], maturityYears: [18, 28], adultScale: [0.82, 1.3], breedingIntervalYears: [5, 8], broodSize: [1, 1], maxPopulation: 3 },
  },
};

const SPECIES = Object.keys(CONFIG) as ImportedDeepSpecies[];

interface ImportedDeepCreature {
  id: string;
  species: ImportedDeepSpecies;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  radiusX: number;
  radiusY: number;
  direction: number;
  phase: number;
  alive: boolean;
  behavior: ImportedDeepBehavior;
  targetId: string | null;
  attackCooldown: number;
  searchUntil: number;
  lastTargetX: number;
  lastTargetY: number;
  inkedUntil: number;
  staggeredUntil: number;
  feedingUntil: number;
  life: LifeState<ImportedDeepSpecies>;
  visual: THREE.Group;
}

export type ImportedDeepEvent =
  | { kind: 'predator-bite'; creatureId: string; species: ImportedDeepSpecies; x: number; y: number; damage: number; knockbackX: number; knockbackY: number }
  | { kind: 'birth' | 'natural-death'; creatureId: string; species: ImportedDeepSpecies; x: number; y: number; generation: number; parentIds: string[] };

export interface ImportedDeepSnapshot {
  nearby: Array<{
    id: string;
    species: ImportedDeepSpecies;
    label: string;
    behavior: ImportedDeepBehavior;
    x: number;
    y: number;
    distance: number;
    threat: boolean;
    alertWaves: boolean;
    targetId: string | null;
    ageYears: number;
    lifespanYears: number;
    generation: number;
    sizeMeters: number;
    assetReady: boolean;
    terrainClear: boolean;
  }>;
  activePopulation: Record<ImportedDeepSpecies, number>;
  visibleCreatures: number;
  simulatedCreatures: number;
  lifecycle: ReturnType<CreatureLifecycleSystem<ImportedDeepSpecies>['snapshot']>;
  bodyCollision: CreatureCollisionSnapshot;
  terrainCollision: AquaticTerrainCollisionSnapshot;
}

/** Sparse, high-detail deep fauna layered over the instanced shoal system. */
export class DeepAssetFaunaSystem {
  private creatures: ImportedDeepCreature[] = [];
  private lifecycle: CreatureLifecycleSystem<ImportedDeepSpecies>;
  private bodyCollision = new CreatureCollisionSystem();
  private terrainCollision = new AquaticTerrainCollisionSystem();
  private elapsed = 0;
  private nextBreedingCheck = 0;
  private birthSequence = 0;
  private visibleCreatures = 0;
  private simulatedCreatures = 0;

  constructor(
    private scene: THREE.Scene,
    private rng: () => number,
    private assets: CreatureAssetLibrary,
    private terrain: SolidTerrainSampler,
  ) {
    const histories = Object.fromEntries(SPECIES.map((species) => [species, CONFIG[species].history])) as Record<ImportedDeepSpecies, LifeHistory>;
    this.lifecycle = new CreatureLifecycleSystem(this.rng, histories);
    for (const species of SPECIES) {
      CONFIG[species].habitats.forEach((habitat, index) => {
        this.add(`${species}-${index + 1}`, species, habitat.x, habitat.y, { initialAdult: true, sex: index ? 'male' : 'female' });
      });
    }
  }

  update(
    dt: number,
    elapsed: number,
    player: { x: number; y: number; concealed: boolean },
    prey: DeepShoalPreyField[],
  ): ImportedDeepEvent[] {
    this.elapsed = elapsed;
    this.terrainCollision.beginStep();
    const events = this.updateLifecycle(dt, elapsed);
    const active: ImportedDeepCreature[] = [];
    const previous = new Map<string, { x: number; y: number }>();
    const simulationDt = Math.min(0.12, dt);
    this.visibleCreatures = 0;

    for (const creature of this.creatures) {
      if (!creature.alive) {
        creature.visual.visible = false;
        continue;
      }
      const dx = creature.x - player.x;
      const dy = creature.y - player.y;
      const visible = Math.abs(dx) <= 15.5 && Math.abs(dy) <= 9.5;
      creature.visual.visible = visible;
      if (visible) {
        this.visibleCreatures += 1;
        this.ensureAsset(creature);
      }
      if (Math.abs(dx) > 20 || Math.abs(dy) > 14) continue;
      active.push(creature);
      previous.set(creature.id, { x: creature.x, y: creature.y });
      creature.attackCooldown = Math.max(0, creature.attackCooldown - dt);
      const config = CONFIG[creature.species];
      const lifeScale = this.lifecycle.currentScale(creature.life);
      creature.radiusX = config.collisionLength * lifeScale * 0.5;
      creature.radiusY = config.collisionLength * lifeScale * (creature.species === 'abyss-manta' ? 0.22 : 0.27);
      const playerDistance = Math.hypot(player.x - creature.x, player.y - creature.y);
      const blinded = elapsed < creature.inkedUntil;
      const staggered = elapsed < creature.staggeredUntil;
      const feeding = elapsed < creature.feedingUntil;
      const nearestPrey = config.predator ? this.nearestPrey(creature, prey, config.detection * 1.35) : undefined;

      if (blinded) {
        creature.behavior = 'blinded';
        creature.targetId = null;
        creature.vx += Math.sin(elapsed * 1.7 + creature.phase) * simulationDt * 0.3;
        creature.vy += Math.cos(elapsed * 1.2 + creature.phase) * simulationDt * 0.22;
      } else if (staggered) {
        creature.behavior = 'staggered';
        creature.targetId = null;
        creature.vx *= Math.pow(0.2, simulationDt);
        creature.vy *= Math.pow(0.2, simulationDt);
      } else if (feeding) {
        creature.behavior = 'feeding';
        creature.targetId = null;
        creature.vx *= Math.pow(0.3, simulationDt);
        creature.vy *= Math.pow(0.3, simulationDt);
      } else if (config.predator && !player.concealed && playerDistance <= config.detection) {
        creature.behavior = 'stalking';
        creature.targetId = 'player';
        creature.lastTargetX = player.x;
        creature.lastTargetY = player.y;
        creature.searchUntil = elapsed + 5.2;
        this.accelerateToward(creature, player.x, player.y, config.speed * 1.85, simulationDt);
      } else if (config.predator && creature.targetId === 'player' && elapsed < creature.searchUntil) {
        creature.behavior = 'searching';
        this.accelerateToward(creature, creature.lastTargetX, creature.lastTargetY, config.speed, simulationDt);
      } else if (config.predator && nearestPrey) {
        creature.behavior = 'hunting';
        creature.targetId = nearestPrey.id;
        this.accelerateToward(creature, nearestPrey.x, nearestPrey.y, config.speed * 1.45, simulationDt);
      } else {
        creature.behavior = creature.species === 'abyss-manta' ? 'filter-feeding' : 'cruising';
        creature.targetId = null;
      }

      creature.vx += ((creature.homeX - creature.x) * 0.035 + Math.sin(elapsed * 0.29 + creature.phase) * 0.065) * simulationDt;
      creature.vy += ((creature.homeY - creature.y) * 0.052 + Math.cos(elapsed * 0.37 + creature.phase) * 0.045) * simulationDt;
      const avoidance = this.terrainCollision.avoidance(creature, this.terrain, Math.min(0.85, creature.radiusX * 0.55));
      creature.vx += avoidance.x * simulationDt * 5.5;
      creature.vy += avoidance.y * simulationDt * 5.5;
      const damping = Math.pow(creature.species === 'abyss-manta' ? 0.8 : 0.7, simulationDt);
      creature.vx *= damping;
      creature.vy *= damping;
      const pursuit = creature.behavior === 'stalking' || creature.behavior === 'hunting';
      const maxSpeed = config.speed * (pursuit ? 1.8 : creature.behavior === 'searching' ? 1.25 : 1);
      const speed = Math.hypot(creature.vx, creature.vy);
      if (speed > maxSpeed) {
        creature.vx = creature.vx / speed * maxSpeed;
        creature.vy = creature.vy / speed * maxSpeed;
      }
      creature.x = clamp(creature.x + creature.vx * simulationDt, creature.homeX - 7.5, creature.homeX + 7.5);
      creature.y = clamp(creature.y + creature.vy * simulationDt, creature.homeY - 5.5, creature.homeY + 5.5);
      if (Math.abs(creature.vx) > 0.025) creature.direction = Math.sign(creature.vx);
      const old = previous.get(creature.id)!;
      this.terrainCollision.resolveMotion(creature, old.x, old.y, this.terrain, 5.5);

      if (config.predator && creature.targetId === 'player' && !player.concealed && creature.attackCooldown <= 0) {
        const contact = Math.hypot(
          (player.x - creature.x) / Math.max(0.1, creature.radiusX + 0.5),
          (player.y - creature.y) / Math.max(0.1, creature.radiusY + 0.56),
        );
        if (contact <= 1.08) {
          const inverse = 1 / Math.max(0.2, playerDistance);
          creature.attackCooldown = creature.species === 'bloodfin-leviathan' ? 6.5 : 3.8;
          events.push({
            kind: 'predator-bite', creatureId: creature.id, species: creature.species,
            x: creature.x, y: creature.y, damage: Math.round(config.damage * (0.72 + lifeScale * 0.28)),
            knockbackX: (player.x - creature.x) * inverse * 2.6,
            knockbackY: (player.y - creature.y) * inverse * 1.5,
          });
        }
      }
    }

    this.simulatedCreatures = active.length;
    this.bodyCollision.resolve(active, (first, second) => first.id !== second.id, 2);
    for (const creature of active) {
      const old = previous.get(creature.id)!;
      this.terrainCollision.resolveMotion(creature, old.x, old.y, this.terrain, 5.5);
      if (creature.visual.visible) this.updateVisual(creature, elapsed);
    }
    return events;
  }

  predatorField(): ShoalPredatorField[] {
    return this.creatures
      .filter((creature) => creature.alive && CONFIG[creature.species].predator)
      .map((creature) => ({
        id: creature.id,
        species: creature.species,
        x: creature.x,
        y: creature.y,
        behavior: creature.behavior,
        disabled: this.elapsed < creature.inkedUntil || this.elapsed < creature.staggeredUntil || this.elapsed < creature.feedingUntil,
        sizeScale: this.lifecycle.currentScale(creature.life) * clamp(CONFIG[creature.species].baseLength / 3.2, 0.72, 2.35),
      }));
  }

  /** Lets the streamed shoal simulation drive a readable feeding reaction. */
  onShoalPredation(predatorId: string, elapsed: number): boolean {
    const creature = this.creatures.find((candidate) => candidate.id === predatorId && candidate.alive);
    if (!creature || !CONFIG[creature.species].predator) return false;
    creature.behavior = 'feeding';
    creature.targetId = null;
    creature.feedingUntil = Math.max(creature.feedingUntil, elapsed + 1.35);
    creature.attackCooldown = Math.max(creature.attackCooldown, 1.1);
    creature.vx *= 0.32;
    creature.vy *= 0.32;
    return true;
  }

  applyInk(x: number, y: number, radius: number, elapsed: number, duration: number): number {
    let affected = 0;
    for (const creature of this.creatures) {
      if (!creature.alive || !CONFIG[creature.species].predator || Math.hypot(creature.x - x, creature.y - y) > radius) continue;
      creature.inkedUntil = Math.max(creature.inkedUntil, elapsed + duration * (creature.species === 'bloodfin-leviathan' ? 0.75 : 0.5));
      creature.searchUntil = 0;
      creature.targetId = null;
      creature.behavior = 'blinded';
      affected += 1;
    }
    return affected;
  }

  applyJet(x: number, y: number, direction: THREE.Vector2, elapsed: number, strength = 1): number {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    let affected = 0;
    for (const creature of this.creatures) {
      if (!creature.alive) continue;
      const dx = creature.x - x;
      const dy = creature.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 4.2) continue;
      const falloff = 1 - distance / 4.2;
      const inverse = 1 / Math.max(0.2, distance);
      creature.vx += (normalized.x * 0.48 + dx * inverse * 1.45) * falloff * strength;
      creature.vy += (normalized.y * 0.4 + dy * inverse * 1.2) * falloff * strength;
      creature.staggeredUntil = Math.max(creature.staggeredUntil, elapsed + (creature.species === 'bloodfin-leviathan' ? 0.32 : 0.82) * strength);
      affected += 1;
    }
    return affected;
  }

  applyJetBlast(x: number, y: number, direction: THREE.Vector2, elapsed: number): JetBlastTargetResult {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    const result: JetBlastTargetResult = { affected: 0, killed: 0, hits: [] };
    for (const creature of this.creatures) {
      const config = CONFIG[creature.species];
      if (!creature.alive || !config.predator) continue;
      const offset = new THREE.Vector2(creature.x - x, creature.y - y);
      const distance = offset.length();
      if (distance > 6.6) continue;
      const alignment = distance < 0.25 ? 1 : normalized.dot(offset.clone().normalize());
      if (alignment < 0.18) continue;
      const sizeMeters = config.baseLength * this.lifecycle.currentScale(creature.life);
      const killDistance = clamp(3.25 - sizeMeters * 0.18, 0.86, 2.78);
      const killed = distance <= killDistance && alignment >= 0.54;
      const falloff = Math.max(0.1, 1 - distance / 6.6);
      creature.vx += (normalized.x * 8.4 + offset.x / Math.max(0.2, distance) * 3.2) * falloff;
      creature.vy += (normalized.y * 7.2 + offset.y / Math.max(0.2, distance) * 2.8) * falloff;
      creature.staggeredUntil = Math.max(creature.staggeredUntil, elapsed + (killed ? 0 : creature.species === 'bloodfin-leviathan' ? 1.5 : 3.8));
      creature.targetId = null;
      creature.searchUntil = 0;
      if (killed) {
        creature.alive = false;
        creature.visual.visible = false;
        this.lifecycle.recordDeath('harvest');
        result.killed += 1;
      }
      result.affected += 1;
      result.hits.push({ id: creature.id, species: creature.species, x: creature.x, y: creature.y, killed });
    }
    return result;
  }

  snapshot(playerX: number, playerY: number, range = 16): ImportedDeepSnapshot {
    const activePopulation = Object.fromEntries(SPECIES.map((species) => [species, 0])) as Record<ImportedDeepSpecies, number>;
    for (const creature of this.creatures) if (creature.alive) activePopulation[creature.species] += 1;
    return {
      nearby: this.creatures
        .filter((creature) => creature.alive)
        .map((creature) => ({ creature, distance: Math.hypot(creature.x - playerX, creature.y - playerY) }))
        .filter(({ distance }) => distance <= range)
        .sort((first, second) => first.distance - second.distance)
        .map(({ creature, distance }) => ({
          id: creature.id,
          species: creature.species,
          label: CONFIG[creature.species].label,
          behavior: creature.behavior,
          x: Number(creature.x.toFixed(2)),
          y: Number(creature.y.toFixed(2)),
          distance: Number(distance.toFixed(2)),
          threat: CONFIG[creature.species].predator,
          alertWaves: CONFIG[creature.species].predator && creature.targetId === 'player'
            && (creature.behavior === 'stalking' || creature.behavior === 'searching') && this.elapsed >= creature.inkedUntil,
          targetId: creature.targetId,
          ageYears: Number(creature.life.ageYears.toFixed(2)),
          lifespanYears: Number(creature.life.lifespanYears.toFixed(2)),
          generation: creature.life.generation,
          sizeMeters: Number((CONFIG[creature.species].baseLength * this.lifecycle.currentScale(creature.life)).toFixed(2)),
          assetReady: Boolean(creature.visual.userData.creatureAssetReady),
          terrainClear: this.terrainCollision.isClear(creature, this.terrain),
        })),
      activePopulation,
      visibleCreatures: this.visibleCreatures,
      simulatedCreatures: this.simulatedCreatures,
      lifecycle: this.lifecycle.snapshot(),
      bodyCollision: this.bodyCollision.snapshot(),
      terrainCollision: this.terrainCollision.snapshot(),
    };
  }

  private add(
    id: string,
    species: ImportedDeepSpecies,
    x: number,
    y: number,
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): ImportedDeepCreature {
    const retired = this.creatures.find((creature) => !creature.alive && creature.species === species);
    const visual = retired?.visual ?? this.createFallback(species);
    if (!retired) this.scene.add(visual);
    const life = this.lifecycle.create(species, lifeOptions);
    const scale = this.lifecycle.currentScale(life);
    const config = CONFIG[species];
    const creature: ImportedDeepCreature = retired ?? {
      id, species, x, y, homeX: x, homeY: y, vx: 0, vy: 0,
      radiusX: 0.4, radiusY: 0.2, direction: 1, phase: 0, alive: true,
      behavior: 'cruising', targetId: null, attackCooldown: 0, searchUntil: 0,
      lastTargetX: x, lastTargetY: y, inkedUntil: 0, staggeredUntil: 0, feedingUntil: 0, life, visual,
    };
    Object.assign(creature, {
      id, species, x, y, homeX: x, homeY: y,
      vx: (this.rng() > 0.5 ? 1 : -1) * (0.12 + this.rng() * 0.12), vy: (this.rng() - 0.5) * 0.08,
      radiusX: config.collisionLength * scale * 0.5,
      radiusY: config.collisionLength * scale * (species === 'abyss-manta' ? 0.22 : 0.27),
      direction: 1, phase: this.rng() * Math.PI * 2, alive: true,
      behavior: species === 'abyss-manta' ? 'filter-feeding' : 'cruising', targetId: null,
      attackCooldown: 0, searchUntil: 0, lastTargetX: x, lastTargetY: y,
      inkedUntil: 0, staggeredUntil: 0, feedingUntil: 0, life,
    });
    const clear = this.terrainCollision.nearestClear(creature, this.terrain, x, y, 7.5);
    if (clear) {
      creature.x = clear.x;
      creature.y = clear.y;
      creature.homeX = clear.x;
      creature.homeY = clear.y;
    }
    visual.position.set(creature.x, creature.y, 2.06);
    visual.visible = false;
    if (!retired) this.creatures.push(creature);
    return creature;
  }

  private createFallback(species: ImportedDeepSpecies): THREE.Group {
    const config = CONFIG[species];
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 14, 9),
      new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.72, emissive: config.glow ?? '#000000', emissiveIntensity: config.glow ? 0.12 : 0 }),
    );
    body.scale.set(config.baseLength / 0.68, species === 'abyss-manta' ? 0.24 : 0.62, 0.45);
    body.userData.assetFallback = true;
    const tailGeometry = new THREE.BufferGeometry();
    const tailHeight = species === 'abyss-manta' ? 0.3 : 0.24;
    tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, tailHeight, 0, -0.5, -tailHeight, 0], 3));
    tailGeometry.setIndex([0, 1, 2]);
    const tail = new THREE.Mesh(tailGeometry, new THREE.MeshBasicMaterial({ color: config.color, side: THREE.DoubleSide }));
    tail.position.x = -config.baseLength * 0.48;
    tail.userData.assetFallback = true;
    tail.userData.tail = true;
    group.add(body, tail);
    if (config.glow) {
      const lure = new THREE.Mesh(
        new THREE.SphereGeometry(species === 'bloodfin-leviathan' ? 0.08 : 0.055, 9, 7),
        new THREE.MeshBasicMaterial({ color: config.glow, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      lure.position.set(config.baseLength * 0.34, species === 'midnight-angler' ? 0.58 : 0.12, 0.32);
      lure.userData.persistentGlow = true;
      group.add(lure);
    }
    if (config.predator) attachPredatorAlertVisual(group, Math.max(0.82, config.baseLength * 0.58), 0.86);
    return group;
  }

  private ensureAsset(creature: ImportedDeepCreature): void {
    if (creature.visual.userData.assetRequested) return;
    creature.visual.userData.assetRequested = true;
    this.assets.attach(CONFIG[creature.species].asset, creature.visual);
  }

  private updateVisual(creature: ImportedDeepCreature, elapsed: number): void {
    const scale = this.lifecycle.currentScale(creature.life);
    const feedingPulse = creature.behavior === 'feeding' ? 1 + Math.sin(elapsed * 18) * 0.1 : 1;
    creature.visual.position.set(creature.x, creature.y, 2.06);
    creature.visual.scale.set(creature.direction * scale * feedingPulse, scale / feedingPulse, scale);
    creature.visual.rotation.z = Math.atan2(creature.vy, Math.max(0.12, Math.abs(creature.vx))) * creature.direction * 0.24;
    const alertMode = elapsed < creature.inkedUntil || creature.targetId !== 'player'
      ? 'none'
      : creature.behavior === 'searching' ? 'searching' : creature.behavior === 'stalking' ? 'spotted' : 'none';
    updatePredatorAlertVisual(creature.visual, elapsed, alertMode, creature.phase);
    creature.visual.traverse((node) => {
      if (node.userData.tail) node.rotation.y = Math.sin(elapsed * 4.2 + creature.phase) * 0.24;
      if (node.userData.persistentGlow) {
        const pulse = creature.species === 'midnight-angler' ? 0.88 + Math.sin(elapsed * 1.5 + creature.phase) * 0.12 : 1;
        node.scale.setScalar(pulse);
      }
    });
  }

  private nearestPrey(creature: ImportedDeepCreature, prey: DeepShoalPreyField[], range: number): DeepShoalPreyField | undefined {
    return prey
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - creature.x, candidate.y - creature.y) }))
      .filter(({ distance }) => distance <= range)
      .sort((first, second) => first.distance - second.distance)[0]?.candidate;
  }

  private accelerateToward(creature: ImportedDeepCreature, x: number, y: number, force: number, dt: number): void {
    const dx = x - creature.x;
    const dy = y - creature.y;
    const inverse = 1 / Math.max(0.2, Math.hypot(dx, dy));
    creature.vx += dx * inverse * force * dt;
    creature.vy += dy * inverse * force * dt;
  }

  private updateLifecycle(dt: number, elapsed: number): ImportedDeepEvent[] {
    const events: ImportedDeepEvent[] = [];
    for (const creature of this.creatures) {
      if (!creature.alive || !this.lifecycle.advance(creature.life, dt)) continue;
      creature.alive = false;
      creature.visual.visible = false;
      this.lifecycle.recordDeath('natural');
      events.push({
        kind: 'natural-death', creatureId: creature.id, species: creature.species, x: creature.x, y: creature.y,
        generation: creature.life.generation, parentIds: creature.life.parentIds,
      });
    }
    if (elapsed < this.nextBreedingCheck) return events;
    this.nextBreedingCheck = elapsed + 1.1;
    for (const species of SPECIES) {
      const living = this.creatures.filter((creature) => creature.alive && creature.species === species);
      if (living.length >= this.lifecycle.maxPopulation(species)) continue;
      const mother = living.find((creature) => creature.life.sex === 'female' && this.lifecycle.canBreed(creature.life));
      const father = mother && living.find((creature) => creature.id !== mother.id && this.lifecycle.compatible(mother.life, creature.life));
      if (!mother || !father) continue;
      this.lifecycle.markBred(mother.life);
      this.lifecycle.markBred(father.life);
      mother.behavior = 'courting';
      father.behavior = 'courting';
      const generation = Math.max(mother.life.generation, father.life.generation) + 1;
      const parentIds = [mother.id, father.id];
      const child = this.add(
        `${species}-born-${++this.birthSequence}`, species,
        (mother.x + father.x) * 0.5 + (this.rng() - 0.5) * 0.8,
        (mother.y + father.y) * 0.5 + (this.rng() - 0.5) * 0.55,
        { generation, parentIds },
      );
      this.lifecycle.recordBirth();
      events.push({ kind: 'birth', creatureId: child.id, species, x: child.x, y: child.y, generation, parentIds });
    }
    return events;
  }
}
