import { PLANET_SEED, clamp, mulberry32 } from './data';
import type { ResourceKey } from './data';

export type Disposition = 'wary' | 'neutral' | 'curious' | 'trusting' | 'bonded';

export type RelationEventType =
  | 'trade-offer'
  | 'storm-warning'
  | 'den-contest'
  | 'food-theft'
  | 'cooperate'
  | 'turn-predator'
  | 'offspring';

export interface RelationStatusFlags {
  trading: boolean;
  cooperating: boolean;
  competitorForDen: boolean;
  thief: boolean;
  predatorToPlayer: boolean;
  mateCandidate: boolean;
}

export interface NearbySurvivor {
  id: string;
  name: string;
  x: number;
  y: number;
  distance: number;
  hunger?: number;
  ageYears?: number;
}

export interface RelationsUpdateContext {
  px: number;
  py: number;
  elapsed: number;
  storm: number;
  survivors: NearbySurvivor[];
  playerFoodCount: number;
  playerDenIds: string[];
  stormIncomingDays: number | null;
  museumDens?: number;
}

export interface RelationActionHandlers {
  trade(survivorId: string): void;
  gift(survivorId: string): void;
  mate(survivorId: string): void;
}

export interface RelationEvent {
  type: RelationEventType;
  survivorId: string;
  name: string;
  detail: string;
  want?: 'food';  give?: ResourceKey;
  giveQty?: number;
  stolenFood?: number;
  durationSec?: number;
  denId?: string;
  childId?: string;
}

export interface ActiveRelationEvent {
  type: RelationEventType;
  survivorId: string;
  detail: string;
}

export interface KnownRelation {
  id: string;
  name: string;
  trust: number;
  rivalry: number;
  disposition: Disposition;
  status: RelationStatusFlags;
  lastAction: string;
  lastActionDay: number;
}

export interface RelationsSnapshot {
  known: KnownRelation[];
  activeEvents: ActiveRelationEvent[];
}

export interface TradeOfferResult {
  accepted: boolean;
  detail: string;
  gainedItem?: ResourceKey;
  gainedQty?: number;
  trustAfter?: number;
}

export interface WarningResult {
  accepted: boolean;
  detail: string;
  trustAfter?: number;
}

export interface GiftResult {
  accepted: boolean;
  detail: string;
  trustAfter?: number;
  foodSpent: number;
}

export interface MateResult {
  accepted: boolean;
  detail: string;
  trustAfter?: number;
  childId?: string;
}

export interface BetrayResult {
  detail: string;
  trustAfter: number;
  rivalryAfter: number;
  turnedPredator: boolean;
}

interface PendingOffer {
  give: ResourceKey;
  qty: number;
  expiresAt: number;
}

interface LedgerEntry {
  id: string;
  name: string;
  x: number;
  y: number;
  trust: number;
  rivalry: number;
  status: RelationStatusFlags;
  lastAction: string;
  lastActionDay: number;
  interactionCooldownUntil: number;
  warnedThisStorm: boolean;
  pendingOffer: PendingOffer | null;
  cooperatingUntil: number;
  pairBonded: boolean;
  pairPartnerId: string | null;
  offspringIds: string[];
  lastSeenAt: number;
}

interface SerializedEntry {
  id: string;
  name: string;
  trust: number;
  rivalry: number;
  status: Partial<RelationStatusFlags>;
  lastAction: string;
  lastActionDay: number;
  interactionCooldownUntil: number;
  warnedThisStorm: boolean;
  cooperatingUntil: number;
  pairBonded: boolean;
  pairPartnerId: string | null;
  offspringIds: string[];
}

export interface SerializedRelations {
  version: 1;
  entries: SerializedEntry[];
}

