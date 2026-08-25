export type OctipointBranch = 'manipulation' | 'mobility' | 'combat' | 'survival' | 'environment' | 'crafting';

export type OctipointActivity = 'survival' | 'hunting' | 'den-work' | 'exploration' | 'crafting' | 'excavation' | 'foraging';

export type OctipointEffect =
  | 'clamPry'
  | 'harvestYield'
  | 'digPower'
  | 'digRadius'
  | 'jetForce'
  | 'jetRecovery'
  | 'huntEfficiency'
  | 'inkDuration'
  | 'moistureRetention'
  | 'hungerRetention'
  | 'restRecovery'
  | 'pressureTolerance'
  | 'mineralSense'
  | 'fiberMastery'
  | 'reinforcement';

export interface OctipointBranchDefinition {
  id: OctipointBranch;
  label: string;
  motto: string;
  color: string;
  icon: string;
}

export interface OctipointNodeDefinition {
  id: string;
  branch: OctipointBranch;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  icon: string;
  cost: number;
  prerequisite?: string;
  effect: OctipointEffect;
  value: number;
}

export interface OctipointActivityRecord {
  activity: OctipointActivity;
  xp: number;
  detail: string;
}

export interface OctipointAward {
  accepted: boolean;
  xpAdded: number;
  pointsGained: number;
  availablePoints: number;
  experience: number;
  experienceToNext: number;
}

export interface OctipointPurchase {
  purchased: boolean;
  reason?: 'unknown' | 'owned' | 'prerequisite' | 'points';
  node?: OctipointNodeDefinition;
}

const OCTIPOINT_XP_BASE = 140;
const OCTIPOINT_XP_STEP = 20;
const OCTIPOINT_XP_CAP = 220;

export const OCTIPOINT_BRANCHES: OctipointBranchDefinition[] = [
  { id: 'manipulation', label: 'Manipulation', motto: 'Use all eight arms', color: '#40e4dc', icon: '⌁' },
  { id: 'mobility', label: 'Mobility', motto: 'Move like water', color: '#b069ff', icon: '➜' },
  { id: 'combat', label: 'Combat', motto: 'Defend. Strike. Dominate.', color: '#ffd23f', icon: '✦' },
  { id: 'survival', label: 'Survival', motto: 'Adapt. Endure. Thrive.', color: '#70e84f', icon: '✚' },
  { id: 'environment', label: 'Environment', motto: 'Control your world', color: '#ff5a45', icon: '◉' },
  { id: 'crafting', label: 'Crafting & tools', motto: 'Create. Build. Innovate.', color: '#52a9ff', icon: '⌘' },
];

