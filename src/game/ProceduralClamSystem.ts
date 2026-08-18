import * as THREE from 'three';
import { BASE_SEA_LEVEL, WORLD_MIN_Y, mulberry32 } from './data';
import { MatterWorld } from './MatterWorld';

export interface ProceduralClam {
  id: string;
  x: number;
  y: number;
  scale: number;
  shellColor: string;
  ribs: number;
  pearlBearing: boolean;
  pryProgress: number;
  harvested: boolean;
  depthZone: 'reef' | 'twilight' | 'abyss' | 'hadal' | 'megacave';
  group: THREE.Group;
  upper: THREE.Group;
}

export interface ClamPryResult {
  id: string;
  x: number;
  y: number;
  progress: number;
  opened: boolean;
  pearlBearing: boolean;
}

/** Deterministic, entity-scale shellfish that require grip -> aimed dig/pry. */
export class ProceduralClamSystem {
  private readonly clams: ProceduralClam[] = [];
  private heldId: string | null = null;
  private preyCache: Array<{ id: string; x: number; y: number; depthZone: ProceduralClam['depthZone'] }> | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly world: MatterWorld, seed: number) {
    const rng = mulberry32(seed);
    const palette = ['#a98572', '#c1a17e', '#887a76', '#c8b8a2', '#8e6f67'];
    for (let index = 0; index < 88; index += 1) {
      // The first reef starts east of the handcrafted tutorial resources so
      // a clam never steals the grab intended for a nearby stone or kelp.
      const x = 6.2 + index * 0.585 + (rng() - 0.5) * 0.28;
      const y = this.surfaceAt(x);
      if (y === null || y >= BASE_SEA_LEVEL - 0.18) continue;
      const scale = 0.72 + rng() * 0.58;
      const depthZone = y > -12 ? 'reef' : y > -32 ? 'twilight' : y > -72 ? 'abyss' : y > -103 ? 'hadal' : 'megacave';
      const deepPalette = depthZone === 'megacave' ? ['#483d58', '#35566a', '#66516c'] : depthZone === 'hadal' ? ['#59606f', '#6a5873', '#435c66'] : palette;
      const shellColor = deepPalette[Math.floor(rng() * deepPalette.length)];
      const ribs = 5 + Math.floor(rng() * 5);
      const group = this.createClam(shellColor, ribs, scale);
      group.position.set(x, y + 0.11 * scale, 3.15 + rng() * 0.08);
      group.rotation.z = (rng() - 0.5) * 0.25;
      group.userData.kind = 'procedural-clam';
      this.scene.add(group);
      this.clams.push({
        id: `clam-${index + 1}`, x, y: y + 0.11 * scale, scale, shellColor, ribs,
        pearlBearing: rng() < (depthZone === 'megacave' ? 0.18 : 0.09), pryProgress: 0, harvested: false, depthZone,
        group, upper: group.children[1] as THREE.Group,
      });
    }
    // These representatives sit inside the first streamed megacave chamber,
    // below the ordinary seafloor. The regional count remains a summary; only
    // nearby shells become rendered entities.
    for (let index = 0; index < 32; index += 1) {
      const x = 42.5 + index * 0.63 + (rng() - 0.5) * 0.22;
      const y = this.caveFloorAt(x, -103.6);
      if (y === null) continue;
      const scale = 0.68 + rng() * 0.64;
      const shellColor = ['#483d58', '#35566a', '#66516c', '#405e70'][Math.floor(rng() * 4)];
      const ribs = 6 + Math.floor(rng() * 5);
      const group = this.createClam(shellColor, ribs, scale);
      group.position.set(x, y + 0.11 * scale, 3.15 + rng() * 0.08);
      group.rotation.z = (rng() - 0.5) * 0.28;
      group.userData.kind = 'procedural-clam';
      this.scene.add(group);
      this.clams.push({
        id: `megacave-clam-${index + 1}`, x, y: y + 0.11 * scale, scale, shellColor, ribs,
        pearlBearing: rng() < 0.2, pryProgress: 0, harvested: false, depthZone: 'megacave',
        group, upper: group.children[1] as THREE.Group,
      });
    }
  }

  update(time: number, playerX: number, playerY: number): void {
    for (const clam of this.clams) {
      const distance = Math.hypot(clam.x - playerX, clam.y - playerY);
      clam.group.visible = !clam.harvested && distance < 13.5;
      if (!clam.group.visible) continue;
      clam.group.position.y = clam.y + Math.sin(time * 0.7 + clam.x) * 0.008;
      clam.upper.rotation.z = clam.pryProgress * 0.68;
      clam.upper.position.x = clam.pryProgress * 0.05 * clam.scale;
      clam.upper.position.y = (0.035 + clam.pryProgress * 0.18) * clam.scale;
    }
    const held = this.held();
    if (held && Math.hypot(held.x - playerX, held.y - playerY) > 1.85) this.heldId = null;
  }

  nearest(x: number, y: number, range: number): ProceduralClam | null {
    let nearest: ProceduralClam | null = null;
    let best = range;
    for (const clam of this.clams) {
      if (clam.harvested) continue;
      const distance = Math.hypot(clam.x - x, clam.y - y);
      if (distance < best) { nearest = clam; best = distance; }
    }
    return nearest;
  }

  grip(clam: ProceduralClam): void {
    this.heldId = clam.id;
  }

  release(): void {
    this.heldId = null;
  }

  held(): ProceduralClam | null {
    return this.clams.find((clam) => clam.id === this.heldId && !clam.harvested) ?? null;
  }

  pryHeld(force: number): ClamPryResult | null {
    const clam = this.held();
    if (!clam) return null;
    clam.pryProgress = Math.min(1, clam.pryProgress + Math.max(0.08, force));
    const opened = clam.pryProgress >= 1;
    if (opened) {
      clam.harvested = true;
      clam.group.visible = false;
      this.heldId = null;
      this.preyCache = null;
    }
    return { id: clam.id, x: clam.x, y: clam.y, progress: clam.pryProgress, opened, pearlBearing: clam.pearlBearing };
  }

  snapshot(playerX: number, playerY: number): {
    generated: number;
    regionalPopulation: number;
    living: number;
    opened: number;
    visible: number;
    culled: number;
    held: string | null;
    nearby: Array<{ id: string; x: number; y: number; scale: number; ribs: number; shellColor: string; pryProgress: number; distance: number }>;
  } {
    return {
      generated: this.clams.length,
      regionalPopulation: 18400,
      living: this.clams.filter((clam) => !clam.harvested).length,
      opened: this.clams.filter((clam) => clam.harvested).length,
      visible: this.clams.filter((clam) => clam.group.visible).length,
      culled: this.clams.filter((clam) => !clam.harvested && !clam.group.visible).length,
      held: this.heldId,
      nearby: this.clams.filter((clam) => !clam.harvested)
        .map((clam) => ({ clam, distance: Math.hypot(clam.x - playerX, clam.y - playerY) }))
        .filter(({ distance }) => distance < 7)
        .sort((a, b) => a.distance - b.distance)
        .map(({ clam, distance }) => ({
          id: clam.id, x: Number(clam.x.toFixed(2)), y: Number(clam.y.toFixed(2)), scale: Number(clam.scale.toFixed(2)), ribs: clam.ribs,
          shellColor: clam.shellColor, pryProgress: Number(clam.pryProgress.toFixed(2)), distance: Number(distance.toFixed(2)),
        })),
    };
  }

  preyField(): Array<{ id: string; x: number; y: number; depthZone: ProceduralClam['depthZone'] }> {
    this.preyCache ??= this.clams
      .filter((clam) => !clam.harvested)
      .map((clam) => ({ id: clam.id, x: clam.x, y: clam.y, depthZone: clam.depthZone }));
    return this.preyCache;
  }

  consumeByPredator(id: string): { id: string; x: number; y: number; depthZone: ProceduralClam['depthZone'] } | null {
    const clam = this.clams.find((candidate) => candidate.id === id && !candidate.harvested);
    if (!clam) return null;
    clam.harvested = true;
    clam.group.visible = false;
    this.preyCache = null;
    if (this.heldId === clam.id) this.heldId = null;
    return { id: clam.id, x: clam.x, y: clam.y, depthZone: clam.depthZone };
  }

  private surfaceAt(x: number): number | null {
    for (let y = BASE_SEA_LEVEL - 0.2; y > WORLD_MIN_Y + 0.2; y -= this.world.cellSize) {
      if (this.world.isSolid(x, y) && !this.world.isSolid(x, y + this.world.cellSize)) return y + this.world.cellSize * 0.5;
    }
    return null;
  }

  private caveFloorAt(x: number, startY: number): number | null {
    let enteredCave = false;
    for (let y = startY; y > WORLD_MIN_Y + 0.15; y -= this.world.cellSize) {
      const solid = this.world.isSolid(x, y);
      if (!solid) enteredCave = true;
      else if (enteredCave && !this.world.isSolid(x, y + this.world.cellSize)) return y + this.world.cellSize * 0.5;
    }
    return null;
  }

  private createClam(color: string, ribs: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const shellMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.03 });
    const fleshMaterial = new THREE.MeshStandardMaterial({ color: '#e8a892', roughness: 0.62, emissive: '#5a261f', emissiveIntensity: 0.08 });
    const shellGeometry = new THREE.SphereGeometry(0.25 * scale, Math.max(8, ribs * 2), 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const lower = new THREE.Group();
    const lowerShell = new THREE.Mesh(shellGeometry, shellMaterial);
    lowerShell.scale.set(1.25, 0.5, 0.38);
    lowerShell.rotation.x = Math.PI;
    lower.add(lowerShell);
    const upper = new THREE.Group();
    const upperShell = new THREE.Mesh(shellGeometry, shellMaterial.clone());
    upperShell.scale.set(1.25, 0.5, 0.38);
    upper.add(upperShell);
    upper.position.y = 0.035 * scale;
    const ridgeMaterial = new THREE.LineBasicMaterial({ color: '#5d463f', transparent: true, opacity: 0.58 });
    const upperRibPositions: number[] = [];
    const lowerRibPositions: number[] = [];
    for (let index = 0; index < ribs; index += 1) {
      const t = ribs === 1 ? 0.5 : index / (ribs - 1);
      const endX = (-0.2 + t * 0.4) * scale;
      const arc = Math.sqrt(Math.max(0, 1 - ((t - 0.5) * 2) ** 2));
      const endY = 0.105 * scale * arc;
      upperRibPositions.push(-0.22 * scale, -0.02 * scale, 0.105, endX, endY, 0.105);
      lowerRibPositions.push(-0.22 * scale, 0.02 * scale, 0.105, endX, -endY, 0.105);
    }
    const upperRibs = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(upperRibPositions, 3)),
      ridgeMaterial,
    );
    const lowerRibs = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lowerRibPositions, 3)),
      ridgeMaterial,
    );
    upper.add(upperRibs);
    lower.add(lowerRibs);
    const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 8, 6), new THREE.MeshStandardMaterial({ color: '#6a4b3f', roughness: 0.9 }));
    hinge.position.set(-0.21 * scale, 0, 0.06);
    const flesh = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 10, 7), fleshMaterial);
    flesh.scale.set(1.3, 0.46, 0.48);
    flesh.position.set(0, 0.025, 0.03);
    group.add(lower, upper, flesh, hinge);
    group.rotation.x = -0.1;
    return group;
  }
}
