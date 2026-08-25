import * as THREE from 'three';
import type { ToolId } from './ToolbeltSystem';

export type ToolUseAction = 'dig' | 'pry' | 'cut' | 'place' | 'reinforce' | 'craft';

interface ActiveToolUse {
  action: ToolUseAction;
  tool: ToolId;
  startedAt: number;
  duration: number;
  direction: THREE.Vector2;
  serial: number;
}

export interface ToolUseVisualSnapshot {
  active: boolean;
  action: ToolUseAction | null;
  tool: ToolId | null;
  progress: number;
  uses: number;
  direction: { x: number; y: number };
}

/**
 * Lightweight, code-built held-tool animation. Tool models deliberately live
 * outside the octopus hierarchy so world-space mouse aim remains exact while
 * the mantle tilts and corkscrews independently.
 */
export class ToolUseVisualSystem {
  private readonly root = new THREE.Group();
  private readonly models = new Map<ToolId, THREE.Group>();
  private readonly impactRing: THREE.Mesh;
  private active: ActiveToolUse | null = null;
  private elapsed = 0;
  private uses = 0;

  constructor(scene: THREE.Scene) {
    this.root.name = 'tool-use-animation';
    this.root.position.z = 4.05;
    this.root.renderOrder = 44;
    for (const tool of ['arms', 'shellBlade', 'shellSpade', 'stoneHammer', 'stoneWedge', 'boneHook', 'net', 'glowKelp', 'stoneAdze'] as ToolId[]) {
      const model = this.buildModel(tool);
      model.visible = false;
      this.models.set(tool, model);
      this.root.add(model);
    }
    this.impactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 24),
      new THREE.MeshBasicMaterial({ color: '#f4d8a2', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
    );
    this.impactRing.position.x = 0.72;
    this.impactRing.renderOrder = 45;
    this.root.add(this.impactRing);
    this.root.visible = false;
    scene.add(this.root);
  }

  play(tool: ToolId, action: ToolUseAction, elapsed: number, direction: THREE.Vector2): void {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    const duration = action === 'craft' ? 0.95 : action === 'place' || action === 'reinforce' ? 0.78 : 0.55;
    this.active = { tool, action, startedAt: elapsed, duration, direction: normalized, serial: ++this.uses };
    this.elapsed = elapsed;
    this.root.visible = true;
    for (const [id, model] of this.models) model.visible = id === tool;
  }

  update(elapsed: number, player: { x: number; y: number }): void {
    this.elapsed = elapsed;
    if (!this.active) {
      this.root.visible = false;
      return;
    }
    const progress = THREE.MathUtils.clamp((elapsed - this.active.startedAt) / this.active.duration, 0, 1);
    if (progress >= 1) {
      this.active = null;
      this.root.visible = false;
      return;
    }

    const direction = this.active.direction;
    const baseAngle = Math.atan2(direction.y, direction.x);
    const strike = Math.sin(Math.min(1, progress / 0.66) * Math.PI * 0.5);
    const recover = progress > 0.66 ? (progress - 0.66) / 0.34 : 0;
    let swing = 0;
    let reach = 0.28;
    let bob = 0;
    if (this.active.action === 'dig' || this.active.action === 'cut') {
      const heavy = this.active.tool === 'stoneHammer' || this.active.tool === 'stoneAdze';
      swing = THREE.MathUtils.lerp(heavy ? 1.1 : 0.55, heavy ? -0.62 : -0.24, strike) + recover * (heavy ? 0.48 : 0.2);
      reach += Math.sin(progress * Math.PI) * (heavy ? 0.11 : 0.2);
    } else if (this.active.action === 'pry') {
      swing = Math.sin(progress * Math.PI * 3) * 0.24 * (1 - progress * 0.45);
      reach += progress * 0.2;
    } else if (this.active.action === 'craft') {
      swing = progress * Math.PI * 2.6;
      reach = 0.18 + Math.sin(progress * Math.PI * 4) * 0.035;
      bob = Math.sin(progress * Math.PI * 4) * 0.07;
    } else {
      swing = Math.sin(progress * Math.PI) * 0.16;
      reach = 0.18 + Math.sin(progress * Math.PI) * 0.28;
      bob = Math.sin(progress * Math.PI) * 0.12;
    }

    this.root.position.set(player.x + direction.x * reach - direction.y * bob, player.y + direction.y * reach + direction.x * bob, 4.05);
    this.root.rotation.z = baseAngle + swing;
    const pulse = Math.max(0, 1 - Math.abs(progress - 0.62) * 8);
    const ringMaterial = this.impactRing.material as THREE.MeshBasicMaterial;
    ringMaterial.opacity = pulse * 0.75;
    this.impactRing.scale.setScalar(0.55 + pulse * 1.3);
  }

