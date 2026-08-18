export const PLANET_SEED = 730_221;
export const WORLD_WIDTH = 128;
export const WORLD_HEIGHT = 128;
export const WORLD_MIN_X = -64;
export const WORLD_MIN_Y = -112;
export const WORLD_MAX_X = WORLD_MIN_X + WORLD_WIDTH;
export const WORLD_MAX_Y = WORLD_MIN_Y + WORLD_HEIGHT;
export const BASE_SEA_LEVEL = 4;
export const HADAL_VENT_X = 52;
export const HADAL_VENT_Y = -102.4;

export enum MaterialId {
  Empty = 0,
  Sand = 1,
  WetSand = 2,
  Soil = 3,
  Mud = 4,
  Clay = 5,
  Limestone = 6,
  Basalt = 7,
  Water = 8,
  Lava = 9,
  CrushedShell = 10,
  KelpFiber = 11,
  Wood = 12,
  Mineral = 13,
  Steam = 14,
  VentFluid = 15,
  Ice = 16,
  Snow = 17,
}

export type ResourceKey =
  | 'fibers'
  | 'kelp'
  | 'glowKelp'
  | 'cord'
  | 'rope'
  | 'food'
  | 'seasonedFood'
  | 'tubeWormMeat'
  | 'ventTonic'
  | 'salt'
  | 'ironstone'
  | 'copperOre'
  | 'obsidian'
  | 'quartz'
  | 'manganese'
  | 'largeShell'
  | 'sharpShell'
  | 'shellFragments'
  | 'stone'
  | 'wood'
  | 'bone'
  | 'sponge'
  | 'adhesive'
  | 'pumice'
  | 'shellBlade'
  | 'shellSpade'
  | 'stoneHammer'
  | 'stoneWedge'
  | 'stoneAdze'
  | 'boneHook'
  | 'storageSling'
  | 'net'
  | 'kelpCurtain'
  | 'tunnelBrace'
  | 'shellBowl';

export type Inventory = Record<ResourceKey, number>;

export const EMPTY_INVENTORY: Inventory = {
  fibers: 0,
  kelp: 0,
  glowKelp: 0,
  cord: 0,
  rope: 0,
  food: 1,
  seasonedFood: 0,
  tubeWormMeat: 0,
  ventTonic: 0,
  salt: 0,
  ironstone: 0,
  copperOre: 0,
  obsidian: 0,
  quartz: 0,
  manganese: 0,
  largeShell: 0,
  sharpShell: 0,
  shellFragments: 0,
  stone: 0,
  wood: 0,
  bone: 0,
  sponge: 0,
  adhesive: 0,
  pumice: 0,
  shellBlade: 0,
  shellSpade: 0,
  stoneHammer: 0,
  stoneWedge: 0,
  stoneAdze: 0,
  boneHook: 0,
  storageSling: 0,
  net: 0,
  kelpCurtain: 0,
  tunnelBrace: 0,
  shellBowl: 0,
};

export interface Recipe {
  id: ResourceKey;
  name: string;
  description: string;
  ingredients: Partial<Record<ResourceKey, number>>;
}