export const OCTIPOINT_NODES: OctipointNodeDefinition[] = [
  { id: 'power-suckers', branch: 'manipulation', tier: 1, name: 'Power Suckers', description: '+12% shell and clam leverage', icon: '◌', cost: 1, effect: 'clamPry', value: 0.12 },
  { id: 'multi-arm-pull', branch: 'manipulation', tier: 2, name: 'Multi-Arm Pull', description: 'Foraging yields an extra bundle', icon: '⌁', cost: 1, prerequisite: 'power-suckers', effect: 'harvestYield', value: 1 },
  { id: 'anchor-pull', branch: 'manipulation', tier: 3, name: 'Anchor Pull', description: '+14% power while excavating', icon: '⚓', cost: 1, prerequisite: 'multi-arm-pull', effect: 'digPower', value: 0.14 },

  { id: 'ink-jet', branch: 'mobility', tier: 1, name: 'Ink Jet', description: '+12% Jet Burst force', icon: '➜', cost: 1, effect: 'jetForce', value: 0.12 },
  { id: 'longer-jet', branch: 'mobility', tier: 2, name: 'Longer Jet', description: '+13% Jet Burst force and reach', icon: '↠', cost: 1, prerequisite: 'ink-jet', effect: 'jetForce', value: 0.13 },
  { id: 'fluid-dash', branch: 'mobility', tier: 3, name: 'Fluid Dash', description: 'Recover 5 stamina after a jet', icon: '≈', cost: 1, prerequisite: 'longer-jet', effect: 'jetRecovery', value: 5 },

  { id: 'ink-efficiency', branch: 'combat', tier: 1, name: 'Ink Efficiency', description: '+18% predator blindness time', icon: '✺', cost: 1, effect: 'inkDuration', value: 0.18 },
  { id: 'crushing-grip', branch: 'combat', tier: 2, name: 'Crushing Grip', description: 'Hunts consume 18% less stamina', icon: '✦', cost: 1, prerequisite: 'ink-efficiency', effect: 'huntEfficiency', value: 0.18 },
  { id: 'vortex-spin', branch: 'combat', tier: 3, name: 'Vortex Spin', description: '+18% jet impact against predators', icon: '⟳', cost: 1, prerequisite: 'crushing-grip', effect: 'jetForce', value: 0.18 },

  { id: 'wet-skin', branch: 'survival', tier: 1, name: 'Wet Skin', description: 'Lose moisture 10% more slowly', icon: '◒', cost: 1, effect: 'moistureRetention', value: 0.1 },
  { id: 'slow-metabolism', branch: 'survival', tier: 2, name: 'Slow Metabolism', description: 'Lose hunger 10% more slowly', icon: '∿', cost: 1, prerequisite: 'wet-skin', effect: 'hungerRetention', value: 0.1 },
  { id: 'regenerative-rest', branch: 'survival', tier: 3, name: 'Regenerative Rest', description: '+50% health restored by sleep', icon: '✚', cost: 1, prerequisite: 'slow-metabolism', effect: 'restRecovery', value: 0.5 },

  { id: 'faster-dig', branch: 'environment', tier: 1, name: 'Faster Dig', description: '+12% excavation power', icon: '⌄', cost: 1, effect: 'digPower', value: 0.12 },
  { id: 'sand-sense', branch: 'environment', tier: 2, name: 'Sand Sense', description: 'Sense minerals and supplies farther away', icon: '◉', cost: 1, prerequisite: 'faster-dig', effect: 'mineralSense', value: 1.25 },
  { id: 'tunnel-master', branch: 'environment', tier: 3, name: 'Tunnel Master', description: '+22% excavation radius', icon: '⬡', cost: 1, prerequisite: 'sand-sense', effect: 'digRadius', value: 0.22 },

  { id: 'tool-use', branch: 'crafting', tier: 1, name: 'Tool Use', description: '+8% tool excavation power', icon: '⚒', cost: 1, effect: 'digPower', value: 0.08 },
  { id: 'master-weaver', branch: 'crafting', tier: 2, name: 'Master Weaver', description: 'Cord and rope craft one bonus item', icon: '∞', cost: 1, prerequisite: 'tool-use', effect: 'fiberMastery', value: 1 },
  { id: 'living-architecture', branch: 'crafting', tier: 3, name: 'Living Architecture', description: 'Den repairs add a second support', icon: '⌂', cost: 1, prerequisite: 'master-weaver', effect: 'reinforcement', value: 1 },
];

/**
 * Progression state is deliberately independent from the HUD and player
 * controller. Campaign saves, NPC octopi, or another UI can consume the same
 * activity, purchase, and effect contracts later.
 */
export class OctipointSystem {
  private availablePoints = 1;
  private totalEarned = 1;
  private experience = 0;
  private readonly unlocked = new Set<string>();
  private readonly uniqueAwards = new Set<string>();
  private readonly activities: OctipointActivityRecord[] = [];

  recordActivity(activity: OctipointActivity, xp: number, detail: string): OctipointAward {
    const safeXp = Math.max(0, Math.round(xp));
    if (safeXp <= 0) return this.awardSnapshot(false, 0, 0);
    this.experience += safeXp;
    this.activities.unshift({ activity, xp: safeXp, detail });
    this.activities.length = Math.min(this.activities.length, 8);
    let pointsGained = 0;
    let requirement = this.experienceRequirement();
    while (this.experience >= requirement) {
      this.experience -= requirement;
      this.availablePoints += 1;
      this.totalEarned += 1;
      pointsGained += 1;
      requirement = this.experienceRequirement();
    }
    return this.awardSnapshot(true, safeXp, pointsGained);
  }

  recordUnique(key: string, activity: OctipointActivity, xp: number, detail: string): OctipointAward {
    if (this.uniqueAwards.has(key)) return this.awardSnapshot(false, 0, 0);
    this.uniqueAwards.add(key);
    return this.recordActivity(activity, xp, detail);
  }

  purchase(nodeId: string): OctipointPurchase {
    const node = OCTIPOINT_NODES.find((candidate) => candidate.id === nodeId);
    if (!node) return { purchased: false, reason: 'unknown' };
    if (this.unlocked.has(node.id)) return { purchased: false, reason: 'owned', node };
    if (node.prerequisite && !this.unlocked.has(node.prerequisite)) return { purchased: false, reason: 'prerequisite', node };
    if (this.availablePoints < node.cost) return { purchased: false, reason: 'points', node };
    this.availablePoints -= node.cost;
    this.unlocked.add(node.id);
    return { purchased: true, node };
  }

  canPurchase(nodeId: string): boolean {
    const node = OCTIPOINT_NODES.find((candidate) => candidate.id === nodeId);
    return Boolean(node && !this.unlocked.has(node.id) && (!node.prerequisite || this.unlocked.has(node.prerequisite)) && this.availablePoints >= node.cost);
  }