const DAY_SECONDS = 90;
const TICK_RADIUS_M = 12;
const WIDGET_RANGE_M = 14;
const WIDGET_INTERVAL_SEC = 0.25;
const COOLDOWN_MIN_SEC = 20;
const COOLDOWN_JITTER_SEC = 12;
const OFFER_TTL_SEC = 45;
const STALE_SEC = 300;
const MATURE_YEARS = 2;

const TRADE_GOODS: Array<{ item: ResourceKey; weight: number }> = [
  { item: 'shellFragments', weight: 0.32 },
  { item: 'stone', weight: 0.26 },
  { item: 'fibers', weight: 0.26 },
  { item: 'salt', weight: 0.16 },
];

const GLYPHS: Record<Disposition, string> = {
  wary: '\u25E6',
  neutral: '\u25C7',
  curious: '\u25C6',
  trusting: '\u2726',
  bonded: '\u2726',
};

const GLYPH_COLORS: Record<Disposition, string> = {
  wary: '#e08a8a',
  neutral: '#cfe0dd',
  curious: '#8fd7c8',
  trusting: '#7be5d0',
  bonded: '#ffd27f',
};

function dispositionOf(trust: number): Disposition {
  if (trust < -30) return 'wary';
  if (trust > 75) return 'bonded';
  if (trust > 50) return 'trusting';
  if (trust > 20) return 'curious';
  return 'neutral';
}

export class SurvivorRelationsSystem {
  private readonly rng = mulberry32(PLANET_SEED + 10441);
  private readonly ledger = new Map<string, LedgerEntry>();
  private now = 0;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly rowRefs = new Map<string, { glyph: HTMLElement; name: HTMLElement; fill: HTMLElement; action: HTMLElement; actions: HTMLElement }>();
  private actionHandlers: RelationActionHandlers | null = null;

  setActionHandlers(handlers: RelationActionHandlers): void {
    this.actionHandlers = handlers;
  }

  hasPendingOffer(survivorId: string): boolean {
    const entry = this.ledger.get(survivorId);
    return Boolean(entry?.pendingOffer && this.now < entry.pendingOffer.expiresAt);
  }
  private readonly lastSeenAge = new Map<string, number>();
  private uiRoot: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private rowsHost: HTMLElement | null = null;
  private widgetAccumulator = 0;
  private nextChildId = 1;

  constructor(uiRoot?: HTMLElement) {
    if (uiRoot) this.attachUiRoot(uiRoot);
  }

  attachUiRoot(root: HTMLElement): void {
    this.uiRoot = root;
    if (this.panel) return;
    const panel = document.createElement('div');
    panel.dataset.ui = 'survivor-relations';
    Object.assign(panel.style, {
      position: 'absolute',
      left: '14px',
      bottom: '14px',
      zIndex: '40',
      display: 'none',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px 11px',
      borderRadius: '12px',
      background: 'rgba(5,19,23,0.82)',
      border: '1px solid rgba(125,238,216,0.30)',
      boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      fontFamily: 'inherit',
      fontSize: '11px',
      letterSpacing: '0.05em',
      color: '#cfe9e2',
      pointerEvents: 'none',
      userSelect: 'none',
      minWidth: '196px',
    } as Partial<CSSStyleDeclaration>);
    panel.addEventListener('pointerdown', (event) => event.stopPropagation());
    const title = document.createElement('div');
    Object.assign(title.style, {
      textTransform: 'uppercase',
      opacity: '0.72',
      fontSize: '9px',
      letterSpacing: '0.14em',
    } as Partial<CSSStyleDeclaration>);
    title.textContent = 'NEIGHBOR OCTOPI';
    const host = document.createElement('div');
    Object.assign(host.style, { display: 'flex', flexDirection: 'column', gap: '4px' } as Partial<CSSStyleDeclaration>);
    panel.append(title, host);
    root.appendChild(panel);
    this.panel = panel;
    this.rowsHost = host;
  }

