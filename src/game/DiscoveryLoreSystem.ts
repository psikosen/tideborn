import * as THREE from 'three';
import {
  BASE_SEA_LEVEL,
  HADAL_VENT_X,
  MaterialId,
  PLANET_SEED,
  WORLD_MIN_X,
  WORLD_MIN_Y,
  WORLD_WIDTH,
  mulberry32,
  wrapWorldX,
} from './data';

export type DiscoveryCategory =
  | 'fossils'
  | 'ancientTools'
  | 'shipwreck'
  | 'geothermal'
  | 'rareOrganisms'
  | 'tablets';

export type DiscoveryId =
  | 'ammonite-vault'
  | 'vertebra-column'
  | 'ancestor-blade'
  | 'knapped-core'
  | 'iron-ribframe'
  | 'cargo-glass'
  | 'compass-rose'
  | 'vent-chimney-cap'
  | 'sulfur-rosette'
  | 'glass-sponge-garden'
  | 'sporecap-lantern'
  | 'ghost-duster-colony'
  | 'slate-long-warming'
  | 'slate-first-hands';

interface KindDefinition {
  id: DiscoveryId;
  label: string;
  category: DiscoveryCategory;
  weight: number;
  color: string;
  zone: 'shelf' | 'mid' | 'vent' | 'dark';
  lore: string;
  story?: string;
}

interface Placement {
  instanceId: string;
  kindId: DiscoveryId;
  x: number;
  y: number;
  band: number;
  phase: number;
  revealed: boolean;
  recovered: boolean;
  dayFound: number | null;
  visual: THREE.Group | null;
}

interface SparkleBurst {
  points: THREE.Points;
  velocities: Float32Array;
  ages: Float32Array;
  active: boolean;
  life: number;
}

interface RecoveryInfo {
  id: string;
  label: string;
  kind: DiscoveryCategory;
  storyLine: string | null;
  day: number;
}

const BAND_WIDTH = 8;
const BAND_COUNT = WORLD_WIDTH / BAND_WIDTH;
const DAY_SECONDS = 90;
const DIG_REVEAL_RADIUS = 1.6;
const SWIM_REVEAL_RADIUS = 1.1;
const RECOVER_RADIUS = 1.55;
const SENSE_RADIUS = 7;

const CATEGORY_ORDER: readonly DiscoveryCategory[] = [
  'fossils',
  'ancientTools',
  'shipwreck',
  'geothermal',
  'rareOrganisms',
  'tablets',
];

const CATEGORY_TITLES: Record<DiscoveryCategory, string> = {
  fossils: 'Fossils',
  ancientTools: 'Ancient Tools',
  shipwreck: 'Shipwreck',
  geothermal: 'Geothermal',
  rareOrganisms: 'Rare Organisms',
  tablets: 'Storytelling Tablets',
};

