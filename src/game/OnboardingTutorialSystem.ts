import { BASE_SEA_LEVEL } from './data';

export type TutorialStepId =
  | 'move'
  | 'dive'
  | 'hunt'
  | 'gather'
  | 'dig'
  | 'craft'
  | 'claimDen'
  | 'jetInfo'
  | 'fieldkit'
  | 'brace'
  | 'prep';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  instruction: string;
  hintKey?: string;
  optional?: boolean;
}

export interface TutorialSnapshot {
  active: boolean;
  done: boolean;
  stepId: TutorialStepId | null;
  stepTitle: string | null;
  instruction: string | null;
  progress: boolean[];
  skippedCount: number;
}

export interface SerializedTutorial {
  version: 1;
  completedStepIds: string[];
  skippedIds: string[];
  activeIndex: number;
  done: boolean;
}

const DAY_SECONDS = 90;
const MOVE_DISTANCE_METERS = 4;
const DIVE_DEPTH_MARGIN = 0.5;
const TUTORIAL_TIME_LIMIT_SEC = 150;
const JET_INFO_DISPLAY_SEC = 6;
const FIELDKIT_DISPLAY_SEC = 7;
const CONGRATS_DISPLAY_SEC = 8;
const HIGHLIGHT_MS = 650;
const SKIP_NOTE = 'skipped — explore later';
const CONGRATS_TITLE = 'Day one survived.';
const CONGRATS_TEXT = 'The storm comes — prepare.';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'move', title: 'Crawl', instruction: 'Crawl in every direction with WASD to feel how your arms carry you.', hintKey: 'WASD' },
  { id: 'dive', title: 'Dive', instruction: 'Swim down with S until you glide beneath the surface.', hintKey: 'S' },
  { id: 'hunt', title: 'Hunt', instruction: 'Press H beside a fish to pounce and land your first meal.', hintKey: 'H' },
  { id: 'gather', title: 'Gather', instruction: 'Press E next to kelp or a scallop to pry food and fiber loose.', hintKey: 'E' },
  { id: 'dig', title: 'Dig', instruction: 'Hold X while aiming toward the floor to scrape sediment away.', hintKey: 'X' },
  { id: 'craft', title: 'Craft', instruction: 'Open the crafting panel with I to twist fibers into rope and tools.', hintKey: 'I' },
  { id: 'claimDen', title: 'Claim den', instruction: 'Press N inside a large enclosed chamber to claim it as a den.', hintKey: 'N' },
  { id: 'jetInfo', title: 'Jet propulsion', instruction: 'Shift spends one of three regenerating jet charges for a quick burst.', hintKey: 'Shift', optional: true },
  { id: 'brace', title: 'Brace', instruction: 'Press B beside a wall or floor to lock your suckers against the surge.', hintKey: 'B' },
  { id: 'fieldkit', title: 'Field kit', instruction: 'Journal opens with P, the discovery codex with 0, and den-builder mode with L. Inside any den, T travels the network.', hintKey: 'P · 0 · L · T', optional: true },
  { id: 'prep', title: 'Storm prep', instruction: 'Store food, reinforce the den with J, and place a lamp with V before day two — then survive through the second spring.', hintKey: 'J · V', optional: true },
];

const PREP_CHECKLIST: readonly string[] = [
  'Food stored — cache meals inside the den',
  'Den claimed — press N inside a chamber',
  'Reinforced — press J with two ironstone nodules',
  'Lamp placed — press V while carrying glow kelp',
  'Field kit — journal P · codex 0 · den-builder L · travel T',
];

const ACTION_STEPS: Readonly<Record<string, TutorialStepId>> = {
  hunted: 'hunt',
  gathered: 'gather',
  dug: 'dig',
  'craft-opened': 'craft',
  'den-claimed': 'claimDen',
  braced: 'brace',
};

interface WidgetRefs {
  eyebrow: HTMLElement;
  title: HTMLElement;
  instruction: HTMLElement;
  keyChip: HTMLElement;
  keyRow: HTMLElement;
  pips: HTMLElement[];
  checklist: HTMLElement;
  skipButton: HTMLButtonElement;
  dismissButton: HTMLButtonElement;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, styles);
  if (text !== undefined) node.textContent = text;
  return node;
}

export class OnboardingTutorialSystem {
  private uiRoot: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private refs: WidgetRefs | null = null;
  private highlightTimer: number | null = null;
  private readonly completed = new Set<string>();
  private readonly skipped = new Map<string, string>();
  private readonly firedActions = new Set<TutorialStepId>();
  private seaLevel = BASE_SEA_LEVEL;
  private movedDistance = 0;
  private lowestPlayerY = Infinity;
  private activeIndex = 0;
  private startElapsed = 0;
  private lastElapsed = 0;
  private stepShownAt = -Infinity;
  private congratsUntil: number | null = null;
  private started = false;
  private done = false;
  private retired = false;