  update(dt: number, ctx: RelationsUpdateContext): RelationEvent[] {
    if (dt <= 0) return [];
    this.now = ctx.elapsed;
    const museumAura = Math.min(3, Math.max(0, ctx.museumDens ?? 0));
    const events: RelationEvent[] = [];
    const seen = new Set<string>();
    let nearest = Infinity;
    for (const survivor of ctx.survivors) {
      nearest = Math.min(nearest, survivor.distance);
      seen.add(survivor.id);
      const entry = this.ensureEntry(survivor);
      entry.x = survivor.x;
      entry.y = survivor.y;
      entry.lastSeenAt = ctx.elapsed;
      if (entry.trust > 60 && !entry.status.mateCandidate && !entry.pairBonded) {
        entry.status.mateCandidate = true;
        entry.lastAction = entry.lastAction || 'circles close, arms relaxed';
        entry.lastActionDay = this.dayOf(ctx.elapsed);
      }
      if (ctx.stormIncomingDays === null && entry.warnedThisStorm) entry.warnedThisStorm = false;
      if (entry.cooperatingUntil > 0 && ctx.elapsed >= entry.cooperatingUntil && entry.status.cooperating) {
        entry.status.cooperating = false;
        entry.cooperatingUntil = 0;
      }
      if (entry.pendingOffer && ctx.elapsed >= entry.pendingOffer.expiresAt) {
        entry.pendingOffer = null;
        entry.status.trading = false;
      }
      if (museumAura > 0 && entry.trust < 60) {
        entry.trust = clamp(entry.trust + 0.05 * museumAura, -100, 100);
        if (this.rng() < 0.01 * museumAura && entry.lastAction !== 'visited your fossil gallery') {
          entry.lastAction = 'visited your fossil gallery';
          entry.lastActionDay = this.dayOf(ctx.elapsed);
        }
      }
      if (survivor.distance <= TICK_RADIUS_M && ctx.elapsed >= entry.interactionCooldownUntil && !entry.status.predatorToPlayer) {
        const event = this.decide(entry, ctx, typeof survivor.hunger === 'number' ? survivor.hunger : 70);
        entry.interactionCooldownUntil = ctx.elapsed + COOLDOWN_MIN_SEC + this.rng() * COOLDOWN_JITTER_SEC;
        if (event) events.push(event);
      } else if (entry.status.predatorToPlayer && survivor.distance <= TICK_RADIUS_M && ctx.elapsed >= entry.interactionCooldownUntil) {
        entry.interactionCooldownUntil = ctx.elapsed + COOLDOWN_MIN_SEC + this.rng() * COOLDOWN_JITTER_SEC;
      }
    }
    for (const [id, entry] of this.ledger) {
      if (seen.has(id)) continue;
      if (ctx.elapsed - entry.lastSeenAt > STALE_SEC) {
        entry.status.trading = false;
        entry.status.cooperating = false;
        entry.status.competitorForDen = false;
        entry.pendingOffer = null;
      }
    }
    this.widgetAccumulator += dt;
    if (this.widgetAccumulator >= WIDGET_INTERVAL_SEC) {
      this.widgetAccumulator = 0;
      this.refreshWidget(ctx.survivors, nearest <= WIDGET_RANGE_M);
    }
    return events;
  }

  acceptTrade(survivorId: string, offered: 'food'): TradeOfferResult {
    const entry = this.ledger.get(survivorId);
    if (!entry) {
      return { accepted: false, detail: `No known relationship with ${survivorId}.` };
    }
    if (!entry.pendingOffer || this.now >= entry.pendingOffer.expiresAt) {
      return { accepted: false, detail: `${entry.name} has no standing trade right now.` };
    }
    const gainedItem = entry.pendingOffer.give;
    const gainedQty = entry.pendingOffer.qty;
    entry.pendingOffer = null;
    entry.status.trading = false;
    entry.trust = clamp(entry.trust + 8, -100, 100);
    entry.rivalry = clamp(entry.rivalry - 6, 0, 100);
    entry.lastAction = 'traded food with you';
    entry.lastActionDay = this.dayOf(this.now);
    entry.interactionCooldownUntil = Math.min(entry.interactionCooldownUntil, this.now + 6);
    return {
      accepted: true,
      gainedItem,
      gainedQty,
      trustAfter: entry.trust,
      detail: `${entry.name} accepts the meal and passes ${gainedQty}\u00D7 ${gainedItem} from a skin pouch.`,
    };
  }