const KINDS: readonly KindDefinition[] = [
  {
    id: 'ammonite-vault', label: 'Ammonite Vault', category: 'fossils', weight: 10, color: '#c9a06b', zone: 'mid',
    lore: 'A limestone nodule split clean to show a coiled ammonite the size of a dinner plate, chambers still lined with crystal. Pelagos-730 surveyed these beds from orbit and logged them as barren rock.',
    story: 'The spiral writes itself again and again in the stone, patient as tide.',
  },
  {
    id: 'vertebra-column', label: 'Vertebra Column', category: 'fossils', weight: 7, color: '#ded3b8', zone: 'mid',
    lore: 'Fourteen linked vertebrae of some shallow-sea leviathan remain articulated in clay, curved as if still swimming. Nothing in the Pelagos-730 biological atlas predicted bones this far inland.',
  },
  {
    id: 'ancestor-blade', label: 'Ancestor Blade', category: 'ancientTools', weight: 8, color: '#8f8a78', zone: 'shelf',
    lore: 'A ground shell-stone blade with a wrist loop worn smooth by a hand that was not a hand. Whoever camped on this shelf before the drowning of Pelagos-730 knapped with eight fingers or eight arms.',
  },
  {
    id: 'knapped-core', label: 'Knapped Core', category: 'ancientTools', weight: 9, color: '#6f7d86', zone: 'shelf',
    lore: 'A exhausted flaking core, every face scarred by removals struck in a hurry before the long water came. The flakes match debris scattered three meters around, a workshop abandoned in minutes.',
  },
  {
    id: 'iron-ribframe', label: 'Iron Ribframe', category: 'shipwreck', weight: 8, color: '#7a6a58', zone: 'shelf',
    lore: 'Curved iron ribs arc out of the sand like the carcass of a whale that dreamed itself a boat. The registry plates match the Pelagos-730 relief schooner listed lost with all hands during the Warming.',
  },
  {
    id: 'cargo-glass', label: 'Cargo Glass', category: 'shipwreck', weight: 9, color: '#7fe8de', zone: 'shelf',
    lore: 'A concretion of fused window glass, still bearing the wave-pattern of sand that polished it for centuries. Its pale green tint matches no local shore; it rode here as cargo from a coast that no longer exists.',
  },
  {
    id: 'compass-rose', label: 'Compass Rose', category: 'shipwreck', weight: 5, color: '#c8b98d', zone: 'shelf',
    lore: 'A brass binnacle ring engraved with a sixteen-point rose, needle long dissolved but the N still legible. It kept pointing north through the drowning of Pelagos-730 and every storm since.',
  },
  {
    id: 'vent-chimney-cap', label: 'Vent Chimney Cap', category: 'geothermal', weight: 7, color: '#4a4e57', zone: 'vent',
    lore: 'A hollow sulfide collar, knuckled like tree bark, sheared from a chimney mouth and tumbled aside. Pelagos-730 drill logs marked this field as their last hope of geothermal power.',
  },
  {
    id: 'sulfur-rosette', label: 'Sulfur Rosette', category: 'geothermal', weight: 6, color: '#e0c341', zone: 'vent',
    lore: 'Yellow crystal petals radiate from a mineral seed, grown in the breathing pause between vent pulses. The flower is stone, but it blooms only where the planet still burns below Pelagos-730.',
  },
  {
    id: 'glass-sponge-garden', label: 'Glass Sponge Garden', category: 'rareOrganisms', weight: 7, color: '#a9d8e8', zone: 'dark',
    lore: 'A slow congregation of vase sponges build skeletons of pure silica taller than your mantle. Their ancestors filtered these waters before Pelagos-730 ever drew a chart, and they have not hurried since.',
  },
  {
    id: 'sporecap-lantern', label: 'Sporecap Lantern', category: 'rareOrganisms', weight: 8, color: '#8df6cf', zone: 'dark',
    lore: 'A mushroom-shaped colony glows with cold green light, spore clouds pulsing from its cap in rhythm with the current. Divers of the drowned station called them mile markers for the dark.',
  },
  {
    id: 'ghost-duster-colony', label: 'Ghost Duster Colony', category: 'rareOrganisms', weight: 6, color: '#dfe7ef', zone: 'dark',
    lore: 'Translucent feeding fans stand in a loose ring, each one shivering dust from the passing water. When the colony senses pressure it folds flat, and the seafloor looks empty enough to have never been lived in.',
  },
  {
    id: 'slate-long-warming', label: 'Etched Slate: The Long Warming', category: 'tablets', weight: 4, color: '#9fb4a6', zone: 'shelf',
    lore: 'A kiln-fired slate etched in careful strokes: tide gauges climbing year over year until the entries stop mid-row. Someone recorded the end of their coastline one measured morning at a time.',
    story: 'The slate reads: "The water took the low fields in spring. We moved the archive to the high cave. If you read this, the warming won. Count what floats and remember we counted too."',
  },
  {
    id: 'slate-first-hands', label: 'Etched Slate: First Hands', category: 'tablets', weight: 4, color: '#b7a98f', zone: 'shelf',
    lore: 'This older slate carries a pressed print of a broad webbed hand beside two narrow human ones, fired hard before the flood. Whatever pact it seals, both signers stood on dry ground to make it.',
    story: 'The slate reads: "Two hands taught eight arms to knot rope. Eight arms taught two hands to hold breath. Whatever rises over Pelagos-730, let it rise together."',
  },
];

const KIND_MAP = new Map(KINDS.map((definition) => [definition.id, definition]));

function bandSeed(band: number): number {
  return (PLANET_SEED + 12661 + Math.imul(band + 1, 0x9e3779b1)) >>> 0;
}

function bandOfX(x: number): number {
  const wrapped = wrapWorldX(x);
  const offset = Math.floor((wrapped - WORLD_MIN_X) / BAND_WIDTH);
  return ((offset % BAND_COUNT) + BAND_COUNT) % BAND_COUNT;
}