  constructor(uiRoot?: HTMLElement) {
    if (uiRoot) this.attachUiRoot(uiRoot);
  }

  attachUiRoot(root: HTMLElement): void {
    this.uiRoot = root;
    if (this.retired || this.panel) return;
    if (this.started && !this.done) {
      this.ensureWidget();
      this.refreshWidget();
    }
  }

  setSeaLevel(value: number): void {
    if (Number.isFinite(value)) this.seaLevel = value;
  }

  begin(elapsed: number): void {
    if (this.done) return;
    this.started = true;
    this.lastElapsed = Math.max(this.lastElapsed, elapsed);
    this.startElapsed = elapsed;
    if (this.stepShownAt === -Infinity) this.stepShownAt = elapsed;
    this.ensureWidget();
    this.evaluate();
    this.refreshWidget();
  }

  update(elapsed: number): void {
    if (this.done) {
      if (this.congratsUntil !== null && elapsed >= this.congratsUntil) {
        this.congratsUntil = null;
        this.retire();
      }
      return;
    }
    this.lastElapsed = Math.max(this.lastElapsed, elapsed);
    if (!this.started) return;
    const active = TUTORIAL_STEPS[this.activeIndex];
    if (active?.id === 'jetInfo' && this.lastElapsed - this.stepShownAt >= JET_INFO_DISPLAY_SEC) this.completeStep('jetInfo');
    if (active?.id === 'fieldkit' && this.lastElapsed - this.stepShownAt >= FIELDKIT_DISPLAY_SEC) this.completeStep('fieldkit');
    if (TUTORIAL_STEPS[this.activeIndex]?.id === 'prep' && this.lastElapsed >= DAY_SECONDS) this.completeStep('prep');
    if (this.lastElapsed - this.startElapsed > TUTORIAL_TIME_LIMIT_SEC) this.skipRemaining(SKIP_NOTE);
    this.evaluate();
    this.refreshWidget();
  }