  shareWarningBack(survivorId: string): WarningResult {
    const entry = this.ledger.get(survivorId);
    if (!entry) {
      return { accepted: false, detail: `No known relationship with ${survivorId}.` };
    }
    entry.trust = clamp(entry.trust + 5, -100, 100);
    entry.rivalry = clamp(entry.rivalry - 2, 0, 100);
    entry.lastAction = 'exchanged storm signals with you';
    entry.lastActionDay = this.dayOf(this.now);
    return {
      accepted: true,
      trustAfter: entry.trust,
      detail: `${entry.name} reads your warning posture and settles. Trust deepens.`,
    };
  }

  offerFoodGift(survivorId: string): GiftResult {
    const entry = this.ledger.get(survivorId);
    if (!entry) {
      return { accepted: false, detail: `No known relationship with ${survivorId}.`, foodSpent: 0 };
    }
    entry.trust = clamp(entry.trust + 10, -100, 100);
    entry.rivalry = clamp(entry.rivalry - 4, 0, 100);
    entry.lastAction = 'received a food gift';
    entry.lastActionDay = this.dayOf(this.now);
    return {
      accepted: true,
      trustAfter: entry.trust,
      foodSpent: 1,
      detail: `${entry.name} takes the offered morsel sucker by sucker. Trust grows.`,
    };
  }

  tryMate(survivorId: string): MateResult {
    const entry = this.ledger.get(survivorId);
    if (!entry) {
      return { accepted: false, detail: `No known relationship with ${survivorId}.` };
    }
    if (entry.pairBonded) {
      return { accepted: false, trustAfter: entry.trust, detail: `${entry.name} has already bonded this season.` };
    }
    if (entry.trust <= 60) {
      return { accepted: false, trustAfter: entry.trust, detail: `${entry.name} does not trust you enough to brood (${Math.round(entry.trust)} trust, needs 60).` };
    }
    if (!this.isMature(entry)) {
      return { accepted: false, trustAfter: entry.trust, detail: `${entry.name} is still a hatchling and cannot brood.` };
    }
    entry.pairBonded = true;
    entry.pairPartnerId = entry.id;
    entry.status.mateCandidate = true;
    entry.lastAction = 'bonded as a mate';
    entry.lastActionDay = this.dayOf(this.now);
    const childId = `survivor-child-${this.nextChildId++}`;
    entry.offspringIds.push(childId);
    return {
      accepted: true,
      trustAfter: entry.trust,
      childId,
      detail: `${entry.name} accepts your brooding dance. A clutch is pledged \u2014 offspring ${childId}.`,
    };
  }

  betray(survivorId: string, name?: string): BetrayResult {
    const entry = this.ensureNamedEntry(survivorId, name ?? 'the rival');
    entry.trust = clamp(entry.trust - 55, -100, 100);
    entry.rivalry = clamp(entry.rivalry + 30, 0, 100);
    entry.status.trading = false;
    entry.status.cooperating = false;
    entry.pendingOffer = null;
    entry.pairBonded = false;
    entry.pairPartnerId = null;
    entry.lastAction = 'devoured kin witnessed';
    entry.lastActionDay = this.dayOf(this.now);
    let turnedPredator = false;
    if (entry.trust <= -60) {
      entry.status.predatorToPlayer = true;
      turnedPredator = true;
    }
    for (const [otherId, other] of this.ledger) {
      if (otherId === survivorId || other.status.predatorToPlayer) continue;
      if (this.now - other.lastSeenAt > STALE_SEC) continue;
      other.trust = clamp(other.trust - 6, -100, 100);
      other.rivalry = clamp(other.rivalry + 4, 0, 100);
      if (other.trust <= -60) other.status.predatorToPlayer = true;
    }
    return {
      detail: `${entry.name} watched you eat one of their own. Word spreads along the reef.`,
      trustAfter: entry.trust,
      rivalryAfter: entry.rivalry,
      turnedPredator,
    };
  }

