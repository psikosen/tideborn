import * as THREE from 'three';
import { clamp } from './data';
import { CreatureAssetLibrary } from './CreatureAssetLibrary';
import { BiologicalSex, CreatureLifecycleSystem, LifeHistory, LifeState } from './CreatureLifecycleSystem';
import { CreatureCollisionBody, CreatureCollisionSnapshot, CreatureCollisionSystem } from './CreatureCollisionSystem';
import { AquaticTerrainBody, AquaticTerrainCollisionSnapshot, AquaticTerrainCollisionSystem } from './AquaticTerrainCollisionSystem';
import { MatterWorld } from './MatterWorld';

export type FishBehavior = 'schooling' | 'fleeing' | 'snared' | 'retired';
type MarineSpecies = 'reef-fish' | 'anemone';

const MARINE_LIFE_HISTORIES: Record<MarineSpecies, LifeHistory> = {
  'reef-fish': { lifespanYears: [3, 9], maturityYears: [0.5, 1.4], adultScale: [0.68, 1.36], breedingIntervalYears: [0.45, 0.95], broodSize: [2, 5], maxPopulation: 96 },
  anemone: { lifespanYears: [45, 110], maturityYears: [2, 5], adultScale: [0.72, 1.38], breedingIntervalYears: [2.5, 5], broodSize: [1, 1], maxPopulation: 7, asexual: true },
};

interface FishRuntime {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  alive: boolean;
  behavior: FishBehavior;
  capturedBy: string | null;
  life: LifeState<MarineSpecies>;
  visual: THREE.Group;
  shoalInstance: number | null;
  locallyVisible: boolean;
}

interface AnemoneRuntime {
  id: string;
  x: number;
  y: number;
  reach: number;
  phase: number;
  cooldown: number;
  preyId: string | null;
  captureProgress: number;
  fedCount: number;
  alive: boolean;
  life: LifeState<MarineSpecies>;
  color: string;
  visual: THREE.Group;
  tentacles: THREE.Line[];
  mouth: THREE.Mesh;
}

export interface MarinePlayerState {
  x: number;
  y: number;
  facing: number;
  concealed: boolean;
}

export interface MarineLifeEvent {
  kind: 'anemone-catch' | 'fish-birth' | 'anemone-bud' | 'natural-death';
  predatorId?: string;
  fishId?: string;
  creatureId?: string;
  species?: MarineSpecies;
  generation?: number;
  parentIds?: string[];
  x: number;
  y: number;
}

export interface FishHuntResult {
  caught: boolean;
  reason: 'caught' | 'miss' | 'cooldown';
  fishId?: string;
  x?: number;
  y?: number;
  range: number;
  staminaCost: number;
  cooldownRemaining: number;
}

export interface ReefPreyField {
  id: string;
  x: number;
  y: number;
}

export interface MarineLifeSnapshot {
  fish: Array<{ id: string; x: number; y: number; distance: number; behavior: FishBehavior; ageYears: number; lifespanYears: number; lifeStage: 'juvenile' | 'adult' | 'elder'; sex: BiologicalSex; generation: number; parentIds: string[]; sizeScale: number; sizeMeters: number }>;
  anemones: Array<{ id: string; x: number; y: number; preyId: string | null; captureProgress: number; fedCount: number; ageYears: number; lifespanYears: number; lifeStage: 'juvenile' | 'adult' | 'elder'; generation: number; sizeScale: number }>;
  playerHuntCooldown: number;
  livingFish: number;
  visibleFish: number;
  simulatedFish: number;
  lifecycle: ReturnType<CreatureLifecycleSystem<MarineSpecies>['snapshot']>;
  collision: CreatureCollisionSnapshot;
  terrainCollision: AquaticTerrainCollisionSnapshot;
}

/**
 * Upgrade boundary for visible marine predator/prey behavior. It owns fish AI,
 * anemone prey capture, visuals, respawning representatives, and player hunt
 * queries while the region-level population remains in the game ecosystem.
 */
export class MarineLifeSystem {
  private readonly scene: THREE.Scene;
  private readonly rng: () => number;
  private readonly fish: FishRuntime[] = [];
  private readonly anemones: AnemoneRuntime[] = [];
  private readonly lifecycle: CreatureLifecycleSystem<MarineSpecies>;
  private readonly collision = new CreatureCollisionSystem();
  private readonly terrainCollision = new AquaticTerrainCollisionSystem();
  private readonly shoalMesh: THREE.InstancedMesh;
  private readonly shoalDummy = new THREE.Object3D();
  private huntCooldown = 0;
  private nextBreedingCheck = 0;
  private fishBirthSequence = 0;
  private anemoneBirthSequence = 0;
  private detailedFishVisuals = 0;
  private shoalInstances = 0;
  private visibleFishCount = 0;
  private simulatedFishCount = 0;
  private shoalMatrixDirty = false;

