import * as THREE from 'three';
import { DigResult, MatterWorld } from './MatterWorld';
import { clamp } from './data';

export interface JetBlastCastResult {
  target: THREE.Vector2;
  terrain: DigResult;
  radius: number;
  force: number;
}

export interface JetBlastTargetResult {
  affected: number;
  killed: number;
  hits: Array<{ id: string; species: string; x: number; y: number; killed: boolean }>;
}

export interface JetBlastSnapshot {
  mastery: number;
  masteryRequired: number;
  progress: number;
  unlocked: boolean;
  cooldownRemaining: number;
  staminaCost: number;
  requiredJetCharges: number;
  casts: number;
}

/** Progression and terrain authority for the learned high-pressure blast. */
export class JetBlastSystem {
  readonly masteryRequired = 80;
  readonly staminaCost = 70;
  readonly requiredJetCharges = 3;
  readonly cooldownSeconds = 18;
  readonly radius = 1.48;
  readonly force = 4.6;
  mastery = 0;
  cooldownRemaining = 0;
  casts = 0;
  private announcedUnlock = false;

  get unlocked(): boolean {
    return this.mastery >= this.masteryRequired;
  }

  update(dt: number): void {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
  }

  trainJet(environmentStrength: number): boolean {
    return this.train(1.2 * clamp(environmentStrength, 0.5, 1));
  }

  trainExcavation(removed: number, chipped: number): boolean {
    return this.train(Math.min(1.6, removed * 0.035 + chipped * 0.018));
  }

  readiness(stamina: number, jetCharges: number, underwater: boolean): string | null {
    if (!this.unlocked) return `Jet Blast mastery ${Math.floor(this.mastery)}/${this.masteryRequired}. Train with jets and excavation.`;
    if (!underwater) return 'Jet Blast needs a full mantle of surrounding water.';
    if (this.cooldownRemaining > 0) return `Jet Blast chambers need ${this.cooldownRemaining.toFixed(1)}s to recover.`;
    if (jetCharges < this.requiredJetCharges) return 'Jet Blast needs all three jet chambers charged.';
    if (stamina < this.staminaCost) return `Jet Blast needs ${this.staminaCost} stamina.`;
    return null;
  }

  cast(world: MatterWorld, origin: THREE.Vector2, direction: THREE.Vector2): JetBlastCastResult {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(1, 0);
    const target = origin.clone().addScaledVector(normalized, 1.42);
    // Unlike careful den excavation, this shock front pulverizes and ejects
    // the removed mass into the particle/mineral layer instead of leaving a
    // giant sediment pile that immediately plugs the opening again.
    const terrain = world.dig(target.x, target.y, this.radius, this.force, false);
    this.cooldownRemaining = this.cooldownSeconds;
    this.casts += 1;
    return { target, terrain, radius: this.radius, force: this.force };
  }

  snapshot(): JetBlastSnapshot {
    return {
      mastery: Number(this.mastery.toFixed(2)),
      masteryRequired: this.masteryRequired,
      progress: Number(clamp(this.mastery / this.masteryRequired, 0, 1).toFixed(3)),
      unlocked: this.unlocked,
      cooldownRemaining: Number(this.cooldownRemaining.toFixed(2)),
      staminaCost: this.staminaCost,
      requiredJetCharges: this.requiredJetCharges,
      casts: this.casts,
    };
  }

  private train(amount: number): boolean {
    const wasUnlocked = this.unlocked;
    this.mastery = clamp(this.mastery + Math.max(0, amount), 0, this.masteryRequired);
    const newlyUnlocked = !wasUnlocked && this.unlocked && !this.announcedUnlock;
    if (newlyUnlocked) this.announcedUnlock = true;
    return newlyUnlocked;
  }
}
