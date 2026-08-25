import type { DenSite } from './DenNetworkSystem';

export type ContestResultReason = 'seven-den-network' | 'winter-fortress' | 'death' | 'den-collapse' | 'second-spring';

export interface WinterReadiness {
  denId: string;
  denName: string;
  ready: boolean;
  score: number;
  excavationCells: number;
  structure: number;
  storage: number;
  winterFood: number;
  habitatFixtures: number;
  missing: string[];
}

export interface ContestSessionInput {
  elapsedSeconds: number;
  dens: DenSite[];
  excavatedCells: number;
  carriedFood: number;
  health: number;
}

export interface ContestResult {
  outcome: 'won' | 'lost';
  reason: ContestResultReason;
  title: string;
  subtitle: string;
  summary: string[];
  elapsedSeconds: number;
  densFound: number;
  survivingDens: number;
  lostDens: number;
  excavatedCells: number;
  winterFood: number;
  bestDen: WinterReadiness | null;
}

export interface ContestSessionSnapshot {
  status: 'active' | 'complete';
  winPaths: {
    network: { requiredDens: number; currentDens: number; ready: boolean };
    solo: { ready: boolean; bestDen: WinterReadiness | null };
  };
  result: ContestResult | null;
}

const REQUIRED_NETWORK_DENS = 7;
const REQUIRED_EXCAVATED_CELLS = 36;
const REQUIRED_STRUCTURE = 2;
const REQUIRED_STORAGE = 1;
const REQUIRED_WINTER_FOOD = 3;
const REQUIRED_HABITAT_FIXTURES = 1;

/** Owns contest win/loss assessment, independent from rendering and storms. */
export class ContestSessionSystem {
  private completedResult: ContestResult | null = null;

  assess(input: ContestSessionInput): ContestSessionSnapshot {
    const discovered = input.dens.filter((den) => den.discovered && !den.destroyed);
    const readiness = discovered.map((den) => this.readiness(den, input.excavatedCells, input.carriedFood));
    const bestDen = readiness.sort((a, b) => b.score - a.score)[0] ?? null;
    return {
      status: this.completedResult ? 'complete' : 'active',
      winPaths: {
        network: {
          requiredDens: REQUIRED_NETWORK_DENS,
          currentDens: discovered.length,
          ready: discovered.length >= REQUIRED_NETWORK_DENS,
        },
        solo: { ready: Boolean(bestDen?.ready), bestDen },
      },
      result: this.completedResult,
    };
  }

  finishStorm(input: ContestSessionInput): ContestResult {
    if (this.completedResult) return this.completedResult;
    const assessment = this.assess(input);
    const densFound = assessment.winPaths.network.currentDens;
    const bestDen = assessment.winPaths.solo.bestDen;
    const common = {
      elapsedSeconds: input.elapsedSeconds,
      densFound,
      excavatedCells: input.excavatedCells,
      winterFood: bestDen?.winterFood ?? input.carriedFood,
      bestDen,
    };
    if (assessment.winPaths.network.ready) {
      this.completedResult = {
        ...common,
        outcome: 'won',
        reason: 'seven-den-network',
        title: 'A planet of shelters',
        subtitle: 'Seven dens endure across the belt. Winter cannot erase every refuge.',
        survivingDens: densFound,
        lostDens: 0,
        summary: [
          `${densFound} of ${REQUIRED_NETWORK_DENS} dens linked`,
          `${input.excavatedCells} terrain cells reshaped`,
          'First winter reached through network resilience',
        ],
      };
      return this.completedResult;
    }
    if (bestDen?.ready) {
      this.completedResult = {
        ...common,
        outcome: 'won',
        reason: 'winter-fortress',
        title: 'Winter-ready',
        subtitle: `${bestDen.denName} holds through the surge. Its stores and braces are ready for the cold season.`,
        survivingDens: Math.max(1, densFound),
        lostDens: 0,
        summary: [
          `${bestDen.denName} readiness ${Math.round(bestDen.score * 100)}%`,
          `${bestDen.structure} structural supports · ${bestDen.storage} storage`,
          `${bestDen.winterFood} winter meals · ${input.excavatedCells} cells excavated`,
        ],
      };
      return this.completedResult;
    }
    this.completedResult = {
      ...common,
      outcome: 'lost',
      reason: 'den-collapse',
      title: 'No den survives',
      subtitle: 'The storm surge reaches every unprepared chamber. With no viable den left, winter wins this run.',
      survivingDens: 0,
      lostDens: densFound,
      summary: [
        `${densFound} den${densFound === 1 ? '' : 's'} lost to flooding or collapse`,
        bestDen ? `Best readiness ${Math.round(bestDen.score * 100)}%` : 'No shelter discovered',
        bestDen?.missing.length ? `Still needed: ${bestDen.missing.join(', ')}` : 'Build below a roof and claim it with N',
      ],
    };
    return this.completedResult;
  }