  constructor(scene: THREE.Scene, rng: () => number, private assets: CreatureAssetLibrary, private world: MatterWorld) {
    this.scene = scene;
    this.rng = rng;
    this.lifecycle = new CreatureLifecycleSystem(this.rng, MARINE_LIFE_HISTORIES);
    this.shoalMesh = this.createShoalMesh();
    this.scene.add(this.shoalMesh);
    this.buildFish();
    this.buildAnemones();
  }

  update(dt: number, elapsed: number, storm: number, player: MarinePlayerState): MarineLifeEvent[] {
    this.shoalMatrixDirty = false;
    const events: MarineLifeEvent[] = this.updateLifecycle(dt, elapsed);
    this.huntCooldown = Math.max(0, this.huntCooldown - dt);
    this.terrainCollision.beginStep();

    for (const anemone of this.anemones) {
      if (!anemone.alive) {
        anemone.visual.visible = false;
        continue;
      }
      anemone.cooldown = Math.max(0, anemone.cooldown - dt);
      if (!anemone.preyId && anemone.cooldown <= 0 && this.livingFishCount() > 5) {
        const prey = this.closestAvailableFish(anemone.x, anemone.y, anemone.reach);
        if (prey) {
          anemone.preyId = prey.id;
          anemone.captureProgress = 0;
          prey.capturedBy = anemone.id;
          prey.behavior = 'snared';
        } else {
          anemone.cooldown = 0.7;
        }
      }

      if (anemone.preyId) {
        const prey = this.fish.find((candidate) => candidate.id === anemone.preyId && candidate.alive);
        if (!prey) {
          anemone.preyId = null;
          anemone.captureProgress = 0;
        } else {
          const previousX = prey.x;
          const previousY = prey.y;
          anemone.captureProgress = clamp(anemone.captureProgress + dt / 2.15, 0, 1);
          const pull = clamp(dt * (0.9 + anemone.captureProgress * 2.2), 0, 1);
          prey.x += (anemone.x - prey.x) * pull;
          prey.y += (anemone.y + 0.22 - prey.y) * pull;
          const terrainBody = this.fishTerrainBody(prey);
          this.terrainCollision.resolveMotion(terrainBody, previousX, previousY, this.world);
          this.applyTerrainBody(prey, terrainBody);
          if (anemone.captureProgress >= 1) {
            this.retireFish(prey, 'predation');
            anemone.preyId = null;
            anemone.captureProgress = 0;
            anemone.fedCount += 1;
            anemone.cooldown = 6 + this.rng() * 5;
            events.push({ kind: 'anemone-catch', predatorId: anemone.id, fishId: prey.id, x: anemone.x, y: anemone.y + 0.3 });
          }
        }
      }
    }

    this.simulatedFishCount = 0;
    for (const fish of this.fish) {
      if (!fish.alive) {
        fish.visual.visible = false;
        continue;
      }

      if (!fish.capturedBy) {
        if (!this.isLocallySimulated(fish, player)) {
          fish.behavior = 'schooling';
          continue;
        }
        this.simulatedFishCount += 1;
        const previousX = fish.x;
        const previousY = fish.y;
        const fromPlayerX = fish.x - player.x;
        const fromPlayerY = fish.y - player.y;
        const playerDistance = Math.hypot(fromPlayerX, fromPlayerY);
        const fleeing = !player.concealed && playerDistance < 1.65;
        fish.behavior = fleeing ? 'fleeing' : 'schooling';
        if (fleeing) {
          const inverse = 1 / Math.max(0.15, playerDistance);
          fish.vx += fromPlayerX * inverse * dt * 3.7;
          fish.vy += fromPlayerY * inverse * dt * 2.5;
        } else {
          fish.vx += Math.sin(elapsed * 0.47 + fish.phase) * dt * 0.16;
          fish.vy += Math.cos(elapsed * 0.72 + fish.phase) * dt * 0.11;
        }
        const avoidance = this.terrainCollision.avoidance(this.fishTerrainBody(fish), this.world);
        fish.vx += avoidance.x * clamp(dt * 5.5, 0, 1);
        fish.vy += avoidance.y * clamp(dt * 5.5, 0, 1);
        fish.vx *= Math.pow(0.76, dt);
        fish.vy *= Math.pow(0.6, dt);
        const maxSpeed = fleeing ? 1.45 : 0.62;
        const speed = Math.hypot(fish.vx, fish.vy);
        if (speed > maxSpeed) {
          fish.vx = fish.vx / speed * maxSpeed;
          fish.vy = fish.vy / speed * maxSpeed;
        }
        fish.x += fish.vx * dt * (1 + storm * 1.35);
        fish.y += (fish.vy + Math.sin(elapsed * 1.3 + fish.phase) * 0.08) * dt;
        if (fish.x < -9.2 || fish.x > 13.2) fish.vx = Math.abs(fish.vx || 0.35) * (fish.x < -9.2 ? 1 : -1);
        if (fish.y < -4.4 || fish.y > 3.25) fish.vy = Math.abs(fish.vy || 0.18) * (fish.y < -4.4 ? 1 : -1);
        fish.x = clamp(fish.x, -9.25, 13.25);
        fish.y = clamp(fish.y, -4.45, 3.28);
        const terrainBody = this.fishTerrainBody(fish);
        this.terrainCollision.resolveMotion(terrainBody, previousX, previousY, this.world);
        this.applyTerrainBody(fish, terrainBody);
      }
    }

    this.resolveCollisions(player);
    this.visibleFishCount = 0;
    for (const fish of this.fish) {
      if (!fish.alive) continue;
      const locallyVisible = Math.abs(fish.x - player.x) <= 14 && Math.abs(fish.y - player.y) <= 9;
      if (locallyVisible) this.visibleFishCount += 1;
      this.updateFishVisual(fish, elapsed, locallyVisible);
    }
    if (this.shoalMatrixDirty) this.shoalMesh.instanceMatrix.needsUpdate = true;
    for (const anemone of this.anemones) {
      const locallyVisible = Math.abs(anemone.x - player.x) <= 17 && Math.abs(anemone.y - player.y) <= 11;
      this.updateAnemoneVisual(anemone, elapsed, storm, locallyVisible);
    }
    return events;
  }