  notify(action: string, value?: number): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (action === 'moved') {
        if (value > 0) this.movedDistance += value;
      } else if (action === 'dived') {
        this.lowestPlayerY = Math.min(this.lowestPlayerY, value);
      }
    }
    const mapped = ACTION_STEPS[action];
    if (mapped) this.firedActions.add(mapped);
    this.evaluate();
    this.refreshWidget();
  }

  snapshot(px = 0, py = 0): TutorialSnapshot {
    void px;
    void py;
    const step = this.done ? null : TUTORIAL_STEPS[this.activeIndex] ?? null;
    return {
      active: this.started && !this.done,
      done: this.done,
      stepId: step?.id ?? null,
      stepTitle: step?.title ?? null,
      instruction: step?.instruction ?? null,
      progress: TUTORIAL_STEPS.map((entry) => this.completed.has(entry.id)),
      skippedCount: this.skipped.size,
    };
  }

  serialize(): SerializedTutorial {
    return {
      version: 1,
      completedStepIds: [...this.completed],
      skippedIds: [...this.skipped.keys()],
      activeIndex: this.activeIndex,
      done: this.done,
    };
  }

  deserialize(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    const completedRaw = Array.isArray(record['completedStepIds']) ? record['completedStepIds'] : [];
    const skippedRaw = Array.isArray(record['skippedIds']) ? record['skippedIds'] : [];
    const knownIds = new Set(TUTORIAL_STEPS.map((step) => step.id as string));
    this.completed.clear();
    for (const id of completedRaw) if (typeof id === 'string' && knownIds.has(id)) this.completed.add(id);
    this.skipped.clear();
    for (const id of skippedRaw) if (typeof id === 'string' && knownIds.has(id)) this.skipped.set(id, SKIP_NOTE);
    const index = typeof record['activeIndex'] === 'number' ? record['activeIndex'] : 0;
    this.activeIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length, Math.floor(index)));
    this.done = record['done'] === true;
    if (this.done) {
      this.retire();
    } else if (this.started && this.uiRoot) {
      this.ensureWidget();
      this.refreshWidget();
    }
  }

  private evaluate(): void {
    if (!this.started || this.done) return;
    for (;;) {
      const step = TUTORIAL_STEPS[this.activeIndex];
      if (!step || !this.isSatisfied(step)) break;
      this.completeStep(step.id);
    }
  }

  private isSatisfied(step: TutorialStep): boolean {
    switch (step.id) {
      case 'move':
        return this.movedDistance >= MOVE_DISTANCE_METERS;
      case 'dive':
        return this.lowestPlayerY <= this.seaLevel - DIVE_DEPTH_MARGIN;
      case 'jetInfo':
      case 'prep':
        return false;
      default:
        return this.firedActions.has(step.id);
    }
  }

  private completeStep(id: TutorialStepId): void {
    if (this.done) return;
    this.completed.add(id);
    this.skipped.delete(id);
    this.activeIndex = Math.min(TUTORIAL_STEPS.length, this.activeIndex + 1);
    this.stepShownAt = this.lastElapsed;
    if (this.activeIndex >= TUTORIAL_STEPS.length) this.finish(true);
    else this.animateHighlight();
  }

  private skipRemaining(note: string): void {
    for (let i = this.activeIndex; i < TUTORIAL_STEPS.length; i += 1) {
      const step = TUTORIAL_STEPS[i];
      if (step && !this.completed.has(step.id)) this.skipped.set(step.id, note);
    }
    this.activeIndex = TUTORIAL_STEPS.length;
    this.finish(false);
  }

  private finish(natural: boolean): void {
    this.done = true;
    if (natural) {
      this.congratsUntil = this.lastElapsed + CONGRATS_DISPLAY_SEC;
      this.animateHighlight();
    } else {
      this.retire();
    }
  }

  private retire(): void {
    this.retired = true;
    if (this.highlightTimer !== null) {
      window.clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.panel?.remove();
    this.panel = null;
    this.refs = null;
  }

  private ensureWidget(): void {
    if (!this.uiRoot || this.panel || this.retired) return;
    const panel = element('div', {
      position: 'fixed',
      top: '12%',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '46',
      maxWidth: '400px',
      minWidth: '264px',
      padding: '10px 14px 11px',
      borderRadius: '14px',
      background: 'rgba(4,24,28,0.80)',
      border: '1px solid rgba(125,232,208,0.32)',
      boxShadow: '0 10px 26px rgba(0,0,0,0.40)',
      backdropFilter: 'blur(5px)',
      color: '#d9efe8',
      fontFamily: 'inherit',
      fontSize: '11px',
      lineHeight: '1.45',
      letterSpacing: '0.03em',
      textAlign: 'left',
      pointerEvents: 'none',
      userSelect: 'none',
      transition: 'box-shadow 320ms ease',
    });
    panel.dataset.ui = 'onboarding-tutorial';

    const header = element('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      marginBottom: '5px',
    });
    const eyebrow = element('span', {
      fontSize: '9px',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: '#8fdcca',
      opacity: '0.85',
    }, 'FIRST DAY');
    const skipButton = document.createElement('button');
    Object.assign(skipButton.style, {
      pointerEvents: 'auto',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: '9px',
      letterSpacing: '0.08em',
      padding: '2px 8px',
      borderRadius: '999px',
      color: '#a8ccc2',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.18)',
    } as Partial<CSSStyleDeclaration>);
    skipButton.textContent = 'Skip tutorial';
    skipButton.addEventListener('click', () => this.onSkipClicked());
    header.append(eyebrow, skipButton);

    const title = element('div', {
      fontSize: '13px',
      fontWeight: '600',
      color: '#c9f5e6',
      letterSpacing: '0.02em',
    });
    const instruction = element('div', {
      marginTop: '2px',
      fontSize: '11px',
      color: 'rgba(217,239,232,0.86)',
    });
    const keyRow = element('div', {
      marginTop: '7px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    });
    const keyLabel = element('span', {
      fontSize: '8px',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      opacity: '0.55',
    }, 'KEY');
    const keyChip = element('span', {
      display: 'inline-grid',
      placeItems: 'center',
      minWidth: '22px',
      height: '20px',
      padding: '0 7px',
      borderRadius: '5px',
      border: '1px solid rgba(141,232,208,0.45)',
      background: 'rgba(125,232,208,0.12)',
      font: '500 10px ui-monospace, SFMono-Regular, Consolas, monospace',
      color: '#9df0da',
    });
    keyRow.append(keyLabel, keyChip);

    const checklist = element('div', {
      marginTop: '7px',
      display: 'none',
      flexDirection: 'column',
      gap: '3px',
      padding: '7px 9px',
      borderRadius: '10px',
      background: 'rgba(125,232,208,0.07)',
      border: '1px dashed rgba(125,232,208,0.30)',
      fontSize: '10px',
      color: 'rgba(217,239,232,0.85)',
    });
    for (const line of PREP_CHECKLIST) checklist.appendChild(element('div', {}, `\u2022 ${line}`));
    const dismissButton = document.createElement('button');
    Object.assign(dismissButton.style, {
      pointerEvents: 'auto',
      cursor: 'pointer',
      alignSelf: 'flex-start',
      marginTop: '4px',
      font: 'inherit',
      fontSize: '9px',
      letterSpacing: '0.08em',
      padding: '2px 9px',
      borderRadius: '999px',
      color: '#0b2226',
      background: '#7de8d0',
      border: 'none',
      fontWeight: '600',
    } as Partial<CSSStyleDeclaration>);
    dismissButton.textContent = 'Dismiss checklist';
    dismissButton.addEventListener('click', () => this.onChecklistDismissed());
    checklist.appendChild(dismissButton);

    const pips = element('div', {
      marginTop: '9px',
      display: 'flex',
      gap: '5px',
      alignItems: 'center',
    });
    const dots: HTMLElement[] = [];
    for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) {
      const dot = element('span', {
        width: '7px',
        height: '7px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.14)',
        border: '1px solid rgba(255,255,255,0.10)',
        transition: 'background 240ms ease, transform 240ms ease',
      });
      pips.appendChild(dot);
      dots.push(dot);
    }

    panel.append(header, title, instruction, keyRow, checklist, pips);
    panel.style.zoom = 'var(--tb-ui-scale, 1)';
    this.uiRoot.appendChild(panel);
    this.panel = panel;
    this.refs = { eyebrow, title, instruction, keyChip, keyRow, pips: dots, checklist, skipButton, dismissButton };
  }

  private refreshWidget(): void {
    if (!this.panel || !this.refs) return;
    const { eyebrow, title, instruction, keyChip, keyRow, pips, checklist, skipButton } = this.refs;
    if (this.done) {
      eyebrow.textContent = 'FIRST DAY \u00B7 COMPLETE';
      title.textContent = CONGRATS_TITLE;
      instruction.textContent = CONGRATS_TEXT;
      keyRow.style.display = 'none';
      checklist.style.display = 'none';
      skipButton.style.display = 'none';
    } else {
      const step = TUTORIAL_STEPS[this.activeIndex];
      eyebrow.textContent = `FIRST DAY \u00B7 STEP ${Math.min(this.activeIndex + 1, TUTORIAL_STEPS.length)}/${TUTORIAL_STEPS.length}${step?.optional ? ' \u00B7 OPTIONAL' : ''}`;
      title.textContent = step?.title ?? '';
      instruction.textContent = step?.instruction ?? '';
      keyChip.textContent = step?.hintKey ?? '';
      keyRow.style.display = step?.hintKey ? 'flex' : 'none';
      skipButton.style.display = '';
      checklist.style.display = step?.id === 'prep' ? 'flex' : 'none';
    }
    for (let i = 0; i < pips.length; i += 1) {
      const entry = TUTORIAL_STEPS[i];
      const dot = pips[i];
      if (!entry || !dot) continue;
      if (this.completed.has(entry.id)) {
        dot.style.background = '#7de8d0';
        dot.style.borderColor = 'rgba(125,232,208,0.65)';
        dot.style.transform = 'scale(1)';
      } else if (this.skipped.has(entry.id)) {
        dot.style.background = 'rgba(214,140,120,0.45)';
        dot.style.borderColor = 'rgba(214,140,120,0.35)';
        dot.style.transform = 'scale(0.85)';
      } else if (!this.done && i === this.activeIndex) {
        dot.style.background = 'rgba(125,232,208,0.30)';
        dot.style.borderColor = 'rgba(125,232,208,0.75)';
        dot.style.transform = 'scale(1.25)';
      } else {
        dot.style.background = 'rgba(255,255,255,0.14)';
        dot.style.borderColor = 'rgba(255,255,255,0.10)';
        dot.style.transform = 'scale(1)';
      }
    }
  }

  private animateHighlight(): void {
    if (!this.panel) return;
    if (this.highlightTimer !== null) window.clearTimeout(this.highlightTimer);
    this.panel.style.boxShadow = '0 0 0 2px rgba(125,232,208,0.85), 0 10px 26px rgba(0,0,0,0.45)';
    this.highlightTimer = window.setTimeout(() => {
      if (this.panel) this.panel.style.boxShadow = '0 10px 26px rgba(0,0,0,0.40)';
      this.highlightTimer = null;
    }, HIGHLIGHT_MS);
  }

  private onSkipClicked(): void {
    if (this.done) return;
    this.skipRemaining(SKIP_NOTE);
  }

  private onChecklistDismissed(): void {
    if (this.done) return;
    if (TUTORIAL_STEPS[this.activeIndex]?.id === 'prep') this.completeStep('prep');
    this.evaluate();
    this.refreshWidget();
  }
}
