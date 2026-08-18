export type BiologicalSex = 'female' | 'male' | 'colony';
export type LifeStage = 'juvenile' | 'adult' | 'elder';
export type LifecycleDeathCause = 'natural' | 'predation' | 'harvest';

export interface LifeHistory {
  lifespanYears: readonly [number, number];
  maturityYears: readonly [number, number];
  adultScale: readonly [number, number];
  breedingIntervalYears: readonly [number, number];
  broodSize: readonly [number, number];
  maxPopulation: number;
  asexual?: boolean;
}

export interface LifeState<S extends string = string> {
  species: S;
  sex: BiologicalSex;
  ageYears: number;
  lifespanYears: number;
  maturityYears: number;
  adultScale: number;
  nextBreedingAgeYears: number;
  generation: number;
  parentIds: string[];
}

export interface LifecycleSnapshot {
  secondsPerEcologyYear: number;
  births: number;
  naturalDeaths: number;
  predationDeaths: number;
  harvestedDeaths: number;
}

interface CreateLifeOptions {
  initialAdult?: boolean;
  generation?: number;
  parentIds?: string[];
  sex?: BiologicalSex;
}

/**
 * Species-agnostic biological clock shared by active wildlife systems. One
 * ecology year is deliberately compressed so several generations can become
 * observable during a long prototype run without tying biology to frame rate.
 */
export class CreatureLifecycleSystem<S extends string> {
  static readonly SECONDS_PER_ECOLOGY_YEAR = 20;

  private births = 0;
  private naturalDeaths = 0;
  private predationDeaths = 0;
  private harvestedDeaths = 0;

  constructor(private rng: () => number, private histories: Record<S, LifeHistory>) {}

  create(species: S, options: CreateLifeOptions = {}): LifeState<S> {
    const history = this.histories[species];
    const maturityYears = this.between(history.maturityYears);
    const lifespanYears = Math.max(maturityYears + 0.5, this.between(history.lifespanYears));
    const ageYears = options.initialAdult
      ? maturityYears + this.rng() * Math.max(0.2, (lifespanYears - maturityYears) * 0.28)
      : 0;
    const sex = history.asexual ? 'colony' : options.sex ?? (this.rng() < 0.5 ? 'female' : 'male');
    return {
      species,
      sex,
      ageYears,
      lifespanYears,
      maturityYears,
      adultScale: this.between(history.adultScale),
      // Founding adults breed soon enough for the vertical slice to reveal the
      // system; later generations use the full species-specific interval.
      nextBreedingAgeYears: options.initialAdult
        ? ageYears + 0.12 + this.rng() * 0.28
        : maturityYears + this.between(history.breedingIntervalYears) * 0.35,
      generation: options.generation ?? 0,
      parentIds: options.parentIds?.slice(0, 2) ?? [],
    };
  }

  advance(life: LifeState<S>, dt: number): boolean {
    life.ageYears += dt / CreatureLifecycleSystem.SECONDS_PER_ECOLOGY_YEAR;
    return life.ageYears >= life.lifespanYears;
  }

  isMature(life: LifeState<S>): boolean {
    return life.ageYears >= life.maturityYears;
  }

  canBreed(life: LifeState<S>): boolean {
    return this.isMature(life) && life.ageYears >= life.nextBreedingAgeYears && life.ageYears < life.lifespanYears * 0.92;
  }

  compatible(first: LifeState<S>, second: LifeState<S>): boolean {
    if (first.species !== second.species || first.sex === 'colony' || second.sex === 'colony') return false;
    return first.sex !== second.sex && this.canBreed(first) && this.canBreed(second);
  }

  markBred(life: LifeState<S>): void {
    life.nextBreedingAgeYears = life.ageYears + this.between(this.histories[life.species].breedingIntervalYears);
  }

  broodSize(species: S): number {
    const [minimum, maximum] = this.histories[species].broodSize;
    return minimum + Math.floor(this.rng() * (maximum - minimum + 1));
  }

  currentScale(life: LifeState<S>): number {
    const growth = Math.min(1, 0.42 + (life.ageYears / Math.max(0.01, life.maturityYears)) * 0.58);
    const elderStart = life.lifespanYears * 0.82;
    const elderLoss = life.ageYears > elderStart
      ? Math.min(0.08, (life.ageYears - elderStart) / Math.max(0.01, life.lifespanYears - elderStart) * 0.08)
      : 0;
    return life.adultScale * growth * (1 - elderLoss);
  }

  stage(life: LifeState<S>): LifeStage {
    if (!this.isMature(life)) return 'juvenile';
    return life.ageYears >= life.lifespanYears * 0.82 ? 'elder' : 'adult';
  }

  maxPopulation(species: S): number {
    return this.histories[species].maxPopulation;
  }

  isAsexual(species: S): boolean {
    return Boolean(this.histories[species].asexual);
  }

  recordBirth(count = 1): void {
    this.births += count;
  }

  recordDeath(cause: LifecycleDeathCause): void {
    if (cause === 'natural') this.naturalDeaths += 1;
    else if (cause === 'predation') this.predationDeaths += 1;
    else this.harvestedDeaths += 1;
  }

  snapshot(): LifecycleSnapshot {
    return {
      secondsPerEcologyYear: CreatureLifecycleSystem.SECONDS_PER_ECOLOGY_YEAR,
      births: this.births,
      naturalDeaths: this.naturalDeaths,
      predationDeaths: this.predationDeaths,
      harvestedDeaths: this.harvestedDeaths,
    };
  }

  private between(range: readonly [number, number]): number {
    return range[0] + this.rng() * (range[1] - range[0]);
  }
}