  hunt(player: MarinePlayerState, hasNet: boolean): FishHuntResult {
    const range = hasNet ? 2.7 : 1.72;
    const staminaCost = hasNet ? 8 : 12;
    if (this.huntCooldown > 0) {
      return { caught: false, reason: 'cooldown', range, staminaCost: 0, cooldownRemaining: this.huntCooldown };
    }
    this.huntCooldown = hasNet ? 0.48 : 0.72;
    const target = this.fish
      .filter((fish) => fish.alive && !fish.capturedBy)
      .map((fish) => ({ fish, distance: Math.hypot(fish.x - player.x, fish.y - player.y), forward: (fish.x - player.x) * player.facing }))
      .filter((candidate) => candidate.distance <= range && candidate.forward > -0.55)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!target) return { caught: false, reason: 'miss', range, staminaCost: 5, cooldownRemaining: this.huntCooldown };
    const { fish } = target;
    const x = fish.x;
    const y = fish.y;
    this.retireFish(fish, 'harvest');
    return { caught: true, reason: 'caught', fishId: fish.id, x, y, range, staminaCost, cooldownRemaining: this.huntCooldown };
  }

  applyJet(x: number, y: number, direction: THREE.Vector2, strength = 1): number {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    const radius = 4.1 * Math.max(0.5, strength);
    let affected = 0;
    for (const fish of this.fish) {
      if (!fish.alive || fish.capturedBy) continue;
      const dx = fish.x - x;
      const dy = fish.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const falloff = (1 - distance / radius) * strength;
      const inverse = 1 / Math.max(0.18, distance);
      fish.vx += (dx * inverse * 2.15 + normalized.x * 0.55) * falloff;
      fish.vy += (dy * inverse * 1.65 + normalized.y * 0.45) * falloff;
      fish.behavior = 'fleeing';
      affected += 1;
    }
    return affected;
  }

  preyField(): ReefPreyField[] {
    return this.fish
      .filter((fish) => fish.alive && !fish.capturedBy)
      .map((fish) => ({ id: fish.id, x: fish.x, y: fish.y }));
  }

  consumeByPredator(id: string): { id: string; x: number; y: number } | null {
    const fish = this.fish.find((candidate) => candidate.id === id && candidate.alive && !candidate.capturedBy);
    if (!fish) return null;
    const result = { id: fish.id, x: fish.x, y: fish.y };
    this.retireFish(fish, 'predation');
    return result;
  }

  snapshot(playerX: number, playerY: number, range = 8): MarineLifeSnapshot {
    return {
      fish: this.fish
        .filter((fish) => fish.alive && Math.hypot(fish.x - playerX, fish.y - playerY) <= range)
        .map((fish) => ({
          id: fish.id,
          x: Number(fish.x.toFixed(2)),
          y: Number(fish.y.toFixed(2)),
          distance: Number(Math.hypot(fish.x - playerX, fish.y - playerY).toFixed(2)),
          behavior: fish.behavior,
          ageYears: Number(fish.life.ageYears.toFixed(2)),
          lifespanYears: Number(fish.life.lifespanYears.toFixed(2)),
          lifeStage: this.lifecycle.stage(fish.life),
          sex: fish.life.sex,
          generation: fish.life.generation,
          parentIds: fish.life.parentIds,
          sizeScale: Number(this.lifecycle.currentScale(fish.life).toFixed(2)),
          sizeMeters: Number((0.66 * this.lifecycle.currentScale(fish.life)).toFixed(2)),
        })),
      anemones: this.anemones.filter((anemone) => anemone.alive).map((anemone) => ({
        id: anemone.id,
        x: anemone.x,
        y: anemone.y,
        preyId: anemone.preyId,
        captureProgress: Number(anemone.captureProgress.toFixed(2)),
        fedCount: anemone.fedCount,
        ageYears: Number(anemone.life.ageYears.toFixed(2)),
        lifespanYears: Number(anemone.life.lifespanYears.toFixed(2)),
        lifeStage: this.lifecycle.stage(anemone.life),
        generation: anemone.life.generation,
        sizeScale: Number(this.lifecycle.currentScale(anemone.life).toFixed(2)),
      })),
      playerHuntCooldown: Number(this.huntCooldown.toFixed(2)),
      livingFish: this.livingFishCount(),
      visibleFish: this.visibleFishCount,
      simulatedFish: this.simulatedFishCount,
      lifecycle: this.lifecycle.snapshot(),
      collision: this.collision.snapshot(),
      terrainCollision: this.terrainCollision.snapshot(),
    };
  }

  private buildFish(): void {
    const schoolCenters = [
      [-7.1, 2.5], [-5.2, 1.85], [-3.0, 1.45], [-1.1, 0.55],
      [1.8, -0.15], [3.45, -0.55], [4.8, -1.35], [6.8, -2.0],
      [8.2, -2.7], [9.4, -3.15], [10.5, -3.5], [11.8, -3.9],
    ] as const;
    const schoolOffsets = [
      [0, 0], [-0.43, 0.26], [0.44, -0.22], [-0.7, -0.12], [0.69, 0.19], [0.05, 0.48],
    ] as const;
    const colors = ['#d8b66c', '#77bfae', '#e39a62', '#78a9bd', '#e7d784', '#85c8d5'];
    let fishIndex = 0;
    // Offset-first ordering distributes the limited detailed GLB slots across
    // the entire reef instead of concentrating them at the western edge.
    for (const [offsetX, offsetY] of schoolOffsets) {
      for (const [centerX, centerY] of schoolCenters) {
        const index = fishIndex++;
        this.spawnFish(`fish-${index}`, centerX + offsetX, centerY + offsetY, colors[index % colors.length], index % 4 === 0 ? 'clownfish' : 'reef-fish', {
          initialAdult: true,
          sex: index % 2 === 0 ? 'female' : 'male',
        });
      }
    }
  }

  private spawnFish(
    id: string,
    x: number,
    y: number,
    color: string,
    asset: 'clownfish' | 'reef-fish',
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): FishRuntime {
    const retired = !lifeOptions.initialAdult ? this.fish.find((fish) => !fish.alive) : undefined;
    if (retired) {
      retired.id = id;
      retired.x = x;
      retired.y = y;
      retired.vx = this.rng() > 0.5 ? 0.34 + this.rng() * 0.18 : -0.36 - this.rng() * 0.16;
      retired.vy = (this.rng() - 0.5) * 0.16;
      retired.phase = this.rng() * Math.PI * 2;
      retired.alive = true;
      retired.behavior = 'schooling';
      retired.capturedBy = null;
      retired.life = this.lifecycle.create('reef-fish', lifeOptions);
      retired.visual.position.set(x, y, 1.84);
      retired.visual.visible = true;
      if (retired.shoalInstance !== null) {
        this.shoalMesh.setColorAt(retired.shoalInstance, new THREE.Color(color));
        if (this.shoalMesh.instanceColor) this.shoalMesh.instanceColor.needsUpdate = true;
      }
      return retired;
    }
    const detailed = this.detailedFishVisuals < 18;
    const visual = detailed ? this.createFishVisual(color) : new THREE.Group();
    visual.position.set(x, y, 1.84);
    if (detailed) this.scene.add(visual);
    // A dense ecosystem remains responsive by reserving imported, potentially
    // animated models for representative hero fish. Every other individual
    // keeps the lightweight fallback mesh and still has full AI/lifecycle.
    if (detailed) {
      this.assets.attach(asset, visual);
      this.detailedFishVisuals += 1;
    }
    const shoalInstance = detailed ? null : this.shoalInstances++;
    if (shoalInstance !== null) {
      this.shoalMesh.count = this.shoalInstances;
      this.shoalMesh.setColorAt(shoalInstance, new THREE.Color(color));
      if (this.shoalMesh.instanceColor) this.shoalMesh.instanceColor.needsUpdate = true;
    }
    const fish: FishRuntime = {
      id,
      x,
      y,
      vx: this.rng() > 0.5 ? 0.34 + this.rng() * 0.18 : -0.36 - this.rng() * 0.16,
      vy: (this.rng() - 0.5) * 0.16,
      phase: this.rng() * Math.PI * 2,
      alive: true,
      behavior: 'schooling',
      capturedBy: null,
      life: this.lifecycle.create('reef-fish', lifeOptions),
      visual,
      shoalInstance,
      locallyVisible: false,
    };
    this.fish.push(fish);
    return fish;
  }

  private createFishVisual(color: string): THREE.Group {
    const visual = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 14, 9),
      new THREE.MeshStandardMaterial({ color, roughness: 0.62, emissive: new THREE.Color(color).multiplyScalar(0.08) }),
    );
    body.scale.set(1.55, 0.68, 0.36);
    const tailGeometry = new THREE.BufferGeometry();
    tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.25, 0.18, 0, -0.25, -0.18, 0], 3));
    tailGeometry.setIndex([0, 1, 2]);
    const tail = new THREE.Mesh(tailGeometry, new THREE.MeshBasicMaterial({ color: '#568e82', side: THREE.DoubleSide }));
    tail.position.x = -0.24;
    tail.userData.tail = true;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#10191b' }));
    eye.position.set(0.18, 0.055, 0.16);
    body.userData.assetFallback = true;
    tail.userData.assetFallback = true;
    eye.userData.assetFallback = true;
    visual.add(body, tail, eye);
    return visual;
  }

  private createShoalMesh(): THREE.InstancedMesh {
    const shape = new THREE.Shape();
    shape.moveTo(0.31, 0);
    shape.quadraticCurveTo(0.13, 0.14, -0.19, 0.1);
    shape.lineTo(-0.35, 0.22);
    shape.lineTo(-0.31, 0);
    shape.lineTo(-0.35, -0.22);
    shape.lineTo(-0.19, -0.1);
    shape.quadraticCurveTo(0.13, -0.14, 0.31, 0);
    const geometry = new THREE.ShapeGeometry(shape, 2);
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, 96);
    mesh.count = 0;
    mesh.position.z = 1.84;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    return mesh;
  }

  private buildAnemones(): void {
    const placements = [
      { id: 'anemone-reef-a', x: -3.25, y: 0.78, reach: 1.35, phase: 0.3, cooldown: 0.7, color: '#eb718b' },
      { id: 'anemone-reef-b', x: 3.05, y: -0.68, reach: 1.5, phase: 2.1, cooldown: 2.4, color: '#d88be5' },
      { id: 'anemone-reef-c', x: 8.35, y: -2.85, reach: 1.65, phase: 4.4, cooldown: 4.1, color: '#f1a16f' },
    ];
    for (const placement of placements) {
      this.spawnAnemone(placement, { initialAdult: true, sex: 'colony' });
    }
  }

  private spawnAnemone(
    placement: { id: string; x: number; y: number; reach: number; phase: number; cooldown: number; color: string },
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): AnemoneRuntime {
    const retired = !lifeOptions.initialAdult ? this.anemones.find((anemone) => !anemone.alive) : undefined;
    if (retired) {
      retired.id = placement.id;
      retired.x = placement.x;
      retired.y = placement.y;
      retired.reach = placement.reach;
      retired.phase = placement.phase;
      retired.cooldown = placement.cooldown;
      retired.color = placement.color;
      retired.preyId = null;
      retired.captureProgress = 0;
      retired.fedCount = 0;
      retired.alive = true;
      retired.life = this.lifecycle.create('anemone', lifeOptions);
      retired.visual.position.set(placement.x, placement.y, 1.92);
      retired.visual.visible = true;
      return retired;
    }
    const visual = new THREE.Group();
    visual.position.set(placement.x, placement.y, 1.92);
    const base = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 10),
      new THREE.MeshStandardMaterial({ color: '#6f496c', roughness: 0.76, emissive: '#24142b', emissiveIntensity: 0.55 }),
    );
    base.scale.set(1.25, 0.42, 0.7);
    const mouth = new THREE.Mesh(
      new THREE.RingGeometry(0.035, 0.095, 18),
      new THREE.MeshBasicMaterial({ color: '#ffb8a8', transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mouth.position.set(0, 0.2, 0.2);
    visual.add(base, mouth);
    const tentacles: THREE.Line[] = [];
    for (let i = 0; i < 15; i += 1) {
      const positions = new Float32Array(6 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: i % 3 === 0 ? '#ffd2a9' : placement.color,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const tentacle = new THREE.Line(geometry, material);
      tentacle.userData.index = i;
      tentacle.renderOrder = 11;
      tentacles.push(tentacle);
      visual.add(tentacle);
    }
    this.scene.add(visual);
    const anemone: AnemoneRuntime = {
      ...placement,
      preyId: null,
      captureProgress: 0,
      fedCount: 0,
      alive: true,
      life: this.lifecycle.create('anemone', lifeOptions),
      visual,
      tentacles,
      mouth,
    };
    this.anemones.push(anemone);
    return anemone;
  }

  private updateFishVisual(fish: FishRuntime, elapsed: number, locallyVisible: boolean): void {
    if (!locallyVisible) {
      fish.visual.visible = false;
      if (fish.shoalInstance !== null && fish.locallyVisible) this.hideShoalInstance(fish.shoalInstance);
      fish.locallyVisible = false;
      return;
    }
    fish.locallyVisible = true;
    const pulse = this.lifecycle.currentScale(fish.life) * (1 + Math.sin(elapsed * 4.2 + fish.phase) * 0.035);
    if (fish.shoalInstance !== null) {
      this.shoalDummy.position.set(fish.x, fish.y, 0);
      this.shoalDummy.rotation.set(0, 0, clamp(fish.vy * 0.22, -0.24, 0.24));
      this.shoalDummy.scale.set(fish.vx >= 0 ? pulse : -pulse, pulse, pulse);
      this.shoalDummy.updateMatrix();
      this.shoalMesh.setMatrixAt(fish.shoalInstance, this.shoalDummy.matrix);
      this.shoalMatrixDirty = true;
      return;
    }
    fish.visual.visible = true;
    fish.visual.position.set(fish.x, fish.y, 1.84);
    fish.visual.scale.set(fish.vx >= 0 ? pulse : -pulse, pulse, pulse);
    const tail = fish.visual.children.find((child) => child.userData.tail);
    if (tail) tail.rotation.z = Math.sin(elapsed * (fish.behavior === 'fleeing' ? 18 : 9) + fish.phase) * 0.34;
  }

  private updateAnemoneVisual(anemone: AnemoneRuntime, elapsed: number, storm: number, locallyVisible: boolean): void {
    anemone.visual.visible = anemone.alive && locallyVisible;
    if (!anemone.visual.visible) return;
    const lifeScale = this.lifecycle.currentScale(anemone.life);
    anemone.visual.scale.setScalar(lifeScale);
    const prey = anemone.preyId ? this.fish.find((fish) => fish.id === anemone.preyId && fish.alive) : undefined;
    for (const tentacle of anemone.tentacles) {
      const index = tentacle.userData.index as number;
      const attr = tentacle.geometry.getAttribute('position') as THREE.BufferAttribute;
      const angle = Math.PI * (0.08 + (index / (anemone.tentacles.length - 1)) * 0.84);
      const naturalLength = 0.48 + (index % 5) * 0.075;
      for (let p = 0; p < attr.count; p += 1) {
        const t = p / (attr.count - 1);
        let x = Math.cos(angle) * naturalLength * t + Math.sin(elapsed * 2.0 + anemone.phase + index * 0.8 + t * 3.2) * t * (0.045 + storm * 0.08);
        let y = 0.13 + Math.sin(angle) * naturalLength * t + Math.cos(elapsed * 1.6 + index + t * 4.1) * t * 0.035;
        if (prey && index === 7) {
          const targetX = prey.x - anemone.x;
          const targetY = prey.y - anemone.y;
          const lock = smoothstep01(anemone.captureProgress * 2.4);
          x += (targetX * t - x) * lock;
          y += (targetY * t - y) * lock;
        }
        attr.setXYZ(p, x, y, 0.1 + index * 0.002);
      }
      attr.needsUpdate = true;
      const material = tentacle.material as THREE.LineBasicMaterial;
      material.opacity = prey && index === 7 ? 0.98 : 0.54 + Math.sin(elapsed * 2.3 + index) * 0.16;
    }
    const feedPulse = prey ? 1 + Math.sin(elapsed * 12) * 0.22 : 1 + Math.sin(elapsed * 2.4 + anemone.phase) * 0.08;
    anemone.mouth.scale.setScalar(feedPulse);
  }

  private fishCollisionBody(fish: FishRuntime): CreatureCollisionBody {
    const scale = this.lifecycle.currentScale(fish.life);
    return {
      id: fish.id,
      x: fish.x,
      y: fish.y,
      vx: fish.vx,
      vy: fish.vy,
      radiusX: 0.35 * scale,
      radiusY: 0.17 * scale,
      mass: 0.7 * scale * scale,
      layer: 'reef-water',
    };
  }

  private fishTerrainBody(fish: FishRuntime): AquaticTerrainBody {
    const body = this.fishCollisionBody(fish);
    // A small terrain skin keeps imported fins from visually touching the
    // granular contour even though their gameplay body is slightly slimmer.
    body.radiusX += 0.025;
    body.radiusY += 0.035;
    return { ...body, vx: body.vx ?? fish.vx, vy: body.vy ?? fish.vy };
  }

  private applyTerrainBody(fish: FishRuntime, body: AquaticTerrainBody): void {
    fish.x = body.x;
    fish.y = body.y;
    fish.vx = body.vx;
    fish.vy = body.vy;
  }

  private resolveCollisions(player: MarinePlayerState): void {
    // A snared fish is deliberately allowed into the capturing tentacles; all
    // freely swimming fish retain physical clearance from fauna and octopus.
    const freeFish = this.fish.filter((fish) => fish.alive && !fish.capturedBy && this.isLocallySimulated(fish, player));
    const fishBodies = freeFish.map((fish) => this.fishCollisionBody(fish));
    const preSeparation = fishBodies.map((body) => ({ x: body.x, y: body.y }));
    const anemoneBodies: CreatureCollisionBody[] = this.anemones
      .filter((anemone) => anemone.alive)
      .map((anemone) => {
        const scale = this.lifecycle.currentScale(anemone.life);
        return { id: anemone.id, x: anemone.x, y: anemone.y + 0.08 * scale, radiusX: 0.34 * scale, radiusY: 0.24 * scale, mass: 1000, immovable: true, layer: 'reef-water' };
      });
    const playerBody: CreatureCollisionBody = { id: 'player', x: player.x, y: player.y, radiusX: 0.5, radiusY: 0.56, mass: 1000, immovable: true, layer: 'reef-water' };
    const bodies = [...fishBodies, ...anemoneBodies, playerBody];
    this.collision.resolve(bodies, () => true, 3);
    for (let index = 0; index < freeFish.length; index += 1) {
      const fish = freeFish[index];
      const body = bodies[index];
      fish.x = clamp(body.x, -9.25, 13.25);
      fish.y = clamp(body.y, -4.45, 3.28);
      fish.vx = body.vx ?? fish.vx;
      fish.vy = body.vy ?? fish.vy;
      const terrainBody = this.fishTerrainBody(fish);
      this.terrainCollision.resolveMotion(terrainBody, preSeparation[index].x, preSeparation[index].y, this.world);
      this.applyTerrainBody(fish, terrainBody);
    }
  }

  private updateLifecycle(dt: number, elapsed: number): MarineLifeEvent[] {
    const events: MarineLifeEvent[] = [];
    for (const fish of this.fish) {
      if (!fish.alive || !this.lifecycle.advance(fish.life, dt)) continue;
      this.retireFish(fish, 'natural');
      events.push({ kind: 'natural-death', creatureId: fish.id, species: 'reef-fish', x: fish.x, y: fish.y, generation: fish.life.generation, parentIds: fish.life.parentIds });
    }
    for (const anemone of this.anemones) {
      if (!anemone.alive || !this.lifecycle.advance(anemone.life, dt)) continue;
      anemone.alive = false;
      anemone.visual.visible = false;
      if (anemone.preyId) {
        const prey = this.fish.find((fish) => fish.id === anemone.preyId);
        if (prey) {
          prey.capturedBy = null;
          prey.behavior = 'schooling';
        }
      }
      anemone.preyId = null;
      this.lifecycle.recordDeath('natural');
      events.push({ kind: 'natural-death', creatureId: anemone.id, species: 'anemone', x: anemone.x, y: anemone.y, generation: anemone.life.generation, parentIds: anemone.life.parentIds });
    }

    if (elapsed < this.nextBreedingCheck) return events;
    this.nextBreedingCheck = elapsed + 0.75;

    const livingFish = this.fish.filter((fish) => fish.alive);
    if (livingFish.length < this.lifecycle.maxPopulation('reef-fish')) {
      const mother = livingFish.find((fish) => fish.life.sex === 'female' && !fish.capturedBy && this.lifecycle.canBreed(fish.life));
      const father = mother && livingFish.find((fish) => fish.id !== mother.id && !fish.capturedBy && this.lifecycle.compatible(mother.life, fish.life));
      if (mother && father) {
        const brood = Math.min(this.lifecycle.broodSize('reef-fish'), this.lifecycle.maxPopulation('reef-fish') - livingFish.length);
        this.lifecycle.markBred(mother.life);
        this.lifecycle.markBred(father.life);
        const parentIds = [mother.id, father.id];
        const generation = Math.max(mother.life.generation, father.life.generation) + 1;
        for (let index = 0; index < brood; index += 1) {
          const child = this.spawnFish(
            `fish-born-${++this.fishBirthSequence}`,
            clamp((mother.x + father.x) * 0.5 + (this.rng() - 0.5) * 0.7, -9.1, 13.1),
            clamp((mother.y + father.y) * 0.5 + (this.rng() - 0.5) * 0.45, -4.3, 3.1),
            index % 2 ? '#79bdb2' : '#d9a56c',
            this.fishBirthSequence % 3 === 0 ? 'clownfish' : 'reef-fish',
            { generation, parentIds },
          );
          this.lifecycle.recordBirth();
          events.push({ kind: 'fish-birth', fishId: child.id, creatureId: child.id, species: 'reef-fish', x: child.x, y: child.y, generation, parentIds });
        }
      }
    }

    const livingAnemones = this.anemones.filter((anemone) => anemone.alive);
    const parent = livingAnemones.find((anemone) => anemone.fedCount > 0 && this.lifecycle.canBreed(anemone.life));
    if (parent && livingAnemones.length < this.lifecycle.maxPopulation('anemone')) {
      this.lifecycle.markBred(parent.life);
      parent.fedCount -= 1;
      const parentIds = [parent.id];
      const generation = parent.life.generation + 1;
      const child = this.spawnAnemone({
        id: `anemone-born-${++this.anemoneBirthSequence}`,
        // Sessile adults cannot solve overlap by swimming apart, so new buds
        // begin beyond the combined adult footprint.
        x: clamp(parent.x + (this.rng() > 0.5 ? 1 : -1) * (0.85 + this.rng() * 0.55), -8.8, 12.8),
        y: parent.y + (this.rng() - 0.5) * 0.16,
        reach: 1.05 + this.rng() * 0.45,
        phase: this.rng() * Math.PI * 2,
        cooldown: 3 + this.rng() * 2,
        color: parent.color,
      }, { generation, parentIds, sex: 'colony' });
      this.lifecycle.recordBirth();
      events.push({ kind: 'anemone-bud', creatureId: child.id, species: 'anemone', x: child.x, y: child.y, generation, parentIds });
    }
    return events;
  }

  private closestAvailableFish(x: number, y: number, range: number): FishRuntime | undefined {
    return this.fish
      .filter((fish) => fish.alive && !fish.capturedBy)
      .map((fish) => ({ fish, distance: Math.hypot(fish.x - x, fish.y - y) }))
      .filter((candidate) => candidate.distance <= range)
      .sort((a, b) => a.distance - b.distance)[0]?.fish;
  }

  private livingFishCount(): number {
    return this.fish.filter((fish) => fish.alive).length;
  }

  private isLocallySimulated(fish: FishRuntime, player: MarinePlayerState): boolean {
    // Simulation range is wider than visual range so fish are already moving
    // before they enter the camera's local presentation bubble.
    return Math.abs(fish.x - player.x) <= 16 && Math.abs(fish.y - player.y) <= 11;
  }

  private retireFish(fish: FishRuntime, cause: 'natural' | 'predation' | 'harvest'): void {
    if (!fish.alive) return;
    fish.alive = false;
    fish.behavior = 'retired';
    fish.capturedBy = null;
    fish.visual.visible = false;
    fish.locallyVisible = false;
    if (fish.shoalInstance !== null) this.hideShoalInstance(fish.shoalInstance);
    for (const anemone of this.anemones) {
      if (anemone.preyId !== fish.id) continue;
      anemone.preyId = null;
      anemone.captureProgress = 0;
    }
    this.lifecycle.recordDeath(cause);
  }

  private hideShoalInstance(index: number): void {
    this.shoalDummy.position.set(0, 0, 0);
    this.shoalDummy.rotation.set(0, 0, 0);
    this.shoalDummy.scale.set(0, 0, 0);
    this.shoalDummy.updateMatrix();
    this.shoalMesh.setMatrixAt(index, this.shoalDummy.matrix);
    this.shoalMatrixDirty = true;
  }
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
