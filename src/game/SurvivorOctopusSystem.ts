import * as THREE from 'three';
import { MatterWorld } from './MatterWorld';
import { BASE_SEA_LEVEL, PLANET_SEED, WORLD_WIDTH, clamp, mulberry32, wrapWorldX } from './data';
import { CreatureAssetLibrary } from './CreatureAssetLibrary';

type SurvivorGoal = 'forage' | 'hunt' | 'excavate shelter' | 'reinforce den' | 'hide from storm' | 'rest' | 'explore';

interface Survivor {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  shelterX: number;
  shelterY: number;
  goal: SurvivorGoal;
  hunger: number;
  moisture: number;
  stamina: number;
  health: number;
  foodCache: number;
  shelterProgress: number;
  ageYears: number;
  lifespanYears: number;
  generation: number;
  sex: 'female' | 'male';
  phase: number;
  nextDecision: number;
  nextWork: number;
  group: THREE.Group;
  arms: THREE.Line[];
}

export interface SurvivorEvent {
  kind: 'foraged' | 'hunted' | 'excavated' | 'reinforced' | 'birth' | 'natural-death';
  survivorId: string;
  x: number;
  y: number;
}

/**
 * Coarse whole-belt survival AI with nearby visual representatives. Rivals
 * keep needs, stores, shelters, lifespan, and goals while culled; only their
 * small bodies and arms animate when the player is close.
 */
export class SurvivorOctopusSystem {
  private readonly rng = mulberry32(PLANET_SEED + 8841);
  private survivors: Survivor[] = [];
  private nextId = 1;
  private nextBreedingCheck = 110;
  private culled = 0;

  constructor(private scene: THREE.Scene, private world: MatterWorld, private assets?: CreatureAssetLibrary) {
    this.spawn('Brine', -4.9, 1.55, -12.7, 2.85, 'female', 0);
    this.spawn('Silt', 14.8, -5.4, 18.4, -7.2, 'male', 0);
    this.spawn('Mica', 34.2, -28.5, 37.1, -31.0, 'female', 0);
    this.spawn('Cinder', 47.2, -90.2, 49.8, -93.2, 'male', 0);
  }

  update(dt: number, elapsed: number, storm: number, player: { x: number; y: number }): SurvivorEvent[] {
    const events: SurvivorEvent[] = [];
    this.culled = 0;
    for (const survivor of this.survivors) {
      if (survivor.health <= 0) {
        survivor.group.visible = false;
        continue;
      }
      survivor.ageYears += dt / 55;
      survivor.hunger = clamp(survivor.hunger - dt * 0.075, 0, 100);
      const underwater = survivor.y < BASE_SEA_LEVEL - 0.08;
      survivor.moisture = clamp(survivor.moisture + dt * (underwater ? 4.5 : -0.42), 0, 100);
      survivor.stamina = clamp(survivor.stamina + dt * (survivor.goal === 'rest' ? 13 : 3.4), 0, 100);
      if (survivor.hunger <= 0 || survivor.moisture <= 0) survivor.health = clamp(survivor.health - dt * 1.4, 0, 100);
      if (survivor.ageYears >= survivor.lifespanYears) {
        survivor.health = 0;
        survivor.group.visible = false;
        events.push({ kind: 'natural-death', survivorId: survivor.id, x: survivor.x, y: survivor.y });
        continue;
      }

      if (elapsed >= survivor.nextDecision) this.chooseGoal(survivor, elapsed, storm);
      const distanceToTarget = Math.hypot(this.horizontalDistance(survivor.targetX, survivor.x), survivor.targetY - survivor.y);
      if (distanceToTarget < 0.52) this.completeGoal(survivor, elapsed, events);
      this.moveSurvivor(survivor, dt);
      this.separate(survivor, player);

      const playerDistance = Math.hypot(this.horizontalDistance(survivor.x, player.x), survivor.y - player.y);
      survivor.group.visible = playerDistance <= 24;
      if (!survivor.group.visible) this.culled += 1;
      else this.updateVisual(survivor, elapsed);
    }

    if (elapsed >= this.nextBreedingCheck) {
      this.nextBreedingCheck = elapsed + 75;
      const parents = this.survivors.filter((survivor) => survivor.health > 0 && survivor.ageYears > 4 && survivor.hunger > 58 && survivor.shelterProgress >= 70);
      const female = parents.find((survivor) => survivor.sex === 'female');
      const male = parents.find((survivor) => survivor.sex === 'male');
      if (female && male && this.survivors.length < 6) {
        const child = this.spawn(`Hatchling ${this.nextId}`, female.shelterX + 0.3, female.shelterY, female.shelterX, female.shelterY, this.rng() < 0.5 ? 'female' : 'male', Math.max(female.generation, male.generation) + 1);
        child.ageYears = 0.2;
        child.hunger = 82;
        events.push({ kind: 'birth', survivorId: child.id, x: child.x, y: child.y });
      }
    }
    return events;
  }