  snapshot(): ToolUseVisualSnapshot {
    const progress = this.active ? THREE.MathUtils.clamp((this.elapsed - this.active.startedAt) / this.active.duration, 0, 1) : 0;
    return {
      active: Boolean(this.active),
      action: this.active?.action ?? null,
      tool: this.active?.tool ?? null,
      progress: Number(progress.toFixed(2)),
      uses: this.uses,
      direction: {
        x: Number((this.active?.direction.x ?? 0).toFixed(2)),
        y: Number((this.active?.direction.y ?? 0).toFixed(2)),
      },
    };
  }

  private buildModel(tool: ToolId): THREE.Group {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#745137', roughness: 0.92 });
    const stone = new THREE.MeshStandardMaterial({ color: '#77776d', roughness: 0.88 });
    const shell = new THREE.MeshStandardMaterial({ color: '#e1b98c', roughness: 0.54, side: THREE.DoubleSide });
    const bone = new THREE.MeshStandardMaterial({ color: '#decda9', roughness: 0.72 });
    const fiber = new THREE.MeshStandardMaterial({ color: '#b18b54', roughness: 1 });
    const kelp = new THREE.MeshStandardMaterial({ color: '#3c8664', emissive: '#1c5846', emissiveIntensity: 0.28, roughness: 0.8 });

    const handle = (length = 0.64): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, length, 7), wood);
      mesh.rotation.z = -Math.PI / 2;
      mesh.position.x = length * 0.5;
      return mesh;
    };
    const lashings = (x: number): void => {
      for (const offset of [-0.055, 0, 0.055]) {
        const cord = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.011, 5, 15), fiber);
        cord.position.x = x + offset;
        cord.rotation.y = Math.PI / 2;
        group.add(cord);
      }
    };

    if (tool === 'arms') {
      for (let index = 0; index < 4; index += 1) {
        const sucker = new THREE.Mesh(new THREE.RingGeometry(0.027, 0.052, 12), shell);
        sucker.position.set(0.36 + index * 0.075, (index - 1.5) * 0.065, 0);
        group.add(sucker);
      }
    } else if (tool === 'stoneHammer') {
      group.add(handle(0.67));
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), stone);
      head.scale.set(1.28, 0.78, 0.62);
      head.position.x = 0.69;
      group.add(head);
      lashings(0.58);
    } else if (tool === 'shellSpade') {
      group.add(handle(0.7));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56), shell);
      head.rotation.z = -Math.PI / 2;
      head.scale.set(1.18, 0.72, 0.3);
      head.position.x = 0.72;
      group.add(head);
      lashings(0.61);
    } else if (tool === 'stoneAdze') {
      group.add(handle(0.67));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.38, 6), stone);
      head.rotation.z = -Math.PI / 2;
      head.position.set(0.67, 0.1, 0);
      group.add(head);
      lashings(0.56);
    } else if (tool === 'stoneWedge') {
      const wedge = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.48, 5), stone);
      wedge.rotation.z = -Math.PI / 2;
      wedge.position.x = 0.38;
      group.add(wedge);
    } else if (tool === 'shellBlade') {
      group.add(handle(0.44));
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 5), shell);
      blade.rotation.z = -Math.PI / 2;
      blade.scale.y = 1.45;
      blade.position.x = 0.47;
      group.add(blade);
      lashings(0.37);
    } else if (tool === 'boneHook') {
      group.add(handle(0.48));
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.032, 7, 18, Math.PI * 1.45), bone);
      hook.position.x = 0.5;
      hook.rotation.z = -0.5;
      group.add(hook);
      lashings(0.4);
    } else if (tool === 'net') {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.024, 6, 24), fiber);
      loop.position.x = 0.4;
      loop.scale.y = 0.72;
      group.add(loop);
      for (let index = -2; index <= 2; index += 1) {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.45, 5), fiber);
        strand.rotation.z = Math.PI / 2;
        strand.position.set(0.4, index * 0.075, 0);
        group.add(strand);
      }
    } else {
      for (let index = 0; index < 4; index += 1) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.42 + index * 0.04, 6), kelp);
        stem.rotation.z = -Math.PI / 2 + (index - 1.5) * 0.12;
        stem.position.x = 0.3;
        group.add(stem);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 9, 7), new THREE.MeshBasicMaterial({ color: '#83f4cf' }));
        bulb.position.set(0.55, (index - 1.5) * 0.07, 0.04);
        group.add(bulb);
      }
    }
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.renderOrder = 44;
      }
    });
    return group;
  }
}