  snapshot(px = 0, py = 0): RelationsSnapshot {
    const known: KnownRelation[] = [...this.ledger.values()]
      .map((entry) => ({
        entry,
        distance: Math.hypot(entry.x - px, entry.y - py),
      }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ entry }) => ({
        id: entry.id,
        name: entry.name,
        trust: Math.round(entry.trust),
        rivalry: Math.round(entry.rivalry),
        disposition: dispositionOf(entry.trust),
        status: { ...entry.status },
        lastAction: entry.lastAction,
        lastActionDay: entry.lastActionDay,
      }));
    const activeEvents: ActiveRelationEvent[] = [];
    for (const entry of this.ledger.values()) {
      if (entry.pendingOffer && this.now < entry.pendingOffer.expiresAt) {
        activeEvents.push({
          type: 'trade-offer',
          survivorId: entry.id,
          detail: `${entry.name} offers ${entry.pendingOffer.qty}\u00D7 ${entry.pendingOffer.give} for one food.`,
        });
      }
      if (entry.status.cooperating) {
        activeEvents.push({
          type: 'cooperate',
          survivorId: entry.id,
          detail: `${entry.name} hunts alongside you for ${Math.max(0, Math.round(entry.cooperatingUntil - this.now))}s more.`,
        });
      }
      if (entry.status.competitorForDen) {
        activeEvents.push({
          type: 'den-contest',
          survivorId: entry.id,
          detail: `${entry.name} is probing your den network.`,
        });
      }
      if (entry.status.predatorToPlayer) {
        activeEvents.push({
          type: 'turn-predator',
          survivorId: entry.id,
          detail: `${entry.name} hunts you.`,
        });
      }
      if (entry.status.thief) {
        activeEvents.push({
          type: 'food-theft',
          survivorId: entry.id,
          detail: `${entry.name} has stolen from your sling before.`,
        });
      }
    }
    return { known, activeEvents };
  }

  serialize(): SerializedRelations {
    return {
      version: 1,
      entries: [...this.ledger.values()].map((entry) => ({
        id: entry.id,
        name: entry.name,
        trust: entry.trust,
        rivalry: entry.rivalry,
        status: { ...entry.status },
        lastAction: entry.lastAction,
        lastActionDay: entry.lastActionDay,
        interactionCooldownUntil: entry.interactionCooldownUntil,
        warnedThisStorm: entry.warnedThisStorm,
        cooperatingUntil: entry.cooperatingUntil,
        pairBonded: entry.pairBonded,
        pairPartnerId: entry.pairPartnerId,
        offspringIds: [...entry.offspringIds],
      })),
    };
  }

  deserialize(value: unknown): void {
    this.ledger.clear();
    this.rows.clear();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    const entries = record['entries'];
    if (!Array.isArray(entries)) return;
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const id = typeof item['id'] === 'string' ? item['id'] : null;
      if (!id) continue;
      const flags = (item['status'] ?? {}) as Record<string, unknown>;
      const bool = (key: string): boolean => flags[key] === true;
      const entry: LedgerEntry = {
        id,
        name: typeof item['name'] === 'string' ? item['name'] : id,
        x: 0,
        y: 0,
        trust: clamp(typeof item['trust'] === 'number' ? item['trust'] : 0, -100, 100),
        rivalry: clamp(typeof item['rivalry'] === 'number' ? item['rivalry'] : 0, 0, 100),
        status: {
          trading: bool('trading'),
          cooperating: bool('cooperating'),
          competitorForDen: bool('competitorForDen'),
          thief: bool('thief'),
          predatorToPlayer: bool('predatorToPlayer'),
          mateCandidate: bool('mateCandidate'),
        },
        lastAction: typeof item['lastAction'] === 'string' ? item['lastAction'] : '',
        lastActionDay: typeof item['lastActionDay'] === 'number' ? item['lastActionDay'] : 0,
        interactionCooldownUntil: typeof item['interactionCooldownUntil'] === 'number' ? item['interactionCooldownUntil'] : 0,
        warnedThisStorm: item['warnedThisStorm'] === true,
        pendingOffer: null,
        cooperatingUntil: typeof item['cooperatingUntil'] === 'number' ? item['cooperatingUntil'] : 0,
        pairBonded: item['pairBonded'] === true,
        pairPartnerId: typeof item['pairPartnerId'] === 'string' ? item['pairPartnerId'] : null,
        offspringIds: Array.isArray(item['offspringIds']) ? item['offspringIds'].filter((child): child is string => typeof child === 'string') : [],
        lastSeenAt: 0,
      };
      this.nextChildId = Math.max(this.nextChildId, entry.offspringIds.length + 1);
      this.ledger.set(id, entry);
    }
  }

  private decide(entry: LedgerEntry, ctx: RelationsUpdateContext, hunger: number): RelationEvent | null {
    const day = this.dayOf(ctx.elapsed);
    if (entry.trust > -20 && entry.status.predatorToPlayer) {
      entry.status.predatorToPlayer = false;
      entry.lastAction = 'backed off from hunting you';
      entry.lastActionDay = day;
    }
    if (entry.trust <= -60 || (entry.rivalry > 80 && hunger < 30)) {
      if (!entry.status.predatorToPlayer) {
        entry.status.predatorToPlayer = true;
        entry.lastAction = 'turning hunter';
        entry.lastActionDay = day;
        return {
          type: 'turn-predator',
          survivorId: entry.id,
          name: entry.name,
          detail: `${entry.name} spreads its web and lowers its beak toward you. It no longer sees a neighbor.`,
        };
      }
      return null;
    }
    if (entry.trust <= -25 && hunger < 45 && ctx.playerFoodCount > 0) {
      entry.status.thief = true;
      entry.trust = clamp(entry.trust - 8, -100, 100);
      entry.lastAction = 'stole food from your sling';
      entry.lastActionDay = day;
      return {
        type: 'food-theft',
        survivorId: entry.id,
        name: entry.name,
        stolenFood: 1,
        detail: `${entry.name} darts an arm into your supply sling and steals one food. Trust sours further.`,
      };
    }
    if (!entry.status.competitorForDen && entry.trust <= -10 && entry.rivalry >= 35 && ctx.playerDenIds.length > 0) {
      const denId = ctx.playerDenIds[Math.floor(this.rng() * ctx.playerDenIds.length)] ?? ctx.playerDenIds[0];
      entry.status.competitorForDen = true;
      entry.lastAction = 'contesting your den';
      entry.lastActionDay = day;
      return {
        type: 'den-contest',
        survivorId: entry.id,
        name: entry.name,
        denId,
        detail: `${entry.name} eyes ${denId} and starts hauling stones toward it. Rivalry sharpens.`,
      };
    }
    if (ctx.stormIncomingDays !== null && entry.trust > 15 && !entry.warnedThisStorm) {
      entry.warnedThisStorm = true;
      entry.trust = clamp(entry.trust + 6, -100, 100);
      entry.lastAction = 'warned you of the coming surge';
      entry.lastActionDay = day;
      return {
        type: 'storm-warning',
        survivorId: entry.id,
        name: entry.name,
        detail: `${entry.name} flashes pale down every arm and points a tip toward open water \u2014 surge weather in about ${ctx.stormIncomingDays.toFixed(1)} days.`,
      };
    }
    if (entry.trust > 25 && ctx.playerFoodCount >= 2) {
      const good = this.pickTradeGood();
      const qty = 1 + (this.rng() < 0.35 ? 1 : 0);
      entry.pendingOffer = { give: good, qty, expiresAt: ctx.elapsed + OFFER_TTL_SEC };
      entry.status.trading = true;
      entry.lastAction = `offered ${qty}\u00D7 ${good} for food`;
      entry.lastActionDay = day;
      return {
        type: 'trade-offer',
        survivorId: entry.id,
        name: entry.name,
        want: 'food',
        give: good,
        giveQty: qty,
        detail: `${entry.name} holds out ${qty}\u00D7 ${good} and gestures at your supply sling. One food for the lot.`,
      };
    }
    if (entry.trust > 45 && !entry.status.cooperating) {
      entry.status.cooperating = true;
      entry.cooperatingUntil = ctx.elapsed + 30;
      entry.lastAction = 'joined your hunt';
      entry.lastActionDay = day;
      return {
        type: 'cooperate',
        survivorId: entry.id,
        name: entry.name,
        durationSec: 30,
        detail: `${entry.name} falls in beside your mantle, herding prey toward your arms. Group-hunt bonus for 30s.`,
      };
    }
    entry.lastAction = entry.lastAction || 'drifts watchfully nearby';
    entry.lastActionDay = day;
    return null;
  }

  private pickTradeGood(): ResourceKey {
    const roll = this.rng();
    let cumulative = 0;
    for (const candidate of TRADE_GOODS) {
      cumulative += candidate.weight;
      if (roll <= cumulative) return candidate.item;
    }
    return 'shellFragments';
  }

  private isMature(entry: LedgerEntry): boolean {
    const source = this.lastSeenAge.get(entry.id);
    if (typeof source === 'number') return source >= MATURE_YEARS;
    return true;
  }

  private ensureEntry(survivor: NearbySurvivor): LedgerEntry {
    let entry = this.ledger.get(survivor.id);
    if (!entry) {
      entry = {
        id: survivor.id,
        name: survivor.name,
        x: survivor.x,
        y: survivor.y,
        trust: 0,
        rivalry: 0,
        status: {
          trading: false,
          cooperating: false,
          competitorForDen: false,
          thief: false,
          predatorToPlayer: false,
          mateCandidate: false,
        },
        lastAction: '',
        lastActionDay: 0,
        interactionCooldownUntil: this.now + 4 + this.rng() * 6,
        warnedThisStorm: false,
        pendingOffer: null,
        cooperatingUntil: 0,
        pairBonded: false,
        pairPartnerId: null,
        offspringIds: [],
        lastSeenAt: this.now,
      };
      this.ledger.set(survivor.id, entry);
    }
    entry.name = survivor.name;
    if (typeof survivor.ageYears === 'number') this.lastSeenAge.set(survivor.id, survivor.ageYears);
    return entry;
  }

  private ensureNamedEntry(id: string, name: string): LedgerEntry {
    let entry = this.ledger.get(id);
    if (!entry) {
      entry = {
        id,
        name,
        x: 0,
        y: 0,
        trust: 0,
        rivalry: 0,
        status: {
          trading: false,
          cooperating: false,
          competitorForDen: false,
          thief: false,
          predatorToPlayer: false,
          mateCandidate: false,
        },
        lastAction: '',
        lastActionDay: 0,
        interactionCooldownUntil: this.now,
        warnedThisStorm: false,
        pendingOffer: null,
        cooperatingUntil: 0,
        pairBonded: false,
        pairPartnerId: null,
        offspringIds: [],
        lastSeenAt: this.now,
      };
      this.ledger.set(id, entry);
    }
    return entry;
  }

  private dayOf(elapsed: number): number {
    return Math.floor(Math.max(0, elapsed) / DAY_SECONDS) + 1;
  }

  private refreshWidget(survivors: NearbySurvivor[], visible: boolean): void {
    if (!this.panel || !this.rowsHost) return;
    this.panel.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    const near = survivors.filter((survivor) => survivor.distance <= WIDGET_RANGE_M).sort((a, b) => a.distance - b.distance).slice(0, 5);
    const live = new Set(near.map((survivor) => survivor.id));
    for (const [id, row] of this.rows) {
      if (!live.has(id)) {
        row.remove();
        this.rows.delete(id);
      }
    }
    for (const survivor of near) {
      const entry = this.ledger.get(survivor.id);
      if (!entry) continue;
      const disposition = dispositionOf(entry.trust);
      let row = this.rows.get(survivor.id);
      if (!row) {
        row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '14px 58px 54px 1fr';
        row.style.alignItems = 'center';
        row.style.gap = '6px';
        const glyph = document.createElement('span');
        const name = document.createElement('b');
        const barShell = document.createElement('span');
        Object.assign(barShell.style, {
          width: '54px',
          height: '5px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.10)',
          overflow: 'hidden',
          display: 'inline-block',
        } as Partial<CSSStyleDeclaration>);
        const fill = document.createElement('i');
        fill.style.display = 'block';
        fill.style.height = '100%';
        fill.style.borderRadius = '999px';
        barShell.appendChild(fill);
        const action = document.createElement('em');
        Object.assign(action.style, { fontStyle: 'normal', opacity: '0.78', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as Partial<CSSStyleDeclaration>);
        const actions = document.createElement('span');
        Object.assign(actions.style, { display: 'flex', gap: '3px', pointerEvents: 'auto' } as Partial<CSSStyleDeclaration>);
        const makeButton = (label: string, title: string, run: () => void): HTMLButtonElement => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.title = title;
          button.setAttribute('aria-label', `${title} · ${survivor.name}`);
          Object.assign(button.style, {
            background: 'rgba(15,64,58,0.9)',
            border: '1px solid rgba(125,238,216,0.4)',
            borderRadius: '6px',
            color: '#baf3e2',
            font: 'inherit',
            fontSize: '9px',
            padding: '2px 6px',
            cursor: 'pointer',
          } as Partial<CSSStyleDeclaration>);
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            run();
          });
          return button;
        };
        actions.append(
          makeButton('Trade', 'Accept their trade offer', () => this.actionHandlers?.trade(survivor.id)),
          makeButton('Gift', 'Offer one food', () => this.actionHandlers?.gift(survivor.id)),
          makeButton('Mate', 'Brood a clutch together', () => this.actionHandlers?.mate(survivor.id)),
        );
        row.append(glyph, name, barShell, action, actions);
        this.rowsHost.appendChild(row);
        this.rows.set(survivor.id, row);
        this.rowRefs.set(survivor.id, { glyph, name, fill, action, actions });
      }
      const refs = this.rowRefs.get(survivor.id)!;
      refs.glyph.textContent = GLYPHS[disposition];
      refs.glyph.style.color = GLYPH_COLORS[disposition];
      refs.name.textContent = survivor.name;
      const percent = Math.round(((entry.trust + 100) / 200) * 100);
      refs.fill.style.width = `${percent}%`;
      refs.fill.style.background = entry.trust < 0 ? '#d96a6a' : '#63d98d';
      refs.action.textContent = entry.lastAction || 'watching';
      refs.action.title = `${disposition} \u00B7 trust ${Math.round(entry.trust)} \u00B7 rivalry ${Math.round(entry.rivalry)}`;
      const tradeButton = refs.actions.children[0] as HTMLButtonElement;
      tradeButton.disabled = !this.hasPendingOffer(survivor.id);
      tradeButton.style.opacity = tradeButton.disabled ? '0.35' : '1';
    }
  }
}