  snapshot(playerX: number, playerY: number): {
    simulated: number;
    visible: number;
    culled: number;
    shelters: number;
    nearby: Array<Record<string, string | number | boolean>>;
  } {
    const living = this.survivors.filter((survivor) => survivor.health > 0);
    return {
      simulated: living.length,
      visible: living.filter((survivor) => survivor.group.visible).length,
      culled: this.culled,
      shelters: living.filter((survivor) => survivor.shelterProgress >= 60).length,
      nearby: living
        .map((survivor) => ({ survivor, distance: Math.hypot(this.horizontalDistance(survivor.x, playerX), survivor.y - playerY) }))
        .filter(({ distance }) => distance <= 24)
        .map(({ survivor, distance }) => ({
          id: survivor.id,
          name: survivor.name,
          x: Number(survivor.x.toFixed(2)),
          y: Number(survivor.y.toFixed(2)),
          distance: Number(distance.toFixed(2)),
          goal: survivor.goal,
          hunger: Number(survivor.hunger.toFixed(1)),
          moisture: Number(survivor.moisture.toFixed(1)),
          stamina: Number(survivor.stamina.toFixed(1)),
          health: Number(survivor.health.toFixed(1)),
          foodCache: survivor.foodCache,
          shelterProgress: Number(survivor.shelterProgress.toFixed(1)),
          ageYears: Number(survivor.ageYears.toFixed(2)),
          lifespanYears: Number(survivor.lifespanYears.toFixed(2)),
          generation: survivor.generation,
          visible: survivor.group.visible,
        })),
    };
  }