  finishCampaign(input: ContestSessionInput): ContestResult {
    if (this.completedResult?.reason === 'second-spring') return this.completedResult;
    const assessment = this.assess(input);
    const densFound = assessment.winPaths.network.currentDens;
    const bestDen = assessment.winPaths.solo.bestDen;
    const surviving = input.dens.filter((den) => !den.destroyed).length;
    this.completedResult = {
      outcome: 'won',
      reason: 'second-spring',
      title: 'The second spring',
      subtitle: 'Ice releases the shallows and the kelp forests green again. Two winters survived — Pelagos-730 knows your name now.',
      elapsedSeconds: input.elapsedSeconds,
      densFound,
      survivingDens: surviving,
      lostDens: Math.max(0, densFound - surviving),
      excavatedCells: input.excavatedCells,
      winterFood: bestDen?.winterFood ?? input.carriedFood,
      bestDen,
      summary: [
        `${Math.floor(input.elapsedSeconds / 90) + 1} days across two winters`,
        `${surviving} den${surviving === 1 ? '' : 's'} still holding`,
        `${input.excavatedCells} terrain cells reshaped`,
        bestDen ? `Finest chamber · ${bestDen.denName} (${Math.round(bestDen.score * 100)}% ready)` : 'A nomad through the cold',
      ],
    };
    return this.completedResult;
  }

  finishDeath(input: ContestSessionInput): ContestResult {
    if (this.completedResult?.reason === 'death') return this.completedResult;
    const assessment = this.assess(input);
    const densFound = assessment.winPaths.network.currentDens;
    this.completedResult = {
      outcome: 'lost',
      reason: 'death',
      title: 'The planet outlasted you',
      subtitle: 'The octopus did not survive long enough to meet the first winter.',
      summary: [
        `${(input.elapsedSeconds / 90).toFixed(1)} contest days survived`,
        `${densFound} viable den${densFound === 1 ? '' : 's'} discovered`,
        `${input.excavatedCells} terrain cells reshaped`,
      ],
      elapsedSeconds: input.elapsedSeconds,
      densFound,
      survivingDens: densFound,
      lostDens: 0,
      excavatedCells: input.excavatedCells,
      winterFood: input.carriedFood,
      bestDen: assessment.winPaths.solo.bestDen,
    };
    return this.completedResult;
  }

  snapshot(input: ContestSessionInput): ContestSessionSnapshot {
    return this.assess(input);
  }

  private readiness(den: DenSite, excavatedCells: number, carriedFood: number): WinterReadiness {
    const structure = den.braces + den.mineralReinforcement;
    const storage = den.storage;
    const winterFood = den.foodStored + carriedFood;
    const habitatFixtures = den.curtains + den.bowls + den.bioLights;
    const parts = [
      Math.min(1, excavatedCells / REQUIRED_EXCAVATED_CELLS),
      Math.min(1, structure / REQUIRED_STRUCTURE),
      Math.min(1, storage / REQUIRED_STORAGE),
      Math.min(1, winterFood / REQUIRED_WINTER_FOOD),
      Math.min(1, habitatFixtures / REQUIRED_HABITAT_FIXTURES),
    ];
    const missing: string[] = [];
    if (excavatedCells < REQUIRED_EXCAVATED_CELLS) missing.push(`${REQUIRED_EXCAVATED_CELLS - excavatedCells} excavation cells`);
    if (structure < REQUIRED_STRUCTURE) missing.push(`${REQUIRED_STRUCTURE - structure} structural support${REQUIRED_STRUCTURE - structure === 1 ? '' : 's'}`);
    if (storage < REQUIRED_STORAGE) missing.push('storage sling');
    if (winterFood < REQUIRED_WINTER_FOOD) missing.push(`${REQUIRED_WINTER_FOOD - winterFood} stored meal${REQUIRED_WINTER_FOOD - winterFood === 1 ? '' : 's'}`);
    if (habitatFixtures < REQUIRED_HABITAT_FIXTURES) missing.push('one curtain, bowl, or living lamp');
    return {
      denId: den.id,
      denName: den.name,
      ready: missing.length === 0,
      score: parts.reduce((sum, value) => sum + value, 0) / parts.length,
      excavationCells: excavatedCells,
      structure,
      storage,
      winterFood,
      habitatFixtures,
      missing,
    };
  }
}