export const RECIPES: Recipe[] = [
  { id: 'cord', name: 'Fiber cord', description: 'Twist three plant-fiber bundles.', ingredients: { fibers: 3 } },
  { id: 'rope', name: 'Braided rope', description: 'Eight arms keep a strong braid under tension.', ingredients: { cord: 3 } },
  { id: 'shellBlade', name: 'Shell blade', description: 'Harvest plants without uprooting them.', ingredients: { sharpShell: 1, cord: 1 } },
  { id: 'shellBlade', name: 'Bio-bound shell blade', description: 'Mussel adhesive replaces a woven binding.', ingredients: { sharpShell: 1, adhesive: 1 } },
  { id: 'shellSpade', name: 'Shell spade', description: 'Moves a broad fan of sediment.', ingredients: { largeShell: 1, wood: 1, rope: 1 } },
  { id: 'stoneHammer', name: 'Stone hammer', description: 'Cracks shell and weak limestone.', ingredients: { stone: 2, wood: 1, rope: 1 } },
  { id: 'stoneHammer', name: 'Copper-bound hammer', description: 'Native copper makes a durable striking head.', ingredients: { copperOre: 1, wood: 1, rope: 1 } },
  { id: 'stoneWedge', name: 'Stone wedge', description: 'A shaped stone for prying.', ingredients: { stone: 2 } },
  { id: 'stoneWedge', name: 'Obsidian wedge', description: 'A volcanic edge for precise shell and crack work.', ingredients: { obsidian: 1, cord: 1 } },
  { id: 'stoneWedge', name: 'Pumice-ground wedge', description: 'Pumice abrades one stone into a clean prying edge.', ingredients: { stone: 1, pumice: 1 } },
  { id: 'boneHook', name: 'Bone hook', description: 'A compact rope anchor.', ingredients: { bone: 1, shellFragments: 1 } },
  { id: 'storageSling', name: 'Storage sling', description: 'Keeps emergency food above floodwater.', ingredients: { rope: 1, fibers: 2 } },
  { id: 'storageSling', name: 'Filter sling', description: 'A sponge-lined sling keeps a wet chamber clean.', ingredients: { rope: 1, sponge: 1 } },
  { id: 'net', name: 'Fiber net', description: 'A trap for small coastal fish.', ingredients: { cord: 2 } },
  { id: 'kelpCurtain', name: 'Kelp curtain', description: 'Conceals an entrance and retains moisture.', ingredients: { kelp: 2, rope: 1 } },
  { id: 'tunnelBrace', name: 'Tunnel brace', description: 'Stabilizes the den during a storm.', ingredients: { wood: 2, rope: 1 } },
  { id: 'tunnelBrace', name: 'Mineral tunnel brace', description: 'Ironstone footings spread roof pressure through wet sediment.', ingredients: { ironstone: 2, wood: 1, rope: 1 } },
  { id: 'shellBowl', name: 'Shell bowl', description: 'Stores food, water, and pigments.', ingredients: { largeShell: 1 } },
];

export type EntityKind = 'kelp' | 'bush' | 'scallop' | 'stone' | 'wood' | 'bone' | 'glow' | 'vent';

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  gathered: boolean;
  health?: number;
}

export type SurfaceCreatureKind = 'bird' | 'caterpillar' | 'snake' | 'jelly';

export interface CreatureState {
  id: string;
  kind: SurfaceCreatureKind;
  x: number;
  y: number;
  vx: number;
  phase: number;
  alive: boolean;
  life: LifeState<SurfaceCreatureKind>;
}

export const MATERIAL_NAMES: Record<number, string> = {
  [MaterialId.Empty]: 'empty',
  [MaterialId.Sand]: 'sand',
  [MaterialId.WetSand]: 'wet sand',
  [MaterialId.Soil]: 'soil',
  [MaterialId.Mud]: 'mud',
  [MaterialId.Clay]: 'clay',
  [MaterialId.Limestone]: 'limestone',
  [MaterialId.Basalt]: 'basalt',
  [MaterialId.Water]: 'water',
  [MaterialId.Lava]: 'lava',
  [MaterialId.CrushedShell]: 'crushed shell',
  [MaterialId.KelpFiber]: 'kelp fiber',
  [MaterialId.Wood]: 'wood',
  [MaterialId.Mineral]: 'mineral sediment',
  [MaterialId.Steam]: 'steam',
  [MaterialId.VentFluid]: 'vent fluid',
  [MaterialId.Ice]: 'sea ice',
  [MaterialId.Snow]: 'snow',
};

export function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function wrapWorldX(value: number): number {
  return ((value - WORLD_MIN_X) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH + WORLD_MIN_X;
}
import type { LifeState } from './CreatureLifecycleSystem';