  private spawn(name: string, x: number, y: number, shelterX: number, shelterY: number, sex: 'female' | 'male', generation: number): Survivor {
    const group = new THREE.Group();
    const hue = 0.015 + this.rng() * 0.055;
    const color = new THREE.Color().setHSL(hue, 0.45, 0.33 + this.rng() * 0.12);
    const mantle = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 14, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.78, emissive: color.clone().multiplyScalar(0.16), emissiveIntensity: 0.3 }),
    );
    mantle.userData.assetFallback = true;
    mantle.scale.set(1, 1.15, 0.5);
    mantle.position.y = 0.12;
    group.add(mantle);
    const arms: THREE.Line[] = [];
    const armMaterial = new THREE.LineBasicMaterial({ color: color.clone().offsetHSL(0, 0.04, 0.12), transparent: true, opacity: 0.88 });
    for (let arm = 0; arm < 8; arm += 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 7 }, () => new THREE.Vector3()));
      const line = new THREE.Line(geometry, armMaterial);
      line.userData.assetFallback = true;
      line.position.z = -arm * 0.002;
      arms.push(line);
      group.add(line);
    }
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#dce7dd' });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMaterial);
      eye.userData.assetFallback = true;
      eye.position.set(side * 0.12, 0.21, 0.3);
      group.add(eye);
    }
    group.position.set(x, y, 2.65);
    group.renderOrder = 11;
    this.scene.add(group);
    if (this.assets && this.nextId === 1) this.assets.attach('survivor-octopus', group);
    const survivor: Survivor = {
      id: `survivor-${this.nextId++}`, name, x, y, vx: 0, vy: 0,
      targetX: x, targetY: y, shelterX, shelterY, goal: 'explore',
      hunger: 72 + this.rng() * 18, moisture: 86, stamina: 80, health: 100,
      foodCache: Math.floor(this.rng() * 2), shelterProgress: 34 + this.rng() * 24,
      ageYears: generation === 0 ? 5 + this.rng() * 8 : 0.2,
      lifespanYears: 18 + this.rng() * 10, generation, sex,
      phase: this.rng() * Math.PI * 2, nextDecision: this.rng() * 4, nextWork: 0, group, arms,
    };
    this.survivors.push(survivor);
    return survivor;
  }

  private chooseGoal(survivor: Survivor, elapsed: number, storm: number): void {
    if (storm > 0.5) {
      survivor.goal = 'hide from storm';
      survivor.targetX = survivor.shelterX;
      survivor.targetY = survivor.shelterY;
    } else if (survivor.hunger < 58) {
      survivor.goal = survivor.y < BASE_SEA_LEVEL ? 'hunt' : 'forage';
      survivor.targetX = wrapWorldX(survivor.x + (this.rng() - 0.5) * 7);
      survivor.targetY = Math.min(BASE_SEA_LEVEL - 0.5, survivor.y + (this.rng() - 0.5) * 3.5);
    } else if (survivor.stamina < 32) {
      survivor.goal = 'rest';
      survivor.targetX = survivor.shelterX;
      survivor.targetY = survivor.shelterY;
    } else if (survivor.shelterProgress < 70) {
      survivor.goal = 'excavate shelter';
      survivor.targetX = survivor.shelterX;
      survivor.targetY = survivor.shelterY;
    } else if (survivor.foodCache < 2) {
      survivor.goal = 'forage';
      survivor.targetX = wrapWorldX(survivor.x + (this.rng() - 0.5) * 5);
      survivor.targetY = survivor.y + (this.rng() - 0.5) * 2;
    } else {
      survivor.goal = this.rng() < 0.35 ? 'reinforce den' : 'explore';
      survivor.targetX = survivor.goal === 'reinforce den' ? survivor.shelterX : wrapWorldX(survivor.x + (this.rng() - 0.5) * 9);
      survivor.targetY = survivor.goal === 'reinforce den' ? survivor.shelterY : Math.min(BASE_SEA_LEVEL + 1, survivor.y + (this.rng() - 0.5) * 4);
    }
    survivor.nextDecision = elapsed + 4.5 + this.rng() * 5;
  }

  private completeGoal(survivor: Survivor, elapsed: number, events: SurvivorEvent[]): void {
    if (elapsed < survivor.nextWork) return;
    survivor.nextWork = elapsed + 4.5;
    if (survivor.goal === 'hunt' || survivor.goal === 'forage') {
      survivor.hunger = clamp(survivor.hunger + 29, 0, 100);
      survivor.foodCache = Math.min(4, survivor.foodCache + (survivor.hunger > 80 ? 1 : 0));
      events.push({ kind: survivor.goal === 'hunt' ? 'hunted' : 'foraged', survivorId: survivor.id, x: survivor.x, y: survivor.y });
    } else if (survivor.goal === 'excavate shelter') {
      survivor.shelterProgress = Math.min(100, survivor.shelterProgress + 7);
      survivor.stamina = clamp(survivor.stamina - 13, 0, 100);
      events.push({ kind: 'excavated', survivorId: survivor.id, x: survivor.x, y: survivor.y });
    } else if (survivor.goal === 'reinforce den') {
      survivor.shelterProgress = Math.min(100, survivor.shelterProgress + 3);
      events.push({ kind: 'reinforced', survivorId: survivor.id, x: survivor.x, y: survivor.y });
    } else if (survivor.goal === 'rest' && survivor.foodCache > 0 && survivor.hunger < 72) {
      survivor.foodCache -= 1;
      survivor.hunger = clamp(survivor.hunger + 34, 0, 100);
    }
    survivor.nextDecision = elapsed;
  }

  private moveSurvivor(survivor: Survivor, dt: number): void {
    const dx = this.horizontalDistance(survivor.targetX, survivor.x);
    const dy = survivor.targetY - survivor.y;
    const length = Math.hypot(dx, dy) || 1;
    const speed = survivor.goal === 'hide from storm' ? 1.65 : survivor.goal === 'rest' ? 0.55 : 1.05;
    const desiredX = dx / length * speed;
    const desiredY = dy / length * speed;
    survivor.vx += (desiredX - survivor.vx) * Math.min(1, dt * 2.8);
    survivor.vy += (desiredY - survivor.vy) * Math.min(1, dt * 2.8);
    const nextX = wrapWorldX(survivor.x + survivor.vx * dt);
    const nextY = survivor.y + survivor.vy * dt;
    if (!this.collides(nextX, survivor.y)) survivor.x = nextX;
    else survivor.vx *= -0.35;
    if (!this.collides(survivor.x, nextY)) survivor.y = nextY;
    else {
      survivor.vy *= -0.22;
      if (!this.collides(survivor.x, survivor.y + 0.24)) survivor.y += 0.12;
    }
    survivor.stamina = clamp(survivor.stamina - dt * (speed > 1.2 ? 1.4 : 0.25), 0, 100);
  }

  private collides(x: number, y: number): boolean {
    for (let sample = 0; sample < 10; sample += 1) {
      const angle = sample / 10 * Math.PI * 2;
      if (this.world.isSolid(x + Math.cos(angle) * 0.28, y + Math.sin(angle) * 0.24)) return true;
    }
    return false;
  }

  private separate(survivor: Survivor, player: { x: number; y: number }): void {
    const dx = this.horizontalDistance(survivor.x, player.x);
    const dy = survivor.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && distance < 0.78) {
      const push = (0.78 - distance) * 0.18;
      survivor.x = wrapWorldX(survivor.x + dx / distance * push);
      survivor.y += dy / distance * push;
    }
    for (const other of this.survivors) {
      if (other === survivor || other.health <= 0) continue;
      const ox = this.horizontalDistance(survivor.x, other.x);
      const oy = survivor.y - other.y;
      const separation = Math.hypot(ox, oy);
      if (separation > 0 && separation < 0.62) {
        survivor.x = wrapWorldX(survivor.x + ox / separation * (0.62 - separation) * 0.08);
        survivor.y += oy / separation * (0.62 - separation) * 0.08;
      }
    }
  }

  private updateVisual(survivor: Survivor, elapsed: number): void {
    survivor.group.position.set(survivor.x, survivor.y, 2.65);
    const speed = Math.hypot(survivor.vx, survivor.vy);
    survivor.group.rotation.z = THREE.MathUtils.lerp(survivor.group.rotation.z, -survivor.vx * 0.18, 0.08);
    for (let arm = 0; arm < survivor.arms.length; arm += 1) {
      const positions = survivor.arms[arm].geometry.getAttribute('position') as THREE.BufferAttribute;
      const side = arm < 4 ? -1 : 1;
      const row = arm % 4;
      for (let point = 0; point < positions.count; point += 1) {
        const t = point / (positions.count - 1);
        const wake = -Math.sign(survivor.vx || 1) * t * speed * 0.2;
        positions.setXYZ(
          point,
          side * (0.06 + row * 0.025) + side * t * (0.18 + row * 0.035) + wake + Math.sin(elapsed * 3 + survivor.phase + arm + t * 4) * 0.025 * t,
          -0.08 - t * (0.26 + row * 0.025) + Math.cos(elapsed * 2.2 + arm + t * 3) * 0.018 * t,
          0,
        );
      }
      positions.needsUpdate = true;
    }
  }

  private horizontalDistance(a: number, b: number): number {
    const raw = a - b;
    if (Math.abs(raw) <= WORLD_WIDTH * 0.5) return raw;
    return raw > 0 ? raw - WORLD_WIDTH : raw + WORLD_WIDTH;
  }
}