  owns(nodeId: string): boolean {
    return this.unlocked.has(nodeId);
  }

  effect(effect: OctipointEffect): number {
    return OCTIPOINT_NODES.reduce((total, node) => total + (node.effect === effect && this.unlocked.has(node.id) ? node.value : 0), 0);
  }

  snapshot(): {
    availablePoints: number;
    totalEarned: number;
    experience: number;
    experienceToNext: number;
    unlocked: string[];
    purchasable: string[];
    activity: OctipointActivityRecord[];
    effects: Record<OctipointEffect, number>;
    progression: { baseXp: number; stepXp: number; capXp: number; starterPoint: boolean };
  } {
    const effectNames: OctipointEffect[] = [
      'clamPry', 'harvestYield', 'digPower', 'digRadius', 'jetForce', 'jetRecovery', 'huntEfficiency',
      'inkDuration', 'moistureRetention', 'hungerRetention', 'restRecovery', 'pressureTolerance',
      'mineralSense', 'fiberMastery', 'reinforcement',
    ];
    return {
      availablePoints: this.availablePoints,
      totalEarned: this.totalEarned,
      experience: this.experience,
      experienceToNext: this.experienceRequirement(),
      unlocked: [...this.unlocked],
      purchasable: OCTIPOINT_NODES.filter((node) => this.canPurchase(node.id)).map((node) => node.id),
      activity: this.activities.map((record) => ({ ...record })),
      effects: Object.fromEntries(effectNames.map((effect) => [effect, this.effect(effect)])) as Record<OctipointEffect, number>,
      progression: { baseXp: OCTIPOINT_XP_BASE, stepXp: OCTIPOINT_XP_STEP, capXp: OCTIPOINT_XP_CAP, starterPoint: true },
    };
  }

  serialize(): {
    version: 1;
    availablePoints: number;
    totalEarned: number;
    experience: number;
    unlocked: string[];
    uniqueAwards: string[];
    activities: OctipointActivityRecord[];
  } {
    return {
      version: 1,
      availablePoints: this.availablePoints,
      totalEarned: this.totalEarned,
      experience: this.experience,
      unlocked: [...this.unlocked],
      uniqueAwards: [...this.uniqueAwards],
      activities: this.activities.map((record) => ({ ...record })),
    };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const section = data as {
      version?: unknown; availablePoints?: unknown; totalEarned?: unknown; experience?: unknown;
      unlocked?: unknown; uniqueAwards?: unknown; activities?: unknown;
    };
    if (section.version !== 1) return;
    const points = Number(section.availablePoints);
    const earned = Number(section.totalEarned);
    const xp = Number(section.experience);
    if (Number.isFinite(points) && points >= 0) this.availablePoints = Math.floor(points);
    if (Number.isFinite(earned) && earned >= 0) this.totalEarned = Math.floor(earned);
    if (Number.isFinite(xp) && xp >= 0) this.experience = Math.floor(xp);
    if (Array.isArray(section.unlocked)) {
      this.unlocked.clear();
      for (const id of section.unlocked) {
        if (typeof id === 'string' && OCTIPOINT_NODES.some((node) => node.id === id)) this.unlocked.add(id);
      }
    }
    if (Array.isArray(section.uniqueAwards)) {
      this.uniqueAwards.clear();
      for (const key of section.uniqueAwards) if (typeof key === 'string') this.uniqueAwards.add(key);
    }
    if (Array.isArray(section.activities)) {
      this.activities.length = 0;
      for (const record of section.activities) {
        if (typeof record !== 'object' || record === null) continue;
        const candidate = record as Partial<OctipointActivityRecord>;
        if (typeof candidate.activity === 'string' && typeof candidate.xp === 'number' && typeof candidate.detail === 'string') {
          this.activities.push({ activity: candidate.activity as OctipointActivity, xp: candidate.xp, detail: candidate.detail });
        }
      }
      this.activities.length = Math.min(this.activities.length, 8);
    }
  }

  private experienceRequirement(): number {
    const earnedThroughExperience = Math.max(0, this.totalEarned - 1);
    return Math.min(OCTIPOINT_XP_CAP, OCTIPOINT_XP_BASE + earnedThroughExperience * OCTIPOINT_XP_STEP);
  }

  private awardSnapshot(accepted: boolean, xpAdded: number, pointsGained: number): OctipointAward {
    return {
      accepted,
      xpAdded,
      pointsGained,
      availablePoints: this.availablePoints,
      experience: this.experience,
      experienceToNext: this.experienceRequirement(),
    };
  }
}
