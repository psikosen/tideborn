export type JournalKind = 'kelp' | 'fish' | 'birds' | 'snakes' | 'sediment' | 'storm' | 'general';

export interface EcosystemStateShape {
  kelpCover: number;
  shellfish: number;
  smallFish: number;
  birds: number;
  snakes: number;
  sedimentStability: number;
}

export interface JournalEntry {
  id: string;
  day: number;
  elapsedSeconds: number;
  kind: JournalKind;
  title: string;
  detail: string;
  concepts: string[];
}

export interface EcologyConcept {
  id: string;
  name: string;
  description: string;
}

export interface EcologySnapshot {
  entryCount: number;
  latestTitle: string;
  unlockedConcepts: string[];
  totalConcepts: number;
}

export interface EcologyJournalSave {
  version: 1;
  entries: JournalEntry[];
  unlockedConcepts: string[];
}

interface Sample {
  elapsed: number;
  state: EcosystemStateShape;
}

type TrendWord = 'steadily' | 'sharply' | 'slightly';

const DAY_LENGTH_SECONDS = 90;
const ENTRY_CAP = 120;
const HISTORY_LIMIT = 8;
const TREND_WINDOW_SECONDS = 150;

const CONCEPTS: EcologyConcept[] = [
  { id: 'trophic-shelter', name: 'Trophic Shelter', description: 'Kelp canopy shelters small fish; cutting it strips their refuge.' },
  { id: 'canopy-dependence', name: 'Canopy Dependence', description: 'After canopy thins, fish losses continue for some time.' },
  { id: 'predator-release', name: 'Predator Release', description: 'Removing one predator lets its prey multiply unchecked.' },
  { id: 'aerial-pressure', name: 'Aerial Pressure', description: 'With snakes gone, ground nests survive and bird numbers swell.' },
  { id: 'sediment-smothering', name: 'Sediment Smothering', description: 'Loose silt drifts over shell beds and suffocates them.' },
  { id: 'storm-canopy-loss', name: 'Storm Canopy Loss', description: 'Storm surge rips at holdfasts and churns the sea floor.' },
  { id: 'tidepool-resilience', name: 'Tidepool Resilience', description: 'Given shelter and time, populations rebound.' },
];

const KIND_CLASS: Record<JournalKind, string> = {
  kelp: 'kelp',
  fish: 'fish',
  birds: 'birds',
  snakes: 'snakes',
  sediment: 'sediment',
  storm: 'storm',
  general: 'general',
};