function wrappedDistance(a: number, b: number): number {
  const raw = a - b;
  if (Math.abs(raw) <= WORLD_WIDTH * 0.5) return raw;
  return raw > 0 ? raw - WORLD_WIDTH : raw + WORLD_WIDTH;
}

function isBuriable(material: MaterialId): boolean {
  return material !== MaterialId.Empty
    && material !== MaterialId.Water
    && material !== MaterialId.Steam
    && material !== MaterialId.VentFluid
    && material !== MaterialId.Lava
    && material !== MaterialId.Ice
    && material !== MaterialId.Snow;
}

export class DiscoveryLoreSystem {
  private readonly rng: () => number;
  private readonly placements: Placement[] = [];
  private readonly visualPool = new Map<DiscoveryId, THREE.Group[]>();
  private readonly sparkles: SparkleBurst[] = [];
  private readonly root: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly countLabel: HTMLSpanElement;
  private latest: RecoveryInfo | null = null;
  private currentDay = 1;
  private openState = false;
  private nextInstanceId = 1;

  constructor(private scene: THREE.Scene, private sampleMaterial: (x: number, y: number) => number) {
    this.rng = mulberry32(PLANET_SEED + 12661);
    this.buildPlacements();
    this.buildSparklePool();
    const built = this.buildOverlay();
    this.root = built.root;
    this.listHost = built.listHost;
    this.countLabel = built.countLabel;
    this.root.style.zoom = 'var(--tb-ui-scale, 1)';
    document.body.appendChild(this.root);
    window.addEventListener('keydown', (event) => {
      if (!this.openState || event.code !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle(false);
    }, true);
  }

  get open(): boolean {
    return this.openState;
  }

  toggle(force?: boolean): void {
    this.openState = force ?? !this.openState;
    this.root.classList.toggle('tb-disc-open', this.openState);
    this.root.setAttribute('aria-hidden', String(!this.openState));
    if (this.openState) this.renderCodex();
  }

  notifyDig(x: number, y: number): void {
    for (const placement of this.placements) {
      if (placement.revealed || placement.recovered) continue;
      const distance = Math.hypot(wrappedDistance(placement.x, x), placement.y - y);
      if (distance <= DIG_REVEAL_RADIUS) this.reveal(placement);
    }
  }

  recoverNearest(px: number, py: number): boolean {
    let target: Placement | null = null;
    let best = RECOVER_RADIUS;
    for (const placement of this.placements) {
      if (!placement.revealed || placement.recovered) continue;
      const distance = Math.hypot(wrappedDistance(placement.x, px), placement.y - py);
      if (distance < best) { target = placement; best = distance; }
    }
    if (!target) return false;
    const definition = KIND_MAP.get(target.kindId)!;
    target.recovered = true;
    target.dayFound = this.currentDay;
    if (target.visual) {
      this.releaseVisual(target.kindId, target.visual);
      target.visual = null;
    }
    this.spawnSparkle(target.x, target.y, definition.color);
    this.latest = {
      id: target.instanceId,
      label: definition.label,
      kind: definition.category,
      storyLine: definition.story ?? null,
      day: this.currentDay,
    };
    if (this.openState) this.renderCodex();
    return true;
  }

  latestRecovery(): RecoveryInfo | null {
    return this.latest;
  }

  update(time: number, px?: number, py?: number): void {
    this.currentDay = Math.floor(Math.max(0, time) / DAY_SECONDS) + 1;
    if (px !== undefined && py !== undefined) {
      for (const placement of this.placements) {
        if (placement.revealed || placement.recovered) continue;
        const distance = Math.hypot(wrappedDistance(placement.x, px), placement.y - py);
        if (distance <= SWIM_REVEAL_RADIUS) this.reveal(placement);
      }
    }
    for (const placement of this.placements) {
      const visual = placement.visual;
      if (!visual || !visual.visible) continue;
      visual.position.y = placement.y + Math.sin(time * 2 + placement.phase) * 0.055;
      visual.rotation.z = Math.sin(time * 0.8 + placement.phase) * 0.09;
      const pulse = 0.96 + Math.sin(time * 3.1 + placement.phase) * 0.05;
      visual.scale.setScalar(pulse);
      const halo = visual.children.find((child) => child.userData.tbDiscHalo === true);
      if (halo instanceof THREE.Mesh && halo.material instanceof THREE.MeshBasicMaterial) {
        halo.material.opacity = 0.22 + 0.14 * Math.sin(time * 2.6 + placement.phase);
      }
    }
    for (const burst of this.sparkles) this.stepSparkle(burst);
  }

  snapshot(px: number, py: number): {
    nearby: Array<{ id: string; label: string; distance: number; kind: DiscoveryCategory }>;
    recoveredCount: number;
    totalKinds: number;
    latestRecovery: RecoveryInfo | null;
  } {
    const nearby = this.placements
      .filter((placement) => placement.revealed && !placement.recovered)
      .map((placement) => ({
        placement,
        distance: Math.hypot(wrappedDistance(placement.x, px), placement.y - py),
      }))
      .filter(({ distance }) => distance < SENSE_RADIUS)
      .sort((a, b) => a.distance - b.distance)
      .map(({ placement, distance }) => {
        const definition = KIND_MAP.get(placement.kindId)!;
        return {
          id: placement.instanceId,
          label: definition.label,
          distance: Number(distance.toFixed(2)),
          kind: definition.category,
        };
      });
    const recoveredKinds = new Set(
      this.placements.filter((placement) => placement.recovered).map((placement) => placement.kindId),
    );
    return {
      nearby,
      recoveredCount: recoveredKinds.size,
      totalKinds: KINDS.length,
      latestRecovery: this.latest,
    };
  }

  serialize(): { recoveredIds: string[]; revealedIds: string[] } {
    return {
      recoveredIds: this.placements
        .filter((placement) => placement.recovered)
        .map((placement) => `${placement.instanceId}@${placement.dayFound ?? 0}`),
      revealedIds: this.placements
        .filter((placement) => placement.revealed && !placement.recovered)
        .map((placement) => placement.instanceId),
    };
  }

  deserialize(value: unknown): void {
    if (typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    const recoveredRaw = record['recoveredIds'];
    const revealedRaw = record['revealedIds'];
    if (!Array.isArray(recoveredRaw) || !Array.isArray(revealedRaw)) return;
    const byInstance = new Map(this.placements.map((placement) => [placement.instanceId, placement]));
    for (const placement of this.placements) {
      placement.revealed = false;
      placement.recovered = false;
      placement.dayFound = null;
      if (placement.visual) {
        this.releaseVisual(placement.kindId, placement.visual);
        placement.visual = null;
      }
    }
    for (const entry of recoveredRaw) {
      if (typeof entry !== 'string') continue;
      const [instanceId, dayPart] = entry.split('@');
      const placement = byInstance.get(instanceId);
      if (!placement) continue;
      const day = Number.parseInt(dayPart ?? '', 10);
      placement.recovered = true;
      placement.dayFound = Number.isFinite(day) && day > 0 ? day : null;
    }
    for (const entry of revealedRaw) {
      if (typeof entry !== 'string') continue;
      const placement = byInstance.get(entry);
      if (placement && !placement.recovered) this.reveal(placement);
    }
    if (this.openState) this.renderCodex();
  }

  private reveal(placement: Placement): void {
    placement.revealed = true;
    if (!placement.visual && !placement.recovered) {
      const visual = this.acquireVisual(placement.kindId);
      visual.position.set(placement.x, placement.y, 4.2);
      visual.rotation.z = 0;
      visual.visible = true;
      this.scene.add(visual);
      placement.visual = visual;
    }
  }

  private buildPlacements(): void {
    for (let band = 0; band < BAND_COUNT; band += 1) {
      const rng = mulberry32(bandSeed(band));
      const roll = rng();
      const count = roll < 0.34 ? 0 : rng() < 0.7 ? 1 : 2;
      const taken = new Set<DiscoveryId>();
      const bandMinX = WORLD_MIN_X + band * BAND_WIDTH;
      const center = bandMinX + BAND_WIDTH * 0.5;
      const ventEligible = Math.abs(center - HADAL_VENT_X) <= 9;
      for (let slot = 0; slot < count; slot += 1) {
        const kindId = this.pickKind(rng, ventEligible, taken);
        if (!kindId) continue;
        const definition = KIND_MAP.get(kindId)!;
        const x = bandMinX + 0.9 + rng() * (BAND_WIDTH - 1.8);
        const y = this.sampleY(definition.zone, rng);
        const settled = this.settlePosition(x, y, definition.zone);
        if (!settled) continue;
        taken.add(kindId);
        this.placements.push({
          instanceId: `disc-${this.nextInstanceId}`,
          kindId,
          x: settled.x,
          y: settled.y,
          band,
          phase: rng() * Math.PI * 2,
          revealed: false,
          recovered: false,
          dayFound: null,
          visual: null,
        });
        this.nextInstanceId += 1;
      }
    }
  }

  private pickKind(rng: () => number, ventEligible: boolean, taken: Set<DiscoveryId>): DiscoveryId | null {
    const eligible = KINDS.filter((definition) => {
      if (taken.has(definition.id)) return false;
      if (definition.zone === 'vent' && !ventEligible) return false;
      return true;
    });
    if (eligible.length === 0) return null;
    const byCategory = new Map<DiscoveryCategory, KindDefinition[]>();
    for (const definition of eligible) {
      const bucket = byCategory.get(definition.category) ?? [];
      bucket.push(definition);
      byCategory.set(definition.category, bucket);
    }
    const categories = [...byCategory.keys()];
    const categoryWeights = categories.map((category) =>
      (byCategory.get(category) ?? []).reduce((sum, definition) => sum + definition.weight, 0));
    const totalWeight = categoryWeights.reduce((sum, weight) => sum + weight, 0);
    let cursor = rng() * totalWeight;
    let chosenCategory = categories[categories.length - 1];
    for (let index = 0; index < categories.length; index += 1) {
      cursor -= categoryWeights[index];
      if (cursor <= 0) { chosenCategory = categories[index]; break; }
    }
    const bucket = byCategory.get(chosenCategory) ?? [];
    const bucketTotal = bucket.reduce((sum, definition) => sum + definition.weight, 0);
    let bucketCursor = rng() * bucketTotal;
    for (const definition of bucket) {
      bucketCursor -= definition.weight;
      if (bucketCursor <= 0) return definition.id;
    }
    return bucket[bucket.length - 1]?.id ?? null;
  }

  private sampleY(zone: KindDefinition['zone'], rng: () => number): number {
    if (zone === 'shelf') return 1 - rng() * 30;
    if (zone === 'mid') return -20 - rng() * 54;
    if (zone === 'vent') return -57 - rng() * 41;
    return -10 - rng() * 82;
  }

  private settlePosition(x: number, y: number, zone: KindDefinition['zone']): { x: number; y: number } | null {
    const offsets = [0, -0.5, 0.5, -1, 1, -1.5];
    for (const offset of offsets) {
      const candidateY = y + offset;
      if (candidateY <= WORLD_MIN_Y + 2 || candidateY >= BASE_SEA_LEVEL - 2) continue;
      const material = this.sampleMaterial(x, candidateY);
      const acceptable = zone === 'dark'
        ? isBuriable(material) || material === MaterialId.Water
        : isBuriable(material);
      if (acceptable) return { x, y: candidateY };
    }
    return null;
  }

  private acquireVisual(kindId: DiscoveryId): THREE.Group {
    const pool = this.visualPool.get(kindId);
    const reused = pool?.pop();
    if (reused) return reused;
    return this.buildVisual(kindId);
  }

  private releaseVisual(kindId: DiscoveryId, visual: THREE.Group): void {
    visual.visible = false;
    this.scene.remove(visual);
    const pool = this.visualPool.get(kindId) ?? [];
    pool.push(visual);
    this.visualPool.set(kindId, pool);
  }

  private halo(color: string): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.4, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, side: THREE.DoubleSide }),
    );
    mesh.renderOrder = 17;
    mesh.userData.tbDiscHalo = true;
    return mesh;
  }

  private buildVisual(kindId: DiscoveryId): THREE.Group {
    const definition = KIND_MAP.get(kindId)!;
    const group = new THREE.Group();
    const tint = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.72, metalness: 0.12 });
    const glowColor = new THREE.Color(definition.color);
    switch (kindId) {
      case 'ammonite-vault': {
        for (let index = 0; index < 3; index += 1) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22 - index * 0.055, 0.032, 8, 20), tint);
          coil.scale.z = 0.35;
          coil.position.z = index * 0.02;
          group.add(coil);
        }
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), tint);
        tip.position.set(-0.24, -0.02, 0.05);
        tip.rotation.z = Math.PI * 0.62;
        group.add(tip);
        break;
      }
      case 'vertebra-column': {
        for (let index = 0; index < 4; index += 1) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 8, 14), tint);
          ring.position.y = -0.18 + index * 0.12;
          ring.rotation.x = Math.PI * 0.5;
          group.add(ring);
        }
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 7), tint);
        spine.position.y = 0.32;
        group.add(spine);
        break;
      }
      case 'ancestor-blade': {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.52, 6), tint);
        blade.rotation.z = Math.PI * 0.5;
        blade.scale.y = 1;
        group.add(blade);
        const binding = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.14), new THREE.MeshStandardMaterial({ color: '#56654b', roughness: 1 }));
        binding.position.set(-0.1, 0, 0.01);
        group.add(binding);
        break;
      }
      case 'knapped-core': {
        for (let index = 0; index < 3; index += 1) {
          const flake = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 5), tint);
          const angle = (index / 3) * Math.PI * 2;
          flake.position.set(Math.cos(angle) * 0.1, -0.06 + index * 0.07, Math.sin(angle) * 0.06);
          flake.rotation.z = 0.7 + index * 0.4;
          group.add(flake);
        }
        break;
      }
      case 'iron-ribframe': {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 22, Math.PI * 1.15), tint);
        rib.material.metalness = 0.65;
        rib.material.roughness = 0.5;
        rib.rotation.z = Math.PI * 0.42;
        group.add(rib);
        const keel = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), tint);
        keel.position.set(-0.26, -0.16, 0);
        keel.rotation.z = Math.PI * 0.75;
        group.add(keel);
        break;
      }
      case 'cargo-glass': {
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.44),
          new THREE.MeshStandardMaterial({ color: definition.color, transparent: true, opacity: 0.55, emissive: glowColor, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.25 }),
        );
        pane.rotation.y = 0.4;
        group.add(pane);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 8, 20), tint);
        rim.rotation.x = Math.PI * 0.5;
        rim.position.y = -0.2;
        group.add(rim);
        break;
      }
      case 'compass-rose': {
        for (let index = 0; index < 2; index += 1) {
          const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.07), tint.clone());
          spoke.material.side = THREE.DoubleSide;
          spoke.rotation.z = index * Math.PI * 0.5;
          group.add(spoke);
        }
        const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 22), tint);
        bezel.material.metalness = 0.7;
        bezel.material.roughness = 0.3;
        group.add(bezel);
        break;
      }
      case 'vent-chimney-cap': {
        const stack = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.44, 9, 1, true), tint);
        stack.material.side = THREE.DoubleSide;
        group.add(stack);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 18), tint);
        collar.rotation.x = Math.PI * 0.5;
        collar.position.y = 0.16;
        group.add(collar);
        break;
      }
      case 'sulfur-rosette': {
        for (let index = 0; index < 6; index += 1) {
          const petal = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 5), tint);
          const angle = (index / 6) * Math.PI * 2;
          petal.position.set(Math.cos(angle) * 0.15, Math.sin(angle) * 0.15, 0);
          petal.rotation.z = angle - Math.PI * 0.5;
          group.add(petal);
        }
        break;
      }
      case 'glass-sponge-garden': {
        for (let index = 0; index < 3; index += 1) {
          const vase = new THREE.Mesh(new THREE.TorusGeometry(0.09 + index * 0.015, 0.03, 8, 16), tint);
          vase.position.set(-0.18 + index * 0.17, -0.08, index * 0.04);
          group.add(vase);
        }
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.2), tint);
        floor.material.transparent = true;
        floor.material.opacity = 0.4;
        floor.position.y = -0.2;
        group.add(floor);
        break;
      }
      case 'sporecap-lantern': {
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.2, 12),
          new THREE.MeshStandardMaterial({ color: definition.color, emissive: glowColor, emissiveIntensity: 0.85, roughness: 0.5 }),
        );
        cap.position.y = 0.14;
        group.add(cap);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.26, 8), tint);
        stalk.position.y = -0.08;
        group.add(stalk);
        break;
      }
      case 'ghost-duster-colony': {
        for (let index = 0; index < 4; index += 1) {
          const fan = new THREE.Mesh(
            new THREE.PlaneGeometry(0.16, 0.34),
            new THREE.MeshStandardMaterial({ color: definition.color, transparent: true, opacity: 0.38, emissive: glowColor, emissiveIntensity: 0.22, side: THREE.DoubleSide }),
          );
          const angle = (index / 4) * Math.PI * 2;
          fan.position.set(Math.cos(angle) * 0.12, 0.02, Math.sin(angle) * 0.05);
          fan.rotation.z = Math.cos(angle) * 0.5;
          group.add(fan);
        }
        break;
      }
      case 'slate-long-warming':
      case 'slate-first-hands': {
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), tint);
        slab.material.side = THREE.DoubleSide;
        slab.material.roughness = 0.94;
        group.add(slab);
        for (let index = 0; index < 3; index += 1) {
          const line = new THREE.Mesh(
            new THREE.PlaneGeometry(0.28, 0.028),
            new THREE.MeshBasicMaterial({ color: '#20343a', transparent: true, opacity: 0.7 }),
          );
          line.position.set(0, 0.12 - index * 0.11, 0.012);
          line.renderOrder = 18;
          group.add(line);
        }
        break;
      }
    }
    group.add(this.halo(definition.color));
    return group;
  }

  private buildSparklePool(): void {
    for (let burstIndex = 0; burstIndex < 3; burstIndex += 1) {
      const count = 22;
      const positions = new Float32Array(count * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: 0.1,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: '#ffffff',
      });
      const points = new THREE.Points(geometry, material);
      points.visible = false;
      points.frustumCulled = false;
      this.scene.add(points);
      this.sparkles.push({
        points,
        velocities: new Float32Array(count * 3),
        ages: new Float32Array(count),
        active: false,
        life: 0.75,
      });
    }
  }

  private spawnSparkle(x: number, y: number, color: string): void {
    const burst = this.sparkles.find((candidate) => !candidate.active) ?? this.sparkles[0];
    if (!burst) return;
    const attribute = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    for (let index = 0; index < positions.length / 3; index += 1) {
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = 4.3;
      const angle = this.rng() * Math.PI * 2;
      const speed = 0.7 + this.rng() * 1.3;
      burst.velocities[index * 3] = Math.cos(angle) * speed;
      burst.velocities[index * 3 + 1] = Math.sin(angle) * speed * 0.8 + 0.4;
      burst.velocities[index * 3 + 2] = 0;
      burst.ages[index] = this.rng() * 0.12;
    }
    attribute.needsUpdate = true;
    if (burst.points.material instanceof THREE.PointsMaterial) {
      burst.points.material.color.set(color);
      burst.points.material.opacity = 1;
    }
    burst.points.visible = true;
    burst.active = true;
  }

  private stepSparkle(burst: SparkleBurst): void {
    if (!burst.active) return;
    const attribute = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    let alive = false;
    for (let index = 0; index < burst.ages.length; index += 1) {
      if (burst.ages[index] >= burst.life) continue;
      burst.ages[index] += 1 / 60;
      if (burst.ages[index] >= burst.life) continue;
      alive = true;
      positions[index * 3] += burst.velocities[index * 3] / 60;
      positions[index * 3 + 1] += burst.velocities[index * 3 + 1] / 60;
      burst.velocities[index * 3 + 1] -= 1.6 / 60;
    }
    attribute.needsUpdate = true;
    if (!alive) {
      burst.active = false;
      burst.points.visible = false;
      if (burst.points.material instanceof THREE.PointsMaterial) burst.points.material.opacity = 0;
      return;
    }
    if (burst.points.material instanceof THREE.PointsMaterial) {
      burst.points.material.opacity = Math.max(0, 1 - burst.ages.reduce((max, age) => Math.max(max, age), 0) / burst.life);
    }
  }

  private buildOverlay(): { root: HTMLDivElement; listHost: HTMLDivElement; countLabel: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'tb-disc-overlay';
    root.setAttribute('aria-hidden', 'true');
    const style = document.createElement('style');
    style.textContent = `
.tb-disc-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(3,14,18,.72);z-index:900;font-family:'Segoe UI',system-ui,sans-serif;color:#dff3ee}
.tb-disc-overlay.tb-disc-open{display:flex}
.tb-disc-panel{width:min(680px,92vw);max-height:84vh;display:flex;flex-direction:column;background:linear-gradient(160deg,#0a2a31,#071c22);border:1px solid #1f5a58;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.tb-disc-header{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #17453f}
.tb-disc-title{margin:0;font-size:17px;letter-spacing:.22em;color:#9ff0dd;font-weight:600}
.tb-disc-count{margin-left:auto;font-size:12px;color:#79b8ad;letter-spacing:.08em}
.tb-disc-close{background:#123c39;border:1px solid #2b6b64;color:#cdeee4;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;letter-spacing:.06em}
.tb-disc-close:hover{background:#1a4f49}
.tb-disc-body{overflow-y:auto;padding:12px 18px 18px;display:flex;flex-direction:column;gap:14px}
.tb-disc-category{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#63a99c;border-bottom:1px solid #14393a;padding-bottom:4px;margin-bottom:6px}
.tb-disc-entry{padding:8px 10px;border-radius:8px;background:rgba(10,42,48,.55);border:1px solid rgba(37,90,86,.5);margin-bottom:6px}
.tb-disc-entry.tb-disc-found{border-color:#3f8f7d;background:rgba(14,56,52,.65)}
.tb-disc-name{font-size:13px;font-weight:600;color:#cfe9df;letter-spacing:.04em}
.tb-disc-entry:not(.tb-disc-found) .tb-disc-name{color:#5f837c;opacity:.75}
.tb-disc-meta{font-size:11px;color:#6fa89c;margin-top:2px}
.tb-disc-lore{font-size:12px;line-height:1.55;color:#a9cdc2;margin-top:5px}
.tb-disc-footer{padding:8px 18px 12px;font-size:11px;color:#547f77;border-top:1px solid #17453f;letter-spacing:.05em}
`;
    root.appendChild(style);
    const panel = document.createElement('div');
    panel.className = 'tb-disc-panel';
    const header = document.createElement('div');
    header.className = 'tb-disc-header';
    const title = document.createElement('h2');
    title.className = 'tb-disc-title';
    title.textContent = 'CODEX OF THE TIDE';
    const countLabel = document.createElement('span');
    countLabel.className = 'tb-disc-count';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tb-disc-close';
    close.textContent = '✕ Close [Esc]';
    close.addEventListener('click', () => this.toggle(false));
    header.append(title, countLabel, close);
    const listHost = document.createElement('div');
    listHost.className = 'tb-disc-body';
    const footer = document.createElement('div');
    footer.className = 'tb-disc-footer';
    footer.textContent = 'Dig or drift close to reveal · press E to recover · finds echo the history of Pelagos-730.';
    panel.append(header, listHost, footer);
    root.appendChild(panel);
    return { root, listHost, countLabel };
  }

  private renderCodex(): void {
    while (this.listHost.firstChild) this.listHost.removeChild(this.listHost.firstChild);
    const recoveredKinds = new Set<DiscoveryId>();
    const firstFind = new Map<DiscoveryId, Placement>();
    for (const placement of this.placements) {
      if (!placement.recovered) continue;
      recoveredKinds.add(placement.kindId);
      const existing = firstFind.get(placement.kindId);
      if (!existing || (placement.dayFound ?? 99) < (existing.dayFound ?? 99)) firstFind.set(placement.kindId, placement);
    }
    this.countLabel.textContent = `${recoveredKinds.size} / ${KINDS.length} catalogued`;
    for (const category of CATEGORY_ORDER) {
      const heading = document.createElement('div');
      heading.className = 'tb-disc-category';
      heading.textContent = CATEGORY_TITLES[category];
      this.listHost.appendChild(heading);
      for (const definition of KINDS.filter((candidate) => candidate.category === category)) {
        const entry = document.createElement('div');
        const found = recoveredKinds.has(definition.id);
        entry.className = found ? 'tb-disc-entry tb-disc-found' : 'tb-disc-entry';
        const name = document.createElement('div');
        name.className = 'tb-disc-name';
        name.textContent = found ? definition.label : '???';
        entry.appendChild(name);
        if (found) {
          const placement = firstFind.get(definition.id)!;
          const meta = document.createElement('div');
          meta.className = 'tb-disc-meta';
          meta.textContent = `Day ${placement.dayFound ?? '?'} · longitude band ${placement.band} · x≈${Math.round(placement.x)}, depth≈${Math.round(BASE_SEA_LEVEL - placement.y)}m`;
          entry.appendChild(meta);
        }
        if (found) {
          const lore = document.createElement('div');
          lore.className = 'tb-disc-lore';
          lore.textContent = definition.lore;
          entry.appendChild(lore);
        }
        this.listHost.appendChild(entry);
      }
    }
  }
}