const STYLE_ID = 'eco-journal-style';
const OVERLAY_CLASS = 'eco-journal-overlay';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${OVERLAY_CLASS}{position:fixed;inset:0;z-index:900;display:none;align-items:center;justify-content:center;background:rgba(2,10,12,0.72);backdrop-filter:blur(3px);font-family:"Segoe UI",system-ui,sans-serif;}
.${OVERLAY_CLASS}.eco-journal-open{display:flex;}
.eco-journal-panel{width:min(680px,92vw);max-height:84vh;display:flex;flex-direction:column;background:linear-gradient(165deg,#0a2124 0%,#07181b 55%,#051114 100%);border:1px solid rgba(94,230,196,0.22);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,0.65),inset 0 0 90px rgba(11,46,44,0.5);color:#d8cfae;padding:22px 24px 18px;}
.eco-journal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-bottom:1px solid rgba(94,230,196,0.16);padding-bottom:12px;}
.eco-journal-eyebrow{font-family:ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace;font-size:10px;letter-spacing:0.32em;color:#5ee6c4;text-transform:uppercase;margin-bottom:6px;}
.eco-journal-head h2{margin:0;font-family:ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace;font-size:22px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#efe7c6;text-shadow:0 0 18px rgba(94,230,196,0.25);}
.eco-journal-sub{margin:6px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.12em;color:#7fa39d;}
.eco-journal-close{background:none;border:1px solid rgba(94,230,196,0.28);color:#bfe8dd;width:34px;height:34px;border-radius:9px;font-size:19px;line-height:1;cursor:pointer;flex:none;}
.eco-journal-close:hover{background:rgba(94,230,196,0.12);}
.eco-journal-filters{display:flex;flex-wrap:wrap;gap:6px;padding:12px 0 10px;}
.eco-journal-filter{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#9db8b0;background:rgba(255,255,255,0.03);border:1px solid rgba(148,190,180,0.22);border-radius:999px;padding:5px 11px;cursor:pointer;}
.eco-journal-filter:hover{border-color:rgba(94,230,196,0.5);}
.eco-journal-filter.eco-journal-active{background:rgba(94,230,196,0.14);color:#eafff7;border-color:#5ee6c4;}
.eco-journal-concepts h3{margin:2px 0 8px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.3em;color:#5ee6c4;text-transform:uppercase;}
.eco-journal-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
.eco-journal-chip{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.1em;border-radius:999px;padding:4px 10px;border:1px solid rgba(94,230,196,0.45);color:#dffef3;background:rgba(94,230,196,0.1);cursor:help;}
.eco-journal-chip.eco-journal-locked{border-style:dashed;border-color:rgba(148,178,170,0.3);color:#5f7571;background:rgba(255,255,255,0.02);}
.eco-journal-list{overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:6px;scrollbar-width:thin;scrollbar-color:rgba(94,230,196,0.35) transparent;}
.eco-journal-list::-webkit-scrollbar{width:6px;}
.eco-journal-list::-webkit-scrollbar-thumb{background:rgba(94,230,196,0.3);border-radius:3px;}
.eco-journal-entry{background:rgba(6,20,22,0.66);border:1px solid rgba(148,190,180,0.14);border-left:3px solid var(--eco-kind-color,#5ee6c4);border-radius:8px;padding:9px 12px;}
.eco-journal-entry.eco-journal-kind-kelp{--eco-kind-color:#6fd08c;}
.eco-journal-entry.eco-journal-kind-fish{--eco-kind-color:#63c7e8;}
.eco-journal-entry.eco-journal-kind-birds{--eco-kind-color:#e8c46a;}
.eco-journal-entry.eco-journal-kind-snakes{--eco-kind-color:#d98a5f;}
.eco-journal-entry.eco-journal-kind-sediment{--eco-kind-color:#c2a878;}
.eco-journal-entry.eco-journal-kind-storm{--eco-kind-color:#8fb7d9;}
.eco-journal-entry.eco-journal-kind-general{--eco-kind-color:#9db3ad;}
.eco-journal-entry-top{display:flex;align-items:center;gap:10px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.18em;color:#7fa39d;text-transform:uppercase;}
.eco-journal-entry-top .eco-journal-tag{color:var(--eco-kind-color,#5ee6c4);}
.eco-journal-entry h4{margin:5px 0 3px;font-size:14px;font-weight:600;color:#efe7c6;}
.eco-journal-entry p{margin:0 0 4px;font-size:12.5px;line-height:1.5;color:#c9c2a4;}
.eco-journal-entry-concepts{display:flex;gap:5px;flex-wrap:wrap;}
.eco-journal-empty{padding:26px 10px;text-align:center;font-size:13px;color:#6f8781;font-style:italic;}
`;
  document.head.appendChild(style);
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function isJournalKind(value: unknown): value is JournalKind {
  return value === 'kelp' || value === 'fish' || value === 'birds' || value === 'snakes'
    || value === 'sediment' || value === 'storm' || value === 'general';
}

function sanitizeEntry(value: unknown): JournalEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.detail !== 'string') return null;
  if (!isJournalKind(raw.kind)) return null;
  const elapsed = typeof raw.elapsedSeconds === 'number' && Number.isFinite(raw.elapsedSeconds) ? raw.elapsedSeconds : 0;
  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id: raw.id,
    day: Math.floor(elapsed / DAY_LENGTH_SECONDS) + 1,
    elapsedSeconds: elapsed,
    kind: raw.kind,
    title: raw.title,
    detail: raw.detail,
    concepts,
  };
}

export class EcologyJournal {
  private entries: JournalEntry[] = [];
  private unlocked = new Set<string>();
  private history: Sample[] = [];
  private cooldowns = new Map<string, number>();
  private counter = 0;
  private lastKelpDropElapsed: number | null = null;
  private snakeBaseline: number | null = null;
  private overlay: HTMLDivElement | null = null;
  private listElement: HTMLElement | null = null;
  private chipsElement: HTMLElement | null = null;
  private subElement: HTMLElement | null = null;
  private filtersElement: HTMLElement | null = null;
  private activeFilter: JournalKind | 'all' = 'all';
  private openState = false;

  constructor() {
    injectStyles();
    this.buildPanel();
    window.addEventListener('keydown', (event) => {
      if (!this.openState) return;
      if (event.key === 'Escape' || event.code === 'KeyP') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle(false);
      }
    }, true);
  }

  observeEcosystem(prev: EcosystemStateShape, next: EcosystemStateShape, elapsedSeconds: number): JournalEntry[] {
    const fresh: JournalEntry[] = [];
    this.pushSample(next, elapsedSeconds);
    if (this.snakeBaseline === null) this.snakeBaseline = prev.snakes;

    const dKelp = prev.kelpCover - next.kelpCover;
    const dFish = prev.smallFish - next.smallFish;
    const dSnakes = prev.snakes - next.snakes;
    const dBirds = next.birds - prev.birds;
    const dSediment = prev.sedimentStability - next.sedimentStability;

    if (dKelp >= 4 && this.ready('kelp-drop', elapsedSeconds, 10)) {
      this.lastKelpDropElapsed = elapsedSeconds;
      const trend = this.trendLabel((state) => state.kelpCover, elapsedSeconds);
      const fishNote = dFish > 0 ? ` Small fish dipped ${Math.round(dFish)} alongside the cut.` : '';
      fresh.push(this.push('kelp',
        'Kelp loss reduced fish shelter',
        `Kelp cover fell ${trend} (${prev.kelpCover.toFixed(0)} → ${next.kelpCover.toFixed(0)}). With a thinner canopy the reef offers little cover, so small fish numbers tend to slide in coming ticks.${fishNote}`,
        elapsedSeconds, 'trophic-shelter'));
    }

    if (dFish > 0 && this.lastKelpDropElapsed !== null
      && elapsedSeconds - this.lastKelpDropElapsed <= 50
      && this.ready('fish-slide', elapsedSeconds, 30)) {
      fresh.push(this.push('fish',
        'Thinning fronds, thinning schools',
        'Fewer kelp fronds mean fewer hiding spots — fish numbers keep sliding.',
        elapsedSeconds, 'canopy-dependence'));
    }

    if (dSnakes >= 2 && this.ready('snake-drop', elapsedSeconds, 40)) {
      fresh.push(this.push('snakes',
        'Fewer snakes patrolling the rocks',
        'Fewer snakes patrolling the rocks — bird numbers are climbing.',
        elapsedSeconds, 'predator-release'));
    }

    if (dBirds >= 3 && this.ready('bird-surge', elapsedSeconds, 40)
      && ((this.snakeBaseline !== null && this.snakeBaseline - next.snakes >= 2) || next.snakes <= 3)) {
      fresh.push(this.push('birds',
        'Birds crowd the quiet shore',
        `Snake patrols have thinned to ${next.snakes.toFixed(0)}, so ground nests go unrobbed and the flock swells unchecked.`,
        elapsedSeconds, 'aerial-pressure'));
    }

    if (dSediment >= 6 && this.ready('sediment-drop', elapsedSeconds, 30)) {
      const trend = this.trendLabel((state) => state.sedimentStability, elapsedSeconds);
      const link = prev.shellfish - next.shellfish > 0
        ? ' Shellfish counts slipped as silt settled over their beds.'
        : ' Watch shellfish beds — drifting silt can smother them.';
      fresh.push(this.push('sediment',
        'Looser sediment smothers shell beds',
        `Sediment loosened ${trend} (${prev.sedimentStability.toFixed(0)} → ${next.sedimentStability.toFixed(0)}).${link}`,
        elapsedSeconds, 'sediment-smothering'));
    }

    if (next.kelpCover - prev.kelpCover >= 4 && this.ready('kelp-recover', elapsedSeconds, 60)) {
      fresh.push(this.push('kelp',
        'Kelp canopy regains depth',
        'New fronds unfold where the water settled; shelter for small fish is growing back.',
        elapsedSeconds, 'tidepool-resilience'));
    }

    if (prev.sedimentStability - next.sedimentStability <= -6 && this.ready('sediment-recover', elapsedSeconds, 60)) {
      fresh.push(this.push('sediment',
        'Sediment firms up around the holdfasts',
        'Pressed mineral and regrown roots bind the floor again; shell beds can breathe.',
        elapsedSeconds, 'tidepool-resilience'));
    }

    if (next.smallFish - prev.smallFish >= 5 && this.ready('fish-recover', elapsedSeconds, 60)) {
      fresh.push(this.push('fish',
        'Fish schools rebuild in sheltered water',
        'Spawning among recovered fronds, the school replenishes itself faster than predators take it.',
        elapsedSeconds, 'tidepool-resilience'));
    }

    return fresh;
  }

  recordStorm(strength: number, elapsedSeconds: number): void {
    if (strength < 0.3) return;
    if (!this.ready('storm', elapsedSeconds, 25)) return;
    if (strength >= 0.85) {
      this.push('storm',
        'The storm tore at the kelp canopy',
        'Peak gusts rip at holdfasts and churn the sea floor. Expect kelp cover to fall and loosened sediment to drift over shell beds.',
        elapsedSeconds, 'storm-canopy-loss');
    } else if (strength >= 0.55) {
      this.push('storm',
        'Storm surge batters the shallows',
        'Waves wrench at anchored fronds and stir the sand. Sheltered fish bunch tighter while the water stays turbid.',
        elapsedSeconds, 'storm-canopy-loss');
    } else {
      this.push('storm',
        'Wind-driven chop troubles the coast',
        'A long swell worries the shoreline; young kelp flex hard and loose sediment creeps downslope.',
        elapsedSeconds, undefined);
    }
  }

  record(kind: JournalKind, title: string, detail: string, elapsedSeconds: number): void {
    this.push(kind, title, detail, elapsedSeconds, undefined);
  }

  toggle(force?: boolean): void {
    this.openState = force ?? !this.openState;
    if (!this.overlay) this.buildPanel();
    this.overlay!.classList.toggle('eco-journal-open', this.openState);
    this.overlay!.setAttribute('aria-hidden', String(!this.openState));
    if (this.openState) this.render();
  }

  isOpen(): boolean {
    return this.openState;
  }

  snapshot(px: number, py: number): EcologySnapshot {
    void px;
    void py;
    return {
      entryCount: this.entries.length,
      latestTitle: this.entries[0]?.title ?? '',
      unlockedConcepts: CONCEPTS.filter((concept) => this.unlocked.has(concept.id)).map((concept) => concept.id),
      totalConcepts: CONCEPTS.length,
    };
  }

  serialize(): EcologyJournalSave {
    return {
      version: 1,
      entries: this.entries.map((entry) => ({ ...entry })),
      unlockedConcepts: CONCEPTS.filter((concept) => this.unlocked.has(concept.id)).map((concept) => concept.id),
    };
  }

  deserialize(value: unknown): void {
    this.entries = [];
    this.unlocked.clear();
    this.history = [];
    this.cooldowns.clear();
    this.lastKelpDropElapsed = null;
    this.snakeBaseline = null;
    if (typeof value !== 'object' || value === null) return;
    const raw = value as Record<string, unknown>;
    if (Array.isArray(raw.entries)) {
      this.entries = raw.entries.map(sanitizeEntry).filter((entry): entry is JournalEntry => entry !== null)
        .sort((a, b) => b.elapsedSeconds - a.elapsedSeconds)
        .slice(0, ENTRY_CAP);
    }
    if (Array.isArray(raw.unlockedConcepts)) {
      for (const id of raw.unlockedConcepts) {
        if (typeof id === 'string' && CONCEPTS.some((concept) => concept.id === id)) this.unlocked.add(id);
      }
    }
    if (this.openState) this.render();
  }

  private pushSample(state: EcosystemStateShape, elapsed: number): void {
    this.history.push({ elapsed, state: { ...state } });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private ready(key: string, elapsed: number, cooldownSeconds: number): boolean {
    const last = this.cooldowns.get(key);
    if (last !== undefined && elapsed - last < cooldownSeconds) return false;
    this.cooldowns.set(key, elapsed);
    return true;
  }

  private trendLabel(metric: (state: EcosystemStateShape) => number, elapsed: number): TrendWord {
    const window = this.history.filter((sample) => elapsed - sample.elapsed <= TREND_WINDOW_SECONDS);
    if (window.length < 3) return 'slightly';
    const moved = Math.abs(metric(window[window.length - 1].state) - metric(window[0].state));
    const perSample = moved / Math.max(1, window.length - 1);
    if (perSample >= 3) return 'sharply';
    if (moved >= 6) return 'steadily';
    return 'slightly';
  }

  private push(kind: JournalKind, title: string, detail: string, elapsedSeconds: number, conceptId?: string): JournalEntry {
    const concepts = conceptId ? [conceptId] : [];
    if (conceptId) this.unlocked.add(conceptId);
    this.counter += 1;
    const entry: JournalEntry = {
      id: `eco-${this.counter.toString(36)}-${Math.max(0, Math.floor(elapsedSeconds)).toString(36)}`,
      day: Math.floor(elapsedSeconds / DAY_LENGTH_SECONDS) + 1,
      elapsedSeconds,
      kind,
      title,
      detail,
      concepts,
    };
    this.entries.unshift(entry);
    if (this.entries.length > ENTRY_CAP) this.entries.length = ENTRY_CAP;
    return entry;
  }

  private buildPanel(): void {
    if (this.overlay) return;
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Ecology journal');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="eco-journal-panel">
        <header class="eco-journal-head">
          <div>
            <div class="eco-journal-eyebrow">FIELD STUDY · TIDEBORN COAST</div>
            <h2>Ecology Journal</h2>
            <p class="eco-journal-sub"></p>
          </div>
          <button type="button" class="eco-journal-close" data-eco-close aria-label="Close ecology journal">×</button>
        </header>
        <div class="eco-journal-filters"></div>
        <section class="eco-journal-concepts">
          <h3>UNDERSTOOD PATTERNS</h3>
          <div class="eco-journal-chips"></div>
        </section>
        <div class="eco-journal-list"></div>
      </section>`;
    overlay.style.zoom = 'var(--tb-ui-scale, 1)';
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.subElement = overlay.querySelector<HTMLElement>('.eco-journal-sub');
    this.filtersElement = overlay.querySelector<HTMLElement>('.eco-journal-filters');
    this.chipsElement = overlay.querySelector<HTMLElement>('.eco-journal-chips');
    this.listElement = overlay.querySelector<HTMLElement>('.eco-journal-list');

    overlay.querySelector<HTMLButtonElement>('[data-eco-close]')?.addEventListener('click', () => this.toggle(false));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.toggle(false);
    });
    this.filtersElement?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-eco-filter]');
      if (!button) return;
      const value = button.dataset.ecoFilter;
      this.activeFilter = value === 'all' || isJournalKind(value) ? value : 'all';
      this.render();
    });
    this.render();
  }

  private render(): void {
    if (!this.overlay || !this.listElement || !this.chipsElement || !this.subElement || !this.filtersElement) return;
    const unlockedCount = CONCEPTS.filter((concept) => this.unlocked.has(concept.id)).length;
    this.subElement.textContent = `${this.entries.length} ENTRIES · ${unlockedCount}/${CONCEPTS.length} PATTERNS UNDERSTOOD · [P] TO CLOSE`;

    const filters: Array<{ value: JournalKind | 'all'; label: string }> = [
      { value: 'all', label: 'All' },
      ...(Object.keys(KIND_CLASS) as JournalKind[]).map((kind) => ({ value: kind, label: kind })),
    ];
    this.filtersElement.replaceChildren(...filters.map(({ value, label }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `eco-journal-filter${this.activeFilter === value ? ' eco-journal-active' : ''}`;
      button.dataset.ecoFilter = value;
      button.textContent = label;
      return button;
    }));

    this.chipsElement.replaceChildren(...CONCEPTS.map((concept) => {
      const chip = document.createElement('span');
      const known = this.unlocked.has(concept.id);
      chip.className = `eco-journal-chip${known ? '' : ' eco-journal-locked'}`;
      chip.textContent = known ? concept.name : '???';
      chip.title = known ? concept.description : 'An unobserved ecological pattern.';
      return chip;
    }));

    const visible = this.activeFilter === 'all'
      ? this.entries
      : this.entries.filter((entry) => entry.kind === this.activeFilter);
    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'eco-journal-empty';
      empty.textContent = 'No observations yet. The shore keeps its secrets until patterns emerge.';
      this.listElement.replaceChildren(empty);
      return;
    }
    this.listElement.replaceChildren(...visible.map((entry) => {
      const article = document.createElement('article');
      article.className = `eco-journal-entry eco-journal-kind-${KIND_CLASS[entry.kind]}`;
      const top = document.createElement('div');
      top.className = 'eco-journal-entry-top';
      const day = document.createElement('span');
      day.textContent = `DAY ${entry.day}`;
      const clock = document.createElement('span');
      clock.textContent = formatClock(entry.elapsedSeconds);
      const tag = document.createElement('span');
      tag.className = 'eco-journal-tag';
      tag.textContent = entry.kind.toUpperCase();
      top.append(day, clock, tag);
      const heading = document.createElement('h4');
      heading.textContent = entry.title;
      const body = document.createElement('p');
      body.textContent = entry.detail;
      article.append(top, heading, body);
      if (entry.concepts.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'eco-journal-entry-concepts';
        for (const id of entry.concepts) {
          const concept = CONCEPTS.find((candidate) => candidate.id === id);
          if (!concept) continue;
          const chip = document.createElement('span');
          chip.className = 'eco-journal-chip';
          chip.textContent = concept.name;
          chip.title = concept.description;
          wrap.append(chip);
        }
        if (wrap.childElementCount > 0) article.append(wrap);
      }
      return article;
    }));
  }
}
